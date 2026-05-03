'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Landmark, FileText, Users, Banknote, LogOut, Settings, Sun, Moon, ClipboardList, Clock, Calendar } from 'lucide-react';
import { motion, useAnimation } from 'motion/react';
import { PromotoraAvatar } from './PromotoraAvatar';
import { useTheme } from '@/contexts/ThemeContext';

export default function Sidebar() {
  const { profile, logout, inactivityTimeLeft } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState(new Date());
  const avatarControls = useAnimation();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    // Animação a cada 2 minutos
    const rotationInterval = setInterval(() => {
      avatarControls.start({ 
        rotateY: [0, 720], 
        transition: { duration: 1.5, ease: "easeInOut" }                
      });
    }, 120000); // 120 segundos = 2 minutos
    
    // Trigger initial animation after a short delay
    const initialAnimationTimeout = setTimeout(() => {
      avatarControls.start({ 
        rotateY: [0, 720], 
        transition: { duration: 1.5, ease: "easeInOut" }                
      });
    }, 2000);
    
    return () => {
        clearInterval(timer);
        clearInterval(rotationInterval);
        clearTimeout(initialAnimationTimeout);
    };
  }, [avatarControls]);

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

  // Apenas Admin por enquanto
  if (profile?.role === 'admin') {
    menuItems.push({ name: 'Simulador WhatsApp', icon: FileText, path: '/admin/simulador-whatsapp' });
  }

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-[var(--sidebar-bg)] dark:bg-black text-white h-screen sticky top-0 shadow-2xl z-50 border-r border-white/5 dark:border-white/10 overflow-hidden">
      {/* Decorative elements to match dashboard header pattern */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-secondary/10 rounded-full -ml-12 -mb-12 blur-xl pointer-events-none" />
      
      <div className="p-4 relative z-10">
        <div className="flex flex-col items-center gap-2 mb-4 pt-4 pb-1 px-1 relative">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent -mt-4 pointer-events-none" />
          <motion.div
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative"
          >
            <div className="absolute inset-0 bg-secondary/30 blur-xl rounded-full scale-125 animate-pulse" />
            <motion.div animate={avatarControls} className="relative z-10">
              <PromotoraAvatar 
                logoUrl={profile?.avatarUrl || profile?.photoUrl} 
                name={profile?.name} 
                className="size-24 border-2 border-white/30 shadow-[0_10px_30px_rgba(0,0,0,0.3)] ring-2 ring-white/5" 
              />
            </motion.div>
          </motion.div>
          <div className="text-center w-full px-2 relative z-10">
            <h2 className="font-black text-xl break-words leading-tight tracking-tight text-white mb-1 drop-shadow-md">
              {profile?.name || 'Usuário'}
            </h2>
            <div className="inline-block px-3 py-1 bg-secondary/20 rounded-full border border-secondary/30">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">
                {profile?.role || 'Corretor'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-white/5 rounded-lg p-1 px-1.5">
          <div className="flex items-center gap-1 text-white/60 font-mono text-[9px]">
            <Clock className="w-3 h-3" />
            <span className="font-bold">{formatTime(inactivityTimeLeft)}</span>
            <span className="text-[7px] font-black tracking-tight text-white/40 uppercase ml-0.5">DESLOGAR</span>
          </div>
          <div className="flex items-center gap-1 pl-1 border-l border-white/10 ml-1">
            <button 
              onClick={() => logout()}
              title="Sair do Sistema"
              className="flex items-center justify-center size-6 bg-red-500 text-white rounded-md transition-all shadow-lg shadow-red-500/20 hover:scale-110 active:scale-95"
            >
              <LogOut className="w-2.5 h-2.5" />
            </button>
            <span className="text-[9px] font-black tracking-widest text-secondary uppercase">SAIR</span>
          </div>
        </div>

        <div className="mt-2 px-2 py-1 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40">
            <Calendar className="w-3 h-3" />
            <span>{currentTime.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40">
            <Clock className="w-3 h-3" />
            <span>{currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        
        <div className="h-px bg-white/10 w-full my-3 opacity-30" />

        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link 
                key={item.path} 
                href={item.path} 
                className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all group relative ${
                  isActive 
                    ? 'bg-white text-primary shadow-lg shadow-black/5 font-bold' 
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

      <div className="mt-auto p-4 space-y-1">
        <button 
          onClick={toggleTheme}
          className="flex items-center gap-2.5 p-2.5 rounded-xl w-full text-left hover:bg-white/10 dark:hover:bg-input text-white/80 transition-all"
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
          className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all ${
            pathname === '/perfil' 
              ? 'bg-white text-primary font-bold' 
              : 'hover:bg-white/10 dark:hover:bg-input text-white/80'
          }`}
        >
          <Settings className="w-5 h-5 opacity-60" />
          <span className="text-sm">Configurações</span>
        </Link>
      </div>
    </aside>
  );
}
