'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Mail, Lock, Eye, ShieldCheck, UserPlus, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PasswordStrength } from '@/components/PasswordStrength';

export default function Cadastro() {
  const { register } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{name?: string, email?: string, password?: string}>({});
  const [isLoading, setIsLoading] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const errors: {name?: string, email?: string, password?: string} = {};
    
    if (!name.trim()) {
      errors.name = "Nome é obrigatório";
    }
    
    if (!email) {
      errors.email = "E-mail é obrigatório";
    } else if (!validateEmail(email)) {
      errors.email = "Formato de e-mail inválido";
    }
    
    if (!password) {
      errors.password = "Senha é obrigatória";
    } else if (password.length < 6) {
      errors.password = "A senha deve ter pelo menos 6 caracteres";
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setErrorMsg(null);
    setIsLoading(true);
    try {
      await register(email, password, name);
      router.push('/dashboard');
    } catch (error: any) {
      console.error("Registration failed", error);
      if (error.code === 'auth/email-already-in-use') {
        setErrorMsg("Este e-mail já está em uso. Tente fazer login ou recupere sua senha.");
      } else if (error.code === 'auth/weak-password') {
        setErrorMsg("A senha deve ter pelo menos 6 caracteres.");
      } else if (error.code === 'auth/network-request-failed') {
        setErrorMsg("Verifique sua conexão com a internet.");
      } else {
        setErrorMsg("Erro ao criar conta. Tente novamente.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen w-full max-w-md mx-auto bg-background overflow-x-hidden shadow-2xl">
      {/* Top App Bar */}
      <div className="flex items-center p-4 pb-2 justify-between">
        <Link href="/" className="text-foreground flex size-12 shrink-0 items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h2 className="text-foreground text-lg font-bold leading-tight tracking-tight flex-1 text-center pr-12">
          Criar Conta
        </h2>
      </div>

      <div className="px-4 pt-8 pb-2">
        <h2 className="text-foreground tracking-tight text-2xl font-bold leading-tight">
          Junte-se a nós
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Crie seu perfil para começar a simular.
        </p>
      </div>

      <form onSubmit={handleRegister} className="px-4 py-6 flex flex-col gap-4">
        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm text-center flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Nome Completo</label>
          <div className="relative">
            <User className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${fieldErrors.name ? 'text-red-500' : 'text-slate-400'}`} />
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors(prev => ({...prev, name: undefined}));
              }}
              placeholder="Seu nome"
              className={`w-full bg-white dark:bg-slate-900 border rounded-xl py-4 pl-12 pr-4 text-foreground focus:outline-none focus:ring-2 transition-all ${
                fieldErrors.name ? 'border-red-500 focus:ring-red-500/50' : 'border-slate-200 dark:border-slate-800 focus:ring-primary/50'
              }`}
            />
          </div>
          {fieldErrors.name && (
            <span className="text-[10px] font-bold text-red-500 ml-1 mt-1 uppercase tracking-widest">{fieldErrors.name}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">E-mail</label>
          <div className="relative">
            <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${fieldErrors.email ? 'text-red-500' : 'text-slate-400'}`} />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                const newEmail = e.target.value;
                setEmail(newEmail);
                if (fieldErrors.email) {
                  if (validateEmail(newEmail)) {
                    setFieldErrors(prev => ({...prev, email: undefined}));
                  } else {
                    setFieldErrors(prev => ({...prev, email: "Formato de e-mail inválido"}));
                  }
                }
              }}
              onBlur={() => {
                if (email && !validateEmail(email)) {
                  setFieldErrors(prev => ({...prev, email: "Formato de e-mail inválido"}));
                }
              }}
              placeholder="seu@email.com"
              className={`w-full bg-white dark:bg-slate-900 border rounded-xl py-4 pl-12 pr-4 text-foreground focus:outline-none focus:ring-2 transition-all ${
                fieldErrors.email ? 'border-red-500 focus:ring-red-500/50' : 'border-slate-200 dark:border-slate-800 focus:ring-primary/50'
              }`}
            />
          </div>
          {fieldErrors.email && (
            <span className="text-[10px] font-bold text-red-500 ml-1 mt-1 uppercase tracking-widest">{fieldErrors.email}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Senha</label>
          <div className="relative">
            <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${fieldErrors.password ? 'text-red-500' : 'text-slate-400'}`} />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors(prev => ({...prev, password: undefined}));
              }}
              placeholder="••••••••"
              className={`w-full bg-white dark:bg-slate-900 border rounded-xl py-4 pl-12 pr-12 text-foreground focus:outline-none focus:ring-2 transition-all ${
                fieldErrors.password ? 'border-red-500 focus:ring-red-500/50' : 'border-slate-200 dark:border-slate-800 focus:ring-primary/50'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <Eye className="w-5 h-5" />
            </button>
          </div>
          {fieldErrors.password && (
            <span className="text-[10px] font-bold text-red-500 ml-1 mt-1 uppercase tracking-widest">{fieldErrors.password}</span>
          )}
          <PasswordStrength password={password} />
        </div>

        <button 
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 mt-4 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {isLoading ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              <span>Cadastrar</span>
              <UserPlus className="w-5 h-5" />
            </>
          )}
        </button>

        <p className="text-center text-sm text-slate-500 mt-4">
          Já tem uma conta? <Link href="/" className="text-primary font-bold hover:underline">Entrar</Link>
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
    </div>
  );
}
