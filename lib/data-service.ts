import { supabase } from './supabase';
import { db, auth } from '@/firebase';
import { safeStringify } from '@/lib/utils';
import { doc, getDoc, collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, setDoc, orderBy, limit, or, serverTimestamp, startAfter, onSnapshot } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', safeStringify(errInfo));
  throw new Error(safeStringify(errInfo));
}

export interface BrandingData {
  loginImageUrl: string | null;
  primaryColor: string;
  promoterName: string;
  slug?: string;
}

export const getUserProfile = async (uid: string): Promise<any | null> => {
  // Try Supabase first
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('uid', uid)
      .single();
    
    if (data && !error) {
      console.log("DataService: Fetched user profile from Supabase");
      return data;
    }
  } catch (e) {
    console.warn("DataService: Supabase user profile fetch failed, falling back to Firestore", e);
  }

  // Fallback to Firestore
  try {
    const snapshot = await getDoc(doc(db, 'users', uid));
    if (snapshot.exists()) {
      return { ...snapshot.data(), uid: snapshot.id };
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, 'users/' + uid);
  }
  return null;
};

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
    handleFirestoreError(e, OperationType.GET, 'settings/' + id);
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
    console.log("DataService: Querying Firestore for slug:", slug);
    const q = query(collection(db, 'settings'), where('slug', '==', slug));
    const querySnapshot = await getDocs(q);
    console.log("DataService: Query result size:", querySnapshot.size);
    if (!querySnapshot.empty) {
      const data = querySnapshot.docs[0].data();
      console.log("DataService: Found branding data for slug:", slug, data);
      return {
        loginImageUrl: data.loginImageUrl || null,
        primaryColor: data.primaryColor || '#1152d4',
        promoterName: data.promoterName || 'Portal do Agente',
        slug: data.slug
      };
    } else {
      console.log("DataService: No branding found for slug:", slug);
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

export const getSimulations = async (profile: any, startTimestamp: any, limitCount: number = 100): Promise<any[]> => {
  // Try Supabase first
  try {
    let query = supabase
      .from('simulations')
      .select('*')
      .gte('created_at', startTimestamp.toDate().toISOString())
      .order('created_at', { ascending: false })
      .limit(limitCount);
    
    if (profile.role === 'promotora') {
      query = query.eq('promotora_id', profile.uid);
    } else if (profile.role !== 'admin') {
      query = query.eq('user_id', profile.uid);
    }

    const { data, error } = await query;
    
    if (data && !error && data.length > 0) {
      console.log("DataService: Fetched simulations from Supabase");
      return data.map(item => ({
        ...item,
        id: item.id,
        createdAt: item.created_at,
        timestamp: new Date(item.created_at).getTime()
      }));
    }
  } catch (e) {
    console.warn("DataService: Supabase simulations fetch failed, falling back to Firestore", e);
  }

  // Fallback to Firestore
  try {
    let q;
    if (profile.role === 'admin') {
      q = query(
        collection(db, 'simulations'), 
        limit(limitCount)
      );
    } else if (profile.role === 'promotora') {
      // Use promotoraId or createdBy for backward compatibility
      q = query(
        collection(db, 'simulations'), 
        where('promotoraId', '==', profile.uid),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, 'simulations'), 
        where('userId', '==', profile.uid),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
        timestamp: data.timestamp || (data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().getTime() : null)
      };
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'simulations');
  }
  return [];
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
  try {
    const snapshot = await getDocs(collection(db, 'bankRules'));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'bankRules');
  }
  return [];
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
  try {
    const snapshot = await getDocs(collection(db, 'generalRules'));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'generalRules');
  }
  return [];
};

export const getUsersWithFilters = async (
  profile: any, 
  limitCount: number = 20, 
  startDate?: Date, 
  endDate?: Date,
  lastVisible?: any
): Promise<{ users: any[], lastVisible: any }> => {
  // Fallback to Firestore
  try {
    const q = collection(db, 'users');
    const constraints = [];

    if (profile.role !== 'admin') {
      constraints.push(or(
        where('promotoraId', '==', profile.uid),
        where('createdBy', '==', profile.uid)
      ));
    }

    if (startDate) {
      constraints.push(where('createdAt', '>=', startDate));
    }
    if (endDate) {
      constraints.push(where('createdAt', '<=', endDate));
    }

    constraints.push(orderBy('createdAt', 'desc'));
    
    if (lastVisible) {
      constraints.push(startAfter(lastVisible));
    }
    
    constraints.push(limit(limitCount));

    const qRef = query(q, ...constraints);

    const snapshot = await getDocs(qRef);
    const lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
    
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return { users, lastVisible: lastVisibleDoc };
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'users');
  }
  return { users: [], lastVisible: null };
};

