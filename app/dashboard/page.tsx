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
  Save,
  Database
} from 'lucide-react';
import { motion } from 'motion/react';
import { QuotaAlert } from '@/components/QuotaAlert';
import { collection, query, onSnapshot, where, limit, Timestamp, doc, updateDoc } from 'firebase/firestore';                
import { db, auth } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { PromotoraAvatar } from '@/components/PromotoraAvatar';
import { safeStringify } from '@/lib/utils';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { NotificationBell } from '@/components/NotificationBell';
import { 
  getBrandingSettings,
  handleFirestoreError,
  OperationType
} from '@/lib/data-service';
import { useToast } from '@/contexts/ToastContext';

export default function Dashboard() {
  const { profile, user, isAuthReady, logout, isPending, setQuotaExceeded } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [simulations, setSimulations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotoraSettings, setPromotoraSettings] = useState<{ logoUrl: string, name: string } | null>(null);
  const [saldoMulticorban, setSaldoMulticorban] = useState<any>(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

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
  const [userFilter, setUserFilter] = useState<string>('all');
  const [bankFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'30d' | '15d' | '7d' | 'today'>('30d');
  const [searchQuery] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthReady && !user) {
      const savedSlug = typeof window !== 'undefined' ? localStorage.getItem('currentPromoterSlug') : null;
      if (savedSlug) {
        router.push(`/p/${savedSlug}`);
      } else {
        router.push('/');
      }
    }
  }, [isAuthReady, user, router]);

  useEffect(() => {
    if (!profile) return;

    let brandingId = profile.uid;
    if (profile.role === 'admin') {
      brandingId = 'admin';
    }

    let isUnmounted = false;
    let unsubscribe: (() => void) | undefined;
    
    const timeoutId = setTimeout(() => {
      if (isUnmounted) return;
      
      const settingsRef = doc(db, 'settings', brandingId);
      unsubscribe = onSnapshot(settingsRef, async (snapshot) => {
        if (isUnmounted) return;
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
    }, 100);

    return () => {
      isUnmounted = true;
      clearTimeout(timeoutId);
      if (unsubscribe) unsubscribe();
    };
  }, [profile]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      const fetchSaldo = async () => {
        setLoadingSaldo(true);
        try {
          const res = await fetch('/api/multicorban/saldo');
          const data = await res.json();
          setSaldoMulticorban(data);
        } catch (err) {
          console.error("Erro ao buscar saldo:", err);
        } finally {
          setLoadingSaldo(false);
        }
      };
      fetchSaldo();
    }
  }, [profile]);

  const uniqueBanks = useMemo(() => {
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
      // Safety timeout for simulations loading
      const simTimer = setTimeout(() => {
        if (loading) {
          console.warn("Dashboard: Simulation load timeout. Unblocking UI.");
          setLoading(false);
        }
      }, 4000);

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
        clearTimeout(simTimer);
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
        clearTimeout(simTimer);
        console.error("Error fetching simulations:", error);
        setLoading(false);
      });
      return listener;
    };

    let isUnmounted = false;
    
    const timeoutId = setTimeout(() => {
      if (isUnmounted) return;
      unsubscribeFn = setupQuery(false);
    }, 100);

    return () => { 
      isUnmounted = true;
      clearTimeout(timeoutId);
      console.log("Dashboard: Cleanup simulations listener");
      if (unsubscribeFn) unsubscribeFn(); 
    };
  }, [profile, dateRange, setQuotaExceeded]);

  const [whatsappSessions, setWhatsappSessions] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) {
      console.log("Dashboard: Profile not ready, skipping whatsappSessions");
      return;
    }
    if (profile.role !== 'admin' && profile.role !== 'promotora') {
      console.log("Dashboard: User is not admin or promotora, skipping whatsappSessions. Role:", profile.role);
      return;
    }

    console.log("Dashboard: Setting up whatsappSessions listener for " + profile.role + ":", profile.email);
    const q = query(collection(db, 'whatsappSessions'), limit(10));
    
    let isUnmounted = false;
    let unsubscribe: (() => void) | undefined;
    
    const timeoutId = setTimeout(() => {
      if (isUnmounted) return;
      unsubscribe = onSnapshot(q, (snapshot) => {
        setWhatsappSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        console.warn("Dashboard: Could not load whatsappSessions (possibly missing permissions or empty)", error);
        setWhatsappSessions([]);
      });
    }, 100);

    return () => {
      isUnmounted = true;
      clearTimeout(timeoutId);
      if (unsubscribe) unsubscribe();
    }
  }, [profile]);

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

  // Get unique users for the filter
  const uniqueUsers = useMemo(() => {
    if (!profile) return [];
    
    // First, filter ALL simulations by role just like we do for base simulations
    // But WITHOUT applying the userFilter or bankFilter, so the dropdown always has everyone
    let baseSims = simulations;
    if (profile.role === 'corretor' || profile.role === 'vendedor') {
      baseSims = baseSims.filter(sim => sim.userId === profile.uid || sim.corretorId === profile.uid);
    } else if (profile.role === 'promotora') {
      baseSims = baseSims.filter(sim => sim.promotoraId === profile.uid || sim.createdBy === profile.uid || sim.userId === profile.uid);
    }

    const usersMap: Record<string, { id: string, name: string }> = {};
    baseSims.forEach(sim => {
      if (sim.userId && sim.userName && sim.userName !== 'J2 Promotora') {
        if (!usersMap[sim.userId]) {
          usersMap[sim.userId] = { id: sim.userId, name: sim.userName };
        }
      }
    });
    return Object.values(usersMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [simulations, profile]);

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
      if (sim.userId && sim.userName && sim.userName !== 'J2 Promotora') {
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
    
    const donutData = Object.entries(convenioCounts)
      .map(([name, value]) => ({
        name,
        value: Number(value),
        color: CONVENIO_COLORS[name] || '#94a3b8'
      }))
      .filter(item => item.value > 0);

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
    sessionStorage.setItem('simulationData', safeStringify(sim));
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
        ['Nova Taxa Port.', `${(sim.topOfferTaxa || 0).toFixed(2)}%`],
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
    console.log("Dashboard: Still loading or profile missing.", { loading, isAuthReady, profile: !!profile });
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <DashboardSkeleton />
        {(!profile && isAuthReady && user) && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Quase lá...</h2>
              <p className="text-slate-500 text-sm">Estamos preparando o seu acesso. Se demorar muito, tente atualizar a página.</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-6 w-full bg-primary text-white font-bold py-3 rounded-xl"
              >
                Atualizar Página
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans pb-24 md:pb-0 overflow-x-hidden">
      <QuotaAlert />
      
      {/* Header Section */}
      <div className="bg-primary dark:bg-black text-white px-6 pt-8 pb-16 relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/20 rounded-full -ml-24 -mb-24 blur-2xl pointer-events-none" />
        
        <div className="relative z-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <PromotoraAvatar 
              logoUrl={profile.avatarUrl || profile.photoUrl} 
              name={profile.name} 
              className="size-20 rounded-full border-4 border-white/30 shadow-xl"
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
          
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button 
              onClick={generateDashboardReport}
              disabled={generatingReport}
              className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-bold rounded-xl shadow-lg shadow-secondary/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {generatingReport ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-4 h-4" />}
              <span className="hidden sm:inline">Relatório PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button 
              onClick={logout}
              className="md:hidden flex items-center justify-center size-10 bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-lg shadow-red-500/20 transition-all active:scale-95"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 px-6 -mt-8 relative z-20 pb-12">
        {/* User Filter for Admin/Promotora */}
        {(profile?.role === 'admin' || profile?.role === 'promotora') && uniqueUsers.length > 0 && (
          <div className="mb-6 flex items-center justify-end">
            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-center size-8 rounded-xl bg-primary/10 text-primary">
                <Users className="w-4 h-4" />
              </div>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="bg-transparent border-none text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer min-w-[200px]"
              >
                <option value="all">Todos os Usuários</option>
                {uniqueUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="professional-card p-6 relative overflow-hidden group dark:bg-slate-800 border border-slate-100 dark:border-slate-800"
          >
            <div className="absolute -right-6 -top-6 size-24 bg-primary/5 rounded-full group-hover:scale-150 transition-transform duration-500" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">+12%</span>
            </div>
            <div className="relative z-10">
              <p className="text-xl font-black text-foreground">{stats.totalSimulations}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Total Simulações</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="professional-card p-6 relative overflow-hidden group dark:bg-slate-800 border border-slate-100 dark:border-slate-800"
          >
            <div className="absolute -right-6 -top-6 size-24 bg-secondary/5 rounded-full group-hover:scale-150 transition-transform duration-500" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="size-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full">Ativo</span>
            </div>
            <div className="relative z-10">
              <p className="text-xl font-black text-foreground">{stats.simulationsToday}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Simulações Hoje</p>
            </div>
          </motion.div>

          {profile?.role === 'admin' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="professional-card p-6 relative overflow-hidden group dark:bg-slate-800 border border-slate-100 dark:border-slate-800"
            >
              <div className="absolute -right-6 -top-6 size-24 bg-amber-500/5 rounded-full group-hover:scale-150 transition-transform duration-500" />
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <Database className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-full">MultiCorban</span>
              </div>
              <div className="relative z-10">
                {loadingSaldo ? (
                  <div className="animate-pulse flex flex-col gap-2">
                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                  </div>
                ) : saldoMulticorban && !saldoMulticorban.raw ? (
                  <>
                    <p className="text-xl font-black text-foreground">{saldoMulticorban.offline || 0}</p>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">
                      Online: {saldoMulticorban.online || 0} | IN100: {saldoMulticorban.in100 || 0}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-rose-500">{saldoMulticorban?.message || 'Licença expirada ou inválida'}</p>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Verifique seu Token</p>
                  </>
                )}
              </div>
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="professional-card p-6 relative overflow-hidden group dark:bg-slate-800 border border-slate-100 dark:border-slate-800 sm:col-span-2 lg:col-span-1"
          >
            <div className="absolute -right-6 -top-6 size-24 bg-emerald-500/5 rounded-full group-hover:scale-150 transition-transform duration-500" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full">Destaque</span>
            </div>
            <div className="relative z-10">
              <p className="text-xl font-black text-foreground truncate">{stats.mostRecommendedBank}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Banco Favorito</p>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
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

            {/* WhatsApp Sessions - Admin & Promotora */}
            {(profile.role === 'admin' || profile.role === 'promotora') && whatsappSessions.length > 0 && (
              <div className="professional-card p-6 dark:bg-slate-800">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-black text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    Leads WhatsApp
                  </h3>
                  <Link href="/admin/simulador-whatsapp" className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="space-y-4">
                  {whatsappSessions.map((session, idx) => (
                    <div key={session.id} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 group hover:border-emerald-500/30 transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase text-emerald-600">{session.data?.convenio || 'Iniciando...'}</span>
                        <span className="text-[9px] font-bold text-slate-400">PASSO: {session.step}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {session.id.startsWith('_') ? session.id.substring(1).replace(/[^a-zA-Z0-9]/g, '') : session.id}
                      </p>
                      {session.data?.valorParcela && (
                        <p className="text-[10px] text-slate-500">Parcela: <span className="font-bold text-emerald-600">R$ {session.data.valorParcela}</span></p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Donut Chart - Mix por Convênio */}
            <div className="professional-card p-6 dark:bg-slate-800 flex flex-col min-h-[450px]">
              <h3 className="font-black text-lg mb-6 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-pink-500" />
                Mix por Convênio
              </h3>
              <div className="flex-1 w-full relative h-[350px]">
                {stats.donutData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={stats.donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        nameKey="name"
                        isAnimationActive={false}
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
                      <Legend 
                        verticalAlign="bottom" 
                        align="center"
                        layout="horizontal"
                        iconType="circle"
                        wrapperStyle={{ paddingTop: '20px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 italic text-sm">
                    <PieChartIcon className="w-12 h-12 mb-2 opacity-20" />
                    Sem dados para exibir
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Simulations - Grid View */}
        <div className="mb-12 clear-both">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-xl flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Simulações Recentes
            </h3>
            <Link href="/simulacao/nova" className="text-primary text-sm font-bold hover:underline flex items-center gap-1">
              Nova Simulação <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredSimulations.slice(0, 15).map((sim) => {
              const conv = (sim.convenio || 'INSS').toUpperCase();
              const badgeColor = stats.CONVENIO_COLORS[conv] || '#94a3b8';
              
              return (
                <div 
                  key={sim.id} 
                  className="professional-card p-5 flex flex-col gap-4 cursor-pointer hover:border-primary/30 transition-all group dark:bg-slate-800"
                  onClick={() => loadSimulation(sim)}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50 pb-4">
                    <div className="flex items-center gap-3">
                      <PromotoraAvatar logoUrl={sim.userAvatar} name={sim.userName} className="size-10 rounded-full border-2 border-white dark:border-slate-800 shadow-sm" />
                       <div className="flex flex-col">
                         <span className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors">{sim.userName || 'N/A'}</span>
                         <span className="text-[10px] font-bold text-slate-400 mt-0.5">
                           {sim.origin === 'whatsapp' ? 'Simulação via WhatsApp' : 'Simulação via Web'}
                         </span>
                         <span 
                           className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full w-fit mt-1 shadow-sm"
                           style={{ backgroundColor: badgeColor }}
                         >
                           {conv}
                         </span>
                       </div>
                    </div>
                    <div className="flex bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl p-2 items-center gap-2">
                         <button 
                          onClick={(e) => { e.stopPropagation(); generateSimulationPDF(sim); }}
                          className="text-slate-400 hover:text-primary transition-colors"
                          title="Baixar PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Oferta Aceita</p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{sim.topOffer || 'N/A'}</p>
                      <p className="text-[10px] font-medium text-slate-500 mt-0.5">{sim.topOfferPrazo || (sim.subConvenio === 'Marinha' ? '72' : '96')}x Parcela</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Parcela Atual</p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.valorParcela || 0)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Valor Contrato</p>
                      <p className="text-base font-black text-blue-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.topOfferContrato || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Valor Liberado</p>
                      <p className="text-base font-black text-emerald-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.topOfferTroco || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
