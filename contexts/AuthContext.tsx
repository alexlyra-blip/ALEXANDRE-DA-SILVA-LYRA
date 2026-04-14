'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, updateEmail, updatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { useRouter } from 'next/navigation';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    console.log("AuthContext: Initializing onAuthStateChanged");
    
    // Safety timeout to ensure the app doesn't stay stuck on "Carregando"
    const timeoutId = setTimeout(() => {
      setIsAuthReady(true);
    }, 3000);

    let unsubscribeProfile: () => void;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeoutId); // Clear timeout if auth state resolves
      console.log("AuthContext: onAuthStateChanged fired", firebaseUser?.email);
      setUser(firebaseUser);
      setIsPending(false);
      setIsAuthReady(true); // Set immediately so UI can progress
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        unsubscribeProfile = onSnapshot(userRef, async (userDoc) => {
          if (userDoc.exists()) {
            let data = userDoc.data() as UserProfile;
            console.log("AuthContext: Profile updated", data.role, data.status);
            
            // Auto-upgrade first admin if they are stuck
            const isFirstAdmin = firebaseUser.email === 'alexandrelyra@msn.com' || firebaseUser.email === 'alexlyra@gmail.com';
            
            // Check for 3-day trial block
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - createdAt.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            let updatedData = { ...data };
            if (diffDays > 3 && data.status === 'pending' && !isFirstAdmin) {
              console.log("AuthContext: Trial period expired, blocking user...");
              updatedData.status = 'inactive';
              await updateDoc(userRef, { status: 'inactive' });
            }

            if (updatedData.status === 'inactive') {
              setBlockedError("Usuário bloqueado. Entre em contato com o administrador.");
              await signOut(auth);
              setProfile(null);
              setIsAuthReady(true);
              return;
            }

            if (isFirstAdmin && (updatedData.status !== 'active' || updatedData.role !== 'admin')) {
              console.log("AuthContext: Auto-upgrading first admin profile...");
              updatedData = { ...updatedData, status: 'active', role: 'admin' };
              try {
                await setDoc(userRef, { status: 'active', role: 'admin' }, { merge: true });
              } catch (error) {
                console.error("AuthContext: Error auto-upgrading admin", error);
              }
            }

            setProfile(updatedData);
            if (updatedData.status !== 'active') {
              setIsPending(true);
            } else {
              setIsPending(false);
            }
          } else {
            console.log("AuthContext: No profile found, bootstrapping...");
            const isFirstAdmin = firebaseUser.email === 'alexandrelyra@msn.com' || firebaseUser.email === 'alexlyra@gmail.com';
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
              role: isFirstAdmin ? 'admin' : 'corretor',
              status: isFirstAdmin ? 'active' : 'pending',
              createdAt: serverTimestamp(),
            };
            
            try {
              await setDoc(userRef, newProfile);
              setProfile(newProfile);
              if (newProfile.status !== 'active') {
                setIsPending(true);
              } else {
                setIsPending(false);
              }
            } catch (error) {
              console.error("AuthContext: Error creating profile", error);
              // Fallback to local profile if creation fails (e.g. permission denied)
              setProfile(newProfile);
              setIsPending(newProfile.status !== 'active');
            }
          }
          setIsAuthReady(true);
        }, async (error: any) => {
          console.error("AuthContext: Error in onSnapshot", error);
          const isQuotaError = error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded');
          
          if (isQuotaError) {
            setQuotaExceeded(true);
            
            // Try fallback fetch from Supabase/Firestore via data-service
            try {
              const fallbackProfile = await getUserProfile(firebaseUser.uid);
              if (fallbackProfile) {
                console.log("AuthContext: Using fallback profile from DataService");
                setProfile(fallbackProfile);
                setIsPending(fallbackProfile.status !== 'active');
                setIsAuthReady(true);
                return;
              }
            } catch (fallbackErr) {
              console.error("AuthContext: Fallback profile fetch failed", fallbackErr);
            }
          }
          
          // Fallback profile to prevent infinite loading if permission denied or quota exceeded
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || (isQuotaError ? 'Limite de Cota' : 'Erro de Acesso'),
            role: 'corretor',
            status: isQuotaError ? 'active' : 'pending', // Assume active on quota error to let them in
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
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      clearTimeout(timeoutId);
    };
  }, []);

  // Inactivity Timeout (15 minutes)
  useEffect(() => {
    if (!user) return;

    let inactivityTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(async () => {
        console.log("AuthContext: User inactive for 15 minutes. Logging out.");
        await logout();
      }, 15 * 60 * 1000); // 15 minutes
    };

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
      clearTimeout(inactivityTimer);
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
      setBlockedError
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
