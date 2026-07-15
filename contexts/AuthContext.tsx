'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, updateEmail, updatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { getUserProfile } from '@/lib/data-service';

export type UserRole = 'admin' | 'promotora' | 'vendedor' | 'corretor';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  status: 'active' | 'pending' | 'inactive';
  createdAt: any;
  photoUrl?: string;
  avatarUrl?: string;
  createdBy?: string | null;
  promotoraId?: string | null;
  maxUsers?: number;
  expiresAt?: any;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  isAuthReady: boolean;
  isPending: boolean;
  quotaExceeded: boolean;
  setQuotaExceeded: (value: boolean) => void;
  resetQuotaExceeded: () => void;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  updateEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  blockedError: string | null;
  setBlockedError: (error: string | null) => void;
  inactivityTimeLeft: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [inactivityTimeLeft, setInactivityTimeLeft] = useState(15 * 60);
  const router = useRouter();
  const pathname = usePathname();

  // Reset timer on page navigation
  useEffect(() => {
    if (user) {
      setInactivityTimeLeft(15 * 60);
    }
  }, [pathname, user]);

  useEffect(() => {
    console.log("AuthContext: Inicializando monitoramento de autenticação");
    
    // Timeout de segurança para evitar que o app fique preso no "Carregando"
    const timeoutId = setTimeout(() => {
      console.warn("AuthContext: Timeout de segurança atingido. Forçando isAuthReady.");
      setIsAuthReady(true);
    }, 15000); // Aumentado para 15s pois o Firebase pode ser lento em conexões instáveis

    let unsubscribeProfile: (() => void) | undefined;
    let timeoutSnapId: NodeJS.Timeout;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("AuthContext: Estado de autenticação alterado:", firebaseUser?.email || "Nenhum usuário");
      clearTimeout(timeoutId); 
      clearTimeout(timeoutSnapId);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }
      
      if (firebaseUser) {
        // ALWAYS require manual login on fresh page load (not from current active session cache)
        const isSessionActive = typeof window !== 'undefined' && sessionStorage.getItem('isLoggedInThisSession') === 'true';
        if (!isSessionActive) {
          console.log("AuthContext: Cached user detected without active session. Force logging out.");
          setUser(null);
          setProfile(null);
          setIsAuthReady(true);
          signOut(auth);
          return;
        }

        setUser(firebaseUser);
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Handle Session Token generation for simultaneous login check
        let localSessionToken = typeof window !== 'undefined' ? sessionStorage.getItem('userSessionToken') : null;
        if (!localSessionToken) {
          localSessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('userSessionToken', localSessionToken);
          }
          // Update Firestore with the new session ID
          setDoc(userRef, { currentSessionId: localSessionToken }, { merge: true }).catch(console.error);
        }

        const isFirstAdmin = 
          firebaseUser.email === 'alexandrelyra@msn.com' || 
          firebaseUser.email === 'alexlyra@gmail.com' || 
          firebaseUser.email === 'alexandrelyra@gmail.com' ||
          firebaseUser.uid === 'AoFpOZClDnM3n5bTj3Ul32qvLIw2' ||
          firebaseUser.uid === '9L0530rP40Sj4fx2xtnXs63Bkqz2';

        // Tentar buscar perfil imediatamente para rapidez
        try {
          const initDoc = await getDoc(userRef);
          if (initDoc.exists()) {
            const data = initDoc.data() as UserProfile & { currentSessionId?: string };
            
            // Check for simultaneous logins
            if (data.currentSessionId && localSessionToken && data.currentSessionId !== localSessionToken) {
              console.warn("AuthContext: Simultaneous login detected. Force logging out.");
              setBlockedError("Acesso simultâneo detectado. Este usuário foi conectado em outro dispositivo.");
              logout();
              return;
            }

            if (data.status === 'inactive' || data.status === 'bloqueado') {
              console.warn("AuthContext: User is blocked/inactive on init. Force logging out.");
              setBlockedError("Seu acesso foi suspenso. Entre em contato com o administrador.");
              setProfile({ ...data, uid: firebaseUser.uid });
              setIsPending(true);
              setIsAuthReady(true);
              logout();
              return;
            }

            console.log("AuthContext: Perfil carregado inicialmente via getDoc");
            setProfile({ ...data, uid: firebaseUser.uid });
            setIsPending(data.status !== 'active');
            setIsAuthReady(true);
          }
        } catch (e) {
          console.warn("AuthContext: Erro na busca inicial via getDoc, aguardando onSnapshot", e);
        }
        
        // Sempre usar onSnapshot para atualizações em tempo real
        unsubscribeProfile = onSnapshot(userRef, async (userDoc) => {
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile & { currentSessionId?: string };
            console.log("AuthContext: Atualização de perfil via snapshot:", data.role, "| Status:", data.status);
            
            // Check for simultaneous logins
            const currentLocalToken = typeof window !== 'undefined' ? sessionStorage.getItem('userSessionToken') : null;
            if (data.currentSessionId && currentLocalToken && data.currentSessionId !== currentLocalToken) {
              console.warn("AuthContext: Simultaneous login detected. Force logging out.");
              setBlockedError("Acesso simultâneo detectado. Este usuário foi conectado em outro dispositivo.");
              logout();
              return;
            }

            let updatedData = { ...data, uid: firebaseUser.uid };
            
            // Check for account expiration
            if (updatedData.expiresAt && updatedData.role !== 'admin') {
              const expirationDate = updatedData.expiresAt.toDate ? updatedData.expiresAt.toDate() : new Date(updatedData.expiresAt);
              if (expirationDate < new Date()) {
                console.warn("AuthContext: Account expired:", updatedData.email);
                setBlockedError("Seu período de teste expirou. Entre em contato com o administrador.");
                setProfile(updatedData);
                setIsPending(true);
                setIsAuthReady(true);
                logout();
                return;
              } else {
                setBlockedError(null);
              }
            } else {
              setBlockedError(null);
            }

            // Bloquear acesso se estiver inativo/bloqueado
            if (updatedData.status === 'inactive' || updatedData.status === 'bloqueado') {
              console.warn("AuthContext: User is blocked/inactive. Force logging out.");
              setBlockedError("Seu acesso foi suspenso. Entre em contato com o administrador.");
              setProfile(updatedData);
              setIsPending(true);
              setIsAuthReady(true);
              logout();
              return;
            }
            
            // Ativação automática de admin principal
            if (isFirstAdmin && (updatedData.status !== 'active' || updatedData.role !== 'admin')) {
              console.log("AuthContext: Auto-ativando administrador principal...");
              updatedData = { ...updatedData, status: 'active', role: 'admin' };
              try {
                await setDoc(userRef, { 
                  status: 'active', 
                  role: 'admin',
                  updatedAt: serverTimestamp() 
                }, { merge: true });
              } catch (error) {
                console.error("AuthContext: Erro ao auto-ativar admin", error);
              }
            }

            setProfile(updatedData);
            setIsPending(updatedData.status !== 'active');
            setIsAuthReady(true);
          } else {
            console.log("AuthContext: Perfil não encontrado, criando novo...");
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
              photoUrl: firebaseUser.photoURL || '',
              avatarUrl: firebaseUser.photoURL || '',
              role: isFirstAdmin ? 'admin' : 'corretor',
              status: isFirstAdmin ? 'active' : 'pending',
              createdAt: serverTimestamp(),
            };
            
            try {
              await setDoc(userRef, newProfile);
              setProfile(newProfile);
              setIsPending(newProfile.status !== 'active');
              setIsAuthReady(true);
            } catch (error) {
              console.error("AuthContext: Erro ao criar perfil", error);
              // Fallback para não travar o app
              setProfile(newProfile);
              setIsAuthReady(true);
            }
          }
        }, (error: any) => {
          console.error("AuthContext: Erro fatal no profile snapshot", error);
          if (firebaseUser) {
             setProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || 'Usuário',
              role: isFirstAdmin ? 'admin' : 'corretor',
              status: isFirstAdmin ? 'active' : 'pending',
              createdAt: serverTimestamp(),
            });
          }
          setIsAuthReady(true);
        });
      } else {
        setUser(null);
        setProfile(null);
        setIsPending(false);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeProfile) unsubscribeProfile();
      clearTimeout(timeoutId);
      clearTimeout(timeoutSnapId);
    };
  }, []);

  // Inactivity Timeout (15 minutes)
  useEffect(() => {
    if (!user) {
      setInactivityTimeLeft(15 * 60);
      return;
    }

    var inactivityInterval: any = null;
    const TIMEOUT_SECONDS = 15 * 60;

    const resetTimer = () => {
      setInactivityTimeLeft(TIMEOUT_SECONDS);
    };

    inactivityInterval = setInterval(async () => {
      setInactivityTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(inactivityInterval);
          console.log("AuthContext: User inactive for 15 minutes. Logging out.");
          logout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Events to track activity
    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];

    const handleActivity = () => {
      resetTimer();
    };

    // Attach event listeners
    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Initialize timer
    resetTimer();

    return () => {
      clearInterval(inactivityInterval);
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [user]);

  const login = async (email: string, pass: string) => {
    try {
      const { setPersistence, browserSessionPersistence } = await import('firebase/auth');
      await setPersistence(auth, browserSessionPersistence);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('isLoggedInThisSession', 'true');
      }
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('isLoggedInThisSession');
      }
      console.error("Error signing in:", error);
      throw error;
    }
  };

  const register = async (email: string, pass: string, name: string, phone?: string) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('isLoggedInThisSession', 'true');
      }
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, pass);
      
      const isFirstAdmin = email === 'alexandrelyra@msn.com' || email === 'alexlyra@gmail.com';
      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: email,
        name: name,
        phone: phone || '',
        photoUrl: firebaseUser.photoURL || '',
        avatarUrl: firebaseUser.photoURL || '',
        role: isFirstAdmin ? 'admin' : 'corretor',
        status: isFirstAdmin ? 'active' : 'pending',
        createdAt: serverTimestamp(),
      };
      
      await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
      setProfile(newProfile);
    } catch (error) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('isLoggedInThisSession');
      }
      console.error("Error registering:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('isLoggedInThisSession');
        sessionStorage.removeItem('userSessionToken');
      }
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error("Error resetting password:", error);
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    try {
      const { setPersistence, browserSessionPersistence } = await import('firebase/auth');
      await setPersistence(auth, browserSessionPersistence);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('isLoggedInThisSession', 'true');
      }
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('isLoggedInThisSession');
      }
      console.error("Error signing in with Google:", error.code, error.message);
      throw error;
    }
  };

  const updateEmailFunc = async (email: string) => {
    if (!auth.currentUser) throw new Error("No user logged in");
    await updateEmail(auth.currentUser, email);
  };

  const updatePasswordFunc = async (password: string) => {
    if (!auth.currentUser) throw new Error("No user logged in");
    await updatePassword(auth.currentUser, password);
  };

  const resetQuotaExceeded = () => {
    setQuotaExceeded(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      isAuthReady, 
      isPending, 
      quotaExceeded,
      setQuotaExceeded,
      resetQuotaExceeded,
      login, 
      register, 
      logout, 
      resetPassword, 
      loginWithGoogle,
      updateEmail: updateEmailFunc,
      updatePassword: updatePasswordFunc,
      blockedError,
      setBlockedError,
      inactivityTimeLeft
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
