'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowLeft, 
  ArrowRight,
  BarChart3, 
  Users, 
  User,
  TrendingUp, 
  Building2,
  Loader2,
  Calendar,
  PlusCircle,
  LogOut,
  XCircle,
  Clock,
  RefreshCcw,
  Filter,
  Search,
  Download,
  FileText
} from 'lucide-react';
import { QuotaAlert } from '@/components/QuotaAlert';
import { collection, query, onSnapshot, getDocs, orderBy, where, doc, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { PromotoraAvatar } from '@/components/PromotoraAvatar';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import BottomNav from '@/components/BottomNav';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import { DashboardSkeleton } from '@/components/DashboardSkeleton';

import { getBrandingSettings } from '@/lib/data-service';

const CACHE_KEY = 'dashboard_simulations_cache';
const CACHE_TIME = 15 * 60 * 1000; // 15 minutes

export default function Dashboard() {
  const { profile, user, isAuthReady, logout, isPending, setQuotaExceeded } = useAuth();
  const router = useRouter();
  const [simulations, setSimulations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [brandingLastUpdated, setBrandingLastUpdated] = useState<Date | null>(null);
  const [promotoraSettings, setPromotoraSettings] = useState<{ logoUrl: string, name: string } | null>(null);

  // Filters for Admin/Promotora
  const [userFilter, setUserFilter] = useState<string>('all');
  const [bankFilter, setBankFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'30d' | '7d' | 'today'>('30d');
  const [searchQuery, setSearchQuery] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthReady && !user) {
      router.push('/');
    }
  }, [isAuthReady, user, router]);

  useEffect(() => {
    if (!profile) return;

    const fetchSettings = async () => {
      const promotoraId = profile.role === 'admin' ? 'admin' : (profile.role === 'promotora' ? profile.uid : profile.createdBy);
      if (!promotoraId) return;

      try {
        const data = await getBrandingSettings(promotoraId);
        if (data) {
          setPromotoraSettings({ logoUrl: data.loginImageUrl || '', name: data.promoterName || profile.name });
          setBrandingLastUpdated(new Date());
        } else {
          setPromotoraSettings({ logoUrl: '', name: profile.name });
          setBrandingLastUpdated(new Date());
        }
      } catch (error: any) {
        console.error("Error fetching settings:", error);
        if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
          setQuotaExceeded(true);
        }
      }
    };

    fetchSettings();
  }, [profile, setQuotaExceeded]);

  const fetchSimulations = async (force = false) => {
    if (!profile) return;
    
    // Check cache
    if (!force) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp, userId } = JSON.parse(cached);
        if (userId === profile.uid && Date.now() - timestamp < CACHE_TIME) {
          setSimulations(data);
          setLastUpdated(new Date(timestamp));
          setLoading(false);
          return;
        }
      }
    }

    setRefreshing(true);
    let q;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startTimestamp = Timestamp.fromDate(thirtyDaysAgo);

    if (profile.role === 'admin') {
      q = query(
        collection(db, 'simulations'), 
        where('createdAt', '>=', startTimestamp),
        orderBy('createdAt', 'desc'),
        limit(500)
      );
    } else if (profile.role === 'promotora') {
      // For promotora, we fetch simulations where createdBy == profile.uid
      // This includes all simulations from users she created
      q = query(
        collection(db, 'simulations'), 
        where('createdBy', '==', profile.uid),
        where('createdAt', '>=', startTimestamp),
        orderBy('createdAt', 'desc'),
        limit(300)
      );
    } else {
      q = query(
        collection(db, 'simulations'), 
        where('userId', '==', profile.uid),
        where('createdAt', '>=', startTimestamp),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
    }

    try {
      const snapshot = await getDocs(q);
      let simsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
          timestamp: data.timestamp || (data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().getTime() : null)
        };
      });
      
      // If promotora, also fetch her own simulations if they weren't included (they won't be if createdBy is admin)
      if (profile.role === 'promotora') {
        const mySimsQuery = query(
          collection(db, 'simulations'),
          where('userId', '==', profile.uid),
          where('createdAt', '>=', startTimestamp),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const mySimsSnapshot = await getDocs(mySimsQuery);
        const mySimsData = mySimsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
            timestamp: data.timestamp || (data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().getTime() : null)
          };
        });
        
        // Merge and remove duplicates
        const merged = [...simsData, ...mySimsData];
        const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
        simsData = unique.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }
      
      setSimulations(simsData);
      const now = new Date();
      setLastUpdated(now);
      
      // Save to cache
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: simsData,
        timestamp: now.getTime(),
        userId: profile.uid
      }));

      setLoading(false);
      setRefreshing(false);
    } catch (error: any) {
      console.error("Error fetching simulations:", error);
      if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
        setQuotaExceeded(true);
      }
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    fetchSimulations();
  }, [profile]);

  // Filter simulations based on role and filters
  const filteredSimulations = useMemo(() => {
    if (!profile) return [];
    
    let filtered = simulations;

    // 1. Role-based filtering (already partially done by query, but good for safety)
    if (profile.role === 'corretor' || profile.role === 'vendedor') {
      filtered = filtered.filter(sim => sim.userId === profile.uid);
    } else if (profile.role === 'promotora') {
      // Promotora sees her own and her sellers' simulations
      filtered = filtered.filter(sim => sim.createdBy === profile.uid || sim.userId === profile.uid);
    }

    // 2. Admin/Promotora Filters
    if (profile.role === 'admin' || profile.role === 'promotora') {
      if (userFilter !== 'all') {
        filtered = filtered.filter(sim => sim.userId === userFilter);
      }
      if (bankFilter !== 'all') {
        filtered = filtered.filter(sim => sim.topOffer === bankFilter);
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(sim => 
          (sim.userName?.toLowerCase().includes(query)) || 
          (sim.topOffer?.toLowerCase().includes(query)) ||
          (sim.bancoAtual?.toLowerCase().includes(query))
        );
      }
      if (dateRange === '7d') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        filtered = filtered.filter(sim => new Date(sim.timestamp || sim.createdAt) >= sevenDaysAgo);
      } else if (dateRange === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filtered = filtered.filter(sim => new Date(sim.timestamp || sim.createdAt) >= today);
      }
    }

    return filtered;
  }, [simulations, profile, userFilter, bankFilter, dateRange, searchQuery]);

  // Get unique users and banks for filters
  const filterOptions = useMemo(() => {
    const usersMap = new Map();
    simulations.forEach(sim => {
      if (sim.userId && sim.userName) {
        usersMap.set(sim.userId, sim.userName);
      }
    });
    
    const users = Array.from(usersMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    const banks = Array.from(new Set(simulations.map(sim => sim.topOffer).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
      
    return { users, banks };
  }, [simulations]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalSimulations = filteredSimulations.length;
    
    // Most recommended bank
    const bankCounts: Record<string, number> = {};
    filteredSimulations.forEach(sim => {
      if (sim.topOffer) {
        bankCounts[sim.topOffer] = (bankCounts[sim.topOffer] || 0) + 1;
      }
    });
    const mostRecommendedBank = Object.entries(bankCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Nenhum';

    // Top users
    const userCounts: Record<string, { name: string, count: number, avatar: string | null }> = {};
    filteredSimulations.forEach(sim => {
      if (sim.userId && sim.userName) {
        if (!userCounts[sim.userId]) {
          userCounts[sim.userId] = { name: sim.userName, count: 0, avatar: sim.userAvatar || null };
        }
        userCounts[sim.userId].count += 1;
      }
    });
    const topUsers = Object.values(userCounts).sort((a, b) => b.count - a.count).slice(0, 5);

    // Daily chart data
    const dailyCounts: Record<string, number> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let simulationsToday = 0;

    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      dailyCounts[dateStr] = 0;
    }

    filteredSimulations.forEach(sim => {
      const timestamp = sim.timestamp || sim.createdAt;
      if (!timestamp) return;
      
      const d = new Date(timestamp);
      if (d >= today) {
        simulationsToday++;
      }
      
      const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (dailyCounts[dateStr] !== undefined) {
        dailyCounts[dateStr] += 1;
      }
    });

    const chartData = Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      Simulações: count
    }));

    return { totalSimulations, mostRecommendedBank, topUsers, chartData, simulationsToday };
  }, [filteredSimulations]);

  const generateDashboardReport = async () => {
    setGeneratingReport(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(22);
      doc.setTextColor(17, 82, 212);
      doc.text('Relatório do Dashboard', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 28, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text('Resumo', 14, 45);
      
      const summaryData = [
        ['Total de Simulações', stats.totalSimulations.toString()],
        ['Banco Mais Indicado', stats.mostRecommendedBank],
        ['Simulações Hoje', stats.simulationsToday.toString()]
      ];
      
      autoTable(doc, {
        startY: 50,
        head: [['Métrica', 'Valor']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [17, 82, 212], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 5 }
      });
      
      if (chartRef.current) {
        const canvas = await html2canvas(chartRef.current);
        const imgData = canvas.toDataURL('image/png');
        const imgProps = doc.getImageProperties(imgData);
        const pdfWidth = pageWidth - 28;
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        doc.text('Gráfico de Simulações', 14, (doc as any).lastAutoTable.finalY + 15);
        doc.addImage(imgData, 'PNG', 14, (doc as any).lastAutoTable.finalY + 20, pdfWidth, pdfHeight);
      }
      
      doc.save('relatorio_dashboard.pdf');
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const generateSimulationPDF = (sim: any) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(22);
      doc.setTextColor(17, 82, 212); // Primary color
      doc.text('Resultado da Simulação', pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 28, { align: 'center' });

      // Simulation Data Section
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text('Dados da Simulação', 14, 45);

      const formatCurrency = (value: number) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      };

      const simTableData = [
        ['Banco Atual', sim.bancoAtual || 'Não informado'],
        ['Valor da Parcela', formatCurrency(sim.valorParcela || 0)],
        ['Saldo Devedor', formatCurrency(sim.saldoDevedor || 0)],
        ['Parcelas Pagas', `${sim.parcelasPagas || 0} de ${sim.prazoTotal || 0}`],
        ['Idade', `${sim.idade || 0} anos`],
      ];

      autoTable(doc, {
        startY: 50,
        head: [['Campo', 'Valor']],
        body: simTableData,
        theme: 'striped',
        headStyles: { fillColor: [17, 82, 212] },
      });

      // Offer Data Section
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(16);
      doc.text('Melhor Oferta Selecionada', 14, finalY);

      const offerTableData = [
        ['Banco Destino', sim.topOffer || 'Não informado'],
        ['Tabela', sim.topOfferTabela || 'Não informado'],
        ['Valor do Contrato', formatCurrency(sim.topOfferContrato || 0)],
        ['Valor do Troco', formatCurrency(sim.topOfferTroco || 0)],
        ['Nova Taxa Port.', `${(sim.topOfferTaxa !== undefined && sim.topOfferTaxa > 1.85 ? 1.85 : (sim.topOfferTaxa || 0)).toFixed(2)}%`],
      ];

      autoTable(doc, {
        startY: finalY + 5,
        head: [['Campo', 'Valor']],
        body: offerTableData,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] }, // Emerald 500
      });

      // Footer
      const lastY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184); // Slate 400
      doc.text('Esta simulação é apenas informativa e não garante a aprovação do crédito.', pageWidth / 2, lastY, { align: 'center' });
      doc.text('Sujeito a análise cadastral e de crédito pelo banco emissor.', pageWidth / 2, lastY + 5, { align: 'center' });

      doc.save(`simulacao_${(sim.userName || 'usuario').toLowerCase().replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating simulation PDF:', error);
      alert('Erro ao gerar PDF da simulação.');
    }
  };

  if (isPending) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 shadow-2xl items-center justify-center p-8 text-center">
        <div className="bg-amber-500/10 p-6 rounded-full mb-6">
          <Clock className="w-12 h-12 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Acesso Pendente</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          Sua conta foi criada, mas ainda não foi liberada pelo administrador. 
          Por favor, entre em contato com o suporte ou aguarde a liberação.
        </p>
        <button 
          onClick={logout}
          className="w-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          Sair
        </button>
      </div>
    );
  }

  if (loading || !profile) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 shadow-2xl pb-24">
      {/* Header */}
      <header className="p-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
          <PromotoraAvatar 
            logoUrl={profile.avatarUrl || profile.photoUrl || promotoraSettings?.logoUrl} 
            name={profile.name} 
            className="size-10 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Olá, {profile.role}</p>
            <h1 className="text-lg font-bold leading-tight break-words">{profile.name || 'Usuário'}</h1>
          </div>
        </div>
        <button 
          onClick={logout}
          className="size-10 shrink-0 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all flex items-center justify-center"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-6">
        
        <QuotaAlert />

        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Visão Geral</h2>
            {lastUpdated && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  Simulações: {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {brandingLastUpdated && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Building2 className="w-2.5 h-2.5" />
                    Branding: {brandingLastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}
          </div>
          <button 
            onClick={() => fetchSimulations(true)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary transition-all disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Nova Simulação Button */}
        <Link 
          href="/simulacao/nova"
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/30"
        >
          <PlusCircle className="w-5 h-5" />
          Nova Simulação
        </Link>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <BarChart3 className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Total</span>
            </div>
            <p className="text-3xl font-black text-primary">{stats.totalSimulations}</p>
            <p className="text-[10px] text-slate-400">Simulações {dateRange === '30d' ? 'no mês' : dateRange === '7d' ? 'na semana' : 'hoje'}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Building2 className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Top Banco</span>
            </div>
            <p className="text-lg font-black text-slate-900 dark:text-white leading-tight line-clamp-2">{stats.mostRecommendedBank}</p>
            <p className="text-[10px] text-slate-400 mt-auto">Mais indicado</p>
          </div>
        </div>

        {/* Daily Summary (Only for Admin) */}
        {profile?.role === 'admin' && dateRange !== 'today' && (
          <div className="bg-primary/5 dark:bg-primary/10 p-4 rounded-2xl border border-primary/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary text-white flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Resumo de Hoje</p>
                <p className="text-lg font-black text-primary">{stats.simulationsToday} Simulações</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</p>
              <p className="text-xs font-bold text-emerald-500">Ativo</p>
            </div>
          </div>
        )}

        {/* Filters (Only for Admin/Promotora) */}
        {(profile?.role === 'admin' || profile?.role === 'promotora') && (
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Filter className="w-5 h-5 text-primary" />
              <h2 className="font-bold">Filtros Avançados</h2>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Buscar por usuário ou banco..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Date Filter */}
                <select 
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as any)}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs outline-none"
                >
                  <option value="30d">Últimos 30 dias</option>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="today">Hoje</option>
                </select>

                {/* Bank Filter */}
                <select 
                  value={bankFilter}
                  onChange={(e) => setBankFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs outline-none"
                >
                  <option value="all">Todos os Bancos</option>
                  {filterOptions.banks.map(bank => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>

              {/* User Filter (Only for Admin) */}
              {profile.role === 'admin' && (
                <select 
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs outline-none"
                >
                  <option value="all">Todos os Usuários</option>
                  {filterOptions.users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="font-bold">Simulações (Últimos 7 dias)</h2>
            </div>
            {(profile?.role === 'admin' || profile?.role === 'promotora') && (
              <button 
                onClick={generateDashboardReport}
                disabled={generatingReport}
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                {generatingReport ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                Gerar Relatório
              </button>
            )}
          </div>
          <div className="h-48 w-full" ref={chartRef}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }} 
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="Simulações" 
                  stroke="#1152d4" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#1152d4', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 6, fill: '#1152d4', strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Users (Only for Admin/Promotora) */}
        {(profile?.role === 'admin' || profile?.role === 'promotora') && (
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-slate-900 dark:text-white">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="font-bold">
                {profile.role === 'admin' ? 'Top Usuários' : 'Top Vendedores'}
              </h2>
            </div>
            
            {stats.topUsers.length > 0 ? (
              <div className="flex flex-col gap-3">
                {stats.topUsers.map((user, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs relative overflow-hidden">
                        {user.avatar ? (
                          <Image 
                            src={user.avatar} 
                            alt={user.name} 
                            fill 
                            className="object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <span className="font-semibold text-sm">{user.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <span className="font-black text-slate-900 dark:text-white">{user.count}</span>
                      <span className="text-[10px] uppercase font-bold">sim.</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">Nenhuma simulação registrada ainda.</p>
            )}
          </div>
        )}

        {/* Simulations List */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Simulações Recentes</h2>
            <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-900 rounded-lg text-slate-500">
              {filteredSimulations.length} total
            </span>
          </div>
          
          <div className="flex flex-col gap-3">
            {filteredSimulations.length > 0 ? (
              filteredSimulations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((sim) => (
                <Link 
                  key={sim.id} 
                  href="/simulacao/recomendacoes"
                  onClick={() => sessionStorage.setItem('simulationData', JSON.stringify(sim))}
                  className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col gap-2 hover:border-primary/30 transition-all group"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden relative border border-primary/10">
                        {sim.userAvatar ? (
                          <Image 
                            src={sim.userAvatar} 
                            alt={sim.userName} 
                            fill 
                            className="object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-primary transition-colors">{sim.userName || 'Usuário'}</p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(sim.timestamp || sim.createdAt).toLocaleDateString('pt-BR')} às {new Date(sim.timestamp || sim.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase">
                        {sim.convenio || 'INSS'}
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            generateSimulationPDF(sim);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-primary transition-all"
                          title="Baixar PDF"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-primary transition-all" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                    <div className="size-6 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700">
                      <Building2 className="w-3 h-3 text-slate-400" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                      {sim.topOffer || 'Nenhum banco selecionado'}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-slate-500">Nenhuma simulação encontrada.</p>
              </div>
            )}
          </div>
          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="text-xs font-bold text-primary disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">Página {currentPage}</span>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredSimulations.length / itemsPerPage)))}
              disabled={currentPage === Math.ceil(filteredSimulations.length / itemsPerPage)}
              className="text-xs font-bold text-primary disabled:opacity-50"
            >
              Próximo
            </button>
          </div>
        </div>

      </main>

      <BottomNav activeTab="inicio" />
    </div>
  );
}
