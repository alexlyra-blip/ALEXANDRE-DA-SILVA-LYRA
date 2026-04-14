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
  Landmark,
  Download
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import { getProposals, deleteProposal } from '@/lib/data-service';
import Link from 'next/link';
import { format, startOfDay, isAfter, addBusinessDays, subDays, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function PropostasPage() {
  const { profile, loading: authLoading } = useAuth();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | '15days' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [proposalToDelete, setProposalToDelete] = useState<any | null>(null);

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

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteProposal(id);
      setProposals(proposals.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting proposal:', error);
    } finally {
      setDeletingId(null);
      setProposalToDelete(null);
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

  const filteredProposals = useMemo(() => {
    return proposals.filter(p => {
      // Text Search
      const matchesSearch = (p.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.clientCpf?.includes(searchTerm) ||
        p.proposalNumber?.includes(searchTerm));
      
      // Status Filter
      const matchesStatus = !statusFilter || p.status === statusFilter;

      // Date Filter
      let matchesDate = true;
      if (dateFilter !== 'all') {
        const proposalDate = p.proposalDate ? startOfDay(parseISO(p.proposalDate)) : null;
        if (!proposalDate) {
          matchesDate = false;
        } else {
          const today = startOfDay(new Date());
          if (dateFilter === 'today') {
            matchesDate = proposalDate.getTime() === today.getTime();
          } else if (dateFilter === 'week') {
            const weekAgo = subDays(today, 7);
            matchesDate = isWithinInterval(proposalDate, { start: weekAgo, end: today });
          } else if (dateFilter === '15days') {
            const fifteenDaysAgo = subDays(today, 15);
            matchesDate = isWithinInterval(proposalDate, { start: fifteenDaysAgo, end: today });
          } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
            const start = startOfDay(parseISO(customStartDate));
            const end = startOfDay(parseISO(customEndDate));
            matchesDate = isWithinInterval(proposalDate, { start, end });
          }
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [proposals, searchTerm, statusFilter, dateFilter, customStartDate, customEndDate]);

  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(18);
    doc.setTextColor(17, 82, 212);
    doc.text('Relatório de Propostas', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 22, { align: 'center' });

    const tableData = filteredProposals.map(p => [
      p.proposalDate ? format(parseISO(p.proposalDate), 'dd/MM/yyyy') : '---',
      p.clientName || '---',
      p.clientCpf || '---',
      p.bank || '---',
      p.tabela || '---',
      formatCurrency(p.parcela || 0),
      formatCurrency(p.saldoDevedor || 0),
      formatCurrency(p.value || 0),
      formatCurrency(p.troco || 0),
      p.status || '---'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Data', 'Cliente', 'CPF', 'Banco', 'Tabela', 'Parcela', 'Saldo Dev.', 'Contrato', 'Troco', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [17, 82, 212], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save('propostas_exportadas.pdf');
  };

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
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex gap-2 overflow-x-auto pb-2 w-full sm:w-auto">
              <button
                onClick={() => setStatusFilter(null)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-primary text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            
            <button
              onClick={exportToPDF}
              className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-secondary/20 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>

          {/* Date Filters */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Período:</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary"
            >
              <option value="all">Todo o período</option>
              <option value="today">Hoje</option>
              <option value="week">Últimos 7 dias</option>
              <option value="15days">Últimos 15 dias</option>
              <option value="custom">Personalizado</option>
            </select>

            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary"
                />
                <span className="text-slate-400">até</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary"
                />
              </div>
            )}
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
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
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
                            <span>Contrato: <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(proposal.value)}</span></span>
                          </div>
                          {parseFloat(proposal.parcela) > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-medium">Parcela:</span>
                              <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(parseFloat(proposal.parcela))}</span>
                            </div>
                          )}
                          {parseFloat(proposal.saldoDevedor) > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-medium">Saldo Dev.:</span>
                              <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(parseFloat(proposal.saldoDevedor))}</span>
                            </div>
                          )}
                          {parseFloat(proposal.troco) > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-medium">Troco:</span>
                              <span className="font-bold text-primary">{formatCurrency(parseFloat(proposal.troco))}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setProposalToDelete(proposal); }}
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

        {proposalToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Confirmar Exclusão</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Tem certeza que deseja excluir esta proposta?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setProposalToDelete(null)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDelete(proposalToDelete.id)}
                  className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomNav activeTab="propostas" />
    </div>
  );
}
