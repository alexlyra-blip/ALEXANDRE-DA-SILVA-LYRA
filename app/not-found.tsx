'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background-light dark:bg-background-dark p-4">
      <div className="text-center space-y-6">
        <h1 className="text-6xl font-bold text-slate-900 dark:text-slate-100">404</h1>
        <h2 className="text-2xl font-semibold text-slate-700 dark:text-slate-300">
          Página não encontrada
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          A página que você está procurando não existe ou foi movida.
        </p>
        <Link 
          href="/"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors"
        >
          <span>Voltar para o Início</span>
        </Link>
      </div>
    </div>
  );
}
