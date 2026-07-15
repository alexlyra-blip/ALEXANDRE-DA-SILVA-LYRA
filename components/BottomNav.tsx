'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutDashboard, Calculator, Settings, Sun, Moon, ClipboardList, LogOut, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PromotoraAvatar } from './PromotoraAvatar';
import { useTheme } from '@/contexts/ThemeContext';

export default function BottomNav() {
  const pathname = usePathname();
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Determine active tab from pathname
  const activeTab = 
    pathname === '/dashboard' ? 'inicio' :
    pathname.startsWith('/simulacao/nova') ? 'nova' :
    pathname.startsWith('/simulacao/recomendacoes') ? 'ofertas' :
    pathname.startsWith('/propostas') ? 'propostas' :
    pathname.startsWith('/regras') ? 'regras' :
    pathname.startsWith('/perfil') ? 'perfil' : '';

  // Hide on Login (/), Cadastro (/cadastro), Promotora Login (/p/[slug])
  if (pathname === '/' || pathname === '/cadastro' || pathname.startsWith('/p/')) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-primary-dark dark:bg-black border-t border-white/10 px-2 pb-6 pt-2 z-50 md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.1)] overflow-x-auto custom-scrollbar">
      <div className="flex justify-between items-center min-w-max gap-4 px-4">
        <Link href="/dashboard" className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'inicio' ? 'text-white scale-110' : 'text-white/50 hover:text-white/80'}`}>
          <Home className="w-6 h-6" />
          <p className="text-[10px] font-black uppercase tracking-tighter">Início</p>
        </Link>
        <Link href="/simulacao/nova" className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'nova' ? 'text-white scale-110' : 'text-white/50 hover:text-white/80'}`}>
          <Calculator className="w-6 h-6" />
          <p className="text-[10px] font-black uppercase tracking-tighter">Simulação</p>
        </Link>
        <Link href="/consulta-cpf" className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'consulta' ? 'text-white scale-110' : 'text-white/50 hover:text-white/80'}`}>
          <Search className="w-6 h-6" />
          <p className="text-[10px] font-black uppercase tracking-tighter">Consulta</p>
        </Link>
        <Link href="/simulacao/recomendacoes" className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'ofertas' ? 'text-white scale-110' : 'text-white/50 hover:text-white/80'}`}>
          <LayoutDashboard className="w-6 h-6" />
          <p className="text-[10px] font-black uppercase tracking-tighter">Ofertas</p>
        </Link>
        <Link href="/propostas" className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'propostas' ? 'text-white scale-110' : 'text-white/50 hover:text-white/80'}`}>
          <ClipboardList className="w-6 h-6" />
          <p className="text-[10px] font-black uppercase tracking-tighter">Propostas</p>
        </Link>
        {(profile?.role === 'admin' || profile?.role === 'promotora') && (
          <Link href="/regras" className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'regras' ? 'text-white scale-110' : 'text-white/50 hover:text-white/80'}`}>
            <Settings className="w-6 h-6" />
            <p className="text-[10px] font-black uppercase tracking-tighter">Regras</p>
          </Link>
        )}
        <button onClick={toggleTheme} className="flex flex-col items-center gap-1 text-white/50 hover:text-white/80 transition-all">
          {theme === 'light' ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
          <p className="text-[10px] font-black uppercase tracking-tighter">Tema</p>
        </button>
        <Link href="/perfil" className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'perfil' ? 'text-white scale-110' : 'text-white/50 hover:text-white/80'}`}>
          <PromotoraAvatar 
            logoUrl={profile?.avatarUrl || profile?.photoUrl} 
            name={profile?.name || 'U'} 
            className={`size-8 border-2 shadow-sm transition-all ${activeTab === 'perfil' ? 'border-white' : 'border-white/20'}`} 
          />
          <p className="text-[10px] font-black uppercase tracking-tighter">Perfil</p>
        </Link>
        <button onClick={() => logout()} className="flex flex-col items-center gap-1 text-red-400 hover:text-red-300 transition-all">
          <LogOut className="w-6 h-6" />
          <p className="text-[10px] font-black uppercase tracking-tighter">Sair</p>
        </button>
      </div>
    </nav>
  );
}
