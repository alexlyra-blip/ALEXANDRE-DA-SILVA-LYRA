'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getBrandingSettings } from '@/lib/data-service';
import { safeLocalStorageSet } from '@/lib/utils';
import { db } from '@/firebase';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { RuleProvider } from '@/contexts/RuleContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

interface BrandingContextType {
  primaryColor: string;
  loginImageUrl: string;
  promoterName: string;
}

const BrandingContext = createContext<BrandingContextType>({
  primaryColor: '#1152d4',
  loginImageUrl: '',
  promoterName: ''
});

export const useBranding = () => useContext(BrandingContext);

function ConnectionTester() {
  useEffect(() => {
    async function testConnection() {
      try {
        // Test connection to Firestore
        await getDocFromServer(doc(db, 'settings', 'admin'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firestore Connection Error: The client is offline. Please check your Firebase configuration.");
        }
        // Skip logging for other errors, as this is simply a connection test.
      }
    }
    testConnection();
  }, []);

  return null;
}

function LoginThemeReset() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  
  useEffect(() => {
    if (user) {
      // Prioritize light mode upon login session start
      const prioritized = sessionStorage.getItem('login_theme_prioritized');
      if (!prioritized) {
        console.log("LoginThemeReset: Prioritizing light mode for new session");
        setTheme('light');
        sessionStorage.setItem('login_theme_prioritized', 'true');
      }
    } else {
      // Clear flag when user is null (logout)
      sessionStorage.removeItem('login_theme_prioritized');
    }
  }, [user, setTheme]);

  return null;
}

function darkenColor(hex: string, percent: number) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) - amt;
  const G = (num >> 8 & 0x00FF) - amt;
  const B = (num & 0x0000FF) - amt;
  return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
}

function adjustSidebarColor(hex: string) {
  // Brightness -40% (0.6) and Contrast +40% (1.4)
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);

  // Apply brightness -40%
  r *= 0.6;
  g *= 0.6;
  b *= 0.6;

  // Apply contrast +40%
  const factor = 1.4;
  r = (factor * (r - 128)) + 128;
  g = (factor * (g - 128)) + 128;
  b = (factor * (b - 128)) + 128;

  // Clamp
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function BrandingWrapper({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [branding, setBranding] = useState({
    primaryColor: '#1152d4',
    loginImageUrl: '',
    promoterName: ''
  });

  useEffect(() => {
    if (!profile) {
      setBranding({ primaryColor: '#1152d4', loginImageUrl: '', promoterName: '' });
      return;
    }
    
    const CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour
    
    let brandingId = profile.uid;
    if (profile.role === 'admin') {
      brandingId = 'admin';
    }
    
    const CACHE_KEY = `branding_${brandingId}`;
    
    // Try to load from cache first for immediate display
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_EXPIRY) {
          setBranding(prev => ({ ...prev, ...data }));
        }
      } catch (e) {}
    }

    console.log(`BrandingWrapper: Listening for branding for ${profile.role} using ID: ${brandingId}`);

    const settingsRef = doc(db, 'settings', brandingId);
    let isUnmounted = false;
    let unsubscribe: (() => void) | undefined;
    
    const timeoutId = setTimeout(() => {
      if (isUnmounted) return;
      unsubscribe = onSnapshot(settingsRef, async (snapshot) => {
        if (isUnmounted) return;
        let data: any = null;
        
        if (snapshot.exists()) {
          data = snapshot.data();
        } else if (brandingId !== 'admin') {
          // Fallback to creator's branding or admin if specific branding not found
          console.log("BrandingWrapper: Specific branding not found, checking fallbacks");
          try {
            let fallbackData = null;
            
            // If user is corretor/vendedor, try their creator's branding first
            if (profile.role === 'vendedor' || profile.role === 'corretor') {
              const creatorId = profile.promotoraId || profile.createdBy;
              if (creatorId && creatorId !== 'admin') {
                fallbackData = await getBrandingSettings(creatorId);
              }
            }
            
            // If still no data, fallback to admin
            if (!fallbackData) {
              fallbackData = await getBrandingSettings('admin');
            }
            
            if (fallbackData) data = fallbackData;
          } catch (e) {
            console.error("Failed to fetch fallback branding", e);
          }
        }

        if (data) {
          const newBranding = {
            primaryColor: data.primaryColor || '#1152d4',
            loginImageUrl: data.loginImageUrl || '',
            promoterName: data.promoterName || ''
          };
          setBranding(newBranding);
          safeLocalStorageSet(CACHE_KEY, JSON.stringify({
            data: newBranding,
            timestamp: Date.now()
          }));
        } else {
          setBranding({ primaryColor: '#1152d4', loginImageUrl: '', promoterName: '' });
        }
      }, (error) => {
        console.error("BrandingWrapper: Error listening to branding:", error);
      });
    }, 100);

    return () => {
      isUnmounted = true;
      clearTimeout(timeoutId);
      if (unsubscribe) unsubscribe();
    };
  }, [profile]);

  const primaryDark = darkenColor(branding.primaryColor, 30);
  const sidebarBg = adjustSidebarColor(branding.primaryColor);

  return (
    <BrandingContext.Provider value={branding}>
      <style dangerouslySetInnerHTML={{ __html: `
        :root { 
          --primary: ${branding.primaryColor}; 
          --primary-dark: ${primaryDark};
          --sidebar-bg: ${sidebarBg};
        }
      ` }} />
      {children}
    </BrandingContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <RuleProvider>
            <BrandingWrapper>
              <ConnectionTester />
              <LoginThemeReset />
              {children}
            </BrandingWrapper>
          </RuleProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
