'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRules } from '@/contexts/RuleContext';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Plus, X, ListOrdered, Settings2, Landmark, ArrowLeft, Calculator } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function RegrasGeraisPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const { 
    generalRules, 
    banks, 
    promotoraPriorities, 
    promotoraInstallments, 
    nonPortableBanks,
    blockedBanks,
    dailyMarginCoefficient,
    updatePromotoraPriority, 
    updatePromotoraInstallment,
    updateNonPortableBanks,
    updateBlockedBanks,
    updateDailyMarginCoefficient
  } = useRules();

  const allOriginBanks = Array.from(new Set([
    "121 - AGIBANK", "250 - BCV", "025 - BANCO ALFA", "233 - BANCO CIFRA", "001 - BANCO DO BRASIL",
    "047 - BANCO DO ESTADO DO SERGIPE", "079 - BANCO ORIGINAL", "643 - BANCO PINE", "081 - BANCO SEGURO",
    "041 - BANRISUL", "268 - BARIGUI", "318 - BMG", "237 - BRADESCO S.A.", "070 - BRB", "626 - C6",
    "320 - CCB BRASIL", "104 - CAIXA", "069 - CREFISA", "707 - DAYCOVAL", "335 - DIGIO", "149 - FACTA",
    "012 - INBURSA", "029 - ITAÚ CONSIGNADO", "184 - ITAÚ BBA", "341 - ITAÚ UNIBANCO", "389 - MERCANTIL",
    "386 - NU FINANCEIRA S.A.", "753 - NBC BANK", "169 - OLÉ", "290 - PAGBANK", "623 - PAN", "254 - PARANÁ BANCO",
    "752 - BNP PARIBAS", "326 - PARATI", "611 - PAULISTA", "380 - PICPAY", "329 - QI SOCIEDADE", "966 - SABEMI",
    "422 - SAFRA", "033 - SANTANDER", "359 - ZEMA", "OUTROS"
  ]))
    .filter(bank => !['C6 CONSIG', 'BANRISUL', 'BMG', 'DAYCOVAL', 'DIGIO', 'FACTA', 'HAVECRED'].includes(bank))
    .sort((a, b) => {
      if (a === 'OUTROS') return 1;
      if (b === 'OUTROS') return -1;
      const nameA = a.includes(' - ') ? a.split(' - ')[1] : a;
      const nameB = b.includes(' - ') ? b.split(' - ')[1] : b;
      return nameA.localeCompare(nameB);
    });

  useEffect(() => {
    if (profile && !['admin', 'promotora', 'corretor'].includes(profile.role)) {
      router.push('/dashboard');
    }
  }, [profile, router]);

  // States Priority Form
  const [priorityBankSelection, setPriorityBankSelection] = useState('');
  const [priorityValue, setPriorityValue] = useState('');
  
  // States Blocked Banks
  const [blockedBankSelection, setBlockedBankSelection] = useState('');
  const [nonPortableBankSelection, setNonPortableBankSelection] = useState('');
  
  // States Installments Form
  const [installmentsBankSelection, setInstallmentsBankSelection] = useState('');
  const [installmentsValue, setInstallmentsValue] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [marginCoefficientValue, setMarginCoefficientValue] = useState('');

  useEffect(() => {
    if (dailyMarginCoefficient > 0) {
      setMarginCoefficientValue(String(dailyMarginCoefficient).replace('.', ','));
    }
  }, [dailyMarginCoefficient]);

  const handleSavePriority = async () => {
    if (!priorityBankSelection || !priorityValue) return;
    setIsSaving(true);
    try {
      await updatePromotoraPriority(priorityBankSelection, parseInt(priorityValue) || 0);
      setPriorityBankSelection('');
      setPriorityValue('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInstallments = async () => {
    if (!installmentsBankSelection || !installmentsValue) return;
    setIsSaving(true);
    try {
      await updatePromotoraInstallment(installmentsBankSelection, parseInt(installmentsValue) || 0);
      setInstallmentsBankSelection('');
      setInstallmentsValue('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const getBankInfo = (bankId: string) => {
    return banks.find(b => b.id === bankId);
  };

  const getBankAvatarByName = (bancoName: string) => {
    const bank = banks.find(b => b.name === bancoName);
    return bank?.logoUrl || null;
  };

  if (!profile) return null;

  // Render Priorities List
  const priorityEntries = Object.entries(promotoraPriorities)
    .filter(([_, val]) => val > 0)
    .sort((a, b) => a[1] - b[1]);

  // Render Installments List
  const installmentEntries = Object.entries(promotoraInstallments)
    .filter(([_, val]) => val > 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <Link href="/regras/banco" className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <ArrowLeft className="text-slate-900 dark:text-slate-100 w-6 h-6" />
        </Link>
        <div className="size-12 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
          <Settings2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Regras Gerais
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure as regras de prioridade de exibição e parcelas pagas.
          </p>
        </div>
      </div>

      {/* COEFICIENTE DIÁRIO DA MARGEM INSS */}
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-bold flex items-center gap-2">
            <Calculator className="w-5 h-5 text-amber-500" />
            Coeficiente Diário - Margem Livre INSS
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Usado pelo Gutto e pela Consulta CPF para calcular o valor estimado liberado da margem disponível. Atualize sempre que o coeficiente diário mudar.
          </p>
        </div>
        <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Coeficiente atual</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 0,02260"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
              value={marginCoefficientValue}
              onChange={e => setMarginCoefficientValue(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={isSaving || !marginCoefficientValue.trim()}
            onClick={async () => {
              const normalized = Number(marginCoefficientValue.replace(',', '.'));
              if (!Number.isFinite(normalized) || normalized <= 0) return;
              setIsSaving(true);
              try {
                await updateDailyMarginCoefficient(normalized);
              } catch (e) {
                console.error(e);
              } finally {
                setIsSaving(false);
              }
            }}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-5 py-2 rounded-xl transition-all text-sm font-bold"
          >
            Salvar coeficiente
          </button>
          <div className="text-xs text-slate-500 sm:min-w-40">
            Atual: <span className="font-black text-slate-800 dark:text-slate-100">{dailyMarginCoefficient.toFixed(5).replace('.', ',')}</span>
          </div>
        </div>
      </div>

      {/* BANKS BLOCKING (Promotora) */}
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-bold flex items-center gap-2">
            <X className="w-5 h-5 text-red-500" />
            Bancos Bloqueados na Simulação
          </h2>
          <p className="text-xs text-slate-500 mt-1">Selecione bancos que não devem ser ofertados.</p>
        </div>
        <div className="p-4">
          <div className="flex gap-2">
            <select 
              className="flex-1 min-w-[150px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
              value={blockedBankSelection}
              onChange={e => setBlockedBankSelection(e.target.value)}
            >
              <option value="">Selecione um banco para bloquear...</option>
              {banks.filter(b => !(blockedBanks || []).includes(b.id) && !(blockedBanks || []).includes(b.name)).map(b => (
                <option key={b.id} value={b.id}>{b.name} - {b.convenio}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={isSaving || !blockedBankSelection}
              onClick={async () => {
                if(blockedBankSelection) {
                  setIsSaving(true);
                  try {
                    await updateBlockedBanks([...(blockedBanks || []), blockedBankSelection]);
                    setBlockedBankSelection('');
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setIsSaving(false);
                  }
                }
              }}
              className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white p-2 rounded-xl transition-all flex items-center justify-center shrink-0"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2 mt-4">
            {(blockedBanks || []).map(bankIdOrName => {
              const matchedBank = banks.find(b => b.id === bankIdOrName || b.name === bankIdOrName);
              const label = matchedBank ? `${matchedBank.name} - ${matchedBank.convenio}` : bankIdOrName;
              return (
                <span key={bankIdOrName} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-bold">
                  {label}
                  <button 
                    type="button" 
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        await updateBlockedBanks((blockedBanks || []).filter(b => b !== bankIdOrName));
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setIsSaving(false);
                      }
                    }} 
                    className="ml-1 hover:text-red-700 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* PRIORITIES SECTION */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-blue-500" />
                Prioridade de Exibição
              </h2>
              <p className="text-xs text-slate-500 mt-1">Defina a ordem do banco no card de ofertas.</p>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <select 
                  className="flex-1 min-w-[150px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  value={priorityBankSelection}
                  onChange={e => setPriorityBankSelection(e.target.value)}
                >
                  <option value="">Selecione um banco...</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.convenio})</option>
                  ))}
                </select>
                <input 
                  type="number" 
                  placeholder="Prioridade (ex: 1)"
                  className="w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  value={priorityValue}
                  onChange={e => setPriorityValue(e.target.value)}
                />
                <button
                  type="button"
                  disabled={isSaving || !priorityBankSelection || !priorityValue}
                  onClick={handleSavePriority}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white p-2 rounded-xl transition-all flex items-center justify-center shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 mt-4">
                {priorityEntries.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Nenhuma prioridade configurada.</p>
                ) : (
                  priorityEntries.map(([bankId, prio]) => {
                    const bank = getBankInfo(bankId);
                    return (
                      <div key={bankId} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full overflow-hidden bg-white shrink-0 relative border border-slate-200">
                            {bank?.logoUrl ? (
                              <Image src={bank.logoUrl} alt={bank.name} fill className="object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Landmark className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold leading-tight">{bank?.name || 'Banco Removido'}</p>
                            <p className="text-[10px] text-slate-500 font-medium">{bank?.convenio || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                            Prio: {prio}
                          </span>
                          <button 
                            onClick={() => updatePromotoraPriority(bankId, 0)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* INSTALLMENTS SECTION */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                Mínimo de Parcelas Pagas
              </h2>
              <p className="text-xs text-slate-500 mt-1">Defina a quantidade de parcelas exigida para acesso à oferta.</p>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <select 
                  className="flex-1 min-w-[150px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  value={installmentsBankSelection}
                  onChange={e => setInstallmentsBankSelection(e.target.value)}
                >
                  <option value="">Selecione um banco de origem...</option>
                  {allOriginBanks.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <input 
                  type="number" 
                  placeholder="Parcelas (ex: 12)"
                  className="w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  value={installmentsValue}
                  onChange={e => setInstallmentsValue(e.target.value)}
                />
                <button
                  type="button"
                  disabled={isSaving || !installmentsBankSelection || !installmentsValue}
                  onClick={handleSaveInstallments}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white p-2 rounded-xl transition-all flex items-center justify-center shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mt-4 text-xs font-bold">
                {installmentEntries.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 w-full">Nenhuma regra de parcelas configurada.</p>
                ) : (
                  installmentEntries.map(([bankName, inst]) => (
                    <span key={bankName} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                      {bankName}: {inst} parcelas
                      <button 
                        type="button" 
                        onClick={() => updatePromotoraInstallment(bankName, 0)} 
                        className="ml-1 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* BANCO NÃO PORTADO SECTION */}
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden mt-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold flex items-center gap-2">
                <Landmark className="w-5 h-5 text-red-500" />
                Banco não Portado (Regra Geral)
              </h2>
              <p className="text-xs text-slate-500 mt-1">Esse banco selecionado na simulação não será portado por nenhum banco cadastrado.</p>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <select 
                  className="flex-1 min-w-[150px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  value={nonPortableBankSelection}
                  onChange={e => setNonPortableBankSelection(e.target.value)}
                >
                  <option value="">Selecione um banco...</option>
                  {allOriginBanks.filter(b => !nonPortableBanks.includes(b)).map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isSaving || !nonPortableBankSelection}
                  onClick={async () => {
                    if (nonPortableBankSelection) {
                      setIsSaving(true);
                      try {
                        await updateNonPortableBanks([...nonPortableBanks, nonPortableBankSelection]);
                        setNonPortableBankSelection('');
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setIsSaving(false);
                      }
                    }
                  }}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white p-2 rounded-xl transition-all flex items-center justify-center shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mt-4 text-xs font-bold">
                {nonPortableBanks.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 w-full">Nenhum banco não portado configurado.</p>
                ) : (
                  nonPortableBanks.map(bankName => (
                    <span key={bankName} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
                      {bankName}
                      <button 
                        type="button" 
                        onClick={async () => {
                          setIsSaving(true);
                          try {
                            await updateNonPortableBanks(nonPortableBanks.filter(b => b !== bankName));
                          } catch (e) {
                            console.error(e);
                          } finally {
                            setIsSaving(false);
                          }
                        }} 
                        className="ml-1 hover:text-red-700 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
