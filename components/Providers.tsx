'use client';

import { RuleProvider } from '@/contexts/RuleContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { useEffect, useState } from 'react';
import { getBrandingSettings } from '@/lib/data-service';
import { safeLocalStorageSet } from '@/lib/utils';
import { db } from '@/firebase';
import { doc, getDocFromServer } from 'firebase/firestore';

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
    
    const fetchBranding = async () => {
      const CACHE_KEY = `branding_${profile.uid}`;
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_EXPIRY) {
            setBranding(prev => ({ ...prev, ...data }));
            return;
          }
        } catch (e) {}
      }

      try {
        // Determine which ID to use for branding
        // Admin sees global branding ('admin')
        // Promotora sees their own branding (profile.uid)
        // Vendedor and Corretor see their Promotora's branding
        let brandingId = profile.uid;
        if (profile.role === 'admin') {
          brandingId = 'admin';
        } else if (profile.role === 'vendedor' || profile.role === 'corretor') {
          brandingId = profile.promotoraId || profile.createdBy || 'admin';
        }
        
        console.log(`BrandingWrapper: Fetching branding for ${profile.role} using ID: ${brandingId}`);
        let data = await getBrandingSettings(brandingId);
        
        // Fallback to admin branding if specific branding not found
        if (!data && brandingId !== 'admin') {
          console.log("BrandingWrapper: Specific branding not found, falling back to admin");
          data = await getBrandingSettings('admin');
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
      } catch (error: any) {
        console.error("BrandingWrapper: Error fetching branding:", error);
        if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
          // Try to use expired cache if available
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            try {
              const { data } = JSON.parse(cached);
              setBranding(prev => ({ ...prev, ...data }));
            } catch (e) {}
          }
        }
      }
    };

    fetchBranding();
  }, [profile]);

  const primaryDark = darkenColor(branding.primaryColor, 30);
  const sidebarBg = adjustSidebarColor(branding.primaryColor);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        :root { 
          --primary: ${branding.primaryColor}; 
          --primary-dark: ${primaryDark};
          --sidebar-bg: ${sidebarBg};
        }
      ` }} />
      {children}
    </>
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
              {children}
            </BrandingWrapper>
          </RuleProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
