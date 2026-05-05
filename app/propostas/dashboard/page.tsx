'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase';
import { collection, query, where, orderBy, limit, or, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, TrendingUp, DollarSign, Users, Clock, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { PromotoraAvatar } from '@/components/PromotoraAvatar';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line
} from 'recharts';

const STATUS_COLORS: { [key: string]: string } = {
  'PENDENTE': '#f59e0b',
  'ANDAMENTO': '#6366f1',
  'PAGO': '#10b981',
  'REPROVADO': '#ef4444',
};

const BANK_COLORS: { [key: string]: string } = {
  'C6 CONSIG': '#868686',
  'DAYCOVAL': '#1543C5',
  'BMG': '#E38803',
  'PAN': '#33CCFF',
};

export default function DashboardPropostasPage() {
  const { profile } = useAuth();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    
    let q;
    if (profile.role === 'admin') {
      q = query(
        collection(db, 'proposals'), 
        limit(100)
      );
    } else if (profile.role === 'promotora') {
      q = query(
        collection(db, 'proposals'), 
        where('promotoraId', '==', profile.uid),
        limit(100)
      );
    } else {
      q = query(
        collection(db, 'proposals'), 
        where('userId', '==', profile.uid),
        limit(100)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProposals(data);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching proposals:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const [dateRange, setDateRange] = useState<'7d' | '15d' | '30d'>('7d');

  const stats = useMemo(() => {
    // Exclude RASCUNHO from dashboard statistics
    const nonDraftProposals = proposals.filter(p => p.status !== 'RASCUNHO');
    
    const total = nonDraftProposals.length;
    const totalValue = nonDraftProposals.reduce((sum, p) => sum + (p.value || 0), 0);
    const totalProducao = nonDraftProposals.reduce((sum, p) => sum + (p.value || 0), 0);
    const totalPago = nonDraftProposals.filter(p => p.status === 'PAGO').reduce((sum, p) => sum + (p.value || 0), 0);
    const totalReprovado = nonDraftProposals.filter(p => p.status === 'REPROVADO').reduce((sum, p) => sum + (p.value || 0), 0);
    
    // Filter proposals by date range
    const now = new Date();
    const filteredProposals = nonDraftProposals.filter(p => {
      if (!p.proposalDate) return true;
      const date = parseISO(p.proposalDate);
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (dateRange === '7d') return diffDays <= 7;
      if (dateRange === '15d') return diffDays <= 15;
      return diffDays <= 30;
    });

    const statusCounts = filteredProposals.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Ensure all statuses are present
    Object.keys(STATUS_COLORS).forEach(status => {
      if (!(status in statusCounts)) statusCounts[status] = 0;
    });

    const bankCounts = filteredProposals.reduce((acc, p) => {
      const bank = p.bank || 'Outros';
      acc[bank] = (acc[bank] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    const userCounts = filteredProposals.reduce((acc, p) => {
      const name = p.corretor || 'Sem Corretor';
      
      if (!acc[name]) {
        acc[name] = { name: name, count: 0, avatar: p.userAvatar || null };
      }
      acc[name].count += 1;
      return acc;
    }, {} as { [key: string]: { name: string, count: number, avatar: string | null } });

    const statusData = Object.entries(statusCounts).map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || '#94a3b8'
    }));

    const bankData = Object.entries(bankCounts)
      .map(([name, value]) => ({
        name,
        value,
      }))
      .filter(item => item.value > 0);

    const barData = Object.values(userCounts).map(u => ({
      name: u.name,
      value: u.count,
      avatar: u.avatar
    })).sort((a, b) => b.value - a.value);

    // Daily count for line chart
    const dailyCounts = filteredProposals.reduce((acc, p) => {
      const date = p.proposalDate ? format(parseISO(p.proposalDate), 'dd/MM') : 'Sem Data';
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    const lineData = Object.entries(dailyCounts).map(([name, value]) => ({
      name,
      value,
    })).sort((a, b) => a.name.localeCompare(b.name));
    
    return { total, totalValue, totalProducao, totalPago, totalReprovado, statusData, bankData, barData, lineData, userCounts: barData };
  }, [proposals, dateRange]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;

  return (
    <>
      <header className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4">
        <Link href="/propostas" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-2xl font-bold">Dashboard de Propostas</h1>
      </header>
      
      <main className="p-6 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-primary/10 text-primary rounded-xl"><TrendingUp className="w-6 h-6" /></div>
                <h3 className="font-bold text-slate-500">Total</h3>
              </div>
              <p className="text-xl lg:text-2xl font-black text-slate-900 truncate" title={stats.total.toString()}>{stats.total}</p>
            </div>
            
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-blue-500/10 text-blue-600 rounded-xl"><DollarSign className="w-6 h-6" /></div>
                <h3 className="font-bold text-slate-500">Contratado</h3>
              </div>
              <p className="text-xl lg:text-2xl font-black text-slate-900 truncate" title={formatCurrency(stats.totalValue)}>{formatCurrency(stats.totalValue)}</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl"><DollarSign className="w-6 h-6" /></div>
                <h3 className="font-bold text-slate-500">Pago</h3>
              </div>
              <p className="text-xl lg:text-2xl font-black text-slate-900 truncate" title={formatCurrency(stats.totalPago)}>{formatCurrency(stats.totalPago)}</p>
            </div>
            
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-rose-500/10 text-rose-600 rounded-xl"><DollarSign className="w-6 h-6" /></div>
                <h3 className="font-bold text-slate-500">Reprovado</h3>
              </div>
              <p className="text-xl lg:text-2xl font-black text-slate-900 truncate" title={formatCurrency(stats.totalReprovado)}>{formatCurrency(stats.totalReprovado)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-500" />
                    Propostas Adicionadas por Dia
                  </h3>
                  <select 
                    value={dateRange} 
                    onChange={(e) => setDateRange(e.target.value as '7d' | '15d' | '30d')}
                    className="bg-slate-100 border-none rounded-lg text-xs font-bold px-3 py-1.5 outline-none text-slate-900"
                  >
                    <option value="7d">Últimos 7 dias</option>
                    <option value="15d">Últimos 15 dias</option>
                    <option value="30d">Últimos 30 dias</option>
                  </select>
                  <div className="h-80 w-full mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.lineData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-black text-lg text-slate-900 mb-6 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Distribuição por Status
                  </h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.statusData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'currentColor' }} className="text-slate-500 dark:text-slate-400" />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'currentColor' }} className="text-slate-500 dark:text-slate-400" />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'transparent' }} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {stats.statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-black text-lg text-slate-900 mb-6 flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-pink-500" />
                    Distribuição por Banco
                  </h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.bankData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          animationDuration={500}
                        >
                          {stats.bankData.map((entry, index) => {
                            const customColor = BANK_COLORS[entry.name.toUpperCase()];
                            return (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={customColor || `hsl(${(index * 45) % 360}, 70%, 60%)`} 
                              />
                            );
                          })}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'transparent' }} />
                        <Legend iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-black text-lg text-slate-900 mb-6 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                  Aproveitamento
                </h3>
                <div className="h-80 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Pago', value: Math.min(Math.max(stats.totalValue > 0 ? (stats.totalPago / stats.totalValue) * 100 : 0, 0), 100) },
                          { name: 'Restante', value: Math.min(Math.max(stats.totalValue > 0 ? 100 - (stats.totalPago / stats.totalValue) * 100 : 100, 0), 100) }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        animationDuration={800}
                        isAnimationActive={true}
                        stroke="none"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#f1f5f9" />
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'transparent', borderRadius: '12px' }} />
                      <Legend iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-8">
                    <p className="text-3xl font-black text-slate-900 tracking-tighter">
                      {stats.totalValue > 0 ? Math.round((stats.totalPago / stats.totalValue) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-black text-lg text-slate-900 mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  Distribuição por Corretor/Vendedor
                </h3>
                <div className="space-y-4">
                  {stats.userCounts.map((user, idx) => (
                    <div key={idx} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <PromotoraAvatar logoUrl={user.avatar} name={user.name} className="size-10 border-2 border-white shadow-sm" />
                        <div>
                          <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">{user.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">
                            {user.value} {user.value === 1 ? 'PROPOSTA' : 'PROPOSTAS'}
                          </p>
                        </div>
                      </div>
                      <div className="h-1 w-16 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${(user.value / (stats.userCounts[0]?.value || 1)) * 100}%` }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
      </main>
    </>
  );
}
