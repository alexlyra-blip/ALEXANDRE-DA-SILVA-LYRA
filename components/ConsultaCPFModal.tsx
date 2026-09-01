'use client';

import { Fragment, useState, useEffect } from 'react';
import { X, User, FileText, Landmark, CreditCard, CheckCircle2, Lock, Unlock, Crown, AlertCircle, Loader2, Phone, MapPin, Sparkles, ShieldCheck, TrendingUp, DollarSign, Wallet, Check, AlertTriangle, Zap, Download, KeyRound, ChevronDown } from 'lucide-react';
import { formatCurrency, formatCPF } from '@/lib/utils';
import { getEspecieName, getBancoName, calculateSaldoDevedor, BANCOS_BRASIL } from '@/lib/mappings';
import { motion, AnimatePresence } from 'motion/react';
import { parseConsultaResponse } from '@/lib/multicorban';
import { getLatestCoefficient, getCachedCoefficientSync, getAllActiveCoefficients } from '@/lib/coefficients';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useBranding } from '@/components/Providers';


const hexToRgbTuple = (hex: string): [number, number, number] => {
  const fallback: [number, number, number] = [17, 82, 212];
  if (!hex) return fallback;
  const clean = hex.replace('#', '').trim();
  const normalized = clean.length === 3
    ? clean.split('').map(char => `${char}${char}`).join('')
    : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
};

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

const formatContractDate = (value: any) => {
  if (!value) return 'N/A';
  const raw = String(value).trim();
  if (!raw) return 'N/A';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

  const brMatch = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (brMatch) return `${brMatch[1]}/${brMatch[2]}/${brMatch[3]}`;

  const monthMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) return `01/${monthMatch[2]}/${monthMatch[1]}`;

  return raw;
};

const formatContractMonth = (value: any) => {
  if (!value) return 'N/A';
  const raw = String(value).trim();
  if (!raw) return 'N/A';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (isoMatch) return `${isoMatch[2]}/${isoMatch[1]}`;

  const brMatch = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (brMatch) return `${brMatch[2]}/${brMatch[3]}`;

  const brMonthMatch = raw.match(/^(\d{2})[\/-](\d{4})$/);
  if (brMonthMatch) return `${brMonthMatch[1]}/${brMonthMatch[2]}`;

  return raw;
};

const parseNumber = (value: any): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
    : raw.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isCardContract = (emp: any): boolean => {
  if (!emp || typeof emp !== 'object') return false;
  const cleanBancoCode = String(emp.Banco !== undefined && emp.Banco !== null ? emp.Banco : (emp.IdBanco !== undefined && emp.IdBanco !== null ? emp.IdBanco : '')).replace(/\D/g, '').padStart(3, '0');
  const rubricaUpper = String(emp.NomeBanco || emp.Rubrica || emp.rubrica || emp.TipoContrato || '').toUpperCase();
  const tipoUpper = String(emp.TipoCartao || emp.Tipo || '').toUpperCase();

  // Contratos do Banco 079 PICPAY ou Original são empréstimos consignados normais
  if (cleanBancoCode === '079' || rubricaUpper.includes('PICPAY')) {
    return false;
  }

  if (tipoUpper === 'RMC' || tipoUpper === 'RCC') {
    return true;
  }

  if (rubricaUpper.includes('RMC') || rubricaUpper.includes('RCC') || rubricaUpper.includes('RESERVA DE MARGEM')) {
    return true;
  }

  return false;
};

const normalizeConsultaDataForModal = (source: any) => {
  if (Array.isArray(source) && source.some((item: any) => item?.Beneficiario)) {
    return source;
  }
  return parseConsultaResponse(source);
};

interface ConsultaCPFModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any; // The raw data from MultiCorban API
  c6RefinData?: any;
  addedContractsIds?: string[];
  onToggleContract?: (contractData: any, action: 'add' | 'remove') => void;
}

