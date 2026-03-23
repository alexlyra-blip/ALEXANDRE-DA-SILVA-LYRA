'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutDashboard, Calculator, User, Settings } from 'lucide-react';

export default function BottomNav({ activeTab }: { activeTab: string }) {
  const pathname = usePathname();

  // Hide on Login (/), Cadastro (/cadastro), Promotora Login (/p/[slug])
  if (pathname === '/' || pathname === '/cadastro' || pathname.startsWith('/p/')) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 pb-6 pt-2 z-50">
      <div className="max-w-md mx-auto flex justify-between items-center">
        <Link href="/dashboard" className={`flex flex-1 flex-col items-center gap-1 ${activeTab === 'inicio' ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>
          <Home className="w-6 h-6" />
          <p className="text-[10px] font-medium uppercase tracking-tight">Início</p>
        </Link>
        <Link href="/simulacao/nova" className={`flex flex-1 flex-col items-center gap-1 ${activeTab === 'nova' ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>
          <Calculator className="w-6 h-6" />
          <p className="text-[10px] font-medium uppercase tracking-tight">Simulação</p>
        </Link>
        <Link href="/simulacao/recomendacoes" className={`flex flex-1 flex-col items-center gap-1 ${activeTab === 'ofertas' ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>
          <LayoutDashboard className="w-6 h-6" />
          <p className="text-[10px] font-medium uppercase tracking-tight">Ofertas</p>
        </Link>
        <Link href="/regras" className={`flex flex-1 flex-col items-center gap-1 ${activeTab === 'regras' ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>
          <Settings className="w-6 h-6" />
          <p className="text-[10px] font-medium uppercase tracking-tight">Regras</p>
        </Link>
        <Link href="/perfil" className={`flex flex-1 flex-col items-center gap-1 ${activeTab === 'perfil' ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>
          <User className="w-6 h-6" />
          <p className="text-[10px] font-medium uppercase tracking-tight">Perfil</p>
        </Link>
      </div>
    </nav>
  );
}
