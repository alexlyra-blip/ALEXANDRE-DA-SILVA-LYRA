'use client';

import { useState } from 'react';
import { X, User, FileText, Landmark, CreditCard, CheckCircle2, Lock, Unlock, Crown, AlertCircle, Loader2, Phone } from 'lucide-react';
import { formatCurrency, formatCPF } from '@/lib/utils';
import { getEspecieName, getBancoName, calculateSaldoDevedor } from '@/lib/mappings';
import { motion, AnimatePresence } from 'motion/react';

interface ConsultaCPFModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any; // The raw data from MultiCorban API
  addedContractsIds?: string[];
  onToggleContract?: (contractData: any, action: 'add' | 'remove') => void;
}

export default function ConsultaCPFModal({ isOpen, onClose, data, addedContractsIds = [], onToggleContract }: ConsultaCPFModalProps) {
  const [activeTab, setActiveTab] = useState(0);

  if (!isOpen || !data) return null;

  // The MultiCorban API returns an array of benefit objects.
  const isArray = Array.isArray(data);
  const dataArray = isArray ? data : (data.beneficios ? data.beneficios : [data]);
  const beneficios = dataArray.length > 0 && dataArray[0].Beneficiario ? dataArray : [];

  // Extract personal data from the first benefit (assuming it's the same person)
  const firstBenefit = beneficios[0] || {};
  const personalInfo = firstBenefit.Beneficiario || {};
  const telefones = Array.isArray(firstBenefit.Telefone) ? firstBenefit.Telefone : (firstBenefit.Telefone ? [firstBenefit.Telefone] : []);


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
              <div className="lg:col-span-4 bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Nome Completo</p>
                <p className="text-lg md:text-xl font-black text-primary-dark dark:text-primary-light uppercase">{personalInfo.Nome || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">CPF</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{personalInfo.CPF ? formatCPF(personalInfo.CPF) : 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Nascimento</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {personalInfo.DataNascimento ? personalInfo.DataNascimento.split('-').reverse().join('/') : 'N/A'}
                  {personalInfo.DataNascimento && (
                    <span className="text-slate-500 text-sm ml-2 font-normal">
                      ({Math.floor((new Date().getTime() - new Date(personalInfo.DataNascimento).getTime()) / 31557600000)} anos)
                    </span>
                  )}
                </p>
              </div>
              <div className="lg:col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Telefone</p>
                <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                  <Phone className="w-4 h-4 text-emerald-500" />
                  {telefones.length > 0 ? telefones.map((t: string) => {
                    const ct = t.replace(/\D/g, '');
                    return ct.length === 11 ? `(${ct.slice(0,2)}) ${ct.slice(2,7)}-${ct.slice(7)}` : t;
                  }).join(', ') : 'N/A'}
                </div>
              </div>
              <div className="lg:col-span-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Endereço</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm uppercase">
                  {[personalInfo.Endereco, personalInfo.Bairro, personalInfo.Cidade, personalInfo.UF, personalInfo.CEP].filter(Boolean).join(', ') || 'N/A'}
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
                
                const valorBeneficio = parseFloat(resumo.ValorBeneficio || 0);
                
                // Cálculo de margens
                // Exceção LOAS 87 e 88 (35%), demais 40%
                const especie = (beneficiario.Especie || '').toString();
                const isLoas = especie.includes('87') || especie.includes('88');
                const percentualMargem = isLoas ? 0.35 : 0.40;
                
                // Função para não arredondar para cima (trunca em 2 casas decimais)
                const truncateDecimals = (num: number) => Math.floor(num * 100) / 100;
                
                const margemConsignavel = truncateDecimals(valorBeneficio * percentualMargem);
                
                // Emprestimos e cartões
                const emprestimos = Array.isArray(b.Emprestimos) ? b.Emprestimos : (b.Emprestimos ? [b.Emprestimos] : []);
                const rmc = Array.isArray(b.Rmc) ? b.Rmc : (b.Rmc ? [b.Rmc] : []);
                const rcc = Array.isArray(b.RCC) ? b.RCC : (b.RCC ? [b.RCC] : []);
                const cartoes = [...rmc, ...rcc];
                
                // Somar tudo que está comprometido (empréstimos e cartões)
                let totalComprometido = 0;
                emprestimos.forEach((e: any) => totalComprometido += parseFloat(e.ValorParcela || 0));
                cartoes.forEach((c: any) => totalComprometido += parseFloat(c.ValorParcela || c.Desconto || 0));

                let margemLivre = truncateDecimals(margemConsignavel - totalComprometido);
                if (margemLivre < 0) margemLivre = 0;
                
                const valorLiberado = truncateDecimals(margemLivre / getMarginCoefficient());

                const isBlocked = beneficiario.BloqueadoEmprestimo === "1" || beneficiario.BloqueadoEmprestimo === true;
                const isActive = beneficiario.Situacao === 'Ativo';

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
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Benefício</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{beneficiario.Beneficio || 'N/A'}</p>
                        </div>
                        <div className="lg:col-span-3">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Espécie</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{getEspecieName(beneficiario.Especie)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Status</p>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{beneficiario.Situacao || 'N/A'}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Concessão</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{beneficiario.DIB ? beneficiario.DIB.split('-').reverse().join('/') : 'N/A'}</p>
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
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Dados Bancários</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Banco: {dadosBancarios.Banco || 'N/A'} | Ag: {dadosBancarios.Agencia || 'N/A'} {dadosBancarios.ContaPagto ? `| CC: ${dadosBancarios.ContaPagto}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Margens */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Margem Consignável</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white">{formatCurrency(margemConsignavel)}</p>
                        <p className="text-[9px] text-slate-400 mt-1">({isLoas ? '35%' : '40%'} do Benefício {formatCurrency(valorBeneficio)})</p>
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
                                <th className="px-4 py-3 font-bold">Prazo</th>
                                <th className="px-4 py-3 font-bold">Taxa</th>
                                <th className="px-4 py-3 font-bold">Valor Origin</th>
                                <th className="px-4 py-3 font-bold">Saldo Atual</th>
                                <th className="px-4 py-3 font-bold text-right">Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emprestimos.map((emp: any, idx: number) => {
                                const saldoAtual = calculateSaldoDevedor(parseFloat(emp.ValorParcela || 0), parseFloat(emp.ParcelasRestantes || 0), emp.Taxa || 0);
                                const isAdded = addedContractsIds?.includes(`${emp.Banco}-${emp.Contrato}`);
                                return (
                                <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{getBancoName(emp.Banco)}</td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{emp.Contrato || 'N/A'}</td>
                                  <td className="px-4 py-3 font-bold text-rose-600 dark:text-rose-400">{formatCurrency(parseFloat(emp.ValorParcela || 0))}</td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                    {emp.ParcelasPagas || 0}/{emp.Prazo || 0}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{emp.Taxa ? `${parseFloat(emp.Taxa).toFixed(2).replace('.', ',')}%` : 'N/A'}</td>
                                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">{formatCurrency(parseFloat(emp.SaldoDevedor || 0))}</td>
                                  <td className="px-4 py-3 font-black text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-900/10">{formatCurrency(saldoAtual)}</td>
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

                    {/* Cartões Ativos Grid */}
                    {cartoes.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {rmc.map((cartao: any, idx: number) => (
                          <div key={`rmc-${idx}`} className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 relative overflow-hidden flex flex-col justify-between">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl"></div>
                            <div className="text-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-3">
                              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Cartão Pessoal (RMC)</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div>
                                <div className="w-8 h-8 mx-auto bg-slate-100 dark:bg-slate-800 rounded-full mb-2 flex items-center justify-center">
                                  <CreditCard className="w-4 h-4 text-slate-500" />
                                </div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{cartao.Banco || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Margem</p>
                                <p className="font-black text-rose-600 dark:text-rose-400">{formatCurrency(parseFloat(cartao.ValorParcela || cartao.Desconto || 0))}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Limite Cartão</p>
                                <p className="font-black text-sky-600 dark:text-sky-400">{formatCurrency(parseFloat(cartao.Limite || cartao.LimiteCartao || 0))}</p>
                              </div>
                            </div>
                          </div>
                        ))}

                        {rcc.map((cartao: any, idx: number) => (
                          <div key={`rcc-${idx}`} className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 relative overflow-hidden flex flex-col justify-between">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl"></div>
                            <div className="text-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-3">
                              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Cartão Benefício (RCC)</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div>
                                <div className="w-8 h-8 mx-auto bg-amber-100 dark:bg-amber-900/30 rounded-full mb-2 flex items-center justify-center">
                                  <CreditCard className="w-4 h-4 text-amber-600" />
                                </div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{cartao.Banco || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Margem</p>
                                <p className="font-black text-rose-600 dark:text-rose-400">{formatCurrency(parseFloat(cartao.ValorParcela || cartao.Desconto || 0))}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Limite Cartão</p>
                                <p className="font-black text-sky-600 dark:text-sky-400">{formatCurrency(parseFloat(cartao.Limite || cartao.LimiteCartao || 0))}</p>
                              </div>
                            </div>
                          </div>
                        ))}
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
