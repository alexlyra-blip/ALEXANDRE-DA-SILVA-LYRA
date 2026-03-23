'use client';

import { XCircle, AlertTriangle, RefreshCcw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function QuotaAlert() {
  const { quotaExceeded, resetQuotaExceeded } = useAuth();

  if (!quotaExceeded) return null;

  const handleRetry = () => {
    resetQuotaExceeded();
    window.location.reload();
  };

  return (
    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex flex-col gap-3 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-red-500">
          <XCircle className="w-5 h-5" />
          <h3 className="font-bold text-sm">Limite de Uso Atingido</h3>
        </div>
        <button 
          onClick={handleRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-colors shadow-sm"
        >
          <RefreshCcw className="w-3 h-3" />
          Tentar Novamente
        </button>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        O limite diário de consultas ao banco de dados foi atingido. 
        Algumas informações podem estar desatualizadas ou indisponíveis até que o limite seja reiniciado (geralmente à meia-noite).
      </p>
      <div className="flex items-center gap-2 text-[10px] text-amber-600 dark:text-amber-500">
        <AlertTriangle className="w-3 h-3" />
        <span>Tente novamente mais tarde ou contate o administrador.</span>
      </div>
    </div>
  );
}
