import { db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { calculateOffers, SimulationParams, calculateRate } from './simulation-engine';

export interface SimulationInput {
  valorParcela: number;
  saldoDevedor: number;
  idade: number;
  convenio: 'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS';
  subConvenio?: string;
  parcelasPagas: number;
  parcelasRestantes: number;
  codigoBeneficio: string;
  dataConcessao?: string;
  isAnalfabeto: boolean;
  isCliente60Mais: boolean | null;
  bancoAtual: string;
  taxaJurosMensal?: number;
}

export interface Offer {
  id: string;
  name: string;
  logo: string;
  tabela: string;
  valorContrato: number;
  valorTroco: number;
  saldoDevedor: number;
  novaTaxaPortabilidade: number;
  taxaPonderada: number;
  taxaBase: number;
  originalRateCalculated: number;
  ajusteTaxaPonderada: number;
  priority: number;
  rules: string[];
  convenio: string;
  subConvenio?: string;
  tabelasCount: number;
  prazoRefinPort?: number;
}

export async function runSimulation(input: SimulationInput): Promise<Offer[]> {
  // Fetch banks and general rules from Firestore
  const banksSnapshot = await getDocs(collection(db, 'bankRules'));
  const banks = banksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  const generalRulesSnapshot = await getDocs(collection(db, 'generalRules'));
  const generalRules = generalRulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  // Fetch admin settings for priorities, installments, and non-portable banks
  const settingsSnapshot = await getDocs(collection(db, 'settings'));
  const adminSettings = settingsSnapshot.docs.find(d => d.id === 'admin')?.data() || {};
  const nonPortableBanks = adminSettings.nonPortableBanks || [];
  const pp = adminSettings.bankPriorities || {};
  const pi = adminSettings.bankInstallments || {};

  let tJurosMensal = input.taxaJurosMensal;
  if (!tJurosMensal && input.saldoDevedor > 0 && input.valorParcela > 0 && input.parcelasRestantes > 0) {
    tJurosMensal = calculateRate(input.saldoDevedor, input.valorParcela, input.parcelasRestantes) * 100;
  }

  // Construct SimulationParams for the core engine
  const params: SimulationParams = {
    idade: input.idade,
    convenio: input.convenio,
    subConvenio: input.subConvenio,
    codigoBeneficio: input.codigoBeneficio,
    dataConcessao: input.dataConcessao || '',
    bancoAtual: input.bancoAtual,
    valorParcela: input.valorParcela,
    saldoDevedor: input.saldoDevedor,
    parcelasPagas: input.parcelasPagas,
    prazoTotal: (input.parcelasPagas || 0) + (input.parcelasRestantes || 0),
    parcelasRestantes: input.parcelasRestantes,
    taxaJurosMensal: tJurosMensal && tJurosMensal > 0.1 ? tJurosMensal / 100 : tJurosMensal,
    isCliente60Mais: input.isCliente60Mais ?? undefined,
    isAnalfabeto: input.isAnalfabeto
  };

  // Run the central simulation engine
  const rawOffers = calculateOffers(params, banks, generalRules, pp, pi, {}, nonPortableBanks);

  // Map raw offers to the expected Offer structure for backward compatibility
  return rawOffers.map(o => ({
    id: o.id,
    name: o.name,
    logo: o.logo,
    tabela: o.tabela,
    valorContrato: o.valorContrato,
    valorTroco: o.valorTroco,
    saldoDevedor: o.saldoDevedor,
    novaTaxaPortabilidade: o.novaTaxaPortabilidade ?? 0,
    taxaPonderada: o.taxaPonderada ?? 0,
    taxaBase: o.taxaBase ?? 0,
    originalRateCalculated: o.originalRateCalculated ?? 0,
    ajusteTaxaPonderada: o.ajusteTaxaPonderada ?? 0,
    priority: o.priority ?? 999,
    rules: o.rules || [],
    convenio: o.convenio,
    subConvenio: o.subConvenio,
    tabelasCount: o.tabelasCount,
    prazoRefinPort: o.prazoRefinPort
  }));
}
