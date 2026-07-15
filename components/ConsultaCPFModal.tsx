'use client';

import { useState } from 'react';
import { X, User, FileText, Landmark, CreditCard, CheckCircle2, Lock, Unlock, Crown, AlertCircle, Loader2 } from 'lucide-react';
import { formatCurrency, formatCPF } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface ConsultaCPFModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any; // The raw data from MultiCorban API
  onSimulate: (contractData: any) => void;
}

export default function ConsultaCPFModal({ isOpen, onClose, data, onSimulate }: ConsultaCPFModalProps) {
  const [activeTab, setActiveTab] = useState(0);

  if (!isOpen || !data) return null;

  // Extrair os dados pessoais principais (o formato pode variar dependendo da API)
  const personalInfo = data.dados_pessoais || data.cliente || data;
  const beneficios = data.beneficios || [];

  const handleSimulate = (emprestimo: any, beneficioData: any) => {
    onSimulate({
      bancoAtual: emprestimo.banco || emprestimo.instituicao || '',
      valorParcela: emprestimo.valor_parcela || emprestimo.parcela || 0,
      prazoTotal: emprestimo.prazo || emprestimo.parcelas || 0,
      parcelasRestantes: emprestimo.parcelas_restantes || emprestimo.prazo_restante || 0,
      saldoDevedor: emprestimo.saldo_devedor || emprestimo.saldo || 0,
      beneficio: beneficioData.numero_beneficio || beneficioData.nb || '',
    });
  };

  const getMarginCoefficient = () => 0.02270;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-4xl max-h-[90vh] bg-slate-50 dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Crown className="w-5 h-5 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Consulta Detalhada</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Dados Pessoais */}
          <div className="bg-white dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl"></div>
            
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Dados do Cliente
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Nome Completo</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{personalInfo.nome || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">CPF</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{personalInfo.cpf ? formatCPF(personalInfo.cpf) : 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Nascimento</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{personalInfo.data_nascimento || personalInfo.nascimento || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Telefone</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{personalInfo.telefone || personalInfo.celular || 'N/A'}</p>
              </div>
              <div className="lg:col-span-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Endereço</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  {[personalInfo.endereco, personalInfo.numero, personalInfo.bairro, personalInfo.cidade, personalInfo.uf].filter(Boolean).join(', ') || 'N/A'}
                </p>
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
                      Benefício {b.numero_beneficio || b.nb || index + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Conteúdo do Benefício Ativo */}
              {beneficios[activeTab] && (() => {
                const b = beneficios[activeTab];
                const valorBeneficio = parseFloat(b.valor_beneficio || b.salario || 0);
                
                // Cálculo de margens
                // Exceção LOAS 87 e 88 (30%), demais 35%
                const especie = (b.especie || b.tipo || '').toString();
                const isLoas = especie.includes('87') || especie.includes('88');
                const percentualMargem = isLoas ? 0.30 : 0.35;
                
                // Função para não arredondar para cima (trunca em 2 casas decimais)
                const truncateDecimals = (num: number) => Math.floor(num * 100) / 100;
                
                const margemConsignavel = truncateDecimals(valorBeneficio * percentualMargem);
                
                // Emprestimos e cartões
                const emprestimos = b.emprestimos || b.contratos || [];
                const cartoes = b.cartoes || b.cartoes_rmc || [];
                
                // Somar tudo que está comprometido (empréstimos e cartões)
                let totalComprometido = 0;
                emprestimos.forEach((e: any) => totalComprometido += parseFloat(e.valor_parcela || e.parcela || 0));
                cartoes.forEach((c: any) => totalComprometido += parseFloat(c.valor_parcela || c.parcela || c.limite_utilizado || 0));

                let margemLivre = truncateDecimals(margemConsignavel - totalComprometido);
                if (margemLivre < 0) margemLivre = 0;
                
                const valorLiberado = truncateDecimals(margemLivre / getMarginCoefficient());

                const isBlocked = b.bloqueado_emprestimo || b.bloqueado === 'S' || b.bloqueado === true;
                const isActive = b.status === 'Ativo' || b.situacao === 'Ativo';

                return (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    
                    {/* Card Dados do Benefício */}
                    <div className="bg-white dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          Dados do Benefício
                        </h3>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${isBlocked ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20'}`}>
                          {isBlocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          {isBlocked ? 'Bloqueado' : 'Liberado'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Número</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{b.numero_beneficio || b.nb || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Espécie</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{b.especie || b.tipo || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Status</p>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{b.status || b.situacao || 'N/A'}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Concessão</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{b.data_concessao || b.dib || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">UF</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{b.uf || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Meio de Pgto</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{b.meio_pagamento || 'N/A'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Dados Bancários</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Banco: {b.banco || b.banco_pagamento || 'N/A'} | Ag: {b.agencia || 'N/A'} {b.conta ? `| CC: ${b.conta}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Margens */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Margem Consignável</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white">{formatCurrency(margemConsignavel)}</p>
                        <p className="text-[9px] text-slate-400 mt-1">({isLoas ? '30%' : '35%'} do Benefício {formatCurrency(valorBeneficio)})</p>
                      </div>
                      
                      <div className="bg-rose-50 dark:bg-rose-500/10 rounded-2xl p-4 border border-rose-100 dark:border-rose-500/20 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-rose-500/80 font-bold mb-1">Total Comprometido</p>
                        <p className="text-xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(totalComprometido)}</p>
                      </div>

                      <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-500/20 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-600/80 font-bold mb-1">Margem Livre</p>
                        <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(margemLivre)}</p>
                      </div>

                      <div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-4 shadow-lg text-center relative overflow-hidden text-white border border-white/10">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                        <p className="text-[10px] uppercase tracking-wider text-white/80 font-bold mb-1">Valor Liberado</p>
                        <p className="text-2xl font-black">{formatCurrency(valorLiberado)}</p>
                        <p className="text-[9px] text-white/60 mt-1">Coeficiente {getMarginCoefficient().toString().replace('.', ',')}</p>
                      </div>
                    </div>

                    {/* Tabela de Empréstimos */}
                    {emprestimos.length > 0 && (
                      <div className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                          <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <Landmark className="w-4 h-4 text-primary" />
                            Empréstimos Ativos
                          </h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="px-4 py-3 font-bold">Banco</th>
                                <th className="px-4 py-3 font-bold">Contrato</th>
                                <th className="px-4 py-3 font-bold">Parcela</th>
                                <th className="px-4 py-3 font-bold">Prazos</th>
                                <th className="px-4 py-3 font-bold">Taxa</th>
                                <th className="px-4 py-3 font-bold">Saldo Devedor</th>
                                <th className="px-4 py-3 font-bold text-right">Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emprestimos.map((emp: any, idx: number) => (
                                <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{emp.banco || emp.instituicao || 'N/A'}</td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{emp.contrato || 'N/A'}</td>
                                  <td className="px-4 py-3 font-bold text-rose-600 dark:text-rose-400">{formatCurrency(parseFloat(emp.valor_parcela || emp.parcela || 0))}</td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                    {emp.parcelas_pagas || 0} pagas / Restam {emp.parcelas_restantes || emp.prazo_restante || 0} / Total {emp.prazo || emp.parcelas || 0}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{emp.taxa ? `${emp.taxa}%` : 'N/A'}</td>
                                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">{formatCurrency(parseFloat(emp.saldo_devedor || emp.saldo || 0))}</td>
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      onClick={() => handleSimulate(emp, b)}
                                      className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg text-xs font-bold transition-all"
                                    >
                                      Simular
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Cartões Ativos */}
                    {cartoes.length > 0 && (
                      <div className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                          <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-primary" />
                            Cartões Ativos (RMC/RCC)
                          </h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="px-4 py-3 font-bold">Banco</th>
                                <th className="px-4 py-3 font-bold">Contrato</th>
                                <th className="px-4 py-3 font-bold">Desconto</th>
                                <th className="px-4 py-3 font-bold">Limite</th>
                                <th className="px-4 py-3 font-bold">Saldo Devedor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cartoes.map((cartao: any, idx: number) => (
                                <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{cartao.banco || cartao.instituicao || 'N/A'}</td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{cartao.contrato || 'N/A'}</td>
                                  <td className="px-4 py-3 font-bold text-rose-600 dark:text-rose-400">{formatCurrency(parseFloat(cartao.valor_parcela || cartao.parcela || cartao.desconto || 0))}</td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatCurrency(parseFloat(cartao.limite || 0))}</td>
                                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">{formatCurrency(parseFloat(cartao.saldo_devedor || cartao.saldo || 0))}</td>
                                </tr>
                              ))}
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
