'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Loader2, Search, Calendar, FileText, X, AlertCircle, Phone } from 'lucide-react';

export default function WhatsappLogs() {
  const { profile, isAuthReady } = useAuth();
  const router = useRouter();
  
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterPhone, setFilterPhone] = useState('');
  const [filterProtocol, setFilterProtocol] = useState('');
  
  const [selectedSession, setSelectedSession] = useState<any>(null);

  useEffect(() => {
    if (isAuthReady && profile && profile.role !== 'admin' && profile.role !== 'promotora') {
      router.push('/dashboard');
    }
  }, [profile, isAuthReady, router]);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterDate) params.append('date', filterDate);
      if (filterPhone) params.append('phone', filterPhone);
      if (filterProtocol) params.append('protocol', filterProtocol);
      
      const res = await fetch(`/api/admin/whatsapp-history?${params.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        setLogs(data.data);
      } else {
        setError(data.error || 'Erro ao carregar logs.');
      }
    } catch (err) {
      console.error(err);
      setError('Erro de conexão ao buscar logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && (profile.role === 'admin' || profile.role === 'promotora')) {
      fetchLogs();
    }
  }, [profile, filterDate]); // auto fetch when date changes

  if (!isAuthReady) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!profile || (profile.role !== 'admin' && profile.role !== 'promotora')) {
    return null;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-black text-slate-800 dark:text-white mb-6">Logs e Simulações WhatsApp</h1>
      
      <div className="bg-white dark:bg-[var(--sidebar-bg)] p-4 rounded-xl shadow-sm border border-slate-200 dark:border-white/10 mb-6 flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Data</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="date" 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full pl-9 p-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-black text-slate-800 dark:text-white"
            />
          </div>
        </div>
        
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Telefone</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Ex: 11999999999"
              value={filterPhone}
              onChange={(e) => setFilterPhone(e.target.value)}
              className="w-full pl-9 p-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-black text-slate-800 dark:text-white"
            />
          </div>
        </div>

        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Protocolo</label>
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Ex: GUTTO-..."
              value={filterProtocol}
              onChange={(e) => setFilterProtocol(e.target.value)}
              className="w-full pl-9 p-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-black text-slate-800 dark:text-white"
            />
          </div>
        </div>
        
        <button 
          onClick={fetchLogs}
          disabled={loading}
          className="bg-primary text-white px-6 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors h-10 w-full md:w-auto"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      <div className="bg-white dark:bg-[var(--sidebar-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
        {error && (
          <div className="p-4 bg-rose-50 text-rose-600 dark:bg-rose-900/20 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                <th className="p-4 text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Data / Hora</th>
                <th className="p-4 text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Protocolo</th>
                <th className="p-4 text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Telefone</th>
                <th className="p-4 text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Status</th>
                <th className="p-4 text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400">
                    Nenhuma simulação encontrada para estes filtros.
                  </td>
                </tr>
              )}
              {logs.map(log => (
                <tr key={log.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="p-4 text-sm text-slate-800 dark:text-white">
                    {new Date(log.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-800 dark:text-white">
                    {log.protocolNumber || 'N/A'}
                  </td>
                  <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                    {log.phone}
                  </td>
                  <td className="p-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${log.status === 'finished' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {log.status === 'finished' ? 'Finalizado' : 'Expirou'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => setSelectedSession(log)}
                      className="text-primary hover:text-primary/80 font-bold text-sm bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Ver Conversa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE CONVERSA */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111] w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col h-[85vh] overflow-hidden border border-slate-200 dark:border-white/10">
            <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-white/5">
              <div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-white">
                  Histórico: {selectedSession.protocolNumber}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedSession.phone} • {new Date(selectedSession.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <button 
                onClick={() => setSelectedSession(null)}
                className="p-2 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 rounded-full transition-colors text-slate-700 dark:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#e5ddd5] dark:bg-[#0b141a]">
              {(!selectedSession.history || selectedSession.history.length === 0) ? (
                <div className="text-center p-8 text-slate-500">Histórico vazio.</div>
              ) : (
                selectedSession.history.map((msg: any, i: number) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div 
                        className={`max-w-[85%] rounded-lg p-3 shadow-sm whitespace-pre-wrap ${
                          isUser 
                            ? 'bg-[#d9fdd3] text-[#111b21] rounded-tr-none' 
                            : 'bg-white text-[#111b21] rounded-tl-none dark:bg-[#202c33] dark:text-[#e9edef]'
                        }`}
                      >
                        <span className="text-xs font-bold mb-1 block opacity-50">
                          {isUser ? 'Cliente' : 'Gutto'}
                        </span>
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
