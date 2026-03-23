'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Info, Search, ShieldCheck, Landmark, Wallet, Building2, Save, User, Banknote, TrendingDown, TrendingUp, Plus, X, Settings, FileText, Trash2, Edit, CheckCircle2, AlertCircle, Hash, Percent, Zap, Lock, Settings2 } from 'lucide-react';
import { QuotaAlert } from '@/components/QuotaAlert';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { useRules, BankRule, GeneralRule } from '@/contexts/RuleContext';
import { useAuth } from '@/contexts/AuthContext';

export default function RegrasBanco() {
  const { profile } = useAuth();
  const router = useRouter();
  const { 
    banks, 
    generalRules, 
    promotoraPriorities,
    addBank, 
    updateBank, 
    deleteBank, 
    addGeneralRule, 
    updateGeneralRule, 
    deleteGeneralRule,
    updatePromotoraPriority
  } = useRules();

  const isAdmin = profile?.role === 'admin';
  const isPromotora = profile?.role === 'promotora';

  useEffect(() => {
    if (profile && profile.role !== 'admin' && profile.role !== 'promotora') {
      router.push('/dashboard');
    }
  }, [profile, router]);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [bankToDeleteId, setBankToDeleteId] = useState<string | null>(null);
  const [isGeneralModalOpen, setIsGeneralModalOpen] = useState(false);
  const [editingGeneralRuleId, setEditingGeneralRuleId] = useState<string | null>(null);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [maxRateFilter, setMaxRateFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [convenioFilter, setConvenioFilter] = useState<'TODOS' | 'INSS' | 'SIAPE'>('TODOS');

  // Form states for Bank Rules
  const [bankName, setBankName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [minInstallmentValue, setMinInstallmentValue] = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [minTroco, setMinTroco] = useState('');
  const [portabilityRate, setPortabilityRate] = useState('');
  const [refinRate, setRefinRate] = useState('');
  const [sumBalanceAndTroco, setSumBalanceAndTroco] = useState(false);
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
  const [minPaidInstallments, setMinPaidInstallments] = useState('');
  const [taxaContratoAtualPreview, setTaxaContratoAtualPreview] = useState('1.85');
  const [ajusteTaxa, setAjusteTaxa] = useState('0');
  const [novaTaxaReferencia, setNovaTaxaReferencia] = useState('1.85');
  const [priority, setPriority] = useState('');
  const [convenio, setConvenio] = useState<'INSS' | 'SIAPE'>('INSS');
  const [isActive, setIsActive] = useState(true);
  const [tabelas, setTabelas] = useState([{ nome: '', coeficiente: '', minTicket: '', taxaTabela: '', taxaDiferencial: '', ajusteTaxaPonderada: '', useMinTicket: true, useTaxaPonderada: true }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-populate from simulation data
  const updateFromSimulation = useCallback(() => {
    const simulationDataStr = sessionStorage.getItem('simulationData');
    if (simulationDataStr) {
      try {
        const simulationData = JSON.parse(simulationDataStr);
        if (simulationData.taxaJurosMensal) {
          const rate = (simulationData.taxaJurosMensal * 100).toFixed(2);
          setTaxaContratoAtualPreview(rate);
          
          // Recalculate novaTaxaReferencia when preview changes
          const adj = parseNumeric(ajusteTaxa);
          const current = parseNumeric(rate);
          const newRate = (current + adj).toFixed(2);
          setNovaTaxaReferencia(newRate);
          
          // Sync to all tables
          setTabelas(prev => prev.map(t => ({
            ...t,
            taxaDiferencial: newRate
          })));
          
          return true;
        }
      } catch (e) {
        console.error("Error parsing simulation data:", e);
      }
    }
    return false;
  }, [ajusteTaxa]);

  useEffect(() => {
    if (isBankModalOpen && !editingBankId) {
      updateFromSimulation();
    }
  }, [isBankModalOpen, editingBankId, updateFromSimulation]);

  // Form states for General Rules
  const [generalRuleBanco, setGeneralRuleBanco] = useState('');
  const [generalRuleParcelas, setGeneralRuleParcelas] = useState('');

  const addTabela = () => {
    setTabelas([...tabelas, { nome: '', coeficiente: '', minTicket: '', taxaTabela: '', taxaDiferencial: '', ajusteTaxaPonderada: '', useMinTicket: true, useTaxaPonderada: true }]);
  };

  const removeTabela = (index: number) => {
    if (tabelas.length > 1) {
      setTabelas(tabelas.filter((_, i) => i !== index));
    } else {
      setTabelas([{ nome: '', coeficiente: '', minTicket: '', taxaTabela: '', taxaDiferencial: '', useMinTicket: true, useTaxaPonderada: true }]);
    }
  };

  const handleTabelaChange = (index: number, field: string, value: any) => {
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
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (saveFeedback) {
      const timer = setTimeout(() => setSaveFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveFeedback]);

  const parseNumeric = (val: string | number) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const sanitized = val.toString().replace(',', '.');
    return parseFloat(sanitized) || 0;
  };

  const validateRates = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (minPaidInstallments && isNaN(parseInt(minPaidInstallments))) {
      newErrors.minPaidInstallments = "Valor inválido";
    }

    const origem = parseNumeric(taxaContratoAtualPreview);

    tabelas.forEach((t, idx) => {
      if (!t.nome) newErrors[`tabela_${idx}_nome`] = "Campo obrigatório";
      if (!t.coeficiente || isNaN(parseNumeric(t.coeficiente))) newErrors[`tabela_${idx}_coef`] = "Valor inválido";
      if (!t.minTicket || isNaN(parseNumeric(t.minTicket))) newErrors[`tabela_${idx}_ticket`] = "Valor inválido";
      
      const taxaTab = parseNumeric(t.taxaTabela);
      const diferencial = parseNumeric(t.taxaDiferencial) || 0;
      
      if (t.taxaTabela === undefined || t.taxaTabela === null || isNaN(taxaTab)) {
        newErrors[`tabela_${idx}_taxa`] = "Valor inválido";
      }

      if (t.taxaDiferencial === undefined || t.taxaDiferencial === null || isNaN(diferencial)) {
        newErrors[`tabela_${idx}_diferencial`] = "Valor inválido";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [taxaContratoAtualPreview, minPaidInstallments, tabelas]);

  useEffect(() => {
    if (isBankModalOpen) {
      validateRates();
    }
  }, [validateRates, isBankModalOpen]);

  const handleSaveBank = async () => {
    if (!bankName) return;
    if (!validateRates()) {
      alert("Algumas taxas excedem os limites permitidos. Verifique os campos destacados.");
      return;
    }
    
    setIsSaving(true);
    setSaveFeedback(null);
    try {
      const invalidezYears = parseInt(invalidezAgeYears) || 0;
      
      // Validation for benefit time when age rule is present
      if (invalidezYears > 0) {
        if (!minBenefitTimeYears && !minBenefitTimeMonths) {
          setSaveFeedback({ type: 'error', message: "Tempo mínimo de benefício é obrigatório quando há regra de idade para invalidez." });
          setIsSaving(false);
          return;
        }
      }

      const bankData = {
        name: bankName,
        convenio: convenio,
        logoUrl,
        minAge: parseInt(minAge) || 0,
        maxAge: parseInt(maxAge) || 0,
        minInstallmentValue: parseNumeric(minInstallmentValue) || 0,
        minBalance: parseNumeric(minBalance) || 0,
        minTroco: parseNumeric(minTroco) || 0,
        portabilityRate: parseNumeric(portabilityRate) || 0,
        refinRate: parseNumeric(refinRate) || 0,
        sumBalanceAndTroco,
        nonAcceptedBanks: nonAcceptedBanks,
        specificInstallmentRules: specificInstallmentRules.map(r => ({ bank: r.bank, installments: parseInt(r.installments) })),
        acceptsIlliterate,
        acceptsLOAS,
        acceptsInvalidez,
        invalidezAgeYears: invalidezYears,
        acceptsOver60Invalidez,
        minBenefitTimeYears: invalidezYears > 0 ? (parseInt(minBenefitTimeYears) || 0) : 0,
        minBenefitTimeMonths: invalidezYears > 0 ? (parseInt(minBenefitTimeMonths) || 0) : 0,
        taxaPortabilidadeOrigem: parseNumeric(taxaContratoAtualPreview),
        ajusteTaxa: parseNumeric(ajusteTaxa),
        novaTaxaReferencia: parseNumeric(novaTaxaReferencia),
        minPaidInstallments: parseInt(minPaidInstallments) || 0,
        priority: parseInt(priority) || 0,
        isActive: isActive,
        tabelas: tabelas.filter(t => t.nome && t.coeficiente).map(t => ({
          nome: t.nome,
          coeficiente: parseNumeric(t.coeficiente),
          minTicket: parseNumeric(t.minTicket),
          taxaTabela: parseNumeric(t.taxaTabela),
          taxaDiferencial: parseNumeric(t.taxaDiferencial),
          ajusteTaxaPonderada: parseNumeric(t.ajusteTaxaPonderada),
          useMinTicket: t.useMinTicket !== false,
          useTaxaPonderada: t.useTaxaPonderada !== false
        }))
      };

      if (editingBankId) {
        await updateBank(editingBankId, bankData);
        setSaveFeedback({ type: 'success', message: "Banco atualizado com sucesso!" });
        // Don't clear editingBankId immediately to allow user to see success
        setTimeout(() => {
          setEditingBankId(null);
          setIsBankModalOpen(false);
        }, 1500);
      } else {
        await addBank(bankData);
        setSaveFeedback({ type: 'success', message: "Banco adicionado com sucesso!" });
        
        // Reset form after success
        setTimeout(() => {
          setBankName('');
          setLogoUrl('');
          setMinAge('');
          setMaxAge('');
          setMinInstallmentValue('');
          setMinBalance('');
          setMinTroco('');
          setPortabilityRate('');
          setRefinRate('');
          setSumBalanceAndTroco(false);
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
          setMinPaidInstallments('');
          setPriority('');
          setIsActive(true);
          setTaxaContratoAtualPreview('1.85');
          setTabelas([{ nome: '', coeficiente: '', minTicket: '', taxaTabela: '', taxaDiferencial: '', ajusteTaxaPonderada: '' }]);
          setErrors({});
          setIsBankModalOpen(false);
        }, 1500);
      }
    } catch (error) {
      console.error("Erro ao salvar banco:", error);
      setSaveFeedback({ type: 'error', message: "Erro ao salvar banco. Tente novamente." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBank = (bank: BankRule) => {
    setEditingBankId(bank.id);
    setBankName(bank.name || '');
    setLogoUrl(bank.logoUrl || '');
    setMinAge(bank.minAge?.toString() || '0');
    setMaxAge(bank.maxAge?.toString() || '0');
    setMinInstallmentValue(bank.minInstallmentValue?.toString() || '');
    setMinBalance(bank.minBalance?.toString() || '');
    setMinTroco(bank.minTroco?.toString() || '');
    setPortabilityRate(bank.portabilityRate?.toString() || '');
    setRefinRate(bank.refinRate?.toString() || '');
    setSumBalanceAndTroco(bank.sumBalanceAndTroco || false);
    setNonAcceptedBanks(bank.nonAcceptedBanks || []);
    setNonAcceptedBankInput('');
    setSpecificInstallmentRules(bank.specificInstallmentRules?.map(r => ({ bank: r.bank, installments: r.installments?.toString() || '0' })) || []);
    setSpecificBankInput('');
    setSpecificInstallmentsInput('');
    setAcceptsIlliterate(bank.acceptsIlliterate || false);
    setAcceptsLOAS(bank.acceptsLOAS || false);
    setAcceptsInvalidez(bank.acceptsInvalidez !== false);
    setInvalidezAgeYears(bank.invalidezAgeYears?.toString() || '');
    setAcceptsOver60Invalidez(bank.acceptsOver60Invalidez || false);
    setMinBenefitTimeYears(bank.minBenefitTimeYears?.toString() || '');
    setMinBenefitTimeMonths(bank.minBenefitTimeMonths?.toString() || '');
    setMinPaidInstallments(bank.minPaidInstallments?.toString() || '');
    setPriority(bank.priority?.toString() || '0');
    setConvenio(bank.convenio || 'INSS');
    setIsActive(bank.isActive !== false);
    setTaxaContratoAtualPreview(bank.taxaPortabilidadeOrigem?.toString() || '1.85');
    setAjusteTaxa(bank.ajusteTaxa?.toString() || '0');
    setNovaTaxaReferencia(bank.novaTaxaReferencia?.toString() || '1.85');
    setTabelas(bank.tabelas?.length > 0 ? bank.tabelas.map(t => ({ 
      nome: t.nome || '', 
      coeficiente: t.coeficiente?.toString() || '',
      minTicket: t.minTicket?.toString() || '',
      taxaTabela: t.taxaTabela?.toString() || '',
      taxaDiferencial: t.taxaDiferencial?.toString() || '',
      ajusteTaxaPonderada: t.ajusteTaxaPonderada?.toString() || '',
      useMinTicket: t.useMinTicket !== false,
      useTaxaPonderada: t.useTaxaPonderada !== false
    })) : [{ nome: '', coeficiente: '', minTicket: '', taxaTabela: '', taxaDiferencial: '', ajusteTaxaPonderada: '', useMinTicket: true, useTaxaPonderada: true }]);
    setIsBankModalOpen(true);
  };

  const handleSaveGeneralRule = async () => {
    if (!generalRuleBanco || !generalRuleParcelas) return;
    
    setIsSaving(true);
    setSaveFeedback(null);
    try {
      const ruleData = {
        banco: generalRuleBanco,
        parcelasAceitas: parseInt(generalRuleParcelas) || 0
      };

      if (editingGeneralRuleId) {
        await updateGeneralRule(editingGeneralRuleId, ruleData);
        setSaveFeedback({ type: 'success', message: "Regra geral atualizada com sucesso!" });
        setTimeout(() => {
          setEditingGeneralRuleId(null);
          setIsGeneralModalOpen(false);
        }, 1500);
      } else {
        await addGeneralRule(ruleData);
        setSaveFeedback({ type: 'success', message: "Regra geral adicionada com sucesso!" });
        setTimeout(() => {
          setGeneralRuleBanco('');
          setGeneralRuleParcelas('');
          setIsGeneralModalOpen(false);
        }, 1500);
      }
    } catch (error) {
      console.error("Erro ao salvar regra geral:", error);
      setSaveFeedback({ type: 'error', message: "Erro ao salvar regra geral. Tente novamente." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditGeneralRule = (rule: GeneralRule) => {
    setEditingGeneralRuleId(rule.id);
    setGeneralRuleBanco(rule.banco);
    setGeneralRuleParcelas(rule.parcelasAceitas.toString());
    setIsGeneralModalOpen(true);
  };

  const handleDeleteBank = (id: string) => {
    setBankToDeleteId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteBank = async () => {
    if (bankToDeleteId) {
      try {
        await deleteBank(bankToDeleteId);
        setIsDeleteModalOpen(false);
        setBankToDeleteId(null);
      } catch (error) {
        console.error("Erro ao excluir banco:", error);
      }
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
    <div className="flex flex-col min-h-screen w-full max-w-xl mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background-light dark:bg-background-dark border-b border-slate-200 dark:border-slate-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/regras/convenio" className="flex items-center justify-center p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft className="text-slate-900 dark:text-slate-100 w-6 h-6" />
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Regras e Bancos</h1>
          </div>
          <button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <Info className="text-slate-900 dark:text-slate-100 w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full p-4 space-y-6">
        <QuotaAlert />
        {/* Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <label className="sr-only">Pesquisar banco</label>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="text-slate-400 w-5 h-5" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="Pesquisar..."
            />
          </div>
          <div className="bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => setConvenioFilter('TODOS')}
              className={`flex-1 py-3 rounded-lg font-bold text-[10px] transition-all ${
                convenioFilter === 'TODOS'
                  ? 'bg-white dark:bg-slate-800 text-primary shadow-sm'
                  : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
            >
              TODOS
            </button>
            <button
              onClick={() => setConvenioFilter('INSS')}
              className={`flex-1 py-3 rounded-lg font-bold text-[10px] transition-all ${
                convenioFilter === 'INSS'
                  ? 'bg-white dark:bg-slate-800 text-primary shadow-sm'
                  : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
            >
              INSS
            </button>
            <button
              onClick={() => setConvenioFilter('SIAPE')}
              className={`flex-1 py-3 rounded-lg font-bold text-[10px] transition-all ${
                convenioFilter === 'SIAPE'
                  ? 'bg-white dark:bg-slate-800 text-primary shadow-sm'
                  : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
            >
              SIAPE
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        {isAdmin && (
          <div className="grid grid-cols-2 gap-4">
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
              onClick={() => {
                setIsActive(true);
                setIsBankModalOpen(true);
              }}
              className="flex flex-col items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl p-4 transition-all"
            >
              <div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center">
                <Landmark className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-primary text-center">Adicionar Banco e Regras</span>
            </button>

          </div>
        )}

        {isPromotora && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-center gap-3 text-primary">
              <ShieldCheck className="w-5 h-5" />
              <p className="text-sm font-bold">Configuração de Prioridades</p>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Como promotora, você pode definir sua própria ordem de preferência para os bancos. 
              Isso afetará apenas as simulações realizadas por você e seus corretores.
            </p>
          </div>
        )}

        {/* General Rules List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Regras Gerais</h3>
            {generalRules.length > 0 && (
              <span className="text-[10px] font-bold bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full">
                {generalRules.length} {generalRules.length === 1 ? 'Regra' : 'Regras'}
              </span>
            )}
          </div>

          {generalRules.length === 0 ? (
            <div className="bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
              <div className="size-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <Settings className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Nenhuma regra geral configurada.</p>
              <p className="text-[10px] text-slate-400 mt-1">Regras gerais são aplicadas a todas as simulações.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {generalRules.map(rule => (
                <div key={rule.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex justify-between items-center shadow-sm hover:border-primary/30 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{rule.banco}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parcelas:</span>
                        <span className="text-xs font-black text-primary">{rule.parcelasAceitas}x</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleEditGeneralRule(rule)} 
                      className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                      title="Editar regra"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteGeneralRule(rule.id)} 
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                      title="Excluir regra"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Banks List */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 px-1">Bancos Configurados</h3>

          {(() => {
            const filteredBanks = banks.filter(bank => {
              const matchesSearch = searchTerm === '' || bank.name.toLowerCase().includes(searchTerm.toLowerCase());
              const matchesConvenio = convenioFilter === 'TODOS' || bank.convenio === convenioFilter;
              const matchesRate = maxRateFilter === '' || (bank.tabelas && bank.tabelas.some(t => (t.taxaTabela !== undefined && t.taxaTabela !== null) && t.taxaTabela <= parseFloat(maxRateFilter)));
              return matchesSearch && matchesConvenio && matchesRate;
            });

            return filteredBanks.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                Nenhum banco encontrado com esses filtros.
              </div>
            ) : (
              filteredBanks.sort((a, b) => a.name.localeCompare(b.name)).map(bank => (
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
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-slate-100">{bank.name}</p>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter ${
                            bank.convenio === 'SIAPE' 
                              ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' 
                              : 'bg-primary/10 text-primary'
                          }`}>
                            {bank.convenio || 'INSS'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{bank.tabelas?.length || 0} tabelas</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPromotora ? (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col items-end">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Sua Prioridade</label>
                            <input 
                              type="number"
                              value={promotoraPriorities[bank.id] ?? bank.priority ?? ''}
                              onChange={(e) => updatePromotoraPriority(bank.id, parseInt(e.target.value) || 0)}
                              className="w-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-primary text-center focus:ring-1 focus:ring-primary outline-none"
                              placeholder="Ex: 1"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => handleEditBank(bank)} className="bg-slate-100 dark:bg-slate-700 hover:bg-primary hover:text-white dark:hover:bg-primary text-slate-700 dark:text-slate-300 text-sm font-semibold px-4 py-2 rounded-lg transition-all">
                            Editar
                          </button>
                          <button onClick={() => handleDeleteBank(bank.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
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
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
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
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Porta com regras específicas:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {bank.specificInstallmentRules.map((rule, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                          {rule.bank}: {rule.installments} parcelas
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Basic Info Quick Edit */}
                {isAdmin && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Parcela Mínima (R$)</label>
                        <input 
                          type="number" 
                          value={bank.minInstallmentValue || ''} 
                          onChange={e => updateBank(bank.id, { minInstallmentValue: parseNumeric(e.target.value) })}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                          placeholder="0.00" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Saldo Mínimo (R$)</label>
                        <input 
                          type="number" 
                          value={bank.minBalance || ''} 
                          onChange={e => updateBank(bank.id, { minBalance: parseNumeric(e.target.value) })}
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
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || !isNaN(parseNumeric(val))) {
                              updateBank(bank.id, { portabilityRate: parseNumeric(val) });
                            }
                          }}
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
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || !isNaN(parseNumeric(val))) {
                              updateBank(bank.id, { refinRate: parseNumeric(val) });
                            }
                          }}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                          placeholder="0.00" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Troco Mínimo (R$)</label>
                        <input 
                          type="number" 
                          value={bank.minTroco || ''} 
                          onChange={e => updateBank(bank.id, { minTroco: parseNumeric(e.target.value) })}
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
                )}
              </div>
            ))
          );
        })()}
        </section>
      </main>

      {/* Modal Adicionar Banco e Regras */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold">Adicionar Banco e Regras</h2>
              <button onClick={() => setIsBankModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-3 overflow-y-auto flex-1 min-h-0 space-y-4">
              {saveFeedback && (
                <div className={`p-3 rounded-xl flex items-center gap-3 ${
                  saveFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                }`}>
                  {saveFeedback.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  <p className="text-sm font-bold">{saveFeedback.message}</p>
                </div>
              )}
                         <div className="space-y-3">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Informações do Banco</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-medium text-slate-500">Nome do Banco</label>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] font-black uppercase tracking-tighter ${isActive ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {isActive ? 'Ativo' : 'Inativo'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsActive(!isActive)}
                          className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isActive ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                        >
                          <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isActive ? 'translate-x-3' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>
                    <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none font-bold" placeholder="Ex: Banco do Brasil" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Convênio</label>
                    <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex gap-1">
                      <button
                        type="button"
                        onClick={() => setConvenio('INSS')}
                        className={`flex-1 py-1 rounded-md font-bold text-[9px] transition-all ${
                          convenio === 'INSS'
                            ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                            : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        INSS
                      </button>
                      <button
                        type="button"
                        onClick={() => setConvenio('SIAPE')}
                        className={`flex-1 py-1 rounded-md font-bold text-[9px] transition-all ${
                          convenio === 'SIAPE'
                            ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                            : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        SIAPE
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 space-y-4 border border-slate-200 dark:border-slate-700 p-4 rounded-xl bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/20"></div>
                    <div className="flex items-center justify-between">
                      <h4 className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] flex items-center gap-1.5">
                        <Settings className="w-2.5 h-2.5" />
                        Dados para Preview da Taxa
                      </h4>
                      <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800 ml-3"></div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Taxa Atual */}
                      <div className="space-y-1.5">
                        <div className="h-4 flex items-center justify-between">
                          <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Taxa Atual (%)</label>
                          <button 
                            onClick={(e) => { e.preventDefault(); updateFromSimulation(); }}
                            className="text-[8px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors bg-primary/5 px-1.5 py-0.5 rounded-md border border-primary/10"
                          >
                            <TrendingUp className="w-2.5 h-2.5" />
                            Importar
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={taxaContratoAtualPreview} 
                          onChange={e => {
                            const val = e.target.value;
                            setTaxaContratoAtualPreview(val);
                            const current = parseNumeric(val);
                            const adj = parseNumeric(ajusteTaxa);
                            const newRate = (current + adj).toFixed(2);
                            setNovaTaxaReferencia(newRate);
                            // Sync to all tables
                            setTabelas(prev => prev.map(t => ({
                              ...t,
                              taxaDiferencial: newRate
                            })));
                          }}
                          className="w-full bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-primary outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm" 
                          placeholder="0.00"
                        />
                      </div>

                      {/* Ajuste */}
                      <div className="space-y-1.5">
                        <div className="h-4 flex items-center">
                          <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ajuste (+/-)</label>
                        </div>
                        <input 
                          type="text" 
                          value={ajusteTaxa} 
                          onChange={e => {
                            const val = e.target.value;
                            setAjusteTaxa(val);
                            const adj = parseNumeric(val);
                            const current = parseNumeric(taxaContratoAtualPreview);
                            const newRate = (current + adj).toFixed(2);
                            setNovaTaxaReferencia(newRate);
                            // Sync to all tables
                            setTabelas(prev => prev.map(t => ({
                              ...t,
                              taxaDiferencial: newRate
                            })));
                          }}
                          className="w-full bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm" 
                          placeholder="0.00"
                        />
                      </div>

                      {/* Resultado */}
                      <div className="space-y-1.5">
                        <div className="h-4 flex items-center">
                          <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Nova Taxa Port.</label>
                        </div>
                        <div className="relative">
                          <input 
                            type="text" 
                            value={novaTaxaReferencia} 
                            onChange={e => {
                              const val = e.target.value;
                              setNovaTaxaReferencia(val);
                              // Sync to all tables
                              setTabelas(prev => prev.map(t => ({
                                ...t,
                                taxaDiferencial: val
                              })));
                            }}
                            className="w-full bg-emerald-50/30 dark:bg-emerald-500/5 border border-emerald-200/60 dark:border-emerald-500/20 rounded-lg px-3 py-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm" 
                            placeholder="0.00"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 px-0.5 pt-0.5">
                      <div className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <Info className="w-2.5 h-2.5 text-slate-400" />
                      </div>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium italic leading-relaxed">
                        Esta taxa será usada como base para o cálculo da <span className="text-slate-600 dark:text-slate-300 font-bold">Taxa Ponderada</span> nas tabelas abaixo.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Mínimo Parcelas Pagas</label>
                    <input 
                      type="number" 
                      value={minPaidInstallments} 
                      onChange={e => setMinPaidInstallments(e.target.value)} 
                      className={`w-full bg-slate-50 dark:bg-slate-800 border ${errors.minPaidInstallments ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none`} 
                      placeholder="Ex: 1" 
                    />
                    {errors.minPaidInstallments && <p className="text-[9px] text-red-500 font-bold">{errors.minPaidInstallments}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Prioridade (Ordem de Preferência)</label>
                    <input 
                      type="number" 
                      value={priority} 
                      onChange={e => setPriority(e.target.value)} 
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" 
                      placeholder="Ex: 10" 
                    />
                    <p className="text-[9px] text-slate-400">Valores menores aparecem primeiro no resultado (ex: 1 é prioridade máxima).</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500">Logo do Banco</label>
                  <div className="flex items-center gap-2">
                    {logoUrl && (
                      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 relative">
                        <Image src={logoUrl} alt="Logo preview" fill className="object-cover" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleLogoUpload} 
                        className="w-full text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-[10px] file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" 
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                    <span className="text-[8px] text-slate-400 font-medium">OU</span>
                    <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                  </div>
                  <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Cole a URL da imagem aqui" />
                </div>
              </div>

              {/* Regras de Idade e Valores */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Regras de Idade e Valores</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Idade Mínima</label>
                    <input type="number" value={minAge} onChange={e => setMinAge(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 18" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Idade Máxima</label>
                    <input type="number" value={maxAge} onChange={e => setMaxAge(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 75" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Parcela Mínima (R$)</label>
                    <input type="number" value={minInstallmentValue} onChange={e => setMinInstallmentValue(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 50.00" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Saldo Mínimo (R$)</label>
                    <input type="number" value={minBalance} onChange={e => setMinBalance(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 100.00" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Troco Mínimo (R$)</label>
                    <input type="number" value={minTroco} onChange={e => setMinTroco(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 200.00" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Taxa Portabilidade (%)</label>
                    <input type="number" step="0.01" value={portabilityRate} onChange={e => setPortabilityRate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 1.80" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Taxa Refin (%)</label>
                    <input type="number" step="0.01" value={refinRate} onChange={e => setRefinRate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 1.75" />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={sumBalanceAndTroco} 
                        onChange={e => setSumBalanceAndTroco(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary" 
                      />
                      <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">Somar Saldo Mínimo + Troco Mínimo na validação</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Regras de Portabilidade */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Regras de Portabilidade</h3>
                <div className="space-y-2">
                  <label className="text-[10px] font-medium text-slate-500">Bancos que NÃO porta</label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {nonAcceptedBanks.map(bank => (
                      <span key={bank} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-medium">
                        {bank}
                        <button type="button" onClick={() => handleRemoveNonAcceptedBank(bank)} className="hover:text-red-900 dark:hover:text-red-200">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input 
                      type="text" 
                      value={nonAcceptedBankInput} 
                      onChange={e => setNonAcceptedBankInput(e.target.value)} 
                      onKeyDown={handleAddNonAcceptedBank}
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" 
                      placeholder="Digite o banco e aperte Enter" 
                    />
                    <button 
                      type="button" 
                      onClick={handleAddNonAcceptedBank}
                      className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-medium text-slate-500">Bancos que porta com regras específicas</label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {specificInstallmentRules.map((rule, index) => (
                      <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium">
                        {rule.bank}: {rule.installments} parcelas
                        <button type="button" onClick={() => handleRemoveSpecificRule(index)} className="hover:text-emerald-900 dark:hover:text-emerald-200">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input 
                      type="text" 
                      value={specificBankInput} 
                      onChange={e => setSpecificBankInput(e.target.value)} 
                      className="flex-[2] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" 
                      placeholder="Nome do banco" 
                    />
                    <input 
                      type="number" 
                      value={specificInstallmentsInput} 
                      onChange={e => setSpecificInstallmentsInput(e.target.value)} 
                      className="flex-1 min-w-[80px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" 
                      placeholder="Parcelas" 
                    />
                    <button 
                      type="button" 
                      onClick={handleAddSpecificRule}
                      className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Regras de Perfil e Benefício */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Perfil e Benefícios</h3>
                
                <label className="flex items-center gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={acceptsIlliterate} onChange={e => setAcceptsIlliterate(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-xs font-medium">Aceita cliente analfabeto</span>
                </label>

                <label className="flex items-center gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={acceptsLOAS} onChange={e => setAcceptsLOAS(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-xs font-medium">Aceita portar benefícios LOAS (87 e 88)</span>
                </label>

                <label className="flex items-center gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={acceptsInvalidez} onChange={e => setAcceptsInvalidez(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-xs font-medium">Aceita Espécie Invalidez (04, 32, 92)</span>
                </label>

                {acceptsInvalidez && (
                  <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2 bg-slate-50 dark:bg-slate-800/20">
                    <p className="text-xs font-medium">Regra de idade para Benefício Invalidez</p>
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500">Idade Mínima (Anos)</label>
                        <input type="number" value={invalidezAgeYears} onChange={e => setInvalidezAgeYears(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 60" />
                      </div>
                      <div className="space-y-1 h-[34px] flex items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={acceptsOver60Invalidez} onChange={e => setAcceptsOver60Invalidez(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary" />
                          <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">Aceita clientes acima de 60 Anos</span>
                        </label>
                      </div>
                    </div>
                    
                    {(!invalidezAgeYears || parseInt(invalidezAgeYears) > 0 || acceptsOver60Invalidez) && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 mt-2">
                        <p className="text-[10px] font-medium mb-2">Tempo mínimo de Benefício</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500">Anos</label>
                            <input type="number" value={minBenefitTimeYears} onChange={e => setMinBenefitTimeYears(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 1" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500">Meses</label>
                            <input type="number" value={minBenefitTimeMonths} onChange={e => setMinBenefitTimeMonths(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" placeholder="Ex: 6" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tabelas e Coeficientes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Tabelas e Coeficientes</h3>
                </div>
                
                {tabelas.map((tabela, index) => (
                  <div key={index} className="p-3 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 relative shadow-sm transition-all hover:shadow-md">
                    {/* Header da Tabela */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-1.5">
                        <div className="size-5 rounded-lg bg-primary text-white flex items-center justify-center text-[9px] font-black shadow-md shadow-primary/20 rotate-3">
                          {index + 1}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[7px] font-black text-primary uppercase tracking-widest leading-none mb-0.5">Configuração</span>
                          <span className="text-[10px] font-bold text-slate-900 dark:text-white leading-none">Tabela de Coeficientes</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => removeTabela(index)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 text-red-500 hover:bg-red-500 hover:text-white transition-all text-[8px] font-bold uppercase tracking-wider border border-slate-200 dark:border-slate-700 shadow-sm"
                      >
                        <Trash2 className="w-2.5 h-2.5" /> 
                        <span className="hidden sm:inline">Remover</span>
                      </button>
                    </div>
                    
                    {/* Grid de Inputs Principais */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-2 sm:gap-3">
                      <div className="space-y-1 sm:col-span-2 md:col-span-12">
                        <div className="flex items-center gap-1 ml-1">
                          <FileText className="w-2 h-2 text-slate-400" />
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-500">Identificação da Tabela</label>
                        </div>
                        <input 
                          type="text" 
                          value={tabela.nome} 
                          onChange={e => handleTabelaChange(index, 'nome', e.target.value)} 
                          className={`w-full bg-white dark:bg-slate-900 border ${errors[`tabela_${index}_nome`] ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm placeholder:text-slate-300`} 
                          placeholder="Ex: Tabela Flex 4.0" 
                        />
                        {errors[`tabela_${index}_nome`] && <p className="text-[8px] text-red-500 ml-1 font-bold">{errors[`tabela_${index}_nome`]}</p>}
                      </div>

                      <div className="space-y-1 sm:col-span-2 md:col-span-4">
                        <div className="flex items-center gap-1 ml-1">
                          <Hash className="w-2 h-2 text-slate-400" />
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-500">Coeficiente</label>
                        </div>
                        <input 
                          type="number" 
                          step="0.00001" 
                          value={tabela.coeficiente} 
                          onChange={e => handleTabelaChange(index, 'coeficiente', e.target.value)} 
                          className={`w-full bg-white dark:bg-slate-900 border ${errors[`tabela_${index}_coef`] ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-lg px-2.5 py-1.5 text-xs font-black focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm`} 
                          placeholder="0.00000" 
                        />
                        {errors[`tabela_${index}_coef`] && <p className="text-[8px] text-red-500 ml-1 font-bold">{errors[`tabela_${index}_coef`]}</p>}
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:col-span-2 md:col-span-8">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 ml-1">
                            <Percent className="w-2 h-2 text-slate-400" />
                            <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 truncate">Taxa Base (%)</label>
                          </div>
                          <input 
                            type="number" 
                            step="0.01" 
                            value={tabela.taxaTabela} 
                            onChange={e => handleTabelaChange(index, 'taxaTabela', e.target.value)} 
                            className={`w-full bg-white dark:bg-slate-900 border ${errors[`tabela_${index}_taxa`] ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-lg px-2.5 py-1.5 text-xs font-black focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm`} 
                            placeholder="0.00" 
                          />
                          {errors[`tabela_${index}_taxa`] && <p className="text-[8px] text-red-500 ml-1 font-bold">{errors[`tabela_${index}_taxa`]}</p>}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 ml-1">
                            <Zap className="w-2 h-2 text-emerald-500" />
                            <label className="text-[8px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 truncate">Nova Taxa (%)</label>
                            <button 
                              type="button"
                              onClick={() => handleTabelaChange(index, 'taxaDiferencial', portabilityRate)}
                              className="ml-auto text-[6px] font-black bg-emerald-500/10 text-emerald-600 px-1 rounded border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-0.5"
                              title="Importar taxa de portabilidade do banco"
                            >
                              <TrendingDown className="w-1.5 h-1.5" />
                              IMPORTAR
                            </button>
                          </div>
                          <div className="relative group">
                            <input 
                              type="number" 
                              step="0.01" 
                              value={tabela.taxaDiferencial} 
                              onChange={e => handleTabelaChange(index, 'taxaDiferencial', e.target.value)}
                              className="w-full bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-inner" 
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <Lock className="w-2 h-2 text-emerald-400" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Seção de Regras e Previews */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                      {/* Ticket Mínimo */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-12 h-12 bg-primary/5 rounded-full -mr-6 -mt-6 transition-transform group-hover:scale-110" />
                        
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-1.5">
                            <div className={`size-1.5 rounded-full shadow-sm ${tabela.useMinTicket !== false ? 'bg-primary animate-pulse' : 'bg-slate-300'}`} />
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Ticket Mínimo</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleTabelaChange(index, 'useMinTicket', !tabela.useMinTicket)}
                            className={`text-[7px] font-black px-1.5 py-0.5 rounded-md transition-all border ${tabela.useMinTicket !== false ? 'bg-primary text-white border-primary shadow-md shadow-primary/20' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                          >
                            {tabela.useMinTicket !== false ? 'ATIVO' : 'INATIVO'}
                          </button>
                        </div>

                        <div className={`relative transition-all duration-300 ${tabela.useMinTicket === false ? 'opacity-20 grayscale pointer-events-none scale-[0.98]' : 'opacity-100 scale-100'}`}>
                          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400">
                            <span className="text-[9px] font-black">R$</span>
                          </div>
                          <input 
                            type="number" 
                            value={tabela.minTicket} 
                            disabled={tabela.useMinTicket === false}
                            onChange={e => handleTabelaChange(index, 'minTicket', e.target.value)} 
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-inner" 
                            placeholder="0.00" 
                          />
                        </div>
                      </div>

                      {/* Taxa Ponderada */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500/5 rounded-full -mr-6 -mt-6 transition-transform group-hover:scale-110" />
                        
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-1.5">
                            <div className={`size-1.5 rounded-full shadow-sm ${tabela.useTaxaPonderada !== false ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Taxa Ponderada</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleTabelaChange(index, 'useTaxaPonderada', !tabela.useTaxaPonderada)}
                            className={`text-[7px] font-black px-1.5 py-0.5 rounded-md transition-all border ${tabela.useTaxaPonderada !== false ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                          >
                            {tabela.useTaxaPonderada !== false ? 'ATIVO' : 'INATIVO'}
                          </button>
                        </div>
                        
                        <div className={`flex flex-col lg:flex-row items-stretch lg:items-center gap-2 transition-all duration-300 ${tabela.useTaxaPonderada === false ? 'opacity-20 grayscale pointer-events-none scale-[0.98]' : 'opacity-100 scale-100'}`}>
                          <div className="flex-1 flex items-center bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 shadow-inner group/input">
                            <div className="flex flex-col flex-1">
                              <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Ajuste Manual</span>
                              <div className="flex items-center">
                                <Settings2 className="w-2 h-2 text-primary mr-1" />
                                <input 
                                  type="text"
                                  value={tabela.ajusteTaxaPonderada || ''}
                                  onChange={e => handleTabelaChange(index, 'ajusteTaxaPonderada', e.target.value)}
                                  className="w-full bg-transparent border-none p-0 text-[10px] font-black text-primary focus:ring-0 outline-none placeholder:text-primary/20"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center px-1">
                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest lg:mb-0.5">Resultado</span>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-lg font-black text-primary tracking-tighter">
                                {(( 
                                  (parseNumeric(taxaContratoAtualPreview) + 
                                  (parseFloat(tabela.taxaDiferencial) || parseFloat(tabela.taxaTabela) || 0)) / 2
                                ) + (parseNumeric(tabela.ajusteTaxaPonderada) || 0)).toFixed(2)}
                              </span>
                              <span className="text-[8px] font-black text-primary/60">%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button 
                  onClick={addTabela}
                  className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-1 group"
                >
                  <div className="size-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <Plus className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Adicionar Nova Tabela</span>
                </button>
                <p className="text-[10px] text-slate-500">Estes coeficientes serão usados como base de cálculo para o valor do troco na simulação.</p>
              </div>

            </div>
            
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <button 
                onClick={handleSaveBank} 
                disabled={isSaving || Object.keys(errors).length > 0}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Save className="w-4 h-4" />
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
              {saveFeedback && (
                <div className={`p-3 rounded-xl flex items-center gap-3 ${
                  saveFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                }`}>
                  {saveFeedback.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  <p className="text-sm font-bold">{saveFeedback.message}</p>
                </div>
              )}
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

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Confirmar Exclusão</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Tem certeza que deseja excluir este banco? Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-4 py-4 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteBank}
                className="flex-1 px-4 py-4 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-l border-slate-100 dark:border-slate-800"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
