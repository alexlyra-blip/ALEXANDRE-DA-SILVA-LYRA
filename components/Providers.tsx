'use client';

import { RuleProvider } from '@/contexts/RuleContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';

function BrandingWrapper({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [primaryColor, setPrimaryColor] = useState('#1152d4');

  useEffect(() => {
    if (!profile) {
      setPrimaryColor('#1152d4');
      return;
    }
    
    let promotoraId = profile.role === 'admin' ? 'admin' : (profile.role === 'promotora' ? profile.uid : profile.createdBy);
    
    if (!promotoraId) {
      setPrimaryColor('#1152d4');
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'settings', promotoraId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.primaryColor) {
          setPrimaryColor(data.primaryColor);
        } else {
          setPrimaryColor('#1152d4');
        }
      } else {
        setPrimaryColor('#1152d4');
      }
    }, (error: any) => {
      console.error("BrandingWrapper: Error fetching branding:", error);
      // On quota error, just keep the default color
      setPrimaryColor('#1152d4');
    });
    return () => unsubscribe();
  }, [profile]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `:root { --color-primary: ${primaryColor}; }` }} />
      {children}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RuleProvider>
        <BrandingWrapper>
          {children}
        </BrandingWrapper>
      </RuleProvider>
    </AuthProvider>
  );
}
