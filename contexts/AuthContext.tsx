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
  const [inactivityTimeLeft, setInactivityTimeLeft] = useState(30 * 60);
  const router = useRouter();
  const pathname = usePathname();

  // Reset timer on page navigation
  useEffect(() => {
    if (user) {
      setInactivityTimeLeft(30 * 60);
    }
  }, [pathname, user]);

  useEffect(() => {
    console.log("AuthContext: Inicializando monitoramento de autenticação");
    
    // Timeout de segurança para evitar que o app fique preso no "Carregando"
    const timeoutId = setTimeout(() => {
      console.warn("AuthContext: Timeout de segurança atingido. Forçando isAuthReady.");
      setIsAuthReady(true);
    }, 15000); // Aumentado para 15s pois o Firebase pode ser lento em conexões instáveis

    let unsubscribeProfile: () => void;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("AuthContext: Estado de autenticação alterado:", firebaseUser?.email || "Nenhum usuário");
      clearTimeout(timeoutId); 
      
      setUser(firebaseUser);
      setIsPending(false);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        console.log("AuthContext: Buscando perfil do usuário no Firestore...");
        unsubscribeProfile = onSnapshot(userRef, async (userDoc) => {
          if (userDoc.exists()) {
            let data = userDoc.data() as UserProfile;
            console.log("AuthContext: Perfil carregado:", data.role, "| Status:", data.status);
            
            // Garantir que administradores principais estejam sempre ativos
            const isFirstAdmin = 
              firebaseUser.email === 'alexandrelyra@msn.com' || 
              firebaseUser.email === 'alexlyra@gmail.com' || 
              firebaseUser.email === 'alexandrelyra@gmail.com' ||
              firebaseUser.uid === 'AoFpOZClDnM3n5bTj3Ul32qvLIw2' ||
              firebaseUser.uid === '9L0530rP40Sj4fx2xtnXs63Bkqz2';
            
            let updatedData = { ...data };
            
            if (isFirstAdmin && (updatedData.status !== 'active' || updatedData.role !== 'admin')) {
              console.log("AuthContext: Atualizando perfil de administrador principal...");
              updatedData = { ...updatedData, status: 'active', role: 'admin' };
              try {
                await setDoc(userRef, { 
                  status: 'active', 
                  role: 'admin',
                  updatedAt: serverTimestamp() 
                }, { merge: true });
              } catch (error) {
                console.error("AuthContext: Erro ao atualizar admin", error);
              }
            }

            setProfile(updatedData);
            setIsPending(updatedData.status !== 'active');
            setIsAuthReady(true); // Garantir que está pronto após carregar perfil
          } else {
            console.log("AuthContext: Perfil não encontrado, criando novo perfil...");
            const isFirstAdmin = 
              firebaseUser.email === 'alexandrelyra@msn.com' || 
              firebaseUser.email === 'alexlyra@gmail.com' || 
              firebaseUser.email === 'alexandrelyra@gmail.com' ||
              firebaseUser.uid === 'AoFpOZClDnM3n5bTj3Ul32qvLIw2' ||
              firebaseUser.uid === '9L0530rP40Sj4fx2xtnXs63Bkqz2';
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
              setProfile(newProfile);
              setIsPending(newProfile.status !== 'active');
              setIsAuthReady(true);
            }
          }
        }, (error: any) => {
          console.error("AuthContext: Erro no onSnapshot do perfil", error);
          // Fallback para evitar travamento
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'Usuário',
            role: 'corretor',
            status: 'active',
            createdAt: serverTimestamp(),
          });
          setIsAuthReady(true);
        });
      } else {
        setProfile(null);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeProfile) unsubscribeProfile();
      clearTimeout(timeoutId);
    };
  }, []);

  // Inactivity Timeout (30 minutes)
  useEffect(() => {
    if (!user) {
      setInactivityTimeLeft(30 * 60);
      return;
    }

    let inactivityInterval: NodeJS.Timeout;
    const TIMEOUT_SECONDS = 30 * 60;

    const resetTimer = () => {
      setInactivityTimeLeft(TIMEOUT_SECONDS);
    };

    inactivityInterval = setInterval(async () => {
      setInactivityTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(inactivityInterval);
          console.log("AuthContext: User inactive for 30 minutes. Logging out.");
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
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error("Error signing in:", error);
      throw error;
    }
  };

  const register = async (email: string, pass: string, name: string, phone?: string) => {
    try {
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
      console.error("Error registering:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
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
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
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
