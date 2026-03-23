'use client';

import Link from 'next/link';
import { ArrowLeft, Building2, Calculator, FileText } from 'lucide-react';
import BottomNav from '@/components/BottomNav';

export default function RegrasDashboard() {
  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display pb-24">
      {/* Header */}
      <div className="flex items-center bg-background-light dark:bg-background-dark p-4 pb-2 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
        <Link href="/dashboard" className="text-slate-900 dark:text-slate-100 flex size-10 shrink-0 items-center justify-center cursor-pointer">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h2 className="text-slate-900 dark:text-slate-100 text-lg font-bold leading-tight tracking-tight flex-1 text-center pr-10">
          Regras e Parâmetros
        </h2>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Gerencie as regras de negócio, bancos, tabelas de cálculo e convênios utilizados nas simulações.
        </p>

        <Link href="/regras/banco" className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-primary/50 transition-colors">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Bancos e Regras</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Configure idades, parcelas mínimas, taxas e regras específicas por banco.</p>
          </div>
        </Link>

        <Link href="/regras/calculo" className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-primary/50 transition-colors">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Calculator className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Cálculos e Tabelas</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gerencie coeficientes, tabelas de refinanciamento e portabilidade.</p>
          </div>
        </Link>

        <Link href="/regras/convenio" className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-primary/50 transition-colors">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Convênios (INSS)</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Regras específicas para benefícios, margens e espécies (Invalidez, LOAS).</p>
          </div>
        </Link>
      </div>

      <BottomNav activeTab="regras" />
    </div>
  );
}
