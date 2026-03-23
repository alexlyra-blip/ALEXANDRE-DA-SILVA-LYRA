import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Share2 } from 'lucide-react';
import { Landmark } from 'lucide-react';
import { Rocket } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Info } from 'lucide-react';
import BottomNav from '@/components/BottomNav';

export default function Detalhes() {
  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center p-4 justify-between">
          <Link href="/simulacao/recomendacoes" className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h2 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center">
            Detalhe da Simulação
          </h2>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
              <Share2 className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {/* Bank Header */}
        <div className="p-4 flex items-center gap-4 mt-2">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Landmark className="text-primary w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Global Finance Bank</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              ID Simulação de Portabilidade: #SIM-8291
            </p>
          </div>
        </div>

        {/* Refinancing Summary */}
        <section className="px-4 py-2">
          <h3 className="text-lg font-bold mb-4">Resumo do Refinanciamento</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
                DÍVIDA TOTAL
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">R$ 45.000,00</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
                TAXA DA PORTABILIDADE
              </p>
              <p className="text-2xl font-bold text-emerald-500">
                4.2% <span className="text-sm font-normal text-slate-400">/mês</span>
              </p>
            </div>
          </div>
        </section>

        {/* Visual Breakdown Indicator */}
        <section className="px-4 py-6">
          <div className="bg-primary/5 dark:bg-primary/10 rounded-2xl p-6 border border-primary/20">
            <div className="flex flex-col items-center justify-center gap-6">
              {/* Simple Circular Representation */}
              <div
                className="relative w-32 h-32 rounded-full flex items-center justify-center"
                style={{ background: 'conic-gradient(from 0deg, #1152d4 0% 70%, #1e293b 70% 100%)' }}
              >
                <div className="absolute inset-2 bg-background-light dark:bg-slate-900 rounded-full flex flex-col items-center justify-center">
                  <span className="text-xs text-slate-500">Economia</span>
                  <span className="text-lg font-bold text-primary">12.5%</span>
                </div>
              </div>

              <div className="w-full space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-primary"></span>
                    <span className="text-sm">Quitação da Dívida Atual</span>
                  </div>
                  <span className="font-semibold">R$ 42.850,00</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-slate-400"></span>
                    <span className="text-sm">Liberado para o Cliente</span>
                  </div>
                  <span className="font-semibold text-emerald-500">R$ 2.150,00</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Financial Breakdown Details */}
        <section className="px-4 space-y-3">
          <h3 className="text-lg font-bold pt-2">Detalhamento Financeiro</h3>
          <div className="bg-white dark:bg-slate-900 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800">
            <div className="p-4 flex justify-between items-center">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Nova Parcela Mensal</p>
                <p className="text-xs text-slate-400">72 meses restantes</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-primary">R$ 625,50</p>
                <p className="text-xs text-emerald-500 font-medium">-R$ 85,00 vs atual</p>
              </div>
            </div>
            <div className="p-4 flex justify-between items-center">
              <p className="text-slate-500 dark:text-slate-400 text-sm">Taxa de Portabilidade</p>
              <p className="font-semibold">0,00%</p>
            </div>
            <div className="p-4 flex justify-between items-center">
              <p className="text-slate-500 dark:text-slate-400 text-sm">Valor Liberado ao Cliente</p>
              <div className="flex items-center gap-2">
                <Info className="text-emerald-500 w-4 h-4" />
                <p className="font-bold text-emerald-500 text-lg">R$ 2.150,00</p>
              </div>
            </div>
          </div>
        </section>

        {/* Action Area */}
        <section className="px-4 pt-8 space-y-3">
          <button className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
            <Rocket className="w-5 h-5" />
            <span>Iniciar Portabilidade</span>
          </button>
          <button className="w-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
            <FileText className="w-5 h-5" />
            <span>Exportar PDF da Simulação</span>
          </button>
        </section>
      </main>

      <BottomNav activeTab="ofertas" />
    </div>
  );
}
