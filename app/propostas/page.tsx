'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardList, 
  Search, 
  Plus, 
  Clock, 
  Loader2, 
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Banknote,
  Trash2,
  Landmark
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import { getProposals, deleteProposal } from '@/lib/data-service';
import Link from 'next/link';
import { format, startOfDay, isAfter, addBusinessDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function PropostasPage() {
  const { profile, loading: authLoading } = useAuth();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      fetchProposals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      const data = await getProposals(profile);
      setProposals(data);
    } catch (error) {
      console.error('Error fetching proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateRemainingDays = (expectedReturnDate: string | null | undefined, cipSentDate: string | null | undefined) => {
    if (!expectedReturnDate && !cipSentDate) return null;
    
    let returnDateObj;
    if (expectedReturnDate) {
      returnDateObj = startOfDay(new Date(expectedReturnDate));
    } else if (cipSentDate) {
      const [y, m, d] = cipSentDate.split('T')[0].split('-');
      const sentD = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      returnDateObj = startOfDay(addBusinessDays(sentD, 5));
    } else {
      return null;
    }

    const today = startOfDay(new Date());
    if (isAfter(today, returnDateObj)) return 0;
    
    let count = 0;
    let current = new Date(today);
    current.setDate(current.getDate() + 1); // start counting from tomorrow
    
    while (current <= returnDateObj) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 = Sunday, 6 = Saturday
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Tem certeza que deseja excluir esta proposta?')) return;
    
    setDeletingId(id);
    try {
      await deleteProposal(id);
      setProposals(proposals.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting proposal:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const stats = useMemo(() => {
    const total = proposals.length;
    const pending = proposals.filter(p => p.status === 'PENDENTE').length;
    const inProgress = proposals.filter(p => p.status === 'ANDAMENTO').length;
    const paid = proposals.filter(p => p.status === 'PAGO').length;
    const rejected = proposals.filter(p => p.status === 'REPROVADO').length;
    
    // Proposals returning today
    const today = startOfDay(new Date());
    const returningToday = proposals.filter(p => {
      if (p.status !== 'ANDAMENTO' || !p.expectedReturnDate) return false;
      const returnDate = startOfDay(new Date(p.expectedReturnDate));
      return returnDate.getTime() === today.getTime();
    }).length;

    return { total, pending, inProgress, paid, rejected, returningToday };
  }, [proposals]);

  const filteredProposals = proposals.filter(p => 
    (p.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     p.clientCpf?.includes(searchTerm) ||
     p.proposalNumber?.includes(searchTerm)) &&
    (!statusFilter || p.status === statusFilter)
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDENTE': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'ANDAMENTO': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'PAGO': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'REPROVADO': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      <Sidebar />
      
      <div className="flex-1 flex flex-col pb-20 md:pb-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-primary" />
                Propostas
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Acompanhe o status das suas propostas</p>
            </div>
            
            <Link 
              href="/propostas/nova"
              className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" />
              Nova Proposta
            </Link>
          </div>
        </header>

        <main className="p-4 max-w-7xl mx-auto w-full space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">Pendentes</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.pending}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">Andamento</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.inProgress}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Pago</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.paid}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">Reprovados</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.rejected}</p>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setStatusFilter(null)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                statusFilter === null 
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' 
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
              }`}
            >
              TODAS
            </button>
            {['PENDENTE', 'ANDAMENTO', 'PAGO', 'REPROVADO'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status === statusFilter ? null : status)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === status
                    ? 'bg-primary text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Highlight Window: Saldos do Dia */}
          <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Saldos do Dia</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Propostas com retorno previsto para hoje</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-primary">{stats.returningToday}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Retornos</p>
            </div>
          </div>

          {/* Search and List */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="text"
                placeholder="Buscar por nome, CPF ou número da proposta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              {filteredProposals.length > 0 ? (
                filteredProposals.map((proposal) => (
                  <Link 
                    key={proposal.id}
                    href={`/propostas/${proposal.id}`}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-primary/50 transition-all group shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getStatusColor(proposal.status)}`}>
                            {proposal.status}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            #{proposal.proposalNumber || '---'}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-white truncate">{proposal.clientName}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>CPF: {proposal.clientCpf}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <Landmark className="w-3.5 h-3.5" />
                            <span>{proposal.bank}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <Banknote className="w-3.5 h-3.5" />
                            <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(proposal.value)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={(e) => handleDelete(proposal.id, e)}
                            disabled={deletingId === proposal.id}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                          >
                            {deletingId === proposal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                          <div className="p-2 text-slate-400 group-hover:text-primary transition-all">
                            <ChevronRight className="w-5 h-5" />
                          </div>
                        </div>
                        
                        {proposal.status === 'ANDAMENTO' && (proposal.expectedReturnDate || proposal.cipSentDate) && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2 py-1 rounded-lg">
                            <Clock className="w-3 h-3" />
                            <span>
                              {calculateRemainingDays(proposal.expectedReturnDate, proposal.cipSentDate) === 0 
                                ? 'Retorno Hoje' 
                                : `Faltam ${calculateRemainingDays(proposal.expectedReturnDate, proposal.cipSentDate)} dias`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                  <ClipboardList className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhuma proposta encontrada</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <BottomNav activeTab="propostas" />
    </div>
  );
}
