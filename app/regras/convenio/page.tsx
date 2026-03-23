import Link from 'next/link';
import { ArrowLeft, Landmark, Gavel, Map, Medal } from 'lucide-react';
import BottomNav from '@/components/BottomNav';

export default function RegrasConvenio() {
  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-4 flex items-center gap-4">
        <Link href="/regras/calculo" className="flex items-center justify-center p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft className="text-slate-700 dark:text-slate-300 w-6 h-6" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Regras por Convênio</h1>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* Intro Section */}
        <div className="px-4 py-6">
          <h2 className="text-lg font-semibold mb-1">Configurações Gerais</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Defina os parâmetros de cálculo e comissão para cada tipo de convênio atendido.
          </p>
        </div>

        {/* Rules List */}
        <div className="space-y-6 px-4">
          {/* INSS Card */}
          <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">INSS</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">Aposentados e Pensionistas</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Comissão Base %</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  placeholder="6,00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Taxa Adm.</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          {/* SIAPE Card */}
          <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Gavel className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">SIAPE</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">Servidores Federais</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Comissão Base %</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  placeholder="4,50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Taxa Adm.</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  placeholder="1,00"
                />
              </div>
            </div>
          </div>

          {/* Governo Estadual Card */}
          <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Map className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Governo Estadual</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">Servidores do Estado</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4 opacity-50 pointer-events-none">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Comissão Base %</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm"
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Taxa Adm.</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm"
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          {/* Forças Armadas Card */}
          <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Medal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Forças Armadas</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">Militar e Exército</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Comissão Base %</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  placeholder="5,25"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Taxa Adm.</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  placeholder="0,50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="p-4 mt-4">
          <Link href="/regras/banco" className="flex items-center justify-center w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-primary/20">
            Salvar Configurações
          </Link>
        </div>
      </main>

      <BottomNav activeTab="regras" />
    </div>
  );
}
