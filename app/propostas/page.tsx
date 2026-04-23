'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardList, 
  Search, 
  Plus, 
  Clock, 
  Calendar,
  Loader2, 
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Banknote,
  Trash2,
  Landmark,
  Download,
  CheckCircle
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
  const [bankFilter, setBankFilter] = useState<string>('all');
  const [corretorFilter, setCorretorFilter] = useState<string>('all');
  const [loanTypeFilter, setLoanTypeFilter] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [proposalToDelete, setProposalToDelete] = useState<any | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

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

  const filterOptions = useMemo(() => {
    const banks = Array.from(new Set(proposals.map(p => p.bank).filter(Boolean))).sort();
    const corretors = Array.from(new Set(proposals.map(p => p.corretor).filter(Boolean))).sort();
    const loanTypes = Array.from(new Set(proposals.map(p => p.loanType).filter(Boolean))).sort();
    return { banks, corretors, loanTypes };
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    const filtered = proposals.filter(p => {
      // Text Search
      const matchesSearch = (p.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.clientCpf?.includes(searchTerm) ||
        p.proposalNumber?.includes(searchTerm));
      
      // Status Filter
      const matchesStatus = !statusFilter || p.status === statusFilter;

      // Bank Filter
      const matchesBank = bankFilter === 'all' || p.bank === bankFilter;

      // Corretor Filter
      const matchesCorretor = corretorFilter === 'all' || p.corretor === corretorFilter;

      // Loan Type Filter
      const matchesLoanType = loanTypeFilter === 'all' || p.loanType === loanTypeFilter;

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

      return matchesSearch && matchesStatus && matchesBank && matchesCorretor && matchesLoanType && matchesDate;
    });

    // Sort by status group, then by date within status
    return filtered.sort((a, b) => {
      const statusOrder: Record<string, number> = {
        'RASCUNHO': 0,
        'ANDAMENTO': 1,
        'PENDENTE': 2,
        'PAGO': 3,
        'REPROVADO': 4
      };

      const statusA = (a.status || '').toUpperCase() as string;
      const statusB = (b.status || '').toUpperCase() as string;

      const orderA = statusOrder[statusA] || 5;
      const orderB = statusOrder[statusB] || 5;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Within same status, sort by date (newest first)
      const dateA = a.proposalDate ? new Date(a.proposalDate).getTime() : 0;
      const dateB = b.proposalDate ? new Date(b.proposalDate).getTime() : 0;
      
      return dateB - dateA;
    });
  }, [proposals, searchTerm, statusFilter, dateFilter, customStartDate, customEndDate, bankFilter, corretorFilter, loanTypeFilter]);

  const totalPages = Math.ceil(filteredProposals.length / itemsPerPage);
  const paginatedProposals = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProposals.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProposals, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateFilter, bankFilter, corretorFilter, loanTypeFilter]);

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

  const getSoftBgColor = (status: string) => {
    switch (status) {
      case 'PENDENTE': return 'bg-amber-50 dark:bg-amber-950/10';
      case 'ANDAMENTO': return 'bg-blue-50 dark:bg-blue-950/10';
      case 'PAGO': return 'bg-emerald-50 dark:bg-emerald-950/10';
      case 'REPROVADO': return 'bg-rose-50 dark:bg-rose-950/10';
      default: return 'bg-white dark:bg-slate-900';
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
      
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sticky top-0 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
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
          {/* Stats Grid - Only show on first page */}
          {currentPage === 1 && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total</p>
                  <p className="text-2xl font-black text-slate-900">{stats.total}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">Pendentes</p>
                  <p className="text-2xl font-black text-slate-900">{stats.pending}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">Andamento</p>
                  <p className="text-2xl font-black text-slate-900">{stats.inProgress}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Pago</p>
                  <p className="text-2xl font-black text-slate-900">{stats.paid}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                  <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">Reprovados</p>
                  <p className="text-2xl font-black text-slate-900">{stats.rejected}</p>
                </div>
              </div>

              {/* Quick Filters */}
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex gap-2 overflow-x-auto pb-2 w-full sm:w-auto scrollbar-hide">
                  <button
                    onClick={() => setStatusFilter(null)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      statusFilter === null 
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' 
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-primary'
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
                          ? 'bg-primary text-white shadow-lg shadow-primary/20'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-primary'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportToPDF}
                    className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-secondary/20 whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    Exportar PDF
                  </button>
                  <Link
                    href="/propostas/dashboard"
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/20 whitespace-nowrap"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Dashboard
                  </Link>
                </div>
              </div>

              {/* Date and Advanced Filters */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Período:</span>
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value as any)}
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-primary"
                    >
                      <option value="all">Todo o período</option>
                      <option value="today">Hoje</option>
                      <option value="week">Últimos 7 dias</option>
                      <option value="15days">Últimos 15 dias</option>
                      <option value="custom">Personalizado</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Banco:</span>
                    <select
                      value={bankFilter}
                      onChange={(e) => setBankFilter(e.target.value)}
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-primary"
                    >
                      <option value="all">Todos os Bancos</option>
                      {filterOptions.banks.map(bank => (
                        <option key={bank} value={bank}>{bank}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Corretor:</span>
                    <select
                      value={corretorFilter}
                      onChange={(e) => setCorretorFilter(e.target.value)}
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-primary"
                    >
                      <option value="all">Todos os Corretores</option>
                      {filterOptions.corretors.map(corretor => (
                        <option key={corretor} value={corretor}>{corretor}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo:</span>
                    <select
                      value={loanTypeFilter}
                      onChange={(e) => setLoanTypeFilter(e.target.value)}
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-primary"
                    >
                      <option value="all">Todos os Tipos</option>
                      {filterOptions.loanTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {dateFilter === 'custom' && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-300">
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary"
                    />
                    <span className="text-slate-400 text-xs font-bold">até</span>
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
              <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between transition-all hover:bg-primary/10 cursor-default">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Saldos do Dia</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Propostas com retorno previsto para hoje</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-primary">{stats.returningToday}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Retornos</p>
                </div>
              </div>
            </>
          )}

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
              {paginatedProposals.length > 0 ? (
                paginatedProposals.map((proposal) => (
                  <Link 
                    key={proposal.id}
                    href={`/propostas/${proposal.id}`}
                    className={`${getSoftBgColor(proposal.status)} border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-primary/50 transition-all group shadow-sm`}
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
                          {proposal.loanType && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              {proposal.loanType}
                            </span>
                          )}
                          {proposal.corretor && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-primary/10 text-primary border border-primary/20">
                              Corretor/Vendedor: {proposal.corretor} {proposal.corretorId ? `(${proposal.corretorId})` : ''}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-900 truncate">{proposal.clientName}</h3>
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
                            <span>Contrato: <span className="font-bold text-slate-900">{formatCurrency(proposal.value)}</span></span>
                          </div>
                          {parseFloat(proposal.parcela) > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-medium">Parcela:</span>
                              <span className="font-bold text-slate-900">{formatCurrency(parseFloat(proposal.parcela))}</span>
                            </div>
                          )}
                          {parseFloat(proposal.saldoDevedor) > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-medium">Saldo Dev.:</span>
                              <span className="font-bold text-slate-900">{formatCurrency(parseFloat(proposal.saldoDevedor))}</span>
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
                        
                        {proposal.status === 'ANDAMENTO' && proposal.loanType === 'PORTABILIDADE' && (proposal.expectedReturnDate || proposal.cipSentDate) && (
                          proposal.portabilityStatus ? (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">
                              <CheckCircle className="w-3 h-3" />
                              <span>{proposal.portabilityStatus}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2 py-1 rounded-lg">
                              <Clock className="w-3 h-3" />
                              <span>
                                {calculateRemainingDays(proposal.expectedReturnDate, proposal.cipSentDate) === 0 
                                  ? 'Retorno Hoje' 
                                  : `Faltam ${calculateRemainingDays(proposal.expectedReturnDate, proposal.cipSentDate)} dias`}
                              </span>
                            </div>
                          )
                        )}

                        {proposal.status === 'PAGO' && proposal.paymentDate && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">
                            <Calendar className="w-3 h-3" />
                            <span>
                              Pago em: {format(parseISO(proposal.paymentDate), 'dd/MM/yyyy')}
                            </span>
                          </div>
                        )}

                        {proposal.status === 'REPROVADO' && proposal.rejectionDate && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-1 rounded-lg">
                            <Calendar className="w-3 h-3" />
                            <span>
                              Reprovado em: {format(parseISO(proposal.rejectionDate), 'dd/MM/yyyy')}
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 pb-10 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-col">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Página {currentPage} de {totalPages}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium italic">
                    Exibindo {paginatedProposals.length} de {filteredProposals.length} propostas
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCurrentPage(prev => Math.max(prev - 1, 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentPage === 1}
                    className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:border-primary transition-all shadow-sm"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                  </button>
                  <div className="flex items-center gap-1">
                    {[...Array(totalPages)].map((_, i) => {
                      const pageNum = i + 1;
                      if (
                        pageNum === 1 || 
                        pageNum === totalPages || 
                        (pageNum >= currentPage - 2 && pageNum <= currentPage + 2)
                      ) {
                        return (
                          <button
                            key={pageNum}
                            onClick={() => {
                              setCurrentPage(pageNum);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className={`w-9 h-9 rounded-xl text-xs font-black transition-all ${
                              currentPage === pageNum 
                                ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110' 
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-primary hover:text-primary'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      }
                      if (pageNum === currentPage - 3 || pageNum === currentPage + 3) {
                        return <span key={pageNum} className="text-slate-400 px-1">...</span>;
                      }
                      return null;
                    })}
                  </div>
                  <button
                    onClick={() => {
                      setCurrentPage(prev => Math.min(prev + 1, totalPages));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentPage === totalPages}
                    className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:border-primary transition-all shadow-sm"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {proposalToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Confirmar Exclusão</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                Tem certeza que deseja excluir esta proposta? Esta ação é irreversível e removerá todos os dados do banco de dados.
              </p>
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
