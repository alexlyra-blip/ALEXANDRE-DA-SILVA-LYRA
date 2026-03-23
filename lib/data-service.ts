import { supabase } from './supabase';
import { db } from '@/firebase';
import { doc, getDoc, collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';

export interface BrandingData {
  loginImageUrl: string | null;
  primaryColor: string;
  promoterName: string;
  slug?: string;
}

export const getBrandingSettings = async (id: string = 'admin'): Promise<BrandingData | null> => {
  // Try Supabase first
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', id)
      .single();
    
    if (data && !error) {
      console.log("DataService: Fetched branding from Supabase (ID:", id, ")");
      return {
        loginImageUrl: data.login_image_url || null,
        primaryColor: data.primary_color || '#1152d4',
        promoterName: data.promoter_name || 'Portal do Agente',
        slug: data.slug
      };
    }
  } catch (e) {
    console.warn("DataService: Supabase branding fetch failed (ID:", id, "), falling back to Firestore", e);
  }

  // Fallback to Firestore
  try {
    const snapshot = await getDoc(doc(db, 'settings', id));
    if (snapshot.exists()) {
      const data = snapshot.data();
      return {
        loginImageUrl: data.loginImageUrl || null,
        primaryColor: data.primaryColor || '#1152d4',
        promoterName: data.promoterName || 'Portal do Agente',
        slug: data.slug
      };
    }
  } catch (e) {
    console.error("DataService: Firestore branding fetch failed", e);
    throw e;
  }
  return null;
};

export const getBrandingBySlug = async (slug: string): Promise<BrandingData | null> => {
  // Try Supabase first
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (data && !error) {
      console.log("DataService: Fetched branding from Supabase (Slug:", slug, ")");
      return {
        loginImageUrl: data.login_image_url || null,
        primaryColor: data.primary_color || '#1152d4',
        promoterName: data.promoter_name || 'Portal do Agente',
        slug: data.slug
      };
    }
  } catch (e) {
    console.warn("DataService: Supabase branding fetch failed (Slug:", slug, "), falling back to Firestore", e);
  }

  // Fallback to Firestore
  try {
    const q = query(collection(db, 'settings'), where('slug', '==', slug));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const data = querySnapshot.docs[0].data();
      return {
        loginImageUrl: data.loginImageUrl || null,
        primaryColor: data.primaryColor || '#1152d4',
        promoterName: data.promoterName || 'Portal do Agente',
        slug: data.slug
      };
    }
  } catch (e) {
    console.error("DataService: Firestore branding fetch by slug failed", e);
    throw e;
  }
  return null;
};

export const saveBrandingSettings = async (id: string, branding: BrandingData) => {
  // Try Supabase
  try {
    console.log("DataService: Saving branding to Supabase for ID:", id);
    
    // Create a timeout for Supabase call
    const supabasePromise = supabase
      .from('settings')
      .upsert({ 
        id, 
        slug: branding.slug,
        login_image_url: branding.loginImageUrl,
        primary_color: branding.primaryColor,
        promoter_name: branding.promoterName
      });
      
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout ao salvar no Supabase (15s)")), 15000)
    );

    const result = await Promise.race([supabasePromise, timeoutPromise]) as any;
    const error = result?.error;
    
    if (error) throw error;
    console.log("DataService: Saved branding to Supabase successfully");
  } catch (e: any) {
    if (e?.message !== 'Supabase not configured') {
      console.error("DataService: Error saving branding to Supabase", e);
    }
    // We don't throw here because we still want to save to Firestore
  }

  // Also save to Firestore
  console.log("DataService: Saving branding to Firestore for ID:", id);
  await setDoc(doc(db, 'settings', id), branding, { merge: true });
  console.log("DataService: Saved branding to Firestore successfully");
};

export const getBankRules = async (): Promise<any[]> => {
  // Try Supabase first
  try {
    const { data, error } = await supabase
      .from('bank_rules')
      .select('*');
    
    if (data && !error && data.length > 0) {
      console.log("DataService: Fetched bank rules from Supabase");
      return data.map(item => ({
        ...item,
        // Map snake_case to camelCase if needed, but let's assume we keep it consistent or map it
        // For now, let's assume the user will create columns matching the Firestore fields
        // or we map them here.
        id: item.id
      }));
    }
  } catch (e) {
    console.warn("DataService: Supabase bank rules fetch failed, falling back to Firestore", e);
  }

  // Fallback to Firestore
  const snapshot = await getDocs(collection(db, 'bankRules'));
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
};

export const getGeneralRules = async (): Promise<any[]> => {
  // Try Supabase first
  try {
    const { data, error } = await supabase
      .from('general_rules')
      .select('*');
    
    if (data && !error && data.length > 0) {
      console.log("DataService: Fetched general rules from Supabase");
      return data;
    }
  } catch (e) {
    console.warn("DataService: Supabase general rules fetch failed, falling back to Firestore", e);
  }

  // Fallback to Firestore
  const snapshot = await getDocs(collection(db, 'generalRules'));
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
};

// Write methods
export const saveBankRule = async (rule: any) => {
  const { id, ...data } = rule;
  
  // Try Supabase
  try {
    const { error } = await supabase
      .from('bank_rules')
      .upsert({ id: id || undefined, ...data });
    if (error) throw error;
    console.log("DataService: Saved bank rule to Supabase");
  } catch (e: any) {
    if (e?.message !== 'Supabase not configured') {
      console.error("DataService: Error saving bank rule to Supabase", e);
    }
  }

  // Also save to Firestore for now (dual-write)
  if (id) {
    await updateDoc(doc(db, 'bankRules', id), data);
  } else {
    await addDoc(collection(db, 'bankRules'), data);
  }
};

export const deleteBankRule = async (id: string) => {
  // Try Supabase
  try {
    await supabase.from('bank_rules').delete().eq('id', id);
  } catch (e) {}

  // Firestore
  await deleteDoc(doc(db, 'bankRules', id));
};

export const saveGeneralRule = async (rule: any) => {
  const { id, ...data } = rule;
  
  // Try Supabase
  try {
    await supabase
      .from('general_rules')
      .upsert({ id: id || undefined, ...data });
  } catch (e) {}

  // Firestore
  if (id) {
    await updateDoc(doc(db, 'generalRules', id), data);
  } else {
    await addDoc(collection(db, 'generalRules'), data);
  }
};

export const deleteGeneralRule = async (id: string) => {
  // Try Supabase
  try {
    await supabase.from('general_rules').delete().eq('id', id);
  } catch (e) {}

  // Firestore
  await deleteDoc(doc(db, 'generalRules', id));
};
