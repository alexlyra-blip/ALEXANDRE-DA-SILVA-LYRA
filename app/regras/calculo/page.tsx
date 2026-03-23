'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Landmark } from 'lucide-react';
import { Save } from 'lucide-react';
import { Settings } from 'lucide-react';
import { Plus } from 'lucide-react';
import { X } from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { Edit } from 'lucide-react';
import { User } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import { useRules } from '@/contexts/RuleContext';
import { useAuth } from '@/contexts/AuthContext';

export default function RegrasCalculo() {
  const { profile } = useAuth();
  const router = useRouter();
  const { banks, generalRules, addBank, updateBank, deleteBank, addGeneralRule, updateGeneralRule, deleteGeneralRule } = useRules();

  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [profile, router]);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isGeneralModalOpen, setIsGeneralModalOpen] = useState(false);
  const [editingGeneralRuleId, setEditingGeneralRuleId] = useState<string | null>(null);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);

  // Form states for Bank Rules
  const [bankName, setBankName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [nonAcceptedBanks, setNonAcceptedBanks] = useState<string[]>([]);
  const [nonAcceptedBankInput, setNonAcceptedBankInput] = useState('');
  const [specificInstallmentRules, setSpecificInstallmentRules] = useState<{bank: string, installments: string}[]>([]);
  const [specificBankInput, setSpecificBankInput] = useState('');
  const [specificInstallmentsInput, setSpecificInstallmentsInput] = useState('');
  const [acceptsIlliterate, setAcceptsIlliterate] = useState(false);
  const [acceptsLOAS, setAcceptsLOAS] = useState(false);
  const [acceptsInvalidez, setAcceptsInvalidez] = useState(true);
  const [invalidezAgeYears, setInvalidezAgeYears] = useState('');
  const [acceptsOver60Invalidez, setAcceptsOver60Invalidez] = useState(false);
  const [minBenefitTimeYears, setMinBenefitTimeYears] = useState('');
  const [minBenefitTimeMonths, setMinBenefitTimeMonths] = useState('');
  const [tabelas, setTabelas] = useState([{ nome: '', coeficiente: '', minTicket: '' }]);

  // Form states for General Rules
  const [generalRuleBanco, setGeneralRuleBanco] = useState('');
  const [generalRuleParcelas, setGeneralRuleParcelas] = useState('');

  const addTabela = () => {
    setTabelas([...tabelas, { nome: '', coeficiente: '', minTicket: '' }]);
  };

  const removeTabela = (index: number) => {
    if (tabelas.length > 1) {
      setTabelas(tabelas.filter((_, i) => i !== index));
    } else {
      setTabelas([{ nome: '', coeficiente: '', minTicket: '' }]);
    }
  };

  const handleTabelaChange = (index: number, field: 'nome' | 'coeficiente' | 'minTicket', value: string) => {
    const newTabelas = [...tabelas];
    (newTabelas[index] as any)[field] = value;
    setTabelas(newTabelas);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddNonAcceptedBank = (e: React.KeyboardEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') return;
    e.preventDefault();
    const value = nonAcceptedBankInput.trim();
    if (value && !nonAcceptedBanks.includes(value)) {
      setNonAcceptedBanks([...nonAcceptedBanks, value]);
    }
    setNonAcceptedBankInput('');
  };

  const handleRemoveNonAcceptedBank = (bankToRemove: string) => {
    setNonAcceptedBanks(nonAcceptedBanks.filter(b => b !== bankToRemove));
  };

  const handleAddSpecificRule = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const bank = specificBankInput.trim();
    const installments = parseInt(specificInstallmentsInput);
    if (bank && !isNaN(installments)) {
      setSpecificInstallmentRules([...specificInstallmentRules, { bank, installments: installments.toString() }]);
      setSpecificBankInput('');
      setSpecificInstallmentsInput('');
    }
  };

  const handleRemoveSpecificRule = (index: number) => {
    setSpecificInstallmentRules(specificInstallmentRules.filter((_, i) => i !== index));
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveBank = async () => {
    if (!bankName) return;
    
    setIsSaving(true);
    try {
      const bankData = {
        name: bankName,
        logoUrl,
        minAge: parseInt(minAge) || 0,
        maxAge: parseInt(maxAge) || 0,
        nonAcceptedBanks: nonAcceptedBanks,
        specificInstallmentRules: specificInstallmentRules.map(r => ({ bank: r.bank, installments: parseInt(r.installments) })),
        acceptsIlliterate,
        acceptsLOAS,
        acceptsInvalidez,
        invalidezAgeYears: parseInt(invalidezAgeYears) || 0,
        acceptsOver60Invalidez,
        minBenefitTimeYears: parseInt(minBenefitTimeYears) || 0,
        minBenefitTimeMonths: parseInt(minBenefitTimeMonths) || 0,
        tabelas: tabelas.filter(t => t.nome && t.coeficiente).map(t => ({
          nome: t.nome,
          coeficiente: parseFloat(t.coeficiente) || 0,
          minTicket: parseFloat(t.minTicket) || 0
        }))
      };

      if (editingBankId) {
        await updateBank(editingBankId, bankData);
        setEditingBankId(null);
      } else {
        await addBank(bankData);
      }
      
      // Reset form
      setBankName('');
      setLogoUrl('');
      setMinAge('');
      setMaxAge('');
      setNonAcceptedBanks([]);
      setNonAcceptedBankInput('');
      setSpecificInstallmentRules([]);
      setSpecificBankInput('');
      setSpecificInstallmentsInput('');
      setAcceptsIlliterate(false);
      setAcceptsLOAS(false);
      setAcceptsInvalidez(true);
      setInvalidezAgeYears('');
      setAcceptsOver60Invalidez(false);
      setMinBenefitTimeYears('');
      setMinBenefitTimeMonths('');
      setTabelas([{ nome: '', coeficiente: '', minTicket: '' }]);
      
      setIsBankModalOpen(false);
    } catch (error) {
      console.error("Erro ao salvar banco:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBank = (bank: any) => {
    setBankName(bank.name || '');
    setLogoUrl(bank.logoUrl || '');
    setMinAge(bank.minAge?.toString() || '0');
    setMaxAge(bank.maxAge?.toString() || '0');
    setNonAcceptedBanks(bank.nonAcceptedBanks || []);
    setNonAcceptedBankInput('');
    setSpecificInstallmentRules(bank.specificInstallmentRules?.map((r: any) => ({ bank: r.bank, installments: r.installments?.toString() || '0' })) || []);
    setSpecificBankInput('');
    setSpecificInstallmentsInput('');
    setAcceptsIlliterate(bank.acceptsIlliterate || false);
    setAcceptsLOAS(bank.acceptsLOAS || false);
    setAcceptsInvalidez(bank.acceptsInvalidez !== false);
    setInvalidezAgeYears(bank.invalidezAgeYears?.toString() || '');
    setAcceptsOver60Invalidez(bank.acceptsOver60Invalidez || false);
    setMinBenefitTimeYears(bank.minBenefitTimeYears?.toString() || '');
    setMinBenefitTimeMonths(bank.minBenefitTimeMonths?.toString() || '');
    setTabelas(bank.tabelas?.length > 0 ? bank.tabelas.map((t: any) => ({ 
      nome: t.nome || '', 
      coeficiente: t.coeficiente?.toString() || '',
      minTicket: t.minTicket?.toString() || ''
    })) : [{ nome: '', coeficiente: '', minTicket: '' }]);
    
    setEditingBankId(bank.id);
    setIsBankModalOpen(true);
  };

  const handleSaveGeneralRule = async () => {
    if (!generalRuleBanco || !generalRuleParcelas) return;
    
    setIsSaving(true);
    try {
      const ruleData = {
        banco: generalRuleBanco,
        parcelasAceitas: parseInt(generalRuleParcelas) || 0
      };

      if (editingGeneralRuleId) {
        await updateGeneralRule(editingGeneralRuleId, ruleData);
        setEditingGeneralRuleId(null);
      } else {
        await addGeneralRule(ruleData);
      }
      
      setGeneralRuleBanco('');
      setGeneralRuleParcelas('');
      setIsGeneralModalOpen(false);
    } catch (error) {
      console.error("Erro ao salvar regra geral:", error);
      alert("Erro ao salvar regra geral. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditGeneralRule = (rule: any) => {
    setGeneralRuleBanco(rule.banco);
    setGeneralRuleParcelas(rule.parcelasAceitas.toString());
    setEditingGeneralRuleId(rule.id);
    setIsGeneralModalOpen(true);
  };

  const handleDeleteBank = async (id: string) => {
    try {
      await deleteBank(id);
    } catch (error) {
      console.error("Erro ao excluir banco:", error);
    }
  };

  const handleDeleteGeneralRule = async (id: string) => {
    try {
      await deleteGeneralRule(id);
    } catch (error) {
      console.error("Erro ao excluir regra geral:", error);
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full max-w-2xl mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display pb-24">
      {/* TopAppBar */}
      <header className="sticky top-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center p-4 gap-4 w-full">
          <Link href="/simulacao/recomendacoes" className="flex items-center justify-center size-10 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="text-slate-900 dark:text-slate-100 w-6 h-6" />
          </Link>
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
            Regras de Cálculo e Bancos
          </h1>
        </div>
      </header>

      <main className="flex-1 w-full pb-10">
        {/* Introductory Text */}
        <div className="px-4 pt-6 pb-4">
          <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base leading-relaxed">
            Estas regras afetarão diretamente as telas de <span className="text-primary font-medium">Análise Comparativa</span> e <span className="text-primary font-medium">Detalhes da Simulação</span>. Ajuste os parâmetros conforme sua estratégia comercial.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="px-4 grid grid-cols-2 gap-4 mb-6">
          <button 
            onClick={() => setIsGeneralModalOpen(true)}
            className="flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl p-4 transition-all"
          >
            <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-center">Adicionar Regra Geral</span>
          </button>

          <button 
            onClick={() => setIsBankModalOpen(true)}
            className="flex flex-col items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl p-4 transition-all"
          >
            <div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-primary text-center">Adicionar Banco e Regras</span>
          </button>
        </div>

        {/* General Rules List */}
        {generalRules.length > 0 && (
          <section className="space-y-4 px-4 mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 px-1">Regras Gerais</h3>
            <div className="grid grid-cols-1 gap-3">
              {generalRules.map(rule => (
                <div key={rule.id} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">Banco: {rule.banco}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Parcelas aceitas: {rule.parcelasAceitas}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEditGeneralRule(rule)} className="p-2 text-slate-400 hover:text-primary transition-colors">
                      <Edit className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleDeleteGeneralRule(rule.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Banks List */}
        <section className="space-y-4 px-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 px-1">Bancos Configurados</h3>

          {banks.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nenhum banco configurado ainda.
            </div>
          ) : (
            banks.map(bank => (
              <div key={bank.id} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:border-primary/50 transition-colors">
                <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden relative shrink-0">
                      {bank.logoUrl ? (
                        <Image src={bank.logoUrl} alt={bank.name} fill className="object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-slate-500">
                          <Landmark className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{bank.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{bank.tabelas.length} tabelas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEditBank(bank)} className="bg-slate-100 dark:bg-slate-700 hover:bg-primary hover:text-white dark:hover:bg-primary text-slate-700 dark:text-slate-300 text-sm font-semibold px-4 py-2 rounded-lg transition-all">
                      Editar
                    </button>
                    <button onClick={() => handleDeleteBank(bank.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-3 flex gap-4 text-[11px] font-medium text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> {bank.minAge}-{bank.maxAge} anos
                  </span>
                  {bank.acceptsLOAS ? (
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" /> LOAS
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500">
                      <X className="w-3 h-3" /> Não atende LOAS
                    </span>
                  )}
                  {bank.acceptsIlliterate ? (
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3 text-blue-500" /> Analfabeto
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500">
                      <X className="w-3 h-3" /> Não atende Analfabeto
                    </span>
                  )}
                </div>

                {bank.nonAcceptedBanks && bank.nonAcceptedBanks.length > 0 && (
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Não porta de:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {bank.nonAcceptedBanks.map(b => (
                        <span key={b} className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {bank.specificInstallmentRules && bank.specificInstallmentRules.length > 0 && (
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Porta com regras específicas:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {bank.specificInstallmentRules.map((rule: any, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                          {rule.bank}: {rule.installments} parcelas
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Basic Info Quick Edit */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Parcela Mínima (R$)</label>
                      <input 
                        type="number" 
                        value={bank.minInstallmentValue || ''} 
                        onChange={e => updateBank(bank.id, { minInstallmentValue: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                        placeholder="0.00" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Saldo Mínimo (R$)</label>
                      <input 
                        type="number" 
                        value={bank.minBalance || ''} 
                        onChange={e => updateBank(bank.id, { minBalance: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                        placeholder="0.00" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Taxa Portabilidade (%)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={bank.portabilityRate || ''} 
                        onChange={e => updateBank(bank.id, { portabilityRate: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                        placeholder="0.00" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Taxa Refin (%)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={bank.refinRate || ''} 
                        onChange={e => updateBank(bank.id, { refinRate: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                        placeholder="0.00" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Troco Mínimo (R$)</label>
                      <input 
                        type="number" 
                        value={bank.minTroco || ''} 
                        onChange={e => updateBank(bank.id, { minTroco: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                        placeholder="0.00" 
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer mt-2">
                    <input 
                      type="checkbox" 
                      checked={bank.sumBalanceAndTroco || false} 
                      onChange={e => updateBank(bank.id, { sumBalanceAndTroco: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" 
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Somar Saldo Mínimo + Troco Mínimo</span>
                  </label>
                </div>
              </div>
            ))
          )}
        </section>
      </main>

      {/* Modal Adicionar Banco e Regras */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold">Adicionar Banco e Regras</h2>
              <button onClick={() => setIsBankModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-6">
              {/* Informações do Banco */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Informações do Banco</h3>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Nome do Banco</label>
                  <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: Banco do Brasil" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Logo do Banco</label>
                  <div className="flex items-center gap-3">
                    {logoUrl && (
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 relative">
                        <Image src={logoUrl} alt="Logo preview" fill className="object-cover" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleLogoUpload} 
                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" 
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                    <span className="text-xs text-slate-400 font-medium">OU</span>
                    <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                  </div>
                  <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} className="w-full mt-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Cole a URL da imagem aqui" />
                </div>
              </div>

              {/* Regras de Idade */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Regras de Idade</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Idade Mínima</label>
                    <input type="number" value={minAge} onChange={e => setMinAge(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 18" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Idade Máxima</label>
                    <input type="number" value={maxAge} onChange={e => setMaxAge(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 75" />
                  </div>
                </div>
              </div>

              {/* Regras de Portabilidade */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Regras de Portabilidade</h3>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Bancos que NÃO porta</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {nonAcceptedBanks.map(bank => (
                      <span key={bank} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium">
                        {bank}
                        <button type="button" onClick={() => handleRemoveNonAcceptedBank(bank)} className="hover:text-red-900 dark:hover:text-red-200">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={nonAcceptedBankInput} 
                      onChange={e => setNonAcceptedBankInput(e.target.value)} 
                      onKeyDown={handleAddNonAcceptedBank}
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" 
                      placeholder="Digite o banco e aperte Enter" 
                    />
                    <button 
                      type="button" 
                      onClick={handleAddNonAcceptedBank}
                      className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Bancos que porta com regras específicas</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {specificInstallmentRules.map((rule, index) => (
                      <span key={index} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                        {rule.bank}: {rule.installments} parcelas
                        <button type="button" onClick={() => handleRemoveSpecificRule(index)} className="hover:text-emerald-900 dark:hover:text-emerald-200">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={specificBankInput} 
                      onChange={e => setSpecificBankInput(e.target.value)} 
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" 
                      placeholder="Nome do banco" 
                    />
                    <input 
                      type="number" 
                      value={specificInstallmentsInput} 
                      onChange={e => setSpecificInstallmentsInput(e.target.value)} 
                      className="w-24 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" 
                      placeholder="Parcelas" 
                    />
                    <button 
                      type="button" 
                      onClick={handleAddSpecificRule}
                      className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              </div>

              {/* Regras de Perfil e Benefício */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Perfil e Benefícios</h3>
                
                <label className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={acceptsIlliterate} onChange={e => setAcceptsIlliterate(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-sm font-medium">Aceita cliente analfabeto</span>
                </label>

                <label className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={acceptsLOAS} onChange={e => setAcceptsLOAS(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-sm font-medium">Aceita portar benefícios LOAS (87 e 88)</span>
                </label>

                <label className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={acceptsInvalidez} onChange={e => setAcceptsInvalidez(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-sm font-medium">Aceita Espécie Invalidez (04, 32, 92)</span>
                </label>

                {acceptsInvalidez && (
                  <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3 bg-slate-50 dark:bg-slate-800/20">
                    <p className="text-sm font-medium">Regra de idade para Benefício Invalidez</p>
                    <div className="grid grid-cols-2 gap-4 items-end">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-500">Idade Mínima (Anos)</label>
                        <input type="number" value={invalidezAgeYears} onChange={e => setInvalidezAgeYears(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 60" />
                      </div>
                      <div className="space-y-1.5 h-[38px] flex items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={acceptsOver60Invalidez} onChange={e => setAcceptsOver60Invalidez(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Aceita clientes acima de 60 Anos</span>
                        </label>
                      </div>
                    </div>
                    
                    {(!invalidezAgeYears || parseInt(invalidezAgeYears) > 0 || acceptsOver60Invalidez) && (
                      <div className="pt-3 border-t border-slate-200 dark:border-slate-700 mt-3">
                        <p className="text-sm font-medium mb-3">Tempo mínimo de Benefício</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs text-slate-500">Anos</label>
                            <input type="number" value={minBenefitTimeYears} onChange={e => setMinBenefitTimeYears(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 1" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs text-slate-500">Meses</label>
                            <input type="number" value={minBenefitTimeMonths} onChange={e => setMinBenefitTimeMonths(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 6" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tabelas e Coeficientes */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Tabelas e Coeficientes</h3>
                </div>
                
                {tabelas.map((tabela, index) => (
                  <div key={index} className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-4 relative group transition-all hover:border-primary/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                        Tabela #{index + 1}
                      </span>
                      <button 
                        onClick={() => removeTabela(index)}
                        className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Nome da Tabela</label>
                        <input 
                          type="text" 
                          value={tabela.nome} 
                          onChange={e => handleTabelaChange(index, 'nome', e.target.value)} 
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                          placeholder="Ex: Normal" 
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Coeficiente</label>
                          <input 
                            type="number" 
                            step="0.00001" 
                            value={tabela.coeficiente} 
                            onChange={e => handleTabelaChange(index, 'coeficiente', e.target.value)} 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                            placeholder="Ex: 0.02245" 
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Ticket Mínimo (R$)</label>
                          <input 
                            type="number" 
                            value={tabela.minTicket} 
                            onChange={e => handleTabelaChange(index, 'minTicket', e.target.value)} 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                            placeholder="Ex: 500.00" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button 
                  onClick={addTabela}
                  className="w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-1 group"
                >
                  <div className="size-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">Adicionar Nova Tabela</span>
                </button>
                <p className="text-xs text-slate-500">Estes coeficientes serão usados como base de cálculo para o valor do troco na simulação.</p>
              </div>

            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <button 
                onClick={handleSaveBank} 
                disabled={isSaving}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {isSaving ? 'Salvando...' : 'Salvar Banco e Regras'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar Regra Geral */}
      {isGeneralModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold">Adicionar Regra Geral</h2>
              <button onClick={() => setIsGeneralModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-500">Esta regra será validada em todas as simulações, informando o banco e a quantidade de parcelas aceita para que a simulação seja liberada.</p>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Banco</label>
                <input type="text" value={generalRuleBanco} onChange={e => setGeneralRuleBanco(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: Banco do Brasil" />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Quantidade de parcelas aceita</label>
                <input type="number" value={generalRuleParcelas} onChange={e => setGeneralRuleParcelas(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 12" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <button 
                onClick={handleSaveGeneralRule} 
                disabled={isSaving}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {isSaving ? 'Salvando...' : 'Salvar Regra Geral'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav activeTab="regras" />
    </div>
  );
}
