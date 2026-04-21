'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, setDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from './AuthContext';

export interface Tabela {
  nome: string;
  coeficiente: number;
  minTicket?: number;
  taxaTabela?: number;
  taxaDiferencial?: number;
  ajusteTaxaPonderada?: number;
  useMinTicket?: boolean;
  useTaxaPonderada?: boolean;
  prazoRefinPort?: number;
}

export interface SpecificInstallmentRule {
  bank: string;
  installments: number;
}

export interface BankRule {
  id: string;
  name: string;
  convenio: 'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS' | 'CLT PRIVADO';
  minAge: number;
  maxAge: number;
  nonAcceptedBanks: string[];
  specificInstallmentRules?: SpecificInstallmentRule[];
  acceptsIlliterate: boolean;
  acceptsLOAS: boolean;
  accepts60Mais: boolean;
  acceptsInvalidez?: boolean;
  invalidezAgeYears: number;
  acceptsOver60Invalidez: boolean;
  minBenefitTimeYears: number;
  minBenefitTimeMonths: number;
  tabelas: Tabela[];
  minInstallmentValue?: number;
  minBalance?: number;
  portabilityRate?: number;
  refinRate?: number;
  minTroco?: number;
  sumBalanceAndTroco?: boolean;
  logoUrl?: string;
  taxaPortabilidadeOrigem?: number;
  ajusteTaxa?: number;
  novaTaxaReferencia?: number;
  minPaidInstallments?: number;
  priority?: number; // Default priority
  isActive?: boolean;
  subConvenio?: string;
  requireTrocoMaiorQue5PorcentoEndividamento?: boolean;
  excludedBenefits?: string[];
}

export interface PromotoraPriorities {
  [bankId: string]: number;
}

export interface PromotoraInstallments {
  [bankId: string]: number;
}

export interface GeneralRule {
  id: string;
  banco: string;
  parcelasAceitas: number;
  priority?: number;
}

interface RuleContextType {
  banks: BankRule[];
  generalRules: GeneralRule[];
  promotoraPriorities: PromotoraPriorities;
  promotoraInstallments: PromotoraInstallments;
  isLoaded: boolean;
  addBank: (bank: Omit<BankRule, 'id'>) => Promise<void>;
  updateBank: (id: string, bank: Partial<BankRule>) => Promise<void>;
  addGeneralRule: (rule: Omit<GeneralRule, 'id'>) => Promise<void>;
  updateGeneralRule: (id: string, rule: Partial<GeneralRule>) => Promise<void>;
  deleteBank: (id: string) => Promise<void>;
  deleteGeneralRule: (id: string) => Promise<void>;
  updatePromotoraPriority: (bankId: string, priority: number) => Promise<void>;
  updatePromotoraInstallment: (bankId: string, installments: number) => Promise<void>;
}

const RuleContext = createContext<RuleContextType | undefined>(undefined);

import { getBankRules, getGeneralRules, saveBankRule, deleteBankRule, saveGeneralRule, deleteGeneralRule } from '@/lib/data-service';
import { safeLocalStorageSet } from '@/lib/utils';

