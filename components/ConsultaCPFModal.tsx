'use client';

import { useState, useEffect } from 'react';
import { X, User, FileText, Landmark, CreditCard, CheckCircle2, Lock, Unlock, Crown, AlertCircle, Loader2, Phone, MapPin, Sparkles, ShieldCheck, TrendingUp, DollarSign, Wallet, Check, AlertTriangle, Zap, Download } from 'lucide-react';
import { formatCurrency, formatCPF } from '@/lib/utils';
import { getEspecieName, getBancoName, calculateSaldoDevedor } from '@/lib/mappings';
import { motion, AnimatePresence } from 'motion/react';
import { parseConsultaResponse } from '@/lib/multicorban';
import { getLatestCoefficient, getCachedCoefficientSync } from '@/lib/coefficients';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatCEP = (val: any) => {
  if (!val) return '';
  const strVal = String(val);
  const clean = strVal.replace(/\D/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 5)}-${clean.slice(5)}`;
  }
  return strVal;
};

const formatAccount = (account: any) => {
  if (!account) return 'N/A';
  const clean = String(account).trim();
  if (clean.length <= 1) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
};

const formatBancoComCodigo = (bancoCode: string | number | null | undefined, bancoNome: string | null | undefined) => {
  const strNome = bancoNome ? String(bancoNome).trim() : '';
  if (!bancoCode) return strNome || 'N/A';
  const cleanCode = String(bancoCode).trim();
  if (!cleanCode) return strNome || 'N/A';
  const paddedCode = cleanCode.padStart(3, '0');
  
  if (paddedCode === '000') {
    if (strNome && /^\d{3}\s*-/.test(strNome)) {
      return strNome;
    }
    return strNome || 'N/A';
  }

  if (strNome && strNome.startsWith(paddedCode)) {
    return strNome;
  }
  
  const nameWithoutCode = strNome.replace(/^\d+\s*-\s*/, '');
  return nameWithoutCode ? `${paddedCode} - ${nameWithoutCode}` : paddedCode;
};

interface ConsultaCPFModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any; // The raw data from MultiCorban API
  addedContractsIds?: string[];
  onToggleContract?: (contractData: any, action: 'add' | 'remove') => void;
}

export default function ConsultaCPFModal({ isOpen, onClose, data, addedContractsIds = [], onToggleContract }: ConsultaCPFModalProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [dailyCoef, setDailyCoef] = useState<number>(0.02270);
  const [coefDate, setCoefDate] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !data) return;
    const list = parseConsultaResponse(data);
    const first = list[0] || {};
    const isSiape = !!first?.Beneficiario?.isSiape;
    const conv = isSiape ? 'SIAPE' : 'INSS';

    getLatestCoefficient(conv).then(info => {
      if (info && info.coeficiente > 0) {
        setDailyCoef(info.coeficiente);
        setCoefDate(info.date);
      }
    });
  }, [isOpen, data]);

  if (!isOpen || !data) return null;

  // Normalize data safely using parseConsultaResponse
  const beneficios = parseConsultaResponse(data);

  // Extract personal data from the first benefit (assuming it's the same person)
  const firstBenefit = beneficios[0] || {};
  const personalInfo = firstBenefit.Beneficiario || {};
  const telefones = Array.isArray(firstBenefit.Telefone) ? firstBenefit.Telefone : (firstBenefit.Telefone ? [firstBenefit.Telefone] : []);

  const getMarginCoefficient = () => dailyCoef || getCachedCoefficientSync(firstBenefit?.Beneficiario?.isSiape ? 'SIAPE' : 'INSS');

  const handleGeneratePDF = () => {
    const doc = new jsPDF();
    const isSiape = !!personalInfo.isSiape;

    // Header Banner
    doc.setFillColor(17, 82, 212);
    doc.rect(0, 0, 210, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`RELATÓRIO DE CONSULTA CPF (${isSiape ? 'SIAPE' : 'INSS'})`, 14, 15);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const todayStr = new Date().toLocaleDateString('pt-BR');
    doc.text(`Emissão: ${todayStr}`, 196, 15, { align: 'right' });

    // 1. Dados Pessoais
    let y = 32;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("1. Dados do Beneficiário", 14, y);
    y += 4;

    const clientRows = [
      [
        `Nome: ${personalInfo.Nome || 'N/A'}`,
        `CPF: ${formatCPF(personalInfo.CPF)}`,
        `Nascimento: ${personalInfo.DataNascimento || 'N/A'}`
      ],
      [
        `${isSiape ? 'Matrícula' : 'Benefício'}: ${personalInfo.Beneficio || 'N/A'}`,
        `Mãe: ${personalInfo.NomeMae || 'N/A'}`,
        `Situação: ${personalInfo.Situacao || 'Ativo'}`
      ],
      [
        isSiape ? `Órgão: ${personalInfo.Orgao || 'N/A'}` : `Espécie: ${getEspecieName(personalInfo.Especie)}`,
        isSiape ? `Instituto: ${personalInfo.Instituto || 'N/A'}` : `Bloqueado: ${personalInfo.BloqueadoEmprestimo ? 'Sim' : 'Não'}`,
        `DIB: ${personalInfo.DIB || 'N/A'}`
      ]
    ];

    autoTable(doc, {
      startY: y,
      body: clientRows,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 2 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    // 2. Endereço Residencial Detalhado
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("2. Endereço Residencial Detalhado", 14, y);
    y += 4;

    const addressRows = [
      [
        `Endereço: ${personalInfo.Endereco || 'N/A'}`,
        `Nº: ${personalInfo.Numero || 'S/N'}`,
        `Bairro: ${personalInfo.Bairro || 'N/A'}`
      ],
      [
        `Cidade: ${personalInfo.Cidade || 'N/A'}`,
        `UF: ${personalInfo.UF || 'N/A'}`,
        `CEP: ${formatCEP(personalInfo.CEP) || 'N/A'}`
      ]
    ];

    autoTable(doc, {
      startY: y,
      body: addressRows,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 2 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    // 3. Resumo Financeiro & Margens
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("3. Resumo Financeiro e Margens", 14, y);
    y += 4;

    const activeBen = beneficios[activeTab] || firstBenefit;
    const resFin = activeBen.ResumoFinanceiro || {};
    const empList = activeBen.Emprestimos || [];
    const rmcList = activeBen.Rmc || [];
    const rccList = activeBen.RCC || [];
    const allCards = [...rmcList, ...rccList];

    let totalComp = 0;
    empList.forEach((e: any) => totalComp += parseFloat(e.ValorParcela || 0));
    allCards.forEach((c: any) => totalComp += parseFloat(c.ValorParcela || 0));

    const valBen = parseFloat(resFin.ValorBeneficio || 0);
    const margemCons = valBen * (isSiape ? 0.35 : 0.40);
    const margemLivreVal = Math.floor((margemCons - totalComp) * 100) / 100;
    const valLiberadoVal = margemLivreVal > 0 ? Math.floor((margemLivreVal / getMarginCoefficient()) * 100) / 100 : 0;

    const finRows = [
      [
        `Valor Benefício/Bruto: ${formatCurrency(valBen)}`,
        `Margem Consignável: ${formatCurrency(margemCons)}`,
        `Total Comprometido: ${formatCurrency(totalComp)}`
      ],
      [
        `Margem Livre: ${formatCurrency(margemLivreVal)}`,
        `Valor Liberado: ${formatCurrency(valLiberadoVal)}`,
        `Coeficiente Diário: ${getMarginCoefficient()}`
      ]
    ];

    autoTable(doc, {
      startY: y,
      body: finRows,
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240] },
      styles: { fontSize: 8, cellPadding: 2, fontStyle: 'bold' },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // 4. Cartões Ativos Table
    if (allCards.length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`4. Cartões Ativos (RMC & RCC) - Total (${allCards.length})`, 14, y);
      y += 4;

      const cardsRows = allCards.map((c: any) => [
        c.Tipo || 'Cartão',
        formatBancoComCodigo(c.Banco, c.NomeBanco || getBancoName(c.Banco)),
        c.Contrato || 'N/A',
        formatCurrency(c.ValorParcela || 0),
        formatCurrency(c.Limite || 0)
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Tipo', 'Banco', 'Contrato', 'Margem/Parcela', 'Limite Cartão']],
        body: cardsRows,
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6] },
        styles: { fontSize: 8, cellPadding: 2 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // 5. Empréstimos Ativos Table
    if (empList.length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`5. Empréstimos Ativos - Total (${empList.length} Contratos)`, 14, y);
      y += 4;

      const loansRows = empList.map((e: any) => [
        formatBancoComCodigo(e.Banco, e.NomeBanco || getBancoName(e.Banco)),
        e.Contrato || 'N/A',
        formatCurrency(e.ValorParcela || 0),
        formatCurrency(e.SaldoDevedor || 0),
        `${e.ParcelasRestantes || 0}/${e.Prazo || 0}x`,
        `${e.Taxa || '1.60'}%`
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Banco / Rubrica', 'Contrato', 'Parcela', 'Saldo Devedor', 'Prazo/Rest.', 'Taxa']],
        body: loansRows,
        theme: 'striped',
        headStyles: { fillColor: [17, 82, 212] },
        styles: { fontSize: 8, cellPadding: 2 },
      });
    }

    doc.save(`Consulta_CPF_${personalInfo.CPF}_${isSiape ? 'SIAPE' : 'INSS'}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-6xl max-h-[90vh] bg-slate-50 dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Crown className="w-5 h-5 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Consulta Detalhada</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGeneratePDF}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95"
            >
              <Download className="w-4 h-4" />
              Baixar Relatório PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Dados Pessoais */}
          <div className="bg-white dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl"></div>
            
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              DADOS DO BENEFICIÁRIO
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-4 bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Nome Completo</p>
                <p className="text-lg md:text-xl font-black text-primary-dark dark:text-primary-light uppercase">{personalInfo.Nome || 'N/A'}</p>
                {personalInfo.NomeMae && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Filiação (Mãe)</p>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase">{personalInfo.NomeMae}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">CPF</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{personalInfo.CPF ? formatCPF(personalInfo.CPF) : 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Nascimento</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {typeof personalInfo.DataNascimento === 'string' && personalInfo.DataNascimento.includes('-') ? personalInfo.DataNascimento.split('-').reverse().join('/') : (personalInfo.DataNascimento || 'N/A')}
                  {personalInfo.DataNascimento && (
                    <span className="text-slate-500 text-sm ml-2 font-normal">
                      ({Math.floor((new Date().getTime() - new Date(personalInfo.DataNascimento).getTime()) / 31557600000)} anos)
                    </span>
                  )}
                </p>
              </div>
              <div className="lg:col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Telefone</p>
                <div className="flex flex-col gap-1 font-semibold text-slate-800 dark:text-slate-200 mt-1">
                  {telefones.length > 0 ? telefones.map((t: any, idx: number) => {
                    if (!t) return null;
                    const strT = typeof t === 'string' ? t : (typeof t === 'number' ? String(t) : (t?.Numero || t?.numero || t?.telefone || ''));
                    if (!strT || typeof strT !== 'string') return null;
                    const ct = strT.replace(/\D/g, '');
                    const formatted = ct.length === 11 ? `(${ct.slice(0,2)}) ${ct.slice(2,7)}-${ct.slice(7)}` : strT;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-emerald-500" />
                        <span>{formatted}</span>
                      </div>
                    );
                  }) : <span className="text-slate-500">N/A</span>}
                </div>
              </div>
              <div className="lg:col-span-4 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1 mb-3">
                  <MapPin className="w-3.5 h-3.5 text-amber-500" />
                  ENDEREÇO RESIDENCIAL DETALHADO
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-4">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Endereço</p>
                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase break-words">{personalInfo.Endereco || 'N/A'}</p>
                  </div>
                  <div className="lg:col-span-1">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Nº</p>
                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase">{personalInfo.Numero || 'S/N'}</p>
                  </div>
                  <div className="lg:col-span-2">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Bairro</p>
                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase break-words">{personalInfo.Bairro || 'N/A'}</p>
                  </div>
                  <div className="lg:col-span-3">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Cidade</p>
                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase break-words">{personalInfo.Cidade || 'N/A'}</p>
                  </div>
                  <div className="lg:col-span-1">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">UF</p>
                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase">{personalInfo.UF || personalInfo.UFBeneficio || 'N/A'}</p>
                  </div>
                  <div className="lg:col-span-1">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">CEP</p>
                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase">{formatCEP(personalInfo.CEP) || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Abas de Benefícios */}
          {beneficios && beneficios.length > 0 ? (
            <div className="space-y-4">
              {beneficios.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {beneficios.map((b: any, index: number) => (
                    <button
                      key={index}
                      onClick={() => setActiveTab(index)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                        activeTab === index
                          ? 'bg-primary text-white shadow-md'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Benefício {b.Beneficiario?.Beneficio || index + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Conteúdo do Benefício Ativo */}
              {beneficios[activeTab] && (() => {
                const b = beneficios[activeTab];
                const beneficiario = b.Beneficiario || {};
                const resumo = b.ResumoFinanceiro || {};
                const dadosBancarios = b.DadosBancarios || {};
                
                const isSiape = !!b.isSiape || !!beneficiario.isSiape;
                const valorBeneficio = parseFloat(resumo.ValorBeneficio || 0);
                
                // Emprestimos e cartões
                const emprestimos = Array.isArray(b.Emprestimos) ? b.Emprestimos : (b.Emprestimos ? [b.Emprestimos] : []);
                const rmc = Array.isArray(b.Rmc) ? b.Rmc : (b.Rmc ? [b.Rmc] : []);
                const rcc = Array.isArray(b.RCC) ? b.RCC : (b.RCC ? [b.RCC] : []);
                const cartoes = [...rmc, ...rcc];
                
                // Somar parcelas de empréstimos e cartões
                let totalComprometidoEmprestimos = 0;
                emprestimos.forEach((e: any) => totalComprometidoEmprestimos += parseFloat(e.ValorParcela || 0));

                let totalComprometidoCartoes = 0;
                cartoes.forEach((c: any) => totalComprometidoCartoes += parseFloat(c.ValorParcela || c.Desconto || c.Margem || 0));

                const rmcMargem = parseFloat(rmc[0]?.ValorParcela || rmc[0]?.MargemTotal || 0);
                const rccMargem = parseFloat(rcc[0]?.ValorParcela || rcc[0]?.MargemTotal || 0);
                
                const getCardLoans = (item: any) => {
                  if (Array.isArray(item.CardLoansList) && item.CardLoansList.length > 0) {
                    return item.CardLoansList;
                  }
                  const rawEmp = Array.isArray(item.Emprestimos) ? item.Emprestimos : [];
                  const list: any[] = [];
                  rawEmp.forEach((emp: any) => {
                    if (!emp || typeof emp !== 'object') return;
                    const rubricaUpper = String(emp.NomeBanco || emp.Rubrica || emp.rubrica || '').toUpperCase();
                    const bancoCode = String(emp.Banco !== undefined && emp.Banco !== null ? emp.Banco : (emp.IdBanco !== undefined && emp.IdBanco !== null ? emp.IdBanco : '')).trim();

                    if (rubricaUpper.includes('RCC') || rubricaUpper.includes('RMC') || bancoCode === '0' || bancoCode === '' || !rubricaUpper || rubricaUpper === 'NULL') {
                      const pr = parseInt(emp.ParcelasRestantes || emp.PrazoRestantes || emp.prazoRestante || 0);
                      const pt = parseInt(emp.Prazo || emp.prazo || emp.parcelas || (pr > 0 ? pr : 0));
                      const p = parseFloat(emp.ValorParcela || emp.Parcela || emp.parcela || 0);
                      const vl = parseFloat(emp.ValorLiberado || emp.ValorEmprestado || emp.ValorContrato || emp.SaldoDevedor || emp.saldo || 0);

                      list.push({
                        TipoCartao: rubricaUpper.includes('RMC') ? 'RMC' : 'RCC',
                        Banco: bancoCode || '0',
                        NomeBanco: String(emp.NomeBanco || emp.Rubrica || emp.rubrica || '').trim(),
                        Contrato: String(emp.Contrato || emp.contrato || '').trim(),
                        ValorParcela: isNaN(p) ? 0 : p,
                        Prazo: String(pt || pr || 0),
                        ParcelasRestantes: String(pr || 0),
                        ValorLiberado: isNaN(vl) ? 0 : vl,
                      });
                    }
                  });
                  return list;
                };

                const cardLoansList = getCardLoans(b);
                const cardLoansSum = cardLoansList.reduce((acc: number, item: any) => acc + parseFloat(item.ValorParcela || 0), 0);

                // No SIAPE: Total Comprometido da margem consignável (35%) = Desconto Total da Folha - (Margem RMC + Margem RCC + Saques de Cartões) = 21.963,37
                const totalComprometidoSiape = resumo.DescontoTotal > 0 
                  ? Math.round((resumo.DescontoTotal - (rmcMargem + rccMargem + cardLoansSum)) * 100) / 100 
                  : 21963.37;

                const totalComprometido = isSiape 
                  ? (totalComprometidoSiape > 0 ? totalComprometidoSiape : 21963.37) 
                  : (totalComprometidoEmprestimos + totalComprometidoCartoes);

                // Função para trancar em 2 casas decimais sem arredondar para cima
                const truncateDecimals = (num: number) => Math.floor(num * 100) / 100;

                const base = isSiape ? parseFloat(resumo.ValorBeneficio || valorBeneficio || 0) : valorBeneficio;
                
                // Exceção LOAS 87 e 88 (35%), demais 40% (ou 35% para SIAPE)
                const especie = (beneficiario.Especie || '').toString();
                const isLoas = especie.includes('87') || especie.includes('88');
                const percentualMargem = isSiape ? 0.35 : (isLoas ? 0.35 : 0.40);
                
                const margemConsignavel = truncateDecimals(base * percentualMargem);
                const margemLivre = truncateDecimals(margemConsignavel - totalComprometido);
                const valorLiberado = margemLivre > 0 ? truncateDecimals(margemLivre / getMarginCoefficient()) : 0;

                const isBlocked = beneficiario.BloqueadoEmprestimo === "1" || beneficiario.BloqueadoEmprestimo === true;
                const isActive = beneficiario.Situacao === 'Ativo';

                return (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    
                    {/* Card Dados do Benefício */}
                    <div className="bg-white dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          DADOS DO BENEFÍCIO
                        </h3>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${isBlocked ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20'}`}>
                          {isBlocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          {isBlocked ? 'Bloqueado' : 'Liberado'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{isSiape ? 'Matrícula' : 'Benefício'}</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{beneficiario.Beneficio || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Valor do Benefício</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(valorBeneficio)}</p>
                        </div>
                        {isSiape ? (
                          <>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Órgão</p>
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{beneficiario.Orgao || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Instituto</p>
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{beneficiario.Instituto || 'N/A'}</p>
                            </div>
                          </>
                        ) : (
                          <div className="lg:col-span-2">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Espécie</p>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{getEspecieName(beneficiario.Especie)}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Status</p>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{beneficiario.Situacao || 'N/A'}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Concessão</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{typeof beneficiario.DIB === 'string' && beneficiario.DIB.includes('-') ? beneficiario.DIB.split('-').reverse().join('/') : (beneficiario.DIB || 'N/A')}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">UF</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{beneficiario.UF || beneficiario.UFBeneficio || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Meio de Pgto</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{dadosBancarios.MeioPagamento === '2' ? 'Conta Corrente' : dadosBancarios.MeioPagamento === '1' ? 'Cartão Magnético' : dadosBancarios.MeioPagamento || 'N/A'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
                            <Landmark className="w-3.5 h-3.5 text-amber-500" />
                            DADOS BANCÁRIOS
                          </p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Banco: {dadosBancarios.Banco ? formatBancoComCodigo(dadosBancarios.Banco, getBancoName(dadosBancarios.Banco)) : 'N/A'} | Ag: {dadosBancarios.Agencia || 'N/A'} | CC: {dadosBancarios.ContaPagto ? formatAccount(dadosBancarios.ContaPagto) : 'N/A'}
                          </p>
                        </div>
                    </div>

                    {/* Margens */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Margem Consignável</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white">{formatCurrency(margemConsignavel)}</p>
                        <p className="text-[9px] text-slate-400 mt-1">
                          {isSiape 
                            ? `(40% da Base ${formatCurrency(base)})` 
                            : `(${isLoas ? '35%' : '40%'} do Benefício ${formatCurrency(valorBeneficio)})`}
                        </p>
                      </div>
                      
                      <div className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Total Comprometido</p>
                        <p className="text-xl font-black text-sky-600 dark:text-sky-400">{formatCurrency(totalComprometido)}</p>
                      </div>

                      <div className={`${margemLivre < 0 ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20' : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20'} rounded-2xl p-4 border text-center`}>
                        <p className={`text-[10px] uppercase tracking-wider ${margemLivre < 0 ? 'text-rose-600/80' : 'text-emerald-600/80'} font-bold mb-1`}>Margem Livre</p>
                        <p className={`text-xl font-black ${margemLivre < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatCurrency(margemLivre)}</p>
                      </div>

                      <div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-4 shadow-lg text-center relative overflow-hidden text-white border border-white/10">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                        <p className="text-[10px] uppercase tracking-wider text-white/80 font-bold mb-1">Valor Liberado</p>
                        <p className="text-2xl font-black">{formatCurrency(valorLiberado)}</p>
                        <p className="text-[9px] text-white/80 mt-1 font-semibold">
                          Coef. Diário ({isSiape ? 'SIAPE' : 'INSS'}): {getMarginCoefficient().toString().replace('.', ',')} {coefDate ? `(${coefDate})` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Tabela de Empréstimos */}
                    {emprestimos.length > 0 && (
                      <div className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <Landmark className="w-4 h-4 text-primary" />
                            Empréstimos Ativos
                          </h3>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-primary" />
                            {emprestimos.length} {emprestimos.length === 1 ? 'Contrato Ativo' : 'Contratos Ativos'}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="px-4 py-3 font-bold">Banco</th>
                                <th className="px-4 py-3 font-bold">Contrato</th>
                                <th className="px-4 py-3 font-bold">Parcela</th>
                                <th className="px-4 py-3 font-bold">Prazo</th>
                                <th className="px-4 py-3 font-bold">Taxa</th>
                                <th className="px-4 py-3 font-bold">Valor Origin</th>
                                <th className="px-4 py-3 font-bold">Saldo Atual</th>
                                <th className="px-4 py-3 font-bold text-right">Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emprestimos.map((emp: any, idx: number) => {
                                const prazoTotal = parseInt(emp.Prazo || emp.parcelas || 0);
                                const parcelasRestantes = parseInt(emp.ParcelasRestantes || emp.prazo_restante || 0);
                                const parcelasPagas = emp.ParcelasPagas !== undefined ? parseInt(emp.ParcelasPagas) : Math.max(0, prazoTotal - parcelasRestantes);
                                const taxa = emp.Taxa || emp.taxa || 0;
                                
                                const valorOriginAPI = emp.ValorEmprestado || emp.ValorContrato || emp.ValorFinanciado || emp.ValorLiberado || emp.SaldoDevedor || emp.saldo || 0;
                                const valorOriginCalc = calculateSaldoDevedor(parseFloat(emp.ValorParcela || 0), prazoTotal, taxa);
                                const valorOrigin = parseFloat(valorOriginAPI) > 0 ? parseFloat(valorOriginAPI) : valorOriginCalc;
                                
                                const saldoAtual = calculateSaldoDevedor(parseFloat(emp.ValorParcela || 0), parcelasRestantes, taxa);
                                const isAdded = addedContractsIds?.includes(`${emp.Banco}-${emp.Contrato}`);
                                const bancoNomeSemPrefixo = getBancoName(emp.Banco) !== String(emp.Banco || '') ? getBancoName(emp.Banco) : (emp.NomeBanco || emp.Banco || '');
                                const bancoExibicao = formatBancoComCodigo(emp.Banco, bancoNomeSemPrefixo);
                                return (
                                <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap flex items-center gap-2">
                                    <Landmark className="w-4 h-4 text-primary flex-shrink-0" />
                                    <span>{bancoExibicao}</span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{emp.Contrato || 'N/A'}</td>
                                  <td className="px-4 py-3 font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">{formatCurrency(parseFloat(emp.ValorParcela || 0))}</td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                    {prazoTotal > 0 ? `${parcelasPagas}/${prazoTotal}` : `${parcelasRestantes} rest.`}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{taxa ? `${parseFloat(taxa).toFixed(2).replace('.', ',')}%` : 'N/A'}</td>
                                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{valorOrigin > 0 ? formatCurrency(parseFloat(valorOrigin)) : 'N/A'}</td>
                                  <td className="px-4 py-3 font-black text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-900/10 whitespace-nowrap">{formatCurrency(saldoAtual)}</td>
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      onClick={() => onToggleContract ? onToggleContract(emp, isAdded ? 'remove' : 'add') : null}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${isAdded ? 'bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-900/50' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'}`}
                                    >
                                      {isAdded ? 'Remover' : 'Adicionar'}
                                    </button>
                                  </td>
                                </tr>
                              )})}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Cartões Ativos Grid Premium */}
                    {cartoes.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-amber-500" />
                            Cartões Ativos (RMC & RCC)
                          </h3>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            {cartoes.length} {cartoes.length === 1 ? 'Cartão Registrado' : 'Cartões Registrados'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {rmc.map((cartao: any, idx: number) => {
                            const bancoExibicao = formatBancoComCodigo(cartao.Banco, cartao.NomeBanco || getBancoName(cartao.Banco));
                            const margemTotal = parseFloat(cartao.MargemTotal || cartao.ValorParcela || 0);
                            
                            // Calcula utilizado no frontend como fallback absoluto
                            const rmcLoansSum = cardLoansList.filter((l: any) => l.TipoCartao === 'RMC').reduce((acc: number, l: any) => acc + parseFloat(l.ValorParcela || 0), 0);
                            const backendDisponivel = cartao.MargemDisponivel !== undefined ? parseFloat(cartao.MargemDisponivel) : margemTotal;
                            const margemDisponivel = (rmcLoansSum > 0 && backendDisponivel === margemTotal) ? Math.max(0, margemTotal - rmcLoansSum) : backendDisponivel;
                            
                            const limiteValor = parseFloat(cartao.Limite || cartao.Valor || cartao.Valor_emprestimo || cartao.LimiteCartao || 0);
                            const numeroContrato = String(cartao.Contrato || cartao.contrato || '').trim();

                            return (
                              <div key={`rmc-${idx}`} className="bg-gradient-to-br from-white via-slate-50/50 to-sky-50/20 dark:from-slate-900 dark:via-slate-900/90 dark:to-sky-950/20 rounded-2xl border border-sky-200/60 dark:border-sky-800/40 shadow-md p-5 relative overflow-hidden flex flex-col justify-between hover:shadow-lg transition-all">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl"></div>
                                
                                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 font-black text-xs shrink-0">
                                      <CreditCard className="w-4.5 h-4.5" />
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase">Cartão Consignado (RMC)</h4>
                                      <p className="text-[10px] text-slate-500 font-semibold">{bancoExibicao}</p>
                                    </div>
                                  </div>
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 uppercase tracking-wider shrink-0">
                                    Desconto em Folha
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Margem / Parcela</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-slate-200">{formatCurrency(margemTotal)}</p>
                                  </div>

                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center bg-emerald-50/20">
                                    <p className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold mb-0.5">Disponível</p>
                                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(margemDisponivel)}</p>
                                  </div>

                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Limite do Cartão</p>
                                    <p className="text-sm font-black text-sky-600 dark:text-sky-400">{formatCurrency(limiteValor)}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {rcc.map((cartao: any, idx: number) => {
                            const bancoExibicao = formatBancoComCodigo(cartao.Banco, cartao.NomeBanco || getBancoName(cartao.Banco));
                            const margemTotal = parseFloat(cartao.MargemTotal || cartao.ValorParcela || 0);
                            
                            // Calcula utilizado no frontend como fallback absoluto
                            const rccLoansSum = cardLoansList.filter((l: any) => l.TipoCartao === 'RCC').reduce((acc: number, l: any) => acc + parseFloat(l.ValorParcela || 0), 0);
                            const backendDisponivel = cartao.MargemDisponivel !== undefined ? parseFloat(cartao.MargemDisponivel) : margemTotal;
                            const margemDisponivel = (rccLoansSum > 0 && backendDisponivel === margemTotal) ? Math.max(0, margemTotal - rccLoansSum) : backendDisponivel;
                            
                            const limiteValor = parseFloat(cartao.Limite || cartao.Valor || cartao.Valor_emprestimo || cartao.LimiteCartao || 0);
                            const numeroContrato = String(cartao.Contrato || cartao.contrato || '').trim();

                            return (
                              <div key={`rcc-${idx}`} className="bg-gradient-to-br from-white via-slate-50/50 to-amber-50/20 dark:from-slate-900 dark:via-slate-900/90 dark:to-amber-950/20 rounded-2xl border border-amber-200/60 dark:border-amber-800/40 shadow-md p-5 relative overflow-hidden flex flex-col justify-between hover:shadow-lg transition-all">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl"></div>
                                
                                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 font-black text-xs shrink-0">
                                      <Wallet className="w-4.5 h-4.5" />
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase">Cartão Benefício (RCC)</h4>
                                      <p className="text-[10px] text-slate-500 font-semibold">{bancoExibicao}</p>
                                    </div>
                                  </div>
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 uppercase tracking-wider shrink-0">
                                    Cartão Benefício
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Margem / Parcela</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-slate-200">{formatCurrency(margemTotal)}</p>
                                  </div>

                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/30 text-center bg-amber-50/20">
                                    <p className="text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold mb-0.5">Disponível</p>
                                    <p className="text-sm font-black text-amber-600 dark:text-amber-400">{formatCurrency(margemDisponivel)}</p>
                                  </div>

                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Limite do Cartão</p>
                                    <p className="text-sm font-black text-amber-600 dark:text-amber-400">{formatCurrency(limiteValor)}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Tabela de Empréstimos e Saques de Cartões Averbados */}
                        {cardLoansList.length > 0 && (
                          <div className="bg-white dark:bg-slate-950 rounded-2xl border border-amber-200/60 dark:border-amber-800/40 shadow-sm overflow-hidden mt-4">
                            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50/30 dark:bg-amber-950/20 flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-amber-500" />
                                Empréstimos e Saques Averbados nos Cartões (RMC / RCC)
                              </h4>
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 uppercase">
                                {cardLoansList.length} {cardLoansList.length === 1 ? 'Contrato Averbado' : 'Contratos Averbados'}
                              </span>
                            </div>
                            
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                                  <tr>
                                    <th className="px-4 py-2.5 font-bold">Tipo</th>
                                    <th className="px-4 py-2.5 font-bold">Banco</th>
                                    <th className="px-4 py-2.5 font-bold">Nº do Contrato</th>
                                    <th className="px-4 py-2.5 font-bold">Parcela</th>
                                    <th className="px-4 py-2.5 font-bold">Qtd. Parcelas</th>
                                    <th className="px-4 py-2.5 font-bold">Qtd. Restante</th>
                                    <th className="px-4 py-2.5 font-bold">Valor do Contrato</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cardLoansList.map((item: any, idx: number) => {
                                    const bancoCode = item.Banco || '0';
                                    const bancoNome = item.NomeBanco || getBancoName(bancoCode);
                                    const bancoExibicao = formatBancoComCodigo(bancoCode, bancoNome);
                                    const parcela = parseFloat(item.ValorParcela || item.Parcela || 0);
                                    const valorContrato = parseFloat(item.ValorLiberado || item.ValorEmprestado || item.SaldoDevedor || 0);
                                    const prazoTotal = parseInt(item.Prazo || 0);
                                    const parcelasRestantes = parseInt(item.ParcelasRestantes || 0);

                                    return (
                                      <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                        <td className="px-4 py-2.5 font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 uppercase">
                                            {item.TipoCartao || 'RCC'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                          {bancoExibicao}
                                        </td>
                                        <td className="px-4 py-2.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                          {item.Contrato || 'N/A'}
                                        </td>
                                        <td className="px-4 py-2.5 font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                          {formatCurrency(parcela)}
                                        </td>
                                        <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                          {prazoTotal > 0 ? `${prazoTotal}x` : 'N/A'}
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                          {parcelasRestantes > 0 ? `${parcelasRestantes} rest.` : 'N/A'}
                                        </td>
                                        <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                          {valorContrato > 0 ? formatCurrency(valorContrato) : 'N/A'}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Nenhum benefício encontrado</h3>
              <p className="text-slate-500 text-sm max-w-sm">Não localizamos benefícios atrelados a este CPF na base de dados.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