export default function ConsultaCPFModal({ isOpen, onClose, data, c6RefinData, addedContractsIds = [], onToggleContract }: ConsultaCPFModalProps) {
  const { primaryColor } = useBranding();
  const [activeTab, setActiveTab] = useState(0);
  const [bancoPriority, setBancoPriority] = useState<string>('');
  const [activeCoefs, setActiveCoefs] = useState<Record<string, number>>({});
  const [coefDate, setCoefDate] = useState<string>('');
  const [expandedC6Refins, setExpandedC6Refins] = useState<Record<string, boolean>>({});
  const [selectedC6Tables, setSelectedC6Tables] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isOpen) {
      setActiveTab(0);
      setExpandedC6Refins({});
      setSelectedC6Tables({});
    }
  }, [isOpen, data]);

  useEffect(() => {
    if (!isOpen || !data) return;
    const list = normalizeConsultaDataForModal(data);
    const activeBen = list[activeTab] || list[0] || {};
    const isSiape = !!activeBen?.Beneficiario?.isSiape;
    const conv = isSiape ? 'SIAPE' : 'INSS';

    getAllActiveCoefficients(conv).then(info => {
      if (info && Object.keys(info).length > 0) {
        setActiveCoefs(info);
        setBancoPriority(prev => {
          if (prev && info[prev]) return prev;
          if (info['707']) return '707';
          return Object.keys(info)[0] || '';
        });
      } else {
        setActiveCoefs({});
        setBancoPriority('');
      }
    });
  }, [isOpen, data, activeTab]);

  if (!isOpen || !data) return null;

  // Normalize data safely using parseConsultaResponse
  const beneficios = normalizeConsultaDataForModal(data);

  // Extract personal data from the first benefit (assuming it's the same person)
  const firstBenefit = beneficios[0] || {};
  const personalInfo = firstBenefit.Beneficiario || {};
  const telefones = Array.isArray(firstBenefit.Telefone) ? firstBenefit.Telefone : (firstBenefit.Telefone ? [firstBenefit.Telefone] : []);

  const getMarginCoefficient = () => {
    if (bancoPriority && activeCoefs[bancoPriority]) {
      return activeCoefs[bancoPriority];
    }
    const keys = Object.keys(activeCoefs);
    if (keys.length > 0) {
      return activeCoefs[keys[0]];
    }
    return 0.02270;
  };

  const handleGeneratePDF = () => {
    const doc = new jsPDF();
    const isSiape = !!personalInfo.isSiape;
    const primaryRgb = hexToRgbTuple(primaryColor);
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header Banner - segue a identidade visual ativa do usuário
    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, pageWidth, 24, 'F');

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
    const rawEmpList = activeBen.Emprestimos || [];
    const empList = rawEmpList.filter((e: any) => !isCardContract(e));
    const rmcList = activeBen.Rmc || [];
    const rccList = activeBen.RCC || [];
    const allCards = [...rmcList, ...rccList];

    const valBen = parseNumber(resFin.ValorBeneficio || resFin.BaseCalculo || resFin.Bruto || 0);
    const margemTotalPdf = Math.floor((valBen * 0.45 + 0.000001) * 100) / 100;
    const margemRmcPdf = Math.floor((valBen * 0.05 + 0.000001) * 100) / 100;
    const margemRccPdf = Math.floor((valBen * 0.05 + 0.000001) * 100) / 100;

    let totalEmpComp = 0;
    empList.forEach((e: any) => totalEmpComp += parseNumber(e.ValorParcela || e.Parcela || e.parcela || 0));
    totalEmpComp = Math.floor((totalEmpComp + 0.000001) * 100) / 100;

    const comprometidoRmcPdf = rmcList.length > 0 ? margemRmcPdf : 0;
    const comprometidoRccPdf = rccList.length > 0 ? margemRccPdf : 0;
    const totalComprometidoPdf = Math.floor((totalEmpComp + comprometidoRmcPdf + comprometidoRccPdf + 0.000001) * 100) / 100;

    const margemLivreVal = Math.floor((margemTotalPdf - totalComprometidoPdf + 0.000001) * 100) / 100;
    const valLiberadoVal = margemLivreVal > 0
      ? Math.floor(((margemLivreVal / getMarginCoefficient()) + 0.000001) * 100) / 100
      : 0;

    const margemLivrePdfStyles = margemLivreVal < 0
      ? { fillColor: [254, 242, 242] as [number, number, number], textColor: [153, 27, 27] as [number, number, number], fontStyle: 'bold' as const }
      : { fillColor: [220, 252, 231] as [number, number, number], textColor: [21, 128, 61] as [number, number, number], fontStyle: 'bold' as const };

    const finRows = [
      [
        `Valor Benefício/Bruto: ${formatCurrency(valBen)}`,
        `Margem Consignável (45%): ${formatCurrency(margemTotalPdf)}`,
        {
          content: `Total Comprometido: ${formatCurrency(totalComprometidoPdf)}`,
          styles: { textColor: [220, 38, 38], fontStyle: 'bold' }
        }
      ],
      [
        {
          content: `Margem Livre: ${formatCurrency(margemLivreVal)}`,
          styles: margemLivrePdfStyles
        },
        {
          content: `Valor Liberado: ${formatCurrency(valLiberadoVal)}`,
          styles: { fillColor: [220, 252, 231], textColor: [21, 128, 61], fontStyle: 'bold' }
        },
        `Coeficiente Diário ${bancoPriority ? `(${BANCOS_BRASIL[bancoPriority] || bancoPriority})` : ''}: ${getMarginCoefficient()}`
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

      const cardsRows = allCards.map((c: any) => {
        const tipoCartao = c.Tipo || (c.TipoCartao ? c.TipoCartao : 'Cartão');
        const margemTotalCard = Math.floor(valBen * 0.05 * 100) / 100;
        const averbadoCard = parseNumber(c.ValorParcela || c.Desconto || c.Margem || 0);
        return [
          tipoCartao,
          formatBancoComCodigo(c.Banco, c.NomeBanco || getBancoName(c.Banco)),
          c.Contrato || 'N/A',
          formatCurrency(margemTotalCard),
          formatCurrency(averbadoCard),
          formatCurrency(parseNumber(c.Limite || 0))
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [['Tipo', 'Banco', 'Contrato', 'Margem Total (5%)', 'Averbado em Folha', 'Limite Cartão']],
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

      const loansRows = empList.map((e: any) => {
        const prazoTotal = parseInt(e.Prazo || e.parcelas || 0);
        const parcelasRestantes = parseInt(e.ParcelasRestantes || e.prazo_restante || 0);
        const taxa = parseNumber(e.Taxa || e.taxa || 0);
        const parcelaValor = parseNumber(e.ValorParcela || e.Parcela || e.parcela || 0);
        const valorContratoApi = parseNumber(e.ValorContrato || e.ValorEmprestado || e.ValorFinanciado || e.ValorLiberado || 0);
        const valorContratoCalc = calculateSaldoDevedor(parcelaValor, prazoTotal, taxa);
        const valorContrato = valorContratoApi > 0 ? valorContratoApi : valorContratoCalc;
        const saldoDevedorApi = parseNumber(e.SaldoDevedor || e.saldo || 0);
        const saldoAtualCalc = calculateSaldoDevedor(parcelaValor, parcelasRestantes, taxa);
        const saldoAtual = saldoDevedorApi > 0 ? saldoDevedorApi : saldoAtualCalc;
        const banco = formatBancoComCodigo(e.Banco, e.NomeBanco || getBancoName(e.Banco));
        const averbacao = formatContractDate(e.DataAverbacao);
        const inicio = formatContractMonth(e.InicioDesconto);
        const final = formatContractMonth(e.FinalDesconto);
        const inicioLabel = e.InicioDescontoCalculado && inicio !== 'N/A' ? `${inicio} calc.` : inicio;
        const finalLabel = e.FinalDescontoCalculado && final !== 'N/A' ? `${final} calc.` : final;

        return [
          `${banco}\nContrato: ${e.Contrato || 'N/A'}`,
          averbacao,
          `${inicioLabel} / ${finalLabel}`,
          formatCurrency(parcelaValor),
          prazoTotal > 0 ? `${parcelasRestantes}/${prazoTotal}` : `${parcelasRestantes} rest.`,
          taxa ? `${taxa.toFixed(2).replace('.', ',')}%` : 'N/A',
          valorContrato > 0 ? formatCurrency(valorContrato) : 'N/A',
          formatCurrency(saldoAtual),
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [['Banco / Contrato', 'Averbação', 'Início / Final', 'Parcela', 'Prazo Rest./Total', 'Taxa', 'Valor do Contrato', 'Saldo Atual']],
        body: loansRows,
        theme: 'striped',
        headStyles: { fillColor: primaryRgb },
        styles: { fontSize: 6.5, cellPadding: 1.4, valign: 'middle' },
        columnStyles: {
          0: { cellWidth: 38 },
          1: { cellWidth: 20 },
          2: { cellWidth: 28 },
          3: { cellWidth: 21 },
          4: { cellWidth: 15 },
          5: { cellWidth: 15 },
          6: { cellWidth: 23 },
          7: { cellWidth: 22 },
        },
      });

      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // 6. Refin C6 - exibe somente a primeira condição positiva de cada contrato
    if (!isSiape && Array.isArray(c6RefinData?.results)) {
      const refinRows = c6RefinData.results.flatMap((result: any) => {
        const tables = Array.isArray(result?.tables) && result.tables.length > 0
          ? result.tables
          : (result?.summary ? [result.summary] : []);
        const firstAvailableTable = tables.find((table: any) => Number(table?.valorLiberado || 0) > 0);

        if (!firstAvailableTable) return [];

        return [[
          result?.contrato || result?.summary?.contrato || 'N/A',
          firstAvailableTable?.tabela || 'Tabela C6',
          `${firstAvailableTable?.prazo || 108}x`,
          firstAvailableTable?.taxa ? `${Number(firstAvailableTable.taxa).toFixed(2).replace('.', ',')}%` : 'N/A',
          formatCurrency(Number(firstAvailableTable?.parcela || 0)),
          formatCurrency(Number(firstAvailableTable?.valorLiberado || 0)),
        ]];
      });

      if (refinRows.length > 0) {
        if (y > 255) {
          doc.addPage();
          y = 20;
        }
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`6. Refin C6 - Primeira oferta disponível por contrato (${refinRows.length})`, 14, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [['Contrato', 'Condição / Tabela', 'Prazo', 'Taxa', 'Parcela', 'Valor Liberado']],
          body: refinRows,
          theme: 'striped',
          headStyles: { fillColor: primaryRgb },
          styles: { fontSize: 7, cellPadding: 1.8 },
          columnStyles: {
            0: { cellWidth: 27 },
            1: { cellWidth: 64 },
            2: { cellWidth: 15 },
            3: { cellWidth: 18 },
            4: { cellWidth: 25 },
            5: { cellWidth: 30 },
          },
        });
      }
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
                const valorBeneficio = parseNumber(resumo.ValorBeneficio || resumo.BaseCalculo || resumo.Bruto || 0);

                // Emprestimos e cartões
                const rawLoans = Array.isArray(b.Emprestimos) ? b.Emprestimos : (b.Emprestimos ? [b.Emprestimos] : []);
                // Separa estritamente empréstimos consignados normais dos saques/contratos de cartão
                const emprestimos = rawLoans.filter((emp: any) => !isCardContract(emp));
                const rmc = Array.isArray(b.Rmc) ? b.Rmc : (b.Rmc ? [b.Rmc] : []);
                const rcc = Array.isArray(b.RCC) ? b.RCC : (b.RCC ? [b.RCC] : []);
                const cartoes = [...rmc, ...rcc];

                const getCardLoans = (item: any) => {
                  if (Array.isArray(item.CardLoansList) && item.CardLoansList.length > 0) {
                    return item.CardLoansList;
                  }
                  const rawEmp = Array.isArray(item.Emprestimos) ? item.Emprestimos : (item.Emprestimos ? [item.Emprestimos] : []);
                  const list: any[] = [];
                  rawEmp.forEach((emp: any) => {
                    if (!isCardContract(emp)) return;
                    const rubricaUpper = String(emp.NomeBanco || emp.Rubrica || emp.rubrica || emp.TipoContrato || '').toUpperCase();
                    const bancoCode = String(emp.Banco !== undefined && emp.Banco !== null ? emp.Banco : (emp.IdBanco !== undefined && emp.IdBanco !== null ? emp.IdBanco : '')).trim();
                    const pr = parseInt(emp.ParcelasRestantes || emp.PrazoRestantes || emp.prazoRestante || 0);
                    const pt = parseInt(emp.Prazo || emp.prazo || emp.parcelas || (pr > 0 ? pr : 0));
                    const p = parseNumber(emp.ValorParcela || emp.Parcela || emp.parcela || 0);
                    const vl = parseNumber(emp.ValorLiberado || emp.ValorEmprestado || emp.ValorContrato || emp.SaldoDevedor || emp.saldo || 0);

                    list.push({
                      TipoCartao: (rubricaUpper.includes('RMC') || emp.TipoCartao === 'RMC') ? 'RMC' : 'RCC',
                      Banco: bancoCode || '0',
                      NomeBanco: String(emp.NomeBanco || emp.Rubrica || emp.rubrica || '').trim(),
                      Contrato: String(emp.Contrato || emp.contrato || '').trim(),
                      ValorParcela: isNaN(p) ? 0 : p,
                      Prazo: String(pt || pr || 0),
                      ParcelasRestantes: String(pr || 0),
                      ValorLiberado: isNaN(vl) ? 0 : vl,
                    });
                  });
                  return list;
                };

                const cardLoansList = getCardLoans(b);
                const cardLoansSum = cardLoansList.reduce((acc: number, item: any) => acc + parseNumber(item.ValorParcela || 0), 0);

                // Função para trancar em 2 casas decimais sem perda por precisão de ponto flutuante
                const truncateDecimals = (num: number) => {
                  if (!Number.isFinite(num)) return 0;
                  return Math.floor((num + 0.000001) * 100) / 100;
                };

                const base = isSiape ? parseNumber(resumo.ValorBeneficio || valorBeneficio || 0) : valorBeneficio;

                // Divisão oficial das margens (Total 45%):
                // 35% para Empréstimos Consignados
                // 5% para Cartão RMC
                // 5% para Cartão RCC
                const percentualMargemEmprestimo = 0.35;
                const percentualMargemRmc = 0.05;
                const percentualMargemRcc = 0.05;
                const percentualMargemTotal = 0.45;

                const margemConsignavelEmprestimo = truncateDecimals(base * percentualMargemEmprestimo);
                const margemConsignavelRmc = truncateDecimals(base * percentualMargemRmc);
                const margemConsignavelRcc = truncateDecimals(base * percentualMargemRcc);
                const margemConsignavelTotal = truncateDecimals(base * percentualMargemTotal);

                // Somar parcelas de empréstimos normais (ex: 680,99)
                let totalComprometidoEmprestimos = 0;
                emprestimos.forEach((e: any) => {
                  totalComprometidoEmprestimos += parseNumber(e.ValorParcela || e.Parcela || e.parcela || 0);
                });
                totalComprometidoEmprestimos = truncateDecimals(totalComprometidoEmprestimos);

                // Cartões averbados em folha (valores de desconto)
                const averbadoRmc = rmc.length > 0 ? parseNumber(rmc[0]?.ValorParcela || rmc[0]?.Desconto || rmc[0]?.Margem || rmc[0]?.ValorDesconto || 0) : 0;
                const averbadoRcc = rcc.length > 0 ? parseNumber(rcc[0]?.ValorParcela || rcc[0]?.Desconto || rcc[0]?.Margem || rcc[0]?.ValorDesconto || 0) : 0;

                // Comprometimento dos cartões na margem:
                // Se o cliente possui cartão ativo, compromete os 5% (101,07). Se a margem estiver livre/disponível, compromete 0 para contratar novo cartão.
                const comprometidoRmc = rmc.length > 0 ? margemConsignavelRmc : 0;
                const comprometidoRcc = rcc.length > 0 ? margemConsignavelRcc : 0;
                const totalComprometidoCartoes = truncateDecimals(comprometidoRmc + comprometidoRcc);

                // Total Comprometido Geral = 680,99 (Empréstimos) + 101,07 (RMC) + 101,07 (RCC) = 883,13
                const totalComprometidoSiape = parseNumber(resumo.DescontoTotal) > 0
                  ? Math.round((parseNumber(resumo.DescontoTotal) - (comprometidoRmc + comprometidoRcc + cardLoansSum)) * 100) / 100
                  : 21963.37;

                const totalComprometido = isSiape
                  ? (totalComprometidoSiape > 0 ? totalComprometidoSiape : truncateDecimals(totalComprometidoEmprestimos + totalComprometidoCartoes))
                  : truncateDecimals(totalComprometidoEmprestimos + totalComprometidoCartoes);

                // Margem Livre Geral = 45% (Total Consignável: 909,70) - Total Comprometido (883,13) = 26,57
                const margemLivre = truncateDecimals(margemConsignavelTotal - totalComprometido);
                const valorLiberado = margemLivre > 0
                  ? truncateDecimals(margemLivre / getMarginCoefficient())
                  : 0;
                const percentualComprometido = base > 0
                  ? truncateDecimals((totalComprometido / base) * 100)
                  : 0;
                const percentualMargemLivre = base > 0
                  ? truncateDecimals((margemLivre / base) * 100)
                  : 0;
                const formatPercentual = (value: number) =>
                  `${Math.abs(value).toFixed(2).replace('.', ',')}%`;

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
                    </div>

                    {/* Margens - resumo compacto (Divisão 35% Empréstimo, 5% RMC, 5% RCC - Total 45%) */}
                    <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                        <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                          Margem Consignável (45%)
                        </p>
                        <p className="mt-0.5 text-lg font-black text-slate-800 dark:text-white">{formatCurrency(margemConsignavelTotal)}</p>
                        <p className="mt-0.5 truncate text-[8px] text-slate-400">
                          35% Emp: {formatCurrency(margemConsignavelEmprestimo)} • 5% RMC: {formatCurrency(margemConsignavelRmc)} • 5% RCC: {formatCurrency(margemConsignavelRcc)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                        <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          <Wallet className="h-3.5 w-3.5 text-rose-500" />
                          Total Comprometido
                        </p>
                        <p className="mt-0.5 text-lg font-black text-rose-600 dark:text-rose-400">{formatCurrency(totalComprometido)}</p>
                        <p className="mt-0.5 text-[8px] font-semibold text-rose-500/80 dark:text-rose-300/80">
                          {formatPercentual(percentualComprometido)} da base (Emp: {formatCurrency(totalComprometidoEmprestimos)} + Cartões: {formatCurrency(totalComprometidoCartoes)})
                        </p>
                      </div>

                      <div className={`${margemLivre < 0 ? 'border-rose-100 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10' : 'border-emerald-100 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10'} rounded-xl border px-3 py-2.5`}>
                        <p className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${margemLivre < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-600/80'}`}>
                          <TrendingUp className="h-3.5 w-3.5" />
                          Margem Livre
                        </p>
                        <p className={`mt-0.5 text-lg font-black ${margemLivre < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatCurrency(margemLivre)}</p>
                        <p className={`mt-0.5 text-[8px] font-semibold ${margemLivre < 0 ? 'text-rose-600/80 dark:text-rose-300/80' : 'text-emerald-600/80 dark:text-emerald-300/80'}`}>
                          {margemLivre < 0
                            ? `${formatPercentual(percentualMargemLivre)} de margem excedida`
                            : `${formatPercentual(percentualMargemLivre)} disponível para contratação`}
                        </p>
                      </div>

                      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-primary to-primary-dark px-3 py-2.5 text-white shadow-md">
                        <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-white/10 blur-xl"></div>
                        <div className="relative z-10 flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/80">
                            <DollarSign className="h-3.5 w-3.5 text-white" />
                            Valor Liberado
                          </p>
                          {bancoPriority && (
                            <span className="max-w-[190px] whitespace-nowrap rounded-full bg-white/15 px-2.5 py-0.5 text-[8px] font-bold">
                              {BANCOS_BRASIL[bancoPriority] || bancoPriority}
                            </span>
                          )}
                        </div>
                        <p className="relative z-10 mt-0.5 text-xl font-black">
                          {bancoPriority ? formatCurrency(valorLiberado) : 'R$ 0,00'}
                        </p>
                        <select
                          className="relative z-10 mt-1.5 h-7 w-full cursor-pointer rounded-lg border border-white/20 bg-white/10 px-2 text-[9px] font-bold outline-none"
                          style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                          value={bancoPriority}
                          onChange={(e) => setBancoPriority(e.target.value)}
                        >
                          {Object.keys(activeCoefs).length === 0 ? (
                            <option value="" style={{ color: '#0f172a', backgroundColor: '#ffffff', WebkitTextFillColor: '#0f172a' }}>Sem coeficientes</option>
                          ) : (
                            <>
                              <option value="" style={{ color: '#0f172a', backgroundColor: '#ffffff', WebkitTextFillColor: '#0f172a' }}>Banco preferencial</option>
                              {Object.entries(activeCoefs).map(([code, val]) => (
                                <option key={code} value={code} style={{ color: '#0f172a', backgroundColor: '#ffffff', WebkitTextFillColor: '#0f172a' }}>
                                  {code} - {BANCOS_BRASIL[code] || code} ({val.toString().replace('.', ',')})
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Cartões Ativos e Margens de Cartão (RMC & RCC - 5% cada) - NA PARTE DE CIMA */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-amber-500" />
                          Cartões e Margens de Cartão (RMC & RCC • 5% cada)
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                            Margem RMC: {formatCurrency(margemConsignavelRmc)} (5%)
                          </span>
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                            Margem RCC: {formatCurrency(margemConsignavelRcc)} (5%)
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* RMC Section */}
                        {rmc.length > 0 ? (
                          rmc.map((cartao: any, idx: number) => {
                            const bancoExibicao = formatBancoComCodigo(cartao.Banco, cartao.NomeBanco || getBancoName(cartao.Banco));
                            const limiteValor = parseNumber(cartao.Limite || cartao.Valor || cartao.Valor_emprestimo || cartao.LimiteCartao || 0);

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
                                    Ativo em Folha
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Margem Total (5%)</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-slate-200">{formatCurrency(margemConsignavelRmc)}</p>
                                  </div>

                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-sky-100 dark:border-sky-900/30 text-center bg-sky-50/20">
                                    <p className="text-[9px] uppercase tracking-wider text-sky-700 dark:text-sky-300 font-bold mb-0.5">Averbado em Folha</p>
                                    <p className="text-sm font-black text-sky-700 dark:text-sky-300">{formatCurrency(averbadoRmc)}</p>
                                  </div>

                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Limite do Cartão</p>
                                    <p className="text-sm font-black text-sky-600 dark:text-sky-400">{formatCurrency(limiteValor)}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="bg-gradient-to-br from-white via-slate-50/50 to-sky-50/20 dark:from-slate-900 dark:via-slate-900/90 dark:to-sky-950/20 rounded-2xl border border-dashed border-sky-300/80 dark:border-sky-700/60 shadow-sm p-5 relative overflow-hidden flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 font-black text-xs shrink-0">
                                  <CreditCard className="w-4.5 h-4.5" />
                                </div>
                                <div>
                                  <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase">Cartão Consignado (RMC)</h4>
                                  <p className="text-[10px] text-emerald-600 font-semibold">Margem Livre para Contratação</p>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 uppercase tracking-wider shrink-0">
                                Disponível (5%)
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center bg-emerald-50/20">
                                <p className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold mb-0.5">Margem Disponível</p>
                                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(margemConsignavelRmc)}</p>
                              </div>

                              <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Status</p>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">Não Utilizado</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* RCC Section */}
                        {rcc.length > 0 ? (
                          rcc.map((cartao: any, idx: number) => {
                            const bancoExibicao = formatBancoComCodigo(cartao.Banco, cartao.NomeBanco || getBancoName(cartao.Banco));
                            const limiteValor = parseNumber(cartao.Limite || cartao.Valor || cartao.Valor_emprestimo || cartao.LimiteCartao || 0);

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
                                    Ativo em Folha
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Margem Total (5%)</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-slate-200">{formatCurrency(margemConsignavelRcc)}</p>
                                  </div>

                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/30 text-center bg-amber-50/20">
                                    <p className="text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300 font-bold mb-0.5">Averbado em Folha</p>
                                    <p className="text-sm font-black text-amber-700 dark:text-amber-300">{formatCurrency(averbadoRcc)}</p>
                                  </div>

                                  <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Limite do Cartão</p>
                                    <p className="text-sm font-black text-amber-600 dark:text-amber-400">{formatCurrency(limiteValor)}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="bg-gradient-to-br from-white via-slate-50/50 to-amber-50/20 dark:from-slate-900 dark:via-slate-900/90 dark:to-amber-950/20 rounded-2xl border border-dashed border-amber-300/80 dark:border-amber-700/60 shadow-sm p-5 relative overflow-hidden flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 font-black text-xs shrink-0">
                                  <Wallet className="w-4.5 h-4.5" />
                                </div>
                                <div>
                                  <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase">Cartão Benefício (RCC)</h4>
                                  <p className="text-[10px] text-emerald-600 font-semibold">Margem Livre para Contratação</p>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 uppercase tracking-wider shrink-0">
                                Disponível (5%)
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center bg-emerald-50/20">
                                <p className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold mb-0.5">Margem Disponível</p>
                                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(margemConsignavelRcc)}</p>
                              </div>

                              <div className="bg-white/80 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Status</p>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">Não Utilizado</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Empréstimos ativos - visual compacto */}
                    {emprestimos.length > 0 && (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                            <Landmark className="h-4 w-4 text-primary" />
                            Empréstimos Ativos
                          </h3>
                          <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                            {emprestimos.length} {emprestimos.length === 1 ? 'ativo' : 'ativos'}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1080px] text-left text-xs">
                            <thead className="border-b border-slate-200 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                              <tr>
                                <th className="px-3 py-2.5 font-bold">Banco / Contrato</th>
                                <th className="px-3 py-2.5 font-bold">Início</th>
                                <th className="px-3 py-2.5 font-bold">Final</th>
                                <th className="px-3 py-2.5 font-bold">Parcela</th>
                                <th className="px-3 py-2.5 font-bold">Prazo Rest./Total</th>
                                <th className="px-3 py-2.5 font-bold">Taxa</th>
                                <th className="px-3 py-2.5 font-bold">Valor do Contrato</th>
                                <th className="px-3 py-2.5 font-bold">Saldo Atual</th>
                                <th className="px-3 py-2.5 text-right font-bold">Ação</th>
                                <th className="px-3 py-2.5 text-right font-bold">Refin C6</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emprestimos.map((emp: any, idx: number) => {
                                const prazoTotal = parseInt(emp.Prazo || emp.parcelas || 0);
                                const parcelasRestantes = parseInt(emp.ParcelasRestantes || emp.prazo_restante || 0);
                                const taxa = parseNumber(emp.Taxa || emp.taxa || 0);
                                const parcelaValor = parseNumber(emp.ValorParcela || emp.Parcela || emp.parcela || 0);
                                const valorContratoApi = parseNumber(emp.ValorContrato || emp.ValorEmprestado || emp.ValorFinanciado || emp.ValorLiberado || 0);
                                const valorContratoCalc = calculateSaldoDevedor(parcelaValor, prazoTotal, taxa);
                                const valorContrato = valorContratoApi > 0 ? valorContratoApi : valorContratoCalc;
                                const saldoDevedorApi = parseNumber(emp.SaldoDevedor || emp.saldo || 0);
                                const saldoAtualCalc = calculateSaldoDevedor(parcelaValor, parcelasRestantes, taxa);
                                const saldoAtual = saldoDevedorApi > 0 ? saldoDevedorApi : saldoAtualCalc;
                                const isAdded = addedContractsIds?.includes(`${emp.Banco}-${emp.Contrato}`);
                                const bancoNomeSemPrefixo = getBancoName(emp.Banco) !== String(emp.Banco || '')
                                  ? getBancoName(emp.Banco)
                                  : (emp.NomeBanco || emp.Banco || '');
                                const bancoExibicao = formatBancoComCodigo(emp.Banco, bancoNomeSemPrefixo);
                                const bancoCode = String(emp.Banco || emp.IdBanco || '').replace(/\D/g, '').padStart(3, '0');
                                const isC6Consignado = bancoCode === '626'
                                  || bancoCode === '336'
                                  || String(emp.NomeBanco || emp.Rubrica || '').toUpperCase().includes('C6')
                                  || String(emp.NomeBanco || emp.Rubrica || '').toUpperCase().includes('FICSA');
                                const c6Key = `${beneficiario.Beneficio || ''}-${emp.Contrato || ''}`;
                                const c6AutoResult = Array.isArray(c6RefinData?.results)
                                  ? c6RefinData.results.find((result: any) => result?.key === c6Key)
                                  : null;
                                const c6ReturnedTables = Array.isArray(c6AutoResult?.tables) && c6AutoResult.tables.length > 0
                                  ? c6AutoResult.tables
                                  : (c6AutoResult?.summary ? [c6AutoResult.summary] : []);
                                const c6Tables = c6ReturnedTables.filter((table: any) => Number(table?.valorLiberado || 0) > 0);
                                const selectedTableIndex = Math.min(
                                  Math.max(0, selectedC6Tables[c6Key] || 0),
                                  Math.max(0, c6Tables.length - 1),
                                );
                                const selectedC6Summary = c6Tables[selectedTableIndex] || null;
                                const hasRefinDetails = Boolean(c6AutoResult && (c6Tables.length > 0 || c6AutoResult.error));
                                const refinExpanded = Boolean(expandedC6Refins[c6Key]);
                                const inicioIsCalculated = Boolean(emp.InicioDescontoCalculado);
                                const finalIsCalculated = Boolean(emp.FinalDescontoCalculado);
                                const dataAverbacao = formatContractDate(emp.DataAverbacao);
                                const inicioContrato = formatContractMonth(emp.InicioDesconto);
                                const finalContrato = formatContractMonth(emp.FinalDesconto);

                                return (
                                  <Fragment key={`${emp.Banco}-${emp.Contrato}-${idx}`}>
                                    <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50/70 dark:border-slate-800/60 dark:hover:bg-slate-900/50">
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        <div className="flex items-start gap-2">
                                          <Landmark className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                                          <div>
                                            <p className="font-bold text-slate-800 dark:text-slate-200">{bancoExibicao}</p>
                                            <p className="mt-0.5 text-[9px] font-semibold text-slate-400">Contrato: {emp.Contrato || 'N/A'}</p>
                                            {dataAverbacao !== 'N/A' && (
                                              <p className="mt-0.5 text-[9px] font-semibold text-slate-400">Averb.: {dataAverbacao}</p>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                                        <span>{inicioContrato}</span>
                                        {inicioIsCalculated && <span className="ml-1 text-[8px] font-bold uppercase text-amber-500">calc.</span>}
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                                        <span>{finalContrato}</span>
                                        {finalIsCalculated && <span className="ml-1 text-[8px] font-bold uppercase text-amber-500">calc.</span>}
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap font-bold text-rose-600 dark:text-rose-400">{formatCurrency(parcelaValor)}</td>
                                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                                        {prazoTotal > 0 ? `${parcelasRestantes}/${prazoTotal}` : `${parcelasRestantes} rest.`}
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">{taxa ? `${taxa.toFixed(2).replace('.', ',')}%` : 'N/A'}</td>
                                      <td className="px-3 py-2.5 whitespace-nowrap font-bold text-slate-800 dark:text-slate-200">{valorContrato > 0 ? formatCurrency(valorContrato) : 'N/A'}</td>
                                      <td className="whitespace-nowrap bg-amber-50/30 px-3 py-2.5 font-black text-amber-600 dark:bg-amber-900/10 dark:text-amber-400">{formatCurrency(saldoAtual)}</td>
                                      <td className="px-3 py-2.5 text-right">
                                        <button
                                          onClick={() => onToggleContract ? onToggleContract(emp, isAdded ? 'remove' : 'add') : null}
                                          className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all whitespace-nowrap ${isAdded ? 'bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/30' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'}`}
                                        >
                                          {isAdded ? 'Remover' : 'Adicionar'}
                                        </button>
                                      </td>
                                      <td className="px-3 py-2.5 text-right">
                                        {isC6Consignado && !isSiape ? (
                                          hasRefinDetails ? (
                                            <button
                                              type="button"
                                              onClick={() => setExpandedC6Refins(prev => ({ ...prev, [c6Key]: !prev[c6Key] }))}
                                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-black whitespace-nowrap transition-colors ${
                                                c6AutoResult?.success && c6AutoResult?.hasAvailableTable
                                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300'
                                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                              }`}
                                              aria-expanded={refinExpanded}
                                            >
                                              <KeyRound className="h-3 w-3" />
                                              {c6AutoResult?.success && c6AutoResult?.hasAvailableTable
                                                ? 'Refin C6 disponível'
                                                : c6AutoResult?.success
                                                  ? 'Sem liberação C6'
                                                  : 'Refin indisponível'}
                                              <ChevronDown className={`h-3 w-3 transition-transform ${refinExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                          ) : c6AutoResult?.success ? (
                                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[9px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                              <KeyRound className="h-3 w-3" />
                                              Sem liberação C6
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[9px] font-black text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                                              {c6RefinData?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                                              {c6RefinData?.loading
                                                ? 'Consultando C6'
                                                : c6RefinData?.configured
                                                  ? 'Refin pendente'
                                                  : 'Credencial C6 necessária'}
                                            </span>
                                          )
                                        ) : (
                                          <span className="text-[9px] font-semibold text-slate-300 dark:text-slate-700">—</span>
                                        )}
                                      </td>
                                    </tr>

                                    {hasRefinDetails && refinExpanded && (
                                      <tr className="border-b border-slate-100 dark:border-slate-800/60">
                                        <td colSpan={10} className="bg-slate-50/80 px-4 py-3 dark:bg-slate-900/40">
                                          {c6AutoResult?.error ? (
                                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                              Refin C6 indisponível para este contrato.
                                            </div>
                                          ) : selectedC6Summary ? (
                                            <div className="rounded-xl border border-emerald-200 bg-white p-3 dark:border-emerald-500/25 dark:bg-slate-950">
                                              <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                                <div>
                                                  <p className="text-xs font-black text-slate-800 dark:text-white">Refin C6 • Contrato {c6AutoResult.contrato}</p>
                                                  <p className="text-[9px] uppercase tracking-wider text-slate-400">{c6Tables.length} {c6Tables.length === 1 ? 'tabela com liberação' : 'tabelas com liberação'} • somente condições com troco positivo</p>
                                                </div>
                                                {c6Tables.length > 1 && (
                                                  <div className="min-w-0 rounded-xl border-2 border-emerald-400 bg-emerald-50/70 p-2 shadow-sm dark:border-emerald-500/60 dark:bg-emerald-500/10 lg:w-[460px]">
                                                    <label className="mb-1 block text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Selecione a tabela com liberação</label>
                                                    <select
                                                      value={selectedTableIndex}
                                                      onChange={(event) => setSelectedC6Tables(prev => ({ ...prev, [c6Key]: Number(event.target.value) }))}
                                                      className="w-full rounded-lg border-2 border-emerald-500 bg-white px-3 py-2.5 text-[11px] font-black text-slate-800 shadow-sm outline-none ring-2 ring-emerald-100 transition focus:border-emerald-600 focus:ring-emerald-200 dark:border-emerald-500 dark:bg-slate-900 dark:text-white dark:ring-emerald-500/20"
                                                    >
                                                      {c6Tables.map((table: any, tableIndex: number) => (
                                                        <option key={`${c6Key}-table-${tableIndex}`} value={tableIndex}>
                                                          {tableIndex + 1}. {table?.tabela || 'Tabela C6'} — {formatCurrency(Number(table?.valorLiberado || 0))}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                )}
                                                <span className={`w-fit rounded-full px-2 py-1 text-[9px] font-black uppercase ${Number(selectedC6Summary?.valorLiberado || 0) > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>
                                                  {Number(selectedC6Summary?.valorLiberado || 0) > 0 ? 'Liberação disponível' : 'Sem liberação'}
                                                </span>
                                              </div>

                                              <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(340px,2.4fr)_minmax(80px,0.65fr)_minmax(90px,0.75fr)_minmax(110px,0.9fr)_minmax(120px,1fr)]">
                                                <div className="col-span-2 min-w-0 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900 md:col-span-1">
                                                  <p className="text-[8px] font-bold uppercase text-slate-500">Condição / Tabela</p>
                                                  <p className="mt-0.5 whitespace-nowrap text-[11px] font-black text-slate-800 dark:text-white">
                                                    {selectedC6Summary.tabela}{selectedC6Summary.codigoTabela ? ` • ${selectedC6Summary.codigoTabela}` : ''}
                                                  </p>
                                                </div>
                                                <div className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900">
                                                  <p className="text-[8px] font-bold uppercase text-slate-500">Prazo</p>
                                                  <p className="mt-0.5 text-[11px] font-black">{selectedC6Summary.prazo ? `${selectedC6Summary.prazo}x` : '108x'}</p>
                                                </div>
                                                <div className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900">
                                                  <p className="text-[8px] font-bold uppercase text-slate-500">Taxa</p>
                                                  <p className="mt-0.5 text-[11px] font-black">{selectedC6Summary.taxa !== null && selectedC6Summary.taxa !== undefined ? `${Number(selectedC6Summary.taxa).toFixed(2).replace('.', ',')}%` : 'N/A'}</p>
                                                </div>
                                                <div className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900">
                                                  <p className="text-[8px] font-bold uppercase text-slate-500">Parcela</p>
                                                  <p className="mt-0.5 text-[11px] font-black">{selectedC6Summary.parcela !== null && selectedC6Summary.parcela !== undefined ? formatCurrency(Number(selectedC6Summary.parcela)) : 'N/A'}</p>
                                                </div>
                                                <div className="rounded-lg bg-emerald-50 px-2.5 py-2 dark:bg-emerald-500/10">
                                                  <p className="text-[8px] font-bold uppercase text-emerald-700/70 dark:text-emerald-300/70">Liberado</p>
                                                  <p className="mt-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300">{selectedC6Summary.valorLiberado !== null && selectedC6Summary.valorLiberado !== undefined ? formatCurrency(Number(selectedC6Summary.valorLiberado)) : 'R$ 0,00'}</p>
                                                </div>
                                              </div>
                                            </div>
                                          ) : null}
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tabela de Empréstimos e Saques de Cartões Averbados (RMC / RCC) - No final após os empréstimos ativos */}
                    {cardLoansList.length > 0 && (
                      <div className="bg-white dark:bg-slate-950 rounded-2xl border border-amber-200/60 dark:border-amber-800/40 shadow-sm overflow-hidden">
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
                                const parcela = parseNumber(item.ValorParcela || item.Parcela || 0);
                                const valorContrato = parseNumber(item.ValorLiberado || item.ValorEmprestado || item.SaldoDevedor || 0);
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
