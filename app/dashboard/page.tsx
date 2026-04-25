'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight,
  BarChart3, 
  Users, 
  TrendingUp, 
  Building2,
  Loader2,
  LogOut,
  Clock,
  Download,
  FileText,
  PieChart as PieChartIcon,
  Save
} from 'lucide-react';
import { motion } from 'motion/react';
import { QuotaAlert } from '@/components/QuotaAlert';
import { collection, query, onSnapshot, where, limit, Timestamp, doc, updateDoc } from 'firebase/firestore';                
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
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import BottomNav from '@/components/BottomNav';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { getBrandingSettings } from '@/lib/data-service';
import { useToast } from '@/contexts/ToastContext';

export default function Dashboard() {
  const { profile, user, isAuthReady, logout, isPending, setQuotaExceeded } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [simulations, setSimulations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotoraSettings, setPromotoraSettings] = useState<{ logoUrl: string, name: string } | null>(null);

  const getDaysRemaining = (profile: any) => {
    const baseDate = profile.trialResetAt || profile.createdAt;
    if (!baseDate) return 30;
    const createdDate = baseDate.toDate ? baseDate.toDate() : new Date(baseDate);
    const now = new Date();
    const diffTime = now.getTime() - createdDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const remaining = 30 - diffDays;
    return remaining > 0 ? remaining : 0;
  };

  // Filters for Admin/Promotora
  const [userFilter] = useState<string>('all');
  const [bankFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'30d' | '15d' | '7d' | 'today'>('30d');
  const [searchQuery] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthReady && !user) {
      router.push('/');
    }
  }, [isAuthReady, user, router]);

  useEffect(() => {
    if (!profile) return;

    let brandingId = profile.uid;
    if (profile.role === 'admin') {
      brandingId = 'admin';
    }

    const settingsRef = doc(db, 'settings', brandingId);
    const unsubscribe = onSnapshot(settingsRef, async (snapshot) => {
      let data: any = null;
      
      if (snapshot.exists()) {
        data = snapshot.data();
      } else if (brandingId !== 'admin') {
        try {
          let fallbackData = null;
          
          if (profile.role === 'vendedor' || profile.role === 'corretor') {
            const creatorId = profile.promotoraId || profile.createdBy;
            if (creatorId && creatorId !== 'admin') {
              fallbackData = await getBrandingSettings(creatorId);
            }
          }
          
          if (!fallbackData) {
            fallbackData = await getBrandingSettings('admin');
          }
          
          if (fallbackData) data = fallbackData;
        } catch (e) {
          console.error("Failed to fetch fallback settings:", e);
        }
      }

      if (data) {
        setPromotoraSettings({ logoUrl: data.loginImageUrl || '', name: data.promoterName || profile.name });
      } else {
        setPromotoraSettings({ logoUrl: '', name: profile.name });
      }
    }, (error) => {
      console.error("Error fetching settings:", error);
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    const startDateObj = new Date();
    if (dateRange === 'today') {
      startDateObj.setHours(0, 0, 0, 0);
    } else if (dateRange === '7d') {
      startDateObj.setDate(startDateObj.getDate() - 7);
    } else if (dateRange === '15d') {
      startDateObj.setDate(startDateObj.getDate() - 15);
    } else {
      startDateObj.setDate(startDateObj.getDate() - 30);
    }
    const startTimestamp = Timestamp.fromDate(startDateObj);

    let unsubscribeFn: () => void = () => {};
    let isFallback = false;

    const setupQuery = (useOrderBy: boolean) => {
      let q;
      // Removed orderBy temporarily to avoid index issues
      if (profile.role === 'admin') {
        q = query(collection(db, 'simulations'), limit(500));
      } else if (profile.role === 'promotora') {
        q = query(collection(db, 'simulations'), where('promotoraId', '==', profile.uid), limit(500));
      } else {
        q = query(collection(db, 'simulations'), where('userId', '==', profile.uid), limit(500));
      }

      const listener = onSnapshot(q, (snapshot) => {
        const simsData = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
            timestamp: data.timestamp || (data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().getTime() : 0)
          };
        });
        // Sort descending so the most recent is first
        simsData.sort((a, b) => b.timestamp - a.timestamp);
        
        setSimulations(simsData);
        setLoading(false);
      }, (error) => {
        console.error("Error fetching simulations:", error);
        setLoading(false);
      });
      return listener;
    };

    unsubscribeFn = setupQuery(false);
    return () => { if (unsubscribeFn) unsubscribeFn(); };
  }, [profile, dateRange, setQuotaExceeded]);

  // Filter simulations based on role and filters
  const filteredSimulations = useMemo(() => {
    if (!profile) return [];
    
    let filtered = simulations;

    // 1. Role-based filtering (already partially done by query, but good for safety)
    if (profile.role === 'corretor' || profile.role === 'vendedor') {
      filtered = filtered.filter(sim => sim.userId === profile.uid || sim.corretorId === profile.uid);
    } else if (profile.role === 'promotora') {
      // Promotora sees her own and her sellers' simulations
      filtered = filtered.filter(sim => sim.promotoraId === profile.uid || sim.createdBy === profile.uid || sim.userId === profile.uid);
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
    const topUsers = Object.values(userCounts).sort((a, b) => b.count - a.count).slice(0, 10);

    // Convênio colors mapping
    const CONVENIO_COLORS: Record<string, string> = {
      'INSS': '#1152d4',
      'SIAPE': '#f59e0b',
      'GOVERNO': '#FF0000',
      'FORÇAS ARMADAS': '#47953D',
      'CLT PRIVADO': '#7c3aed'
    };

    // Daily chart data (Volume and Value)
    const dailyData: Record<string, any> = {};
    const convenioCounts: Record<string, number> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let simulationsToday = 0;

    // Detect all convenios in filtered simulations to ensure they are represented in charts
    const activeConvenios = new Set<string>(['INSS', 'SIAPE', 'GOVERNO', 'FORÇAS ARMADAS', 'CLT PRIVADO']);
    filteredSimulations.forEach(sim => {
      if (sim.convenio) activeConvenios.add(sim.convenio.toUpperCase());
    });
    const sortedConvenios = Array.from(activeConvenios).sort();

    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      
      const dayData: any = { date: dateStr };
      sortedConvenios.forEach(c => {
        dayData[c] = 0;
        dayData[`${c}_val`] = 0;
      });
      dailyData[dateStr] = dayData;
    }

    filteredSimulations.forEach(sim => {
      const timestamp = sim.timestamp || sim.createdAt;
      if (!timestamp) return;
      
      const d = new Date(timestamp);
      if (d >= today) {
        simulationsToday++;
      }
      
      const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const conv = (sim.convenio || 'INSS').toUpperCase();
      
      // Update Donut Chart data
      convenioCounts[conv] = (convenioCounts[conv] || 0) + 1;

      if (dailyData[dateStr] !== undefined) {
        const convVal = Number(sim.topOfferContrato || sim.top_offer_contrato || 0);
        if (dailyData[dateStr][conv] !== undefined) {
          dailyData[dateStr][conv] += 1;
          dailyData[dateStr][`${conv}_val`] += convVal;
        } else {
          // If a new convenio appears that wasn't in sortedConvenios (shouldn't happen with our detection)
          dailyData[dateStr][conv] = 1;
          dailyData[dateStr][`${conv}_val`] = convVal;
        }
      }
    });

    const chartData = Object.values(dailyData);
    
    const donutData = Object.entries(convenioCounts).map(([name, value]) => ({
      name,
      value,
      color: CONVENIO_COLORS[name] || '#94a3b8'
    }));

    return { 
      totalSimulations, 
      mostRecommendedBank, 
      topUsers, 
      chartData, 
      donutData,
      simulationsToday,
      sortedConvenios,
      CONVENIO_COLORS
    };
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
      showToast('Erro ao gerar relatório. Tente novamente.', 'error');
    } finally {
      setGeneratingReport(false);
    }
  };

  const loadSimulation = (sim: any) => {
    // Save to session storage and redirect to recommendations page to view details
    sessionStorage.setItem('simulationData', JSON.stringify(sim));
    router.push('/simulacao/recomendacoes');
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
      showToast('Erro ao gerar PDF da simulação.', 'error');
    }
  };

  const handleSaveProposal = (sim: any) => {
    const namePart = sim.nomeCliente ? `&nome=${encodeURIComponent(sim.nomeCliente)}` : '';
    const cpfPart = sim.cpfCliente ? `&cpf=${encodeURIComponent(sim.cpfCliente)}` : '';
    const bankPart = sim.topOffer ? `&bank=${encodeURIComponent(sim.topOffer)}` : '';
    const tablePart = sim.topOfferTabela ? `&tabela=${encodeURIComponent(sim.topOfferTabela)}` : '';
    const valuePart = `&valor=${sim.topOfferContrato || 0}`;
    const trocoPart = `&troco=${sim.topOfferTroco || 0}`;
    const parcelaPart = `&parcela=${sim.valorParcela || 0}`;
    const saldoPart = `&saldoDevedor=${sim.saldoDevedor || 0}`;
    const bancoPortadoPart = sim.bancoAtual ? `&bancoPortado=${encodeURIComponent(sim.bancoAtual)}` : '';
    
    router.push(`/propostas/nova?fromSim=true${namePart}${cpfPart}${bankPart}${tablePart}${valuePart}${trocoPart}${parcelaPart}${saldoPart}${bancoPortadoPart}`);
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
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans pb-24 md:pb-0">
      <QuotaAlert />
      
      {/* Header Section */}
      <div className="bg-primary dark:bg-black text-white px-6 pt-8 pb-16 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/20 rounded-full -ml-24 -mb-24 blur-2xl" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <PromotoraAvatar 
              logoUrl={profile.avatarUrl || profile.photoUrl} 
              name={profile.name} 
              className="size-20 border-4 border-white/30 shadow-xl"
            />
            <div>
              <h1 className="text-3xl font-black tracking-tight mb-1">Dashboard</h1>
              <div className="flex items-center gap-2">
                <p className="text-white/70 font-medium">Bem-vindo de volta, <span className="text-white">{profile?.name}</span></p>
                {(() => {
                  const remaining = getDaysRemaining(profile);
                  const isExpired = remaining <= 0;
                  const isBlocked = profile.status === 'inactive';
                  
                  // Check if user should see the clock
                  // Only promotora or users created by admin
                  const isCreatedByAdmin = profile.createdBy === 'admin' || !profile.createdBy; // Fallback for old users
                  const shouldShowClock = profile.role === 'promotora' || ((profile.role === 'corretor' || profile.role === 'vendedor') && isCreatedByAdmin);
                  
                  if (!shouldShowClock || profile.role === 'admin') return null;

                  return (
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 backdrop-blur-md border ${
                      (isExpired || isBlocked)
                        ? 'bg-red-500 text-white border-red-400' 
                        : remaining <= 5 
                          ? 'bg-red-500/20 text-red-200 border-red-500/30' 
                          : 'bg-white/10 text-white/90 border-white/20'
                    }`}>
                      <Clock className="w-2.5 h-2.5" /> 
                      {(isExpired || isBlocked) ? 'Bloqueado' : `${remaining}d`}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={generateDashboardReport}
              disabled={generatingReport}
              className="flex items-center gap-2 px-5 py-3 bg-secondary hover:bg-secondary/90 text-white font-bold rounded-xl shadow-lg shadow-secondary/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {generatingReport ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              <span>Relatório PDF</span>
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 px-6 -mt-8 relative z-20 pb-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="professional-card p-6 flex items-center gap-4 border-l-4 border-l-primary dark:bg-slate-800"
          >
            <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Total Simulações</p>
              <p className="text-2xl font-black text-foreground">{stats.totalSimulations}</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="professional-card p-6 flex items-center gap-4 border-l-4 border-l-secondary dark:bg-slate-800"
          >
            <div className="size-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Hoje</p>
              <p className="text-2xl font-black text-foreground">{stats.simulationsToday}</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="professional-card p-6 flex items-center gap-4 border-l-4 border-l-emerald-500 dark:bg-slate-800"
          >
            <div className="size-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Banco Favorito</p>
              <p className="text-lg font-black text-foreground truncate max-w-[120px]">{stats.mostRecommendedBank}</p>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Chart Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className="professional-card p-6 dark:bg-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <h3 className="font-black text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Volume de Simulações
                </h3>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {(['today', '7d', '15d', '30d'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateRange(range)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        dateRange === range 
                          ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {range === 'today' ? 'Hoje' : range === '7d' ? '7 Dias' : range === '15d' ? '15 Dias' : '30 Dias'}
                    </button>
                  ))}
                </div>
              </div>

              <div ref={chartRef} className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                    />
                    <Tooltip 
                      itemStyle={{ fontSize: '11px' }}
                      labelStyle={{ fontSize: '11px' }}
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        padding: '12px',
                        fontSize: '11px'
                      }} 
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} verticalAlign="top" height={36} iconType="circle" />
                    {stats.sortedConvenios.map((conv) => (
                      <Line 
                        key={conv}
                        type="monotone" 
                        dataKey={conv} 
                        stroke={stats.CONVENIO_COLORS[conv] || '#94a3b8'} 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: stats.CONVENIO_COLORS[conv] || '#94a3b8', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* New Column Chart (Value R$) */}
            <div className="professional-card p-6">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-black text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-500" />
                  Volume Financeiro (R$)
                </h3>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickFormatter={(value) => `R$ ${value / 1000}k`}
                    />
                    <Tooltip 
                      formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                      itemStyle={{ fontSize: '11px' }}
                      labelStyle={{ fontSize: '11px' }}
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        padding: '12px',
                        fontSize: '11px'
                      }} 
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} verticalAlign="top" height={36} iconType="circle" />
                    {stats.sortedConvenios.map((conv) => (
                      <Bar 
                        key={`${conv}_val`}
                        dataKey={`${conv}_val`} 
                        name={conv} 
                        fill={stats.CONVENIO_COLORS[conv] || '#94a3b8'} 
                        radius={[4, 4, 0, 0]} 
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Sidebar Section */}
          <div className="space-y-8">
            {/* Top Users - Hidden for corretores/vendedores */}
            {profile.role !== 'corretor' && profile.role !== 'vendedor' && (
              <div className="professional-card p-6 dark:bg-slate-800">
                <h3 className="font-black text-lg mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5 text-secondary" />
                  Top Corretores
                </h3>
                <div className="space-y-4">
                  {stats.topUsers.length > 0 ? (
                    stats.topUsers.map((user, idx) => (
                      <div key={idx} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <PromotoraAvatar logoUrl={user.avatar} name={user.name} className="size-10 border-2 border-white dark:border-slate-800 shadow-sm" />
                            <div className={`absolute -top-1 -left-1 size-5 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm ${
                              idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-amber-700' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {idx + 1}
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{user.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">{user.count} simulações</p>
                          </div>
                        </div>
                        <div className="h-1 w-12 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary" 
                            style={{ width: `${(user.count / (stats.topUsers[0]?.count || 1)) * 100}%` }} 
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm italic">
                      Nenhum corretor ativo no período.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Donut Chart - Mix por Convênio */}
            <div className="professional-card p-6 dark:bg-slate-800">
              <h3 className="font-black text-lg mb-6 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-pink-500" />
                Mix por Convênio
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {stats.donutData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                      }} 
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Simulations - Full Width at Bottom */}
        <div className="professional-card overflow-hidden mb-8 dark:bg-slate-800">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-black text-lg">Simulações Recentes</h3>
            <Link href="/simulacao/nova" className="text-primary text-sm font-bold hover:underline flex items-center gap-1">
              Nova Simulação <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          {/* Mobile List View */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredSimulations.slice(0, 10).map((sim) => {
              const conv = (sim.convenio || 'INSS').toUpperCase();
              const badgeColor = stats.CONVENIO_COLORS[conv] || '#94a3b8';
              return (
                <div 
                  key={sim.id} 
                  className="p-4 flex flex-col gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  onClick={() => loadSimulation(sim)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <PromotoraAvatar logoUrl={sim.userAvatar} name={sim.userName} className="size-8" />
                      <span className="font-bold text-sm text-slate-700 dark:text-slate-300 dark:selection:bg-slate-700 dark:selection:text-white">{sim.userName || 'N/A'}</span>
                    </div>
                    <span 
                      className="px-2 py-1 rounded-md text-[10px] font-bold text-white shadow-sm"
                      style={{ backgroundColor: badgeColor }}
                    >
                      {conv}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-400 uppercase font-black text-[9px] tracking-widest">Banco</p>
                      <p className="font-bold text-slate-700 dark:text-slate-300 dark:selection:bg-slate-700 dark:selection:text-white">{sim.topOffer || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase font-black text-[9px] tracking-widest">Parcela</p>
                      <p className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.valorParcela)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase font-black text-[9px] tracking-widest">Troco</p>
                      <p className="font-bold text-emerald-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.topOfferTroco || 0)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase font-black text-[9px] tracking-widest">Contrato</p>
                      <p className="font-bold text-blue-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.topOfferContrato || 0)}</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button 
                      onClick={(e) => { e.stopPropagation(); generateSimulationPDF(sim); }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Download className="w-4 h-4" /> Baixar PDF
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-6 py-4">Usuário</th>
                  <th className="px-6 py-4">Banco Aceito</th>
                  <th className="px-6 py-4">Convênio</th>
                  <th className="px-6 py-4">Parcela</th>
                  <th className="px-6 py-4">Prazo</th>
                  <th className="px-6 py-4">Valor do Troco</th>
                  <th className="px-6 py-4">Valor do Contrato</th>
                  <th className="px-6 py-4 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSimulations.slice(0, 10).map((sim) => {
                  const conv = (sim.convenio || 'INSS').toUpperCase();
                  const badgeColor = stats.CONVENIO_COLORS[conv] || '#94a3b8';
                  
                  return (
                    <tr 
                      key={sim.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      onClick={() => loadSimulation(sim)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <PromotoraAvatar logoUrl={sim.userAvatar} name={sim.userName} className="size-8" />
                          <span className="font-bold text-sm truncate max-w-[150px] text-slate-700 dark:text-slate-300 dark:selection:bg-slate-700 dark:selection:text-white">{sim.userName || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 dark:selection:bg-slate-700 dark:selection:text-white">{sim.topOffer || 'N/A'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span 
                          className="px-2 py-1 rounded-md text-[10px] font-bold text-white shadow-sm"
                          style={{ backgroundColor: badgeColor }}
                        >
                          {conv}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.valorParcela)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{sim.topOfferPrazo || (sim.subConvenio === 'Marinha' ? '72' : '96')}x</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-emerald-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.topOfferTroco || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-black text-blue-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.topOfferContrato || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleSaveProposal(sim); }}
                          className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                          title="Salvar Proposta"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); generateSimulationPDF(sim); }}
                          className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-400 hover:text-primary transition-colors"
                          title="Baixar PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <BottomNav activeTab="dashboard" />
    </div>
  );
}
