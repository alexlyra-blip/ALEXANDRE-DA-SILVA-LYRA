'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, Shield, Camera, Key, Bell, ChevronRight, User } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { useState, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { PromotoraAvatar } from '@/components/PromotoraAvatar';

type TabType = 'conta' | 'preferencias' | 'seguranca';

export default function Perfil() {
  const { profile, logout, resetPassword } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('conta');
  const [resetMessage, setResetMessage] = useState({ type: '', text: '' });

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        
        // Update in Firestore
        const userRef = doc(db, 'users', profile.uid);
        await updateDoc(userRef, {
          photoUrl: base64String
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading photo:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!profile?.email) return;
    try {
      await resetPassword(profile.email);
      setResetMessage({ type: 'success', text: 'E-mail de redefinição enviado!' });
    } catch (error) {
      setResetMessage({ type: 'error', text: 'Erro ao enviar e-mail.' });
    }
    setTimeout(() => setResetMessage({ type: '', text: '' }), 4000);
  };

  if (!profile) return null;

  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans pb-24">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 px-6 pt-8 pb-6 rounded-b-3xl shadow-sm border-b border-slate-200 dark:border-slate-800 relative">
        <Link href="/dashboard" className="absolute top-8 left-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        
        <div className="flex flex-col items-center mt-2">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 shadow-md overflow-hidden bg-slate-100 dark:bg-slate-800">
              <PromotoraAvatar 
                logoUrl={profile.avatarUrl || profile.photoUrl} 
                name={profile.name} 
                className="w-full h-full text-3xl"
              />
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute bottom-0 right-0 p-2 bg-primary text-white rounded-full shadow-lg hover:bg-primary/90 transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
          <h2 className="mt-4 text-xl font-bold">{profile.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{profile.email}</p>
          <div className="mt-2 px-3 py-1 bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider rounded-full">
            {profile.role}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 mt-6">
        <div className="flex p-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl">
          <button 
            onClick={() => setActiveTab('conta')} 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${activeTab === 'conta' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Conta
          </button>
          <button 
            onClick={() => setActiveTab('preferencias')} 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${activeTab === 'preferencias' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Ajustes
          </button>
          <button 
            onClick={() => setActiveTab('seguranca')} 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${activeTab === 'seguranca' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Segurança
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-6 mt-6">
        {activeTab === 'conta' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome Completo</label>
                <p className="font-medium mt-1 text-slate-800 dark:text-slate-200">{profile.name}</p>
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-800" />
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-mail</label>
                <p className="font-medium mt-1 text-slate-800 dark:text-slate-200">{profile.email}</p>
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-800" />
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Função</label>
                <p className="font-medium mt-1 text-slate-800 dark:text-slate-200 capitalize">{profile.role}</p>
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-800" />
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</label>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${profile.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  <p className="font-medium text-slate-800 dark:text-slate-200 capitalize">{profile.status === 'active' ? 'Ativo' : 'Pendente'}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preferencias' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              {(profile.role === 'admin' || profile.role === 'promotora') && (
                <Link href="/admin/usuarios" className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Gerenciar Usuários</h4>
                      <p className="text-xs text-slate-500">Configurações e acessos</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300" />
                </Link>
              )}
              <div className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-not-allowed opacity-70">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Notificações</h4>
                    <p className="text-xs text-slate-500">Em breve</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'seguranca' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {resetMessage.text && (
              <div className={`p-3 rounded-xl text-sm font-medium text-center ${resetMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                {resetMessage.text}
              </div>
            )}
            
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <button 
                onClick={handleResetPassword} 
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Redefinir Senha</h4>
                    <p className="text-xs text-slate-500">Enviaremos um link por e-mail</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300" />
              </button>
              
              <button 
                onClick={handleLogout} 
                className="w-full flex items-center justify-between p-4 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400 group-hover:bg-red-200 dark:group-hover:bg-red-500/30 transition-colors">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-red-600 dark:text-red-400">Sair da Conta</h4>
                    <p className="text-xs text-red-500/70 dark:text-red-400/70">Encerrar sessão atual</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}
      </main>

      <BottomNav activeTab="perfil" />
    </div>
  );
}
