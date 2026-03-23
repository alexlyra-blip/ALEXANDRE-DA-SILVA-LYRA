'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Landmark, User, Lock, Eye, LogIn, Palette, ShieldCheck } from 'lucide-react';
import { QuotaAlert } from '@/components/QuotaAlert';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';

import { getBrandingSettings } from '@/lib/data-service';

export default function Login() {
  const { user, login, isAuthReady, resetPassword, loginWithGoogle, setQuotaExceeded } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isLoadingBranding, setIsLoadingBranding] = useState(true);
  const [branding, setBranding] = useState({
    loginImageUrl: null as string | null,
    primaryColor: '#1152d4',
    promoterName: 'Portabilidade PRO'
  });

  useEffect(() => {
    const fetchBranding = async () => {
      const CACHE_KEY = 'branding_admin';
      const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

      // Try to load from cache first for immediate display
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_EXPIRY) {
            console.log("Login: Using cached branding settings");
            setBranding(data);
            setIsLoadingBranding(false);
            // We still fetch in the background to ensure we have the latest
          }
        } catch (e) {
          console.error("Login: Error parsing cached branding", e);
        }
      }

      try {
        console.log("Login: Fetching global branding settings via DataService...");
        const data = await getBrandingSettings('admin');
        if (data) {
          const brandingData = {
            loginImageUrl: data.loginImageUrl || null,
            primaryColor: data.primaryColor || '#1152d4',
            promoterName: data.promoterName || 'Portal do Agente'
          };
          console.log("Login: Branding settings loaded:", brandingData);
          setBranding(brandingData);
          
          // Update cache
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: brandingData,
            timestamp: Date.now()
          }));
        } else {
          console.log("Login: No global branding settings found, using defaults.");
        }
      } catch (error: any) {
        console.error("Login: Error fetching branding settings:", error);
        if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
          setQuotaExceeded(true);
          // If we have a cache (even if expired), use it on quota error
          if (cached) {
            try {
              const { data } = JSON.parse(cached);
              setBranding(data);
            } catch (e) {}
          }
        }
      } finally {
        setIsLoadingBranding(false);
      }
    };

    fetchBranding();
  }, [setQuotaExceeded]);

  useEffect(() => {
    console.log("Login: isAuthReady:", isAuthReady, "user:", user?.email);
    if (isAuthReady && user) {
      console.log("Login: Redirecting to dashboard...");
      router.push('/dashboard');
    }
  }, [user, isAuthReady, router]);

  // Fallback for isAuthReady
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isAuthReady) {
        console.warn("Login: isAuthReady fallback triggered");
        // We don't have access to setIsAuthReady here as it's in context
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [isAuthReady]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Login: handleLogin triggered", email);
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !password) {
      setErrorMsg("Por favor, preencha todos os campos.");
      return;
    }
    if (!emailRegex.test(email)) {
      setErrorMsg("Por favor, insira um e-mail válido.");
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);
    try {
      console.log("Login: Attempting login...");
      await login(email, password);
      console.log("Login: Login successful");
    } catch (error: any) {
      console.error("Login: Login failed", error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setErrorMsg("E-mail ou senha incorretos.");
      } else if (error.code === 'auth/operation-not-allowed') {
        setErrorMsg("O login com e-mail e senha não está ativado.");
      } else {
        setErrorMsg("Erro ao fazer login. Verifique sua conexão.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setErrorMsg("Por favor, insira seu e-mail no campo acima para recuperar a senha.");
      return;
    }
    if (!emailRegex.test(email)) {
      setErrorMsg("Por favor, insira um e-mail válido para recuperar a senha.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsResetting(true);
    try {
      await resetPassword(email);
      setSuccessMsg("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (error: any) {
      console.error("Reset password failed", error);
      if (error.code === 'auth/user-not-found') {
        setErrorMsg("Nenhuma conta encontrada com este e-mail.");
      } else {
        setErrorMsg("Erro ao enviar e-mail de recuperação. Tente novamente.");
      }
    } finally {
      setIsResetting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      await loginWithGoogle();
      // Redirection is handled by the useEffect watching `user`
    } catch (error: any) {
      console.error("Google login failed", error);
      setErrorMsg("Erro ao fazer login com o Google. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 text-sm animate-pulse">Verificando acesso...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark overflow-x-hidden shadow-2xl">
      {/* Top App Bar */}
      <div className="flex items-center p-4 pb-2 justify-between">
        <div className="text-slate-900 dark:text-slate-100 flex size-12 shrink-0 items-center justify-center cursor-pointer">
          <ArrowLeft className="w-6 h-6" />
        </div>
        <h2 className="text-slate-900 dark:text-slate-100 text-lg font-bold leading-tight tracking-tight flex-1 text-center pr-12">
          {branding.promoterName}
        </h2>
      </div>

      {/* Hero / Brand Section */}
      <div className="w-full relative overflow-hidden bg-slate-900 aspect-[2/1]">
        {/* Branding Image */}
        {!isLoadingBranding ? (
          <Image 
            src={branding.loginImageUrl || "https://i.imgur.com/YcC89G7.jpeg"} 
            alt="Portabilidade PRO" 
            fill
            priority
            className="object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full bg-slate-800 animate-pulse flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
        )}

        {/* Decorative elements to match the "network" feel */}
        <div className="absolute top-4 right-4 w-24 h-24 border border-white/10 rounded-full animate-pulse"></div>
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-primary/20 blur-3xl rounded-full"></div>
      </div>

      {/* Welcome Text */}
      <div className="px-4 pt-4 pb-2">
        <QuotaAlert />
        <h2 className="text-slate-900 dark:text-slate-100 tracking-tight text-2xl font-bold leading-tight">
          Bem-vindo de volta
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Acesse o motor de simulação de portabilidade.
        </p>
      </div>

      {/* Login Form */}
      <form onSubmit={handleLogin} className="px-4 py-4 flex flex-col gap-4">
        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm text-center flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-600 dark:text-emerald-400 text-sm text-center">
            {successMsg}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">E-mail</label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-4 pl-12 pr-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center ml-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Senha</label>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={isResetting}
              className="text-xs font-semibold hover:underline disabled:opacity-50"
              style={{ color: branding.primaryColor }}
            >
              {isResetting ? 'Enviando...' : 'Esqueceu a senha?'}
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-4 pl-12 pr-12 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <Eye className="w-5 h-5" />
            </button>
          </div>
        </div>

        <button 
          type="submit"
          disabled={isLoading}
          style={{ backgroundColor: branding.primaryColor, color: 'white' }}
          className="w-full hover:opacity-90 font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 mt-4 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {isLoading ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              <span>{isAuthReady ? 'Entrar' : 'Carregando...'}</span>
              <LogIn className="w-5 h-5" />
            </>
          )}
        </button>

        <div className="relative flex items-center py-2">
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          <span className="flex-shrink-0 mx-4 text-slate-400 text-xs">OU</span>
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold py-4 rounded-xl shadow-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Entrar com Google</span>
        </button>

        <p className="text-center text-sm text-slate-500 mt-2">
          Não tem uma conta? <Link href="/cadastro" className="font-bold hover:underline" style={{ color: branding.primaryColor }}>Cadastrar-se</Link>
        </p>
      </form>

      <div className="px-4 mt-auto mb-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center w-full gap-4">
            <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1"></div>
            <span className="text-slate-400 text-xs font-medium uppercase tracking-widest">
              SEGURANÇA VERIFICADA
            </span>
            <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1"></div>
          </div>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Criptografia de ponta a ponta</span>
          </div>
        </div>
      </div>

      {/* Bottom Tab Indicator (Mobile Aesthetic) */}
      <div className="flex justify-center pb-2">
        <div className="w-32 h-1 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
      </div>
    </div>
  );
}
