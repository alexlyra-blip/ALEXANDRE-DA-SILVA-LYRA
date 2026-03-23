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
}

export interface SpecificInstallmentRule {
  bank: string;
  installments: number;
}

export interface BankRule {
  id: string;
  name: string;
  convenio: 'INSS' | 'SIAPE';
  minAge: number;
  maxAge: number;
  nonAcceptedBanks: string[];
  specificInstallmentRules?: SpecificInstallmentRule[];
  acceptsIlliterate: boolean;
  acceptsLOAS: boolean;
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
}

export interface PromotoraPriorities {
  [bankId: string]: number;
}

export interface GeneralRule {
  id: string;
  banco: string;
  parcelasAceitas: number;
}

interface RuleContextType {
  banks: BankRule[];
  generalRules: GeneralRule[];
  promotoraPriorities: PromotoraPriorities;
  isLoaded: boolean;
  addBank: (bank: Omit<BankRule, 'id'>) => Promise<void>;
  updateBank: (id: string, bank: Partial<BankRule>) => Promise<void>;
  addGeneralRule: (rule: Omit<GeneralRule, 'id'>) => Promise<void>;
  updateGeneralRule: (id: string, rule: Partial<GeneralRule>) => Promise<void>;
  deleteBank: (id: string) => Promise<void>;
  deleteGeneralRule: (id: string) => Promise<void>;
  updatePromotoraPriority: (bankId: string, priority: number) => Promise<void>;
}

const RuleContext = createContext<RuleContextType | undefined>(undefined);

import { getBankRules, getGeneralRules, saveBankRule, deleteBankRule, saveGeneralRule, deleteGeneralRule } from '@/lib/data-service';

export function RuleProvider({ children }: { children: React.ReactNode }) {
  const [banks, setBanks] = useState<BankRule[]>([]);
  const [generalRules, setGeneralRules] = useState<GeneralRule[]>([]);
  const [promotoraPriorities, setPromotoraPriorities] = useState<PromotoraPriorities>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const { user, profile, setQuotaExceeded } = useAuth();

  useEffect(() => {
    const resetRules = () => {
      setBanks([]);
      setGeneralRules([]);
      setPromotoraPriorities({});
      setIsLoaded(false);
    };

    if (!user) {
      resetRules();
      return;
    }

    const fetchRules = async () => {
      const CACHE_KEY_BANKS = 'rules_banks';
      const CACHE_KEY_GENERAL = 'rules_general';
      const CACHE_EXPIRY = 12 * 60 * 60 * 1000; // 12 hours

      // Try to load from cache first
      const cachedBanks = localStorage.getItem(CACHE_KEY_BANKS);
      const cachedGeneral = localStorage.getItem(CACHE_KEY_GENERAL);

      if (cachedBanks && cachedGeneral) {
        try {
          const { data: banksData, timestamp: banksTime } = JSON.parse(cachedBanks);
          const { data: generalData, timestamp: generalTime } = JSON.parse(cachedGeneral);
          
          if (Date.now() - banksTime < CACHE_EXPIRY && Date.now() - generalTime < CACHE_EXPIRY) {
            console.log("RuleContext: Using cached rules");
            setBanks(banksData);
            setGeneralRules(generalData);
            setIsLoaded(true);
          }
        } catch (e) {
          console.error("RuleContext: Error parsing cached rules", e);
        }
      }

      // Setup real-time listeners
      const unsubscribeBanks = onSnapshot(collection(db, 'bankRules'), (snapshot) => {
        const banksData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as BankRule);
        setBanks(banksData);
        localStorage.setItem(CACHE_KEY_BANKS, JSON.stringify({
          data: banksData,
          timestamp: Date.now()
        }));
        setIsLoaded(true);
      }, (error) => {
        console.error("Error fetching bank rules:", error);
      });

      const unsubscribeGeneral = onSnapshot(collection(db, 'generalRules'), (snapshot) => {
        const generalData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as GeneralRule);
        setGeneralRules(generalData);
        localStorage.setItem(CACHE_KEY_GENERAL, JSON.stringify({
          data: generalData,
          timestamp: Date.now()
        }));
        setIsLoaded(true);
      }, (error) => {
        console.error("Error fetching general rules:", error);
      });

      // Fetch promotora priorities
      let unsubscribePriorities: (() => void) | undefined;
      if (profile) {
        const promotoraId = profile.role === 'admin' ? 'admin' : (profile.role === 'promotora' ? profile.uid : profile.createdBy);
        if (promotoraId) {
          unsubscribePriorities = onSnapshot(doc(db, 'settings', promotoraId), (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              setPromotoraPriorities(data.bankPriorities || {});
            }
          });
        }
      }

      return () => {
        unsubscribeBanks();
        unsubscribeGeneral();
        if (unsubscribePriorities) unsubscribePriorities();
      };
    };

    const unsubscribe = fetchRules();
    return () => {
      unsubscribe.then(unsub => unsub && unsub());
    };
  }, [user, profile, setQuotaExceeded]);

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

  const addBank = async (bank: Omit<BankRule, 'id'>) => {
    try {
      await saveBankRule(bank);
    } catch (error) {
      console.error("Error adding bank rule:", error);
      throw error;
    }
  };

  const updateBank = async (id: string, bankUpdate: Partial<BankRule>) => {
    try {
      await saveBankRule({ id, ...bankUpdate });
    } catch (error) {
      console.error("Error updating bank rule:", error);
      throw error;
    }
  };

  const addGeneralRule = async (rule: Omit<GeneralRule, 'id'>) => {
    try {
      await saveGeneralRule(rule);
    } catch (error) {
      console.error("Error adding general rule:", error);
      throw error;
    }
  };

  const updateGeneralRule = async (id: string, ruleUpdate: Partial<GeneralRule>) => {
    try {
      await saveGeneralRule({ id, ...ruleUpdate });
    } catch (error) {
      console.error("Error updating general rule:", error);
      throw error;
    }
  };

  const deleteBank = async (id: string) => {
    try {
      await deleteBankRule(id);
    } catch (error) {
      console.error("Error deleting bank rule:", error);
      throw error;
    }
  };

  const deleteGeneralRule = async (id: string) => {
    try {
      await deleteGeneralRule(id);
    } catch (error) {
      console.error("Error deleting general rule:", error);
      throw error;
    }
  };

  return (
    <RuleContext.Provider value={{ 
      banks, 
      generalRules, 
      promotoraPriorities,
      isLoaded,
      addBank, 
      updateBank, 
      addGeneralRule, 
      updateGeneralRule, 
      deleteBank, 
      deleteGeneralRule,
      updatePromotoraPriority
    }}>
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