// Write methods
export const saveBankRule = async (rule: any) => {
  const { id, ...data } = rule;
  const now = Date.now();
  const dataWithTimestamp = { ...data, updatedAt: now };
  
  // Try Supabase
  try {
    const { error } = await supabase
      .from('bank_rules')
      .upsert({ id: id || undefined, ...dataWithTimestamp });
    if (error) throw error;
    console.log("DataService: Saved bank rule to Supabase");
  } catch (e: any) {
    if (e?.message !== 'Supabase not configured') {
      console.error("DataService: Error saving bank rule to Supabase", e);
    }
  }

  // Also save to Firestore for now (dual-write)
  if (id) {
    await updateDoc(doc(db, 'bankRules', id), dataWithTimestamp);
  } else {
    await addDoc(collection(db, 'bankRules'), dataWithTimestamp);
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

// Proposal methods
export const getProposals = async (profile: any, limitCount: number = 100, useOrderBy: boolean = true): Promise<any[]> => {
  try {
    let q;
    if (profile.role === 'admin') {
      q = useOrderBy
        ? query(collection(db, 'proposals'), orderBy('createdAt', 'desc'), limit(limitCount))
        : query(collection(db, 'proposals'), limit(limitCount));
    } else if (profile.role === 'promotora') {
      q = useOrderBy
        ? query(collection(db, 'proposals'), where('promotoraId', '==', profile.uid), orderBy('createdAt', 'desc'), limit(limitCount))
        : query(collection(db, 'proposals'), where('promotoraId', '==', profile.uid), limit(limitCount));
    } else {
      q = useOrderBy
        ? query(collection(db, 'proposals'), where('userId', '==', profile.uid), orderBy('createdAt', 'desc'), limit(limitCount))
        : query(collection(db, 'proposals'), where('userId', '==', profile.uid), limit(limitCount));
    }

    const snapshot = await getDocs(q);
    const results = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
        updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt) : null,
        cipSentDate: data.cipSentDate ? (data.cipSentDate.toDate ? data.cipSentDate.toDate().toISOString() : data.cipSentDate) : null,
        expectedReturnDate: data.expectedReturnDate ? (data.expectedReturnDate.toDate ? data.expectedReturnDate.toDate().toISOString() : data.expectedReturnDate) : null,
        // Make sure we have a number to sort by
        _time: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().getTime() : 0) : 0
      };
    });

    results.sort((a, b) => b._time - a._time);
    
    // remove _time to keep data clean
    return results.map(({ _time, ...rest }) => rest);
  } catch (e: any) {
    if (useOrderBy && e.message && e.message.includes('index')) {
      console.log('Falling back to proposals query without orderBy due to missing index');
      return getProposals(profile, limitCount, false);
    }
    handleFirestoreError(e, OperationType.LIST, 'proposals');
  }
  return [];
};

export const saveProposal = async (proposal: any) => {
  const { id, ...data } = proposal;
  
  if (id) {
    // Logic for updating linked Refinancing proposals
    if (data.loanType === 'PORTABILIDADE') {
      try {
        const q = query(
          collection(db, 'proposals'), 
          where('parentId', '==', id),
          where('isLinkedRefin', '==', true)
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const refinDoc = snapshot.docs[0];
          let newRefinStatus = null;

          // Transições automáticas baseadas no status da Portabilidade
          if (data.status === 'PENDENTE') {
            newRefinStatus = 'PENDENTE';
          } else if (data.status === 'ANDAMENTO') {
            newRefinStatus = 'AGUARDA PORTABILIDADE';
          } else if (data.status === 'AGUARDA AVERBAÇÃO PORT') {
            newRefinStatus = 'AGUARDA AVERBAÇÃO PORT';
          }
          
          // Transição final: Portabilidade finalizada (status interno ou status pago)
          if (data.portabilityStatus === 'PORTABILIDADE FINALIZADA' || data.status === 'PAGO') {
            newRefinStatus = 'AG AVERBAÇÃO';
          }

          if (newRefinStatus && newRefinStatus !== refinDoc.data().status) {
            console.log(`DataService: Syncing linked Refin ${refinDoc.id} to status ${newRefinStatus}`);
            await updateDoc(doc(db, 'proposals', refinDoc.id), {
              status: newRefinStatus,
              updatedAt: serverTimestamp()
            });
          }
        }
      } catch (e) {
        console.error("Error updating linked Refin proposal:", e);
      }
    }

    await updateDoc(doc(db, 'proposals', id), {
      ...data,
      updatedAt: serverTimestamp()
    });
    return id;
  } else {
    // Creating a new proposal
    const docRef = await addDoc(collection(db, 'proposals'), {
      ...data,
      isLinkedRefin: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // If it's a new Portabilidade and user chose to link refin, auto-create it
    const shouldCreateLinkedRefin = data.loanType === 'PORTABILIDADE' && (data.shouldCreateRefin === true || data.shouldCreateRefin === 'true');
    
    if (shouldCreateLinkedRefin) {
      try {
        await addDoc(collection(db, 'proposals'), {
          ...data,
          loanType: 'REFINANCIAMENTO',
          isLinkedRefin: true,
          parentId: docRef.id,
          // Se a portabilidade nasce PENDENTE, o refin também nasce PENDENTE
          // Se já nasce em ANDAMENTO, o refin nasce AGUARDA PORTABILIDADE
          status: data.status === 'PENDENTE' ? 'PENDENTE' : 'AGUARDA PORTABILIDADE',
          createdAt: new Date(Date.now() - 1000), 
          updatedAt: serverTimestamp(),
          // Don't copy portability specific fields to the refin
          cipSentDate: null,
          cipReturnDate: null,
          cipReturnTimestamp: null,
          expectedReturnDate: null,
          portabilityStatus: null,
          shouldCreateRefin: false 
        });
      } catch (e) {
        console.error("Error auto-creating linked Refin proposal:", e);
      }
    }

    return docRef.id;
  }
};

export const deleteProposal = async (id: string) => {
  await deleteDoc(doc(db, 'proposals', id));
};
