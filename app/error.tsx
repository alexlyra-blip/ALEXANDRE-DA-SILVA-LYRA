'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('App Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-200 dark:border-slate-700">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Ops! Algo deu errado.</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          Ocorreu um erro inesperado. Nossa equipe já foi notificada.
        </p>
        <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg text-left overflow-auto max-h-40 mb-6">
          <p className="text-xs font-mono text-red-600 dark:text-red-400 break-words">
            {error?.message || 'Erro desconhecido'}
          </p>
        </div>
        <button
          onClick={() => reset()}
          className="w-full bg-primary text-white font-bold py-3 px-4 rounded-xl hover:bg-primary/90 transition-colors mb-4"
        >
          Tentar Novamente
        </button>
        <button
          onClick={() => {
            const savedSlug = typeof window !== 'undefined' ? localStorage.getItem('currentPromoterSlug') : null;
            window.location.href = savedSlug ? `/p/${savedSlug}` : '/';
          }}
          className="w-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3 px-4 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Voltar ao Início
        </button>
      </div>
    </div>
  );
}
