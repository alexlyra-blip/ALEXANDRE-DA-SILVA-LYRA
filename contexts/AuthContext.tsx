'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { useRouter } from 'next/navigation';

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
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
            const isFirstAdmin = firebaseUser.email === 'alexlyra@gmail.com';
            if (isFirstAdmin && (data.status !== 'active' || data.role !== 'admin')) {
              console.log("AuthContext: Auto-upgrading first admin profile...");
              data = { ...data, status: 'active', role: 'admin' };
              try {
                await setDoc(userRef, { status: 'active', role: 'admin' }, { merge: true });
              } catch (error) {
                console.error("AuthContext: Error auto-upgrading admin", error);
              }
            }

            setProfile(data);
            if (data.status !== 'active') {
              setIsPending(true);
            } else {
              setIsPending(false);
            }
          } else {
            console.log("AuthContext: No profile found, bootstrapping...");
            const isFirstAdmin = firebaseUser.email === 'alexlyra@gmail.com';
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
        }, (error: any) => {
          console.error("AuthContext: Error in onSnapshot", error);
          const isQuotaError = error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded');
          
          if (isQuotaError) {
            setQuotaExceeded(true);
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

  const login = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error("Error signing in:", error);
      throw error;
    }
  };

  const register = async (email: string, pass: string, name: string) => {
    try {
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, pass);
      
      const isFirstAdmin = email === 'alexlyra@gmail.com';
      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: email,
        name: name,
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
      loginWithGoogle 
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