export function RuleProvider({ children }: { children: React.ReactNode }) {
  const [banks, setBanks] = useState<BankRule[]>([]);
  const [generalRules, setGeneralRules] = useState<GeneralRule[]>([]);
  const [promotoraPriorities, setPromotoraPriorities] = useState<PromotoraPriorities>({});
  const [promotoraInstallments, setPromotoraInstallments] = useState<PromotoraInstallments>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const { user, profile, setQuotaExceeded } = useAuth();

  useEffect(() => {
    const resetRules = () => {
      setBanks([]);
      setGeneralRules([]);
      setPromotoraPriorities({});
      setPromotoraInstallments({});
      setIsLoaded(false);
    };

    if (!user) {
      resetRules();
      return;
    }

    const fetchRules = async () => {
      // Clear cache to force fresh fetch
      localStorage.removeItem('rules_banks');
      localStorage.removeItem('rules_general');

      // Fetch rules function
      const fetchFromFirestore = () => {
        const banksQuery = query(collection(db, 'bankRules'));
        const unsubscribeBanks = onSnapshot(banksQuery, (snapshot) => {
          const banksData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as BankRule));
          
          // Aggressive deduplication
          const seenKeys = new Map<string, BankRule>();
          banksData.forEach(bank => {
            const key = `${bank.name}-${bank.convenio}-${bank.subConvenio || ''}`.toUpperCase();
            const existing = seenKeys.get(key);
            if (!existing || ((bank as any).updatedAt || 0) > ((existing as any).updatedAt || 0) || (!(bank as any).updatedAt && !(existing as any).updatedAt && bank.id.localeCompare(existing.id) > 0)) {
              seenKeys.set(key, bank);
            }
          });

          const uniqueBanks = Array.from(seenKeys.values());
          setBanks(uniqueBanks);
          safeLocalStorageSet('rules_banks', JSON.stringify({
            data: uniqueBanks,
            timestamp: Date.now()
          }));
          setIsLoaded(true);
        }, (error) => {
          console.error("RuleContext: Error fetching banks:", error);
          if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
            setQuotaExceeded(true);
          }
        });

        const generalQuery = query(collection(db, 'generalRules'));
        const unsubscribeGeneral = onSnapshot(generalQuery, (snapshot) => {
          const generalData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as GeneralRule));
          setGeneralRules(generalData);
          safeLocalStorageSet('rules_general', JSON.stringify({
            data: generalData,
            timestamp: Date.now()
          }));
        }, (error) => {
          console.error("RuleContext: Error fetching general rules:", error);
        });

        // FETCH SCOPED SETTINGS
        const promotoraId = profile?.role === 'admin' ? 'admin' : (profile?.role === 'promotora' ? profile?.uid : profile?.createdBy);
        let unsubscribeSettings = () => {};
        
        if (promotoraId) {
          unsubscribeSettings = onSnapshot(doc(db, 'settings', promotoraId), (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data.bankPriorities) setPromotoraPriorities(data.bankPriorities);
              if (data.bankInstallments) setPromotoraInstallments(data.bankInstallments);
            }
          });
        }

        return () => {
          unsubscribeBanks();
          unsubscribeGeneral();
          unsubscribeSettings();
        };
      };

      const unsubscribe = fetchFromFirestore();
      return unsubscribe;
    };

    const unsubscribePromise = fetchRules();
    
    return () => {
      unsubscribePromise.then(unsubscribe => {
        if (unsubscribe) unsubscribe();
      });
    };
  }, [user, profile?.uid, profile?.role, profile?.createdBy, setQuotaExceeded]);

  const updatePromotoraPriority = async (bankId: string, priority: number) => {
    if (!profile) return;
    const promotoraId = profile.role === 'admin' ? 'admin' : (profile.role === 'promotora' ? profile.uid : profile.createdBy);
    if (!promotoraId) return;

    try {
      const newPriorities = { ...promotoraPriorities, [bankId]: priority };
      await setDoc(doc(db, 'settings', promotoraId), {
        bankPriorities: newPriorities
      }, { merge: true });
      setPromotoraPriorities(newPriorities);
    } catch (error) {
      console.error("Error updating promotora priority:", error);
      throw error;
    }
  };

  const updatePromotoraInstallment = async (bankId: string, installments: number) => {
    if (!profile) return;
    const promotoraId = profile.role === 'admin' ? 'admin' : (profile.role === 'promotora' ? profile.uid : profile.createdBy);
    if (!promotoraId) return;

    try {
      const newInstallments = { ...promotoraInstallments, [bankId]: installments };
      await setDoc(doc(db, 'settings', promotoraId), {
        bankInstallments: newInstallments
      }, { merge: true });
      setPromotoraInstallments(newInstallments);
    } catch (error) {
      console.error("Error updating promotora installment:", error);
      throw error;
    }
  };

  const addBank = async (bank: Omit<BankRule, 'id'>) => {
    try {
      await saveBankRule(bank);
      localStorage.removeItem('rules_banks');
    } catch (error) {
      console.error("Error adding bank rule:", error);
      throw error;
    }
  };

  const updateBank = async (id: string, bankUpdate: Partial<BankRule>) => {
    try {
      await saveBankRule({ id, ...bankUpdate });
      localStorage.removeItem('rules_banks');
    } catch (error) {
      console.error("Error updating bank rule:", error);
      throw error;
    }
  };

  const addGeneralRule = async (rule: Omit<GeneralRule, 'id'>) => {
    try {
      await saveGeneralRule(rule);
      localStorage.removeItem('rules_general');
    } catch (error) {
      console.error("Error adding general rule:", error);
      throw error;
    }
  };

  const updateGeneralRule = async (id: string, ruleUpdate: Partial<GeneralRule>) => {
    try {
      await saveGeneralRule({ id, ...ruleUpdate });
      localStorage.removeItem('rules_general');
    } catch (error) {
      console.error("Error updating general rule:", error);
      throw error;
    }
  };

  const deleteBank = async (id: string) => {
    try {
      await deleteBankRule(id);
      localStorage.removeItem('rules_banks');
    } catch (error) {
      console.error("Error deleting bank rule:", error);
      throw error;
    }
  };

  const deleteGeneralRule = async (id: string) => {
    try {
      await deleteGeneralRule(id);
      localStorage.removeItem('rules_general');
    } catch (error) {
      console.error("Error deleting general rule:", error);
      throw error;
    }
  };

  const value = React.useMemo(() => ({ 
    banks, 
    generalRules, 
    promotoraPriorities,
    promotoraInstallments,
    isLoaded,
    addBank, 
    updateBank, 
    addGeneralRule, 
    updateGeneralRule, 
    deleteBank, 
    deleteGeneralRule,
    updatePromotoraPriority,
    updatePromotoraInstallment
  }), [
    banks, 
    generalRules, 
    promotoraPriorities, 
    promotoraInstallments, 
    isLoaded
  ]);

  return (
    <RuleContext.Provider value={value}>
      {children}
    </RuleContext.Provider>
  );
}

export function useRules() {
  const context = useContext(RuleContext);
  if (context === undefined) {
    throw new Error('useRules must be used within a RuleProvider');
  }
  return context;
}
