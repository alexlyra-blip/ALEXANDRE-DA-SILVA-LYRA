'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  Clock, 
  Loader2, 
  Calendar,
  User,
  CreditCard,
  FileText,
  TrendingUp,
  Info,
  CheckCircle,
  Copy,
  FileEdit
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import { saveProposal, deleteProposal, getProposals } from '@/lib/data-service';
import { format, addBusinessDays, differenceInBusinessDays, isAfter, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_OPTIONS = [
  { id: 'RASCUNHO', label: 'RASCUNHO', color: 'bg-slate-500', activeColor: 'bg-slate-500 text-white shadow-lg shadow-slate-500/30' },
  { id: 'PENDENTE', label: 'PENDENTE', color: 'bg-amber-500', activeColor: 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' },
  { id: 'ANDAMENTO', label: 'ANDAMENTO', color: 'bg-blue-500', activeColor: 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' },
  { id: 'PAGO', label: 'PAGO', color: 'bg-emerald-500', activeColor: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' },
  { id: 'REPROVADO', label: 'REPROVADO', color: 'bg-rose-500', activeColor: 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' },
];

const formatCpf = (value: string) => {
  const v = value.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
  if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
  return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
};

const validateCpf = (cpf: string) => {
  const cleanCpf = cpf.replace(/\D/g, '');
  if (cleanCpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cleanCpf.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleanCpf.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleanCpf.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleanCpf.charAt(10))) return false;
  
  return true;
};

import { Suspense } from 'react';

export default function ProposalDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <ProposalDetailPageContent />
    </Suspense>
  );
}

function ProposalDetailPageContent() {
  const params = useParams();
  const proposalId = Array.isArray(params.id) ? params.id[0] : params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  
  const isNew = proposalId === 'nova';
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    clientName: '',
    clientCpf: '',
    proposalDate: format(new Date(), 'yyyy-MM-dd'),
    proposalNumber: '',
    status: 'PENDENTE',
    cipSentDate: '',
    cipReturnDate: '',
    bank: searchParams.get('bank') || '',
    tabela: searchParams.get('tabela') || '',
    value: parseFloat(searchParams.get('valor') || '0'),
    troco: parseFloat(searchParams.get('troco') || '0'),
  });

  useEffect(() => {
    if (profile && !isNew) {
      fetchProposal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, proposalId]);

  const fetchProposal = async () => {
    setLoading(true);
    try {
      const proposals = await getProposals(profile);
      const proposal = proposals.find(p => p.id === proposalId);
      if (proposal) {
        let cipRetDate = proposal.cipReturnDate ? proposal.cipReturnDate.split('T')[0] : '';
        const cipSent = proposal.cipSentDate ? proposal.cipSentDate.split('T')[0] : '';

        setFormData({
          clientName: proposal.clientName || '',
          clientCpf: proposal.clientCpf || '',
          proposalDate: proposal.proposalDate || format(new Date(), 'yyyy-MM-dd'),
          proposalNumber: proposal.proposalNumber || '',
          status: proposal.status || 'PENDENTE',
          cipSentDate: cipSent,
          cipReturnDate: cipRetDate,
          bank: proposal.bank || '',
          tabela: proposal.tabela || '',
          value: proposal.value || 0,
          troco: proposal.troco || 0,
        });
      } else {
        router.push('/propostas');
      }
    } catch (error) {
      console.error('Error fetching proposal:', error);
    } finally {
      setLoading(false);
    }
  };

  const expectedReturnDate = useMemo(() => {
    if (formData.status !== 'ANDAMENTO') return null;
    
    if (formData.cipReturnDate) {
      const [y, m, d] = formData.cipReturnDate.split('-');
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    } else if (formData.cipSentDate) {
      const [y, m, d] = formData.cipSentDate.split('-');
      const sentD = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return addBusinessDays(sentD, 5);
    }
    
    return null;
  }, [formData.cipReturnDate, formData.cipSentDate, formData.status]);

  const remainingDays = useMemo(() => {
    if (!expectedReturnDate) return null;
    const today = startOfDay(new Date());
    const returnDate = startOfDay(expectedReturnDate);
    
    if (isAfter(today, returnDate)) return 0;
    
    let count = 0;
    let current = new Date(today);
    current.setDate(current.getDate() + 1); // start counting from tomorrow
    
    while (current <= returnDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 = Sunday, 6 = Saturday
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  }, [expectedReturnDate]);

  const handleSave = async () => {
    setError(null);
    if (!formData.clientName || !formData.clientCpf) {
      setError('Por favor, preencha o nome e CPF do cliente.');
      return;
    }
    if (!validateCpf(formData.clientCpf)) {
      setError('CPF inválido.');
      return;
    }

    setSaving(true);
    try {
      const proposalData = {
        ...formData,
        id: isNew ? undefined : proposalId,
        userId: profile.uid,
        promotoraId: profile.promotoraId || profile.uid,
        expectedReturnDate: expectedReturnDate ? expectedReturnDate.toISOString() : null,
      };
      
      await saveProposal(proposalData);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        router.push('/propostas');
      }, 2000);
    } catch (error) {
      console.error('Error saving proposal:', error);
      setError('Erro ao salvar proposta. Verifique sua conexão.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    setError(null);
    if (!formData.clientName || !formData.clientCpf) {
      setError('Por favor, preencha o nome e CPF do cliente para salvar como rascunho.');
      return;
    }
    
    setSaving(true);
    try {
      const proposalData = {
        ...formData,
        status: 'RASCUNHO',
        id: isNew ? undefined : proposalId,
        userId: profile.uid,
        promotoraId: profile.promotoraId || profile.uid,
        expectedReturnDate: expectedReturnDate ? expectedReturnDate.toISOString() : null,
      };
      
      await saveProposal(proposalData);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        router.push('/propostas');
      }, 2000);
    } catch (error) {
      console.error('Error saving draft:', error);
      setError('Erro ao salvar rascunho. Verifique sua conexão.');
    } finally {
      setSaving(false);
    }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProposal(proposalId as string);
      router.push('/propostas');
    } catch (error) {
      console.error('Error deleting proposal:', error);
      setError('Erro ao excluir proposta.');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getSoftBackgroundColor = (status: string) => {
    switch (status) {
      case 'PENDENTE': return 'bg-amber-50';
      case 'ANDAMENTO': return 'bg-blue-50';
      case 'PAGO': return 'bg-emerald-50';
      case 'REPROVADO': return 'bg-rose-50';
      default: return 'bg-slate-50';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${getSoftBackgroundColor(formData.status)} dark:bg-background flex flex-col md:flex-row`}>
      <Sidebar />
      
      <div className="flex-1 flex flex-col pb-20 md:pb-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => router.back()}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              >
                <ArrowLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div>
                <h1 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {isNew ? 'Nova Proposta' : 'Editar Proposta'}
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  {isNew ? 'Criando novo registro' : `Proposta #${formData.proposalNumber || '---'}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {formData.status === 'ANDAMENTO' && (
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-xl">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {remainingDays !== null ? `${remainingDays} dias restantes` : 'Calculando...'}
                  </span>
                </div>
              )}
              {!isNew && (
                <button 
                  onClick={handleDelete}
                  disabled={deleting}
                  className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                >
                  {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                </button>
              )}
              <button 
                onClick={handleSave}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3"
            >
              <CheckCircle className="w-5 h-5" />
              <span className="font-bold">Alterações salvas com sucesso!</span>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="p-4 max-w-3xl mx-auto w-full space-y-6">
          {/* Status Seals (Farol) */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" />
              Status da Proposta
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    const updates: any = { status: option.id };
                    if (option.id === 'ANDAMENTO' && !formData.cipSentDate) {
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      updates.cipSentDate = todayStr;
                      // cipReturnDate remains blank so it calculates automatically
                    }
                    setFormData({ ...formData, ...updates });
                  }}
                  className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border-2 ${
                    formData.status === option.id 
                      ? option.activeColor + ' border-transparent' 
                      : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Countdown Timer (Only if status is ANDAMENTO) */}
          <AnimatePresence>
            {formData.status === 'ANDAMENTO' && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Prazo de Retorno</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {expectedReturnDate 
                        ? `Previsão: ${format(expectedReturnDate, 'dd/MM/yyyy', { locale: ptBR })}`
                        : 'Informe a data de envio ao CIP'}
                    </p>
                  </div>
                </div>
                {remainingDays !== null && (
                  <div className="text-right">
                    {remainingDays === 0 ? (
                      <p className="text-xs font-black text-rose-600 dark:text-rose-400 animate-pulse">
                        Verificar retorno do saldo
                      </p>
                    ) : (
                      <>
                        <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
                          {remainingDays} {remainingDays === 1 ? 'Dia' : 'Dias'}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Restantes</p>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form Fields */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <User className="w-3.5 h-3.5" />
                  Nome do Cliente
                </label>
                <input 
                  type="text"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  placeholder="Nome completo"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5" />
                  CPF do Cliente
                </label>
                <input 
                  type="text"
                  value={formData.clientCpf}
                  onChange={(e) => setFormData({ ...formData, clientCpf: formatCpf(e.target.value) })}
                  placeholder="000.000.000-00"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" />
                  Número da Proposta
                </label>
                <input 
                  type="text"
                  value={formData.proposalNumber}
                  onChange={(e) => setFormData({ ...formData, proposalNumber: e.target.value })}
                  placeholder="Ex: 123456789"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Data da Proposta
                </label>
                <input 
                  type="date"
                  value={formData.proposalDate}
                  onChange={(e) => setFormData({ ...formData, proposalDate: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Data de Envio CIP
                </label>
                <input 
                  type="date"
                  value={formData.cipSentDate}
                  onChange={(e) => {
                    const newSentDate = e.target.value;
                    setFormData({ ...formData, cipSentDate: newSentDate });
                  }}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Data de Retorno CIP
                </label>
                <input 
                  type="date"
                  value={formData.cipReturnDate}
                  onChange={(e) => setFormData({ ...formData, cipReturnDate: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Dados da Operação</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Banco</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{formData.bank || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Tabela</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{formData.tabela || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Valor Contrato</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(formData.value)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Valor Troco</p>
                  <p className="text-sm font-bold text-primary">{formatCurrency(formData.troco)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 flex gap-3">
            <Info className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
              O prazo de 5 dias úteis para o retorno do saldo é contado a partir da data de envio ao CIP. 
              Certifique-se de atualizar o status para <span className="font-bold">ANDAMENTO</span> para ativar o cronômetro.
            </p>
          </div>
        </main>
      </div>

      <BottomNav activeTab="propostas" />
    </div>
  );
}
