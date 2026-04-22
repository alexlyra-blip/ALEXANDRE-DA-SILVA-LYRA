'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Landmark, FileText, Users, Banknote, LogOut, Settings, Sun, Moon, ClipboardList, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { PromotoraAvatar } from './PromotoraAvatar';
import { useTheme } from '@/contexts/ThemeContext';

export default function Sidebar() {
  const { profile, logout, inactivityTimeLeft } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  
  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Nova Simulação', icon: FileText, path: '/simulacao/nova' },
    { name: 'Card de Ofertas', icon: Banknote, path: '/simulacao/recomendacoes' },
    { name: 'Propostas', icon: ClipboardList, path: '/propostas' },
  ];

  // Admin and Promotora menus
  if (profile?.role === 'admin' || profile?.role === 'promotora') {
    menuItems.push({ name: 'Regras e Bancos', icon: Landmark, path: '/regras/banco' });
    menuItems.push({ name: 'Usuários', icon: Users, path: '/admin/usuarios' });
  }

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-[var(--sidebar-bg)] dark:bg-black text-white h-screen sticky top-0 shadow-2xl z-50 border-r border-white/5 dark:border-white/10 overflow-hidden">
      {/* Decorative elements to match dashboard header pattern */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-secondary/10 rounded-full -ml-12 -mb-12 blur-xl pointer-events-none" />
      
      <div className="p-8 relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            style={{ perspective: 1000 }}
          >
            <motion.div
              animate={{ rotateY: [0, 360, 360] }}
              transition={{ duration: 120, repeat: Infinity, times: [0, 0.008, 1], ease: "easeInOut" }}
            >
              <PromotoraAvatar 
                logoUrl={profile?.avatarUrl || profile?.photoUrl} 
                name={profile?.name} 
                className="size-14 border-2 border-white/30 shadow-xl" 
              />
            </motion.div>
          </motion.div>
          <div className="overflow-hidden">
            <p className="font-black text-sm truncate leading-tight">{profile?.name || 'Usuário'}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mt-1">{profile?.role || 'Corretor'}</p>
            <div className="flex items-center gap-1.5 text-white/40 mt-1 font-mono text-[11px]">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-bold">{formatTime(inactivityTimeLeft)}</span>
            </div>
          </div>
        </div>
        
        <div className="h-px bg-white/10 w-full mb-8" />

        <nav className="space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link 
                key={item.path} 
                href={item.path} 
                className={`flex items-center gap-3 p-4 rounded-2xl transition-all group relative ${
                  isActive 
                    ? 'bg-white text-primary shadow-xl shadow-black/10 font-bold' 
                    : 'hover:bg-white/10 dark:hover:bg-input text-white/80 hover:text-white'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-white/60 group-hover:text-white'}`} />
                <span className="text-sm">{item.name}</span>
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute left-0 w-1 h-6 bg-secondary rounded-r-full"
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-8 space-y-2">
        <button 
          onClick={toggleTheme}
          className="flex items-center gap-3 p-4 rounded-2xl w-full text-left hover:bg-white/10 dark:hover:bg-input text-white/80 transition-all"
        >
          {theme === 'light' ? (
            <>
              <Moon className="w-5 h-5 opacity-60" />
              <span className="text-sm">Modo Escuro</span>
            </>
          ) : (
            <>
              <Sun className="w-5 h-5 opacity-60" />
              <span className="text-sm">Modo Claro</span>
            </>
          )}
        </button>
        <Link 
          href="/perfil" 
          className={`flex items-center gap-3 p-4 rounded-2xl transition-all ${
            pathname === '/perfil' 
              ? 'bg-white text-primary font-bold' 
              : 'hover:bg-white/10 dark:hover:bg-input text-white/80'
          }`}
        >
          <Settings className="w-5 h-5 opacity-60" />
          <span className="text-sm">Configurações</span>
        </Link>
        <button 
          onClick={() => logout()}
          className="flex items-center gap-3 p-4 rounded-2xl w-full text-left hover:bg-red-600 hover:text-white text-white/80 transition-all"
        >
          <LogOut className="w-5 h-5 opacity-60 group-hover:opacity-100" />
          <span className="text-sm">Sair</span>
        </button>
      </div>
    </aside>
  );
}
