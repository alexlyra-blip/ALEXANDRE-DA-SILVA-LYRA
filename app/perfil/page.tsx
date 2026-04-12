'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, Shield, Camera, Key, Bell, ChevronRight, Loader2, Palette } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { useState, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { PromotoraAvatar } from '@/components/PromotoraAvatar';
import { uploadFileWithTimeout, deleteFile } from '@/lib/storage-service';
import { getAuth } from 'firebase/auth';
import { safeStringify } from '@/lib/utils';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const auth = getAuth();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', safeStringify(errInfo));
  throw new Error(safeStringify(errInfo));
}

type TabType = 'conta' | 'preferencias' | 'seguranca';

export default function Perfil() {
  const { profile, logout, resetPassword, updateEmail, updatePassword } = useAuth();
  const { showToast, hideToast } = useToast();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState(profile?.email || '');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState(profile?.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('conta');
  const [resetMessage, setResetMessage] = useState({ type: '', text: '' });

  const formatPhone = (value: string) => {
    if (!value) return '';
    value = value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    if (value.length <= 2) {
      return value.length > 0 ? `(${value}` : '';
    } else if (value.length <= 7) {
      return `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else {
      return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    }
  };

  const handleUpdatePhone = async () => {
    if (!profile) return;
    
    const rawPhone = newPhone.replace(/\D/g, '');
    if (rawPhone && rawPhone.length !== 11) {
      showToast("O telefone deve ter 11 dígitos.", "error");
      return;
    }

    try {
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, { phone: newPhone });
      showToast("Telefone atualizado com sucesso!", "success");
      setIsEditingPhone(false);
    } catch (error: any) {
      console.error("Error updating phone:", error);
      showToast(`Erro ao atualizar telefone: ${error.message}`, "error");
    }
  };

  const handleUpdateEmail = async () => {
    if (!profile || !newEmail || newEmail === profile.email) {
      setIsEditingEmail(false);
      return;
    }

    try {
      await updateEmail(newEmail);
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, { email: newEmail });
      showToast("E-mail atualizado com sucesso!", "success");
      setIsEditingEmail(false);
    } catch (error: any) {
      console.error("Error updating email:", error);
      showToast(`Erro ao atualizar e-mail: ${error.message}`, "error");
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showToast("A senha deve ter pelo menos 6 caracteres.", "error");
      return;
    }

    try {
      await updatePassword(newPassword);
      showToast("Senha atualizada com sucesso!", "success");
      setNewPassword('');
    } catch (error: any) {
      console.error("Error updating password:", error);
      showToast(`Erro ao atualizar senha: ${error.message}`, "error");
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Validate file size (max 1MB for profile avatar)
    if (file.size > 1024 * 1024) {
      showToast("A imagem deve ter no máximo 1MB.", "error");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    const loadingToastId = showToast("Enviando foto...", "loading", 0);
    try {
      // Delete old photo if exists to save space
      const oldPhotoUrl = profile.avatarUrl || profile.photoUrl;
      if (oldPhotoUrl && oldPhotoUrl.includes('firebasestorage')) {
        try {
          await deleteFile(oldPhotoUrl);
        } catch (e) {
          console.warn("Could not delete old photo, continuing with upload", e);
        }
      }

      const fileExt = file.name.split('.').pop() || 'png';
      const storagePath = `avatars/${profile.uid}.${fileExt}`;
      
      const downloadURL = await uploadFileWithTimeout(storagePath, file, {
        timeoutMs: 60000,
        onProgress: (progress) => {
          setUploadProgress(progress);
        }
      });
      
      // Update in Firestore
      const userRef = doc(db, 'users', profile.uid);
      try {
        await updateDoc(userRef, {
          avatarUrl: downloadURL,
          photoUrl: downloadURL
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
      }
      
      showToast("Foto de perfil atualizada com sucesso!", "success");
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      showToast(`Erro ao atualizar foto: ${error.message}`, "error");
    } finally {
      setIsUploading(false);
      hideToast(loadingToastId);
    }
  };

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetPassword = async () => {
    if (!profile?.email) return;
    setIsResetting(true);
    try {
      await resetPassword(profile.email);
      setResetMessage({ type: 'success', text: 'E-mail de redefinição enviado com sucesso!' });
      setIsResetModalOpen(true);
    } catch (error) {
      setResetMessage({ type: 'error', text: 'Erro ao enviar e-mail de redefinição.' });
      setIsResetModalOpen(true);
    } finally {
      setIsResetting(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="flex flex-col min-h-screen w-full md:max-w-none mx-auto max-w-md bg-background text-slate-900 dark:text-slate-100 font-sans pb-24 md:pb-0">
      {/* Header */}
      <header className="bg-primary dark:bg-black text-white px-6 pt-8 pb-10 rounded-b-[40px] shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        
        <Link href="/dashboard" className="absolute top-8 left-6 text-white/70 hover:text-white transition-colors z-10">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        
        <div className="flex flex-col items-center mt-4 relative z-10">
          <div className="relative">
            <div className="w-28 h-28 rounded-full border-4 border-white/30 shadow-2xl overflow-hidden bg-white/10 relative backdrop-blur-sm">
              <PromotoraAvatar 
                logoUrl={profile.avatarUrl || profile.photoUrl} 
                name={profile.name} 
                className="w-full h-full text-4xl"
              />
              {isUploading && (
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                  <span className="text-[10px] text-white font-bold mt-1">{uploadProgress}%</span>
                </div>
              )}
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute bottom-1 right-1 p-2.5 bg-white text-primary rounded-full shadow-xl hover:scale-110 transition-transform disabled:opacity-50 flex items-center gap-1"
            >
              <Camera className="w-4 h-4" />
              <span className="text-[10px] font-bold">Editar</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight">{profile.name}</h2>
          <p className="text-white/70 font-medium">{profile.email}</p>
          <div className="mt-3 px-4 py-1.5 bg-white/20 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest rounded-full border border-white/20">
            {profile.role}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 mt-6">
        <div className="flex p-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl">
          <button 
            onClick={() => setActiveTab('conta')} 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${activeTab === 'conta' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-black/70 hover:text-black dark:text-slate-200 dark:hover:text-white'}`}
          >
            Conta
          </button>
          <button 
            onClick={() => setActiveTab('preferencias')} 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${activeTab === 'preferencias' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-black/70 hover:text-black dark:text-slate-200 dark:hover:text-white'}`}
          >
            Ajustes
          </button>
          <button 
            onClick={() => setActiveTab('seguranca')} 
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${activeTab === 'seguranca' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-black/70 hover:text-black dark:text-slate-200 dark:hover:text-white'}`}
          >
            Segurança
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-6 mt-6">
        {activeTab === 'conta' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white dark:bg-surface-dark p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome Completo</label>
                <p className="font-medium mt-1 text-slate-800 dark:text-slate-200">{profile.name}</p>
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-800" />
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-mail</label>
                {isEditingEmail ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                    />
                    <button onClick={handleUpdateEmail} className="text-xs font-bold text-primary hover:text-primary/80">Salvar</button>
                    <button onClick={() => setIsEditingEmail(false)} className="text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between mt-1">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{profile.email}</p>
                    <button onClick={() => setIsEditingEmail(true)} className="text-xs font-bold text-primary hover:text-primary/80">Editar</button>
                  </div>
                )}
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-800" />
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Telefone</label>
                {isEditingPhone ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                      className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                    />
                    <button onClick={handleUpdatePhone} className="text-xs font-bold text-primary hover:text-primary/80">Salvar</button>
                    <button onClick={() => setIsEditingPhone(false)} className="text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between mt-1">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{profile.phone || 'Não informado'}</p>
                    <button onClick={() => setIsEditingPhone(true)} className="text-xs font-bold text-primary hover:text-primary/80">Editar</button>
                  </div>
                )}
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
            <div className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
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
              {(profile.role === 'admin' || profile.role === 'promotora') && (
                <Link href="/admin/usuarios?personalizar=true" className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Palette className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Personalizar Portal</h4>
                      <p className="text-xs text-slate-500">Cores e identidade visual</p>
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
            {/* Password Reset Modal */}
            {isResetModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                    {resetMessage.type === 'success' ? 'Sucesso!' : 'Atenção'}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    {resetMessage.text}
                  </p>
                  <button 
                    onClick={() => {
                      setIsResetModalOpen(false);
                      setResetMessage({ type: '', text: '' });
                    }}
                    className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-4">
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-4">Alterar Senha</h4>
              <div className="flex flex-col gap-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova senha"
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                />
                <button onClick={handleUpdatePassword} className="py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors">
                  Atualizar Senha
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <button 
                onClick={handleResetPassword} 
                disabled={isResetting}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800 text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    {isResetting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Key className="w-5 h-5" />}
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
