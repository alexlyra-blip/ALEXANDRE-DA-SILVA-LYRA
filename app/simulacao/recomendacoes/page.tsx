'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ChevronDown, Banknote, FileText, Download, Calendar, Percent, Calculator, ChevronLeft, ChevronRight, MessageCircle, Sparkles, Loader2, LayoutDashboard, ShieldCheck, CheckCircle2, History, DollarSign, Star, Landmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QuotaAlert } from '@/components/QuotaAlert';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRules } from '@/contexts/RuleContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleGenAI } from "@google/genai";
import { safeStringify } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';

const getAI = () => {
  let apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  if (apiKey.includes("MY_GEMINI") || !apiKey) {
      apiKey = "AIzaSyBLQXgN8KtlZclzEqFeXk7wYAUzkbtcs80"; 
  }
  return new GoogleGenAI({ apiKey });
};

type SortOption = 'menor_troco' | 'valor_troco' | 'valor_contrato';

interface Offer {
  id: string;
  name: string;
  logo: string;
  tabela: string;
  valorContrato: number;
  valorTroco: number;
  saldoDevedor: number;
  novaTaxaPortabilidade?: number;
  novaTaxaPortTarget?: number;
  taxaPonderada?: number;
  taxaBase?: number;
  ajusteTaxaPonderada?: number;
  useTaxaPonderada?: boolean;
  originalRateCalculated?: number;
  priority?: number;
  rules?: string[][];
  convenio: 'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS' | 'CLT PRIVADO';
  subConvenio?: string;
  tabelasCount: number;
  prazoRefinPort?: number;
  isAnalfabeto?: boolean;
  is60Mais?: boolean;
  isInvalidity?: boolean;
  hasMinBalanceRule?: boolean;
  minBalanceValue?: number;
}

import SimulationForm from '@/components/SimulationForm';

function calculateRate(pv: number, pmt: number, n: number) {
  if (pmt <= 0 || pv <= 0 || n <= 0) return 0;
  if (pmt * n <= pv) return 0;
  let low = 0.0001; let high = 1; let rate = 0.05; let diff = 1;
  let iterations = 0;
  while (diff > 0.0001 && high - low > 0.00001 && iterations < 100) {
      const calculatedPv = (pmt / rate) * (1 - Math.pow(1 + rate, -n));
      diff = Math.abs(calculatedPv - pv);
      if (calculatedPv > pv) { low = rate; rate = (rate + high) / 2; }
      else { high = rate; rate = (rate + low) / 2; }
      iterations++;
  }
  return rate;
}

const BANK_ALIASES: Record<string, string[]> = {
  "237": ["bradesco"],
  "341": ["itau", "itaú"],
  "033": ["santander"],
  "001": ["bb", "banco do brasil"],
  "104": ["caixa"],
  "623": ["pan", "banco pan"],
  "311": ["bmg"],
  "422": ["safra"],
  "626": ["c6", "c6 consig", "c6 bank"],
  "707": ["daycoval"],
  "041": ["banrisul"],
  "012": ["inbursa"],
  "069": ["crefisa"],
  "121": ["agibank"],
  "079": ["picpay"],
  "336": ["c6"],
  "003": ["amazonia", "bas"],
  "004": ["nordeste", "bnb"],
  "070": ["brb"],
};

const normalizeStr = (s: string) => {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

const SUB_CONVENIO_MAP: Record<string, string[]> = {
  "01": ["exercito", "exército"],
  "02": ["aeronautica", "aeronáutica"],
  "03": ["marinha"],
  "AC": ["acre"],
  "AL": ["alagoas"],
  "AP": ["amapa", "amapá"],
  "AM": ["amazonas"],
  "BA": ["bahia"],
  "CE": ["ceara", "ceará"],
  "DF": ["distrito federal", "df"],
  "ES": ["espirito santo", "espírito santo", "es"],
  "GO": ["goias", "goiás"],
  "MA": ["maranhao", "maranhão"],
  "MT": ["mato grosso"],
  "MS": ["mato grosso do sul"],
  "MG": ["minas gerais", "mg"],
  "PA": ["para", "pará"],
  "PB": ["paraiba", "paraíba"],
  "PR": ["parana", "paraná"],
  "PE": ["pernambuco"],
  "PI": ["piaui", "piauí"],
  "RJ": ["rio de janeiro", "rj"],
  "RN": ["rio grande do norte"],
  "RS": ["rio grande do sul"],
  "RO": ["rondonia", "rondônia"],
  "RR": ["roraima"],
  "SC": ["santa catarina"],
  "SP": ["sao paulo", "são paulo", "sp"],
  "SE": ["sergipe"],
  "TO": ["tocantins"],
};

const checkSubConvenioMatch = (ruleSub: string, currentSub: string): boolean => {
  if (!ruleSub || !currentSub) return true;
  const r = normalizeStr(ruleSub);
  const c = normalizeStr(currentSub);
  if (r === c) return true;
  for (const [code, aliases] of Object.entries(SUB_CONVENIO_MAP)) {
    const normCode = code.toLowerCase();
    const ruleMatches = r === normCode || aliases.some(a => r.includes(a) || a.includes(r));
    const currentMatches = c === normCode || aliases.some(a => c.includes(a) || a.includes(c));
    if (ruleMatches && currentMatches) return true;
  }
  return r.includes(c) || c.includes(r);
};

const checkBankMatch = (ruleBank: string, currentBank: string) => {
  if (!ruleBank || !currentBank) return false;
  const rule = ruleBank.trim().toLowerCase();
  const current = currentBank.trim().toLowerCase();
  if (current === rule) return true;

  const ruleCodeMatch = rule.match(/^\d{1,4}/);
  const currentCodeMatch = current.match(/^\d{1,4}/);
  const ruleCode = ruleCodeMatch ? ruleCodeMatch[0].padStart(3, '0') : null;
  const currentCode = currentCodeMatch ? currentCodeMatch[0].padStart(3, '0') : null;

  if (ruleCode && currentCode && ruleCode === currentCode) return true;

  for (const [code, aliases] of Object.entries(BANK_ALIASES)) {
    const ruleHasCode = ruleCode === code || aliases.some(a => rule.includes(a));
    const currentHasCode = currentCode === code || aliases.some(a => current.includes(a));
    if (ruleHasCode && currentHasCode) return true;
  }

  const parts = current.split('-');
  if (parts.length >= 2) {
    const name = parts.slice(1).join('-').trim();
    if (rule.length >= 2 && name.includes(rule)) return true;
  }
  return rule.length >= 2 && (current.includes(rule) || rule.includes(current));
};

export default function Recomendacoes() {
  const router = useRouter();
  const { showToast } = useToast();
  const [sortBy, setSortBy] = useState<SortOption>('menor_troco');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [allCalculatedOffersMap, setAllCalculatedOffersMap] = useState<Record<string, Offer[]>>({});
  const [filterReasonsMap, setFilterReasonsMap] = useState<Record<string, {bankName: string, reason: string, tabela?: string}[]>>({});
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>('all');
  const [selectedPrazoFilter, setSelectedPrazoFilter] = useState<number>(108);
  const [simData, setSimData] = useState<any>(null);
  const [allSimulations, setAllSimulations] = useState<any[]>([]);
  const [activeSimulationIndex, setActiveSimulationIndex] = useState(0);
  const [showFilterLog, setShowFilterLog] = useState(false);
  const [isAISummarizing, setIsAISummarizing] = useState(false);
  const { banks, generalRules, promotoraPriorities, promotoraInstallments, nonPortableBanks, blockedBanks, isLoaded } = useRules();
  const { profile } = useAuth();
  const savedSimulationIds = useRef<Set<string>>(new Set());

  // Use active offers based on index
  const allCalculatedOffers = useMemo(() => 
    allCalculatedOffersMap[simData?.id] || [], 
    [allCalculatedOffersMap, simData?.id]
  );

  const availablePrazos = useMemo(() => {
    const prazos = new Set<number>();
    allCalculatedOffers.forEach(o => {
      if (o.prazoRefinPort) {
        prazos.add(o.prazoRefinPort);
      }
    });
    return Array.from(prazos).sort((a, b) => b - a);
  }, [allCalculatedOffers]);

  useEffect(() => {
    if (availablePrazos.length > 0 && !availablePrazos.includes(selectedPrazoFilter)) {
      setSelectedPrazoFilter(availablePrazos[0]);
    }
  }, [availablePrazos, selectedPrazoFilter]);

  const offersWithPrazo = useMemo(() => {
    if (availablePrazos.length === 0) return allCalculatedOffers;
    return allCalculatedOffers.filter(o => o.prazoRefinPort === selectedPrazoFilter);
  }, [allCalculatedOffers, selectedPrazoFilter, availablePrazos]);

  const filterReasons = useMemo(() => 
    filterReasonsMap[simData?.id] || [],
    [filterReasonsMap, simData?.id]
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(value || 0);
  };

  const handleSelectOffer = async (offer: Offer) => {
    try {
      const simulationId = simData?.id || crypto.randomUUID();
      const docRef = doc(db, 'simulations', simulationId);
      
      // Prepare a clean, lightweight version of simData to avoid document size issues
      const cleanSimData = simData ? {
        id: simData.id,
        nomeCliente: simData.nomeCliente,
        cpfCliente: simData.cpfCliente,
        idade: simData.idade,
        convenio: simData.convenio,
        subConvenio: simData.subConvenio,
        bancoAtual: simData.bancoAtual,
        valorParcela: simData.valorParcela,
        prazoTotal: simData.prazoTotal,
        parcelasRestantes: simData.parcelasRestantes,
        saldoDevedor: simData.saldoDevedor
      } : null;

      const avatarUrl = simData?.userAvatar || profile?.photoUrl || profile?.avatarUrl || null;
      const safeAvatarUrl = (avatarUrl && avatarUrl.length < 2000) ? avatarUrl : null;

      // Comprehensive save to ensure it appears correctly in Dashboard
      await setDoc(docRef, {
        userId: profile?.uid,
        userName: simData?.userName || profile?.name,
        userAvatar: simData?.userAvatar || safeAvatarUrl,
        userRole: simData?.userRole || profile?.role,
        corretorId: simData?.corretorId || (profile?.role === 'corretor' || profile?.role === 'vendedor' ? profile?.uid : null),
        createdBy: simData?.createdBy || profile?.createdBy || null,
        promotoraId: simData?.promotoraId || (profile?.role === 'promotora' ? profile?.uid : (profile?.promotoraId || profile?.createdBy || 'admin')),
        createdAt: simData?.createdAt || new Date().toISOString(),
        simData: cleanSimData,
        offers: allCalculatedOffers.slice(0, 5).map(o => ({
          id: o.id,
          name: o.name,
          tabela: o.tabela,
          valorTroco: o.valorTroco,
          valorContrato: o.valorContrato,
          saldoDevedor: o.saldoDevedor,
          prazoRefinPort: o.prazoRefinPort,
          logo: o.logo && o.logo.length < 500 ? o.logo : null
        })),
        recommendedBanks: allCalculatedOffers.slice(0, 3).map(o => o.name),
        topOffer: offer.name,
        topOfferTabela: offer.tabela,
        topOfferContrato: offer.valorContrato,
        topOfferTroco: offer.valorTroco,
        topOfferTaxa: offer.novaTaxaPortabilidade,
        topOfferPrazo: offer.prazoRefinPort || (simData?.subConvenio === 'Marinha' ? 72 : (simData?.prazoTotal || 96)),
        updatedAt: serverTimestamp()
      }, { merge: true });

    } catch (err) {
      console.error('Error updating selected offer in simulations:', err);
    }

    const stored = sessionStorage.getItem('selectedOffers');
    const selected = stored ? JSON.parse(stored) : [];
    selected.push(offer);
    sessionStorage.setItem('selectedOffers', safeStringify(selected));
    
    // Redirect to new proposal page
    const baseUrl = `/propostas/nova?bank=${encodeURIComponent(offer.name)}&tabela=${encodeURIComponent(offer.tabela)}&valor=${offer.valorContrato}&troco=${offer.valorTroco}&parcela=${simData?.valorParcela || 0}&saldoDevedor=${offer.saldoDevedor}&bancoPortado=${encodeURIComponent(simData?.bancoAtual || '')}&convenio=${encodeURIComponent(simData?.convenio || '')}&subConvenio=${encodeURIComponent(simData?.subConvenio || '')}&fromSim=true`;
    const namePart = simData?.nomeCliente ? `&nomeCliente=${encodeURIComponent(simData.nomeCliente)}` : '';
    const cpfPart = simData?.cpfCliente ? `&cpfCliente=${encodeURIComponent(simData.cpfCliente)}` : '';
    
    router.push(`${baseUrl}${namePart}${cpfPart}`);
  };

  const handleShareWhatsApp = (offer: Offer) => {
    const message = `*Simulação de Portabilidade*\n\n` +
      `*Banco:* ${offer.name}\n` +
      `*Tabela:* ${offer.tabela}\n` +
      `*Valor da Parcela:* ${formatCurrency(simData?.valorParcela || 0)}\n` +
      `*Valor do Contrato:* ${formatCurrency(offer.valorContrato)}\n` +
      `*Valor do Troco:* ${formatCurrency(offer.valorTroco)}\n` +
      `*Prazo:* ${offer.prazoRefinPort || (simData?.subConvenio === 'Marinha' ? 72 : (simData?.prazoTotal || 96))}x\n` +
      `*Taxa Port.:* ${offer.novaTaxaPortabilidade?.toFixed(2)}%\n\n` +
      `_Simulação realizada em: ${new Date().toLocaleDateString('pt-BR')}_`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleAIShareWhatsApp = async () => {
    if (offers.length === 0) return;
    
    setIsAISummarizing(true);
    try {
      const ai = getAI();
      const topOffers = offers.slice(0, 3);
      const offersText = topOffers.map((o, i) => 
        `Oferta ${i+1}: Banco ${o.name}, Tabela ${o.tabela}, Troco de ${formatCurrency(o.valorTroco)}, Taxa de ${o.novaTaxaPortabilidade?.toFixed(2)}%`
      ).join('\n');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Você é um assistente técnico especializado para corretores de crédito consignado. 
        Sua tarefa é gerar um resumo técnico e persuasivo de uma simulação de portabilidade para que o corretor envie ao seu parceiro ou cliente final, mas com foco na clareza PROFISSIONAL.

        REQUISITOS OBRIGATÓRIOS:
        - Responda em Português do Brasil (PT-BR).
        - Use uma linguagem técnica e consultiva: "Troco", "Tabelas", "Nova Taxa", "Portabilidade".
        - Destaque o banco que liberou a melhor oferta e a tabela utilizada.
        - Informe a quantidade total de tabelas disponíveis para aquele banco.
        - Destaque o VALOR LIBERADO (Troco) em **negrito**.
        - Informe o novo prazo e a economia na taxa de juros.
        - Mencione o banco com o MAIOR TROCO e o banco com a MENOR TAXA de juros encontrada.
        - Mencione os demais bancos que também apresentaram ofertas para este contrato.
        - No final, convide o corretor a baixar o relatório PDF completo das propostas.

        Dados da simulação:
        Parcela atual: ${formatCurrency(simData?.valorParcela || 0)}
        
        Ofertas encontradas:
        ${offersText}
        
        Crie a mensagem de forma organizada, usando emojis discretos e profissionais.`
      });

      const message = response.text;
      if (!message) throw new Error("Sem resposta da IA");
      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    } catch (error) {
      console.error("Erro ao gerar resumo com IA:", error);
      showToast("Não foi possível gerar o resumo com IA. Tente usar o compartilhamento individual.", 'error');
    } finally {
      setIsAISummarizing(false);
    }
  };

  // 1. Load simulation data from sessionStorage
  useEffect(() => {
    const storedAll = sessionStorage.getItem('allSimulations');
    if (storedAll) {
      try {
        const parsed = JSON.parse(storedAll);
        setAllSimulations(parsed);
        setSimData(parsed[activeSimulationIndex]);
      } catch (e) {
        console.error("Error parsing allSimulations:", e);
      }
    } else {
      const storedData = sessionStorage.getItem('simulationData');
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          setSimData(parsed);
          setAllSimulations([parsed]);
        } catch (e) {
          console.error("Error parsing simulationData:", e);
        }
      }
    }
  }, [isSimulatorOpen, activeSimulationIndex]); // Re-check when simulator closes/opens or active index changes

  // 2. Calculate offers when data or rules change
  const calculationsCount = useRef<number>(0);

  useEffect(() => {
    if (!isLoaded || !allSimulations.length || !banks.length) {
      return;
    }

    calculationsCount.current++;
    console.log(`[SIMULATION #${calculationsCount.current}] CALCULATING OFFERS FOR ALL CONTRACTS -`, new Date().toLocaleTimeString());

    const newOffersMap: Record<string, Offer[]> = {};
    const newReasonsMap: Record<string, any[]> = {};

    allSimulations.forEach(currentSim => {
      const {
        id: simulationId,
        idade,
        codigoBeneficio,
        dataConcessao,
        bancoAtual,
        valorParcela,
        saldoDevedor,
        parcelasPagas,
        prazoTotal,
        parcelasRestantes,
        isCliente60Mais,
        negativeCardValue
      } = currentSim;

      // Check if bancoAtual is a globally blocked Non-Portable Bank
      if (nonPortableBanks && nonPortableBanks.some((b: string) => checkBankMatch(b, bancoAtual))) {
        newOffersMap[simulationId] = [];
        newReasonsMap[simulationId] = [{ bankName: bancoAtual || 'Banco', reason: "Este banco não pode ser portado por nenhuma instituição cadastrada." }];
        return;
      }

      const originalRate = currentSim.taxaJurosMensal ? currentSim.taxaJurosMensal * 100 : 0;
      const effectiveN = parcelasRestantes || (prazoTotal > 0 && parcelasPagas !== undefined ? prazoTotal - parcelasPagas : 0);
      
      const calculatedOffers: Offer[] = [];
      const localFilterReasons: {bankName: string, reason: string, tabela?: string}[] = [];

      // Calculate time of benefit in months
      let benefitTimeMonths = 0;
      if (dataConcessao) {
        const concessaoDate = new Date(dataConcessao + 'T12:00:00');
        const now = new Date();
        let years = now.getFullYear() - concessaoDate.getFullYear();
        let months = now.getMonth() - concessaoDate.getMonth();
        if (now.getDate() < concessaoDate.getDate()) months--;
        if (months < 0) { years--; months += 12; }
        benefitTimeMonths = years * 12 + months;
      }

      const cleanBeneficio = codigoBeneficio ? String(codigoBeneficio).replace(/^0+/, '') : '';



      banks.forEach(rawBank => {
        const bank = {
          ...rawBank,
          minAge: rawBank.minAge !== undefined ? rawBank.minAge : (rawBank.min_age !== undefined ? rawBank.min_age : 0),
          maxAge: rawBank.maxAge !== undefined ? rawBank.maxAge : (rawBank.max_age !== undefined ? rawBank.max_age : 0),
          minInstallmentValue: rawBank.minInstallmentValue !== undefined ? rawBank.minInstallmentValue : (rawBank.min_installment_value !== undefined ? rawBank.min_installment_value : 0),
          minBalance: rawBank.minBalance !== undefined ? rawBank.minBalance : (rawBank.min_balance !== undefined ? rawBank.min_balance : 0),
          minTroco: rawBank.minTroco !== undefined ? rawBank.minTroco : (rawBank.min_troco !== undefined ? rawBank.min_troco : 0),
          portabilityRate: rawBank.portabilityRate !== undefined ? rawBank.portabilityRate : (rawBank.portability_rate !== undefined ? rawBank.portability_rate : 0),
          refinRate: rawBank.refinRate !== undefined ? rawBank.refinRate : (rawBank.refin_rate !== undefined ? rawBank.refin_rate : 0),
          sumBalanceAndTroco: rawBank.sumBalanceAndTroco !== undefined ? rawBank.sumBalanceAndTroco : (rawBank.sum_balance_and_troco !== undefined ? rawBank.sum_balance_and_troco : (rawBank.sumSaldoTroco !== undefined ? rawBank.sumSaldoTroco : rawBank.sum_saldo_troco)),
          acceptsIlliterate: rawBank.acceptsIlliterate !== undefined ? rawBank.acceptsIlliterate : (rawBank.accepts_illiterate !== undefined ? rawBank.accepts_illiterate : false),
          acceptsLOAS: rawBank.acceptsLOAS !== undefined ? rawBank.acceptsLOAS : (rawBank.accepts_loas !== undefined ? rawBank.accepts_loas : false),
          accepts60Mais: rawBank.accepts60Mais !== undefined ? rawBank.accepts60Mais : (rawBank.accepts_60_mais !== undefined ? rawBank.accepts_60_mais : false),
          acceptsInvalidez: rawBank.acceptsInvalidez !== undefined ? rawBank.acceptsInvalidez : (rawBank.accepts_invalidez !== undefined ? rawBank.accepts_invalidez : true),
          invalidezAgeYears: rawBank.invalidezAgeYears !== undefined ? rawBank.invalidezAgeYears : (rawBank.invalidez_age_years !== undefined ? rawBank.invalidez_age_years : 0),
          invalidezMaxAgeYears: rawBank.invalidezMaxAgeYears !== undefined ? rawBank.invalidezMaxAgeYears : (rawBank.invalidez_max_age_years !== undefined ? rawBank.invalidez_max_age_years : 0),
          acceptsOver60Invalidez: rawBank.acceptsOver60Invalidez !== undefined ? rawBank.acceptsOver60Invalidez : (rawBank.accepts_over_60_invalidez !== undefined ? rawBank.accepts_over_60_invalidez : false),
          minBenefitTimeYears: rawBank.minBenefitTimeYears !== undefined ? rawBank.minBenefitTimeYears : (rawBank.min_benefit_time_years !== undefined ? rawBank.min_benefit_time_years : 0),
          minBenefitTimeMonths: rawBank.minBenefitTimeMonths !== undefined ? rawBank.minBenefitTimeMonths : (rawBank.min_benefit_time_months !== undefined ? rawBank.min_benefit_time_months : 0),
          taxaPortabilidadeOrigem: rawBank.taxaPortabilidadeOrigem !== undefined ? rawBank.taxaPortabilidadeOrigem : (rawBank.taxa_portabilidade_origem !== undefined ? rawBank.taxa_portabilidade_origem : 0),
          ajusteTaxa: rawBank.ajusteTaxa !== undefined ? rawBank.ajusteTaxa : (rawBank.ajuste_taxa !== undefined ? rawBank.ajuste_taxa : 0),
          novaTaxaReferencia: rawBank.novaTaxaReferencia !== undefined ? rawBank.novaTaxaReferencia : (rawBank.nova_taxa_referencia !== undefined ? rawBank.nova_taxa_referencia : 0),
          minPaidInstallments: rawBank.minPaidInstallments !== undefined ? rawBank.minPaidInstallments : (rawBank.min_paid_installments !== undefined ? rawBank.min_paid_installments : 0),
          isActive: rawBank.isActive !== undefined ? rawBank.isActive : (rawBank.is_active !== undefined ? rawBank.is_active : true),
          subConvenio: rawBank.subConvenio !== undefined ? rawBank.subConvenio : (rawBank.sub_convenio !== undefined ? rawBank.sub_convenio : ''),
          requireTrocoMaiorQue5PorcentoEndividamento: rawBank.requireTrocoMaiorQue5PorcentoEndividamento !== undefined ? rawBank.requireTrocoMaiorQue5PorcentoEndividamento : (rawBank.require_troco_maior_que_5_porcento_endividamento !== undefined ? rawBank.require_troco_maior_que_5_porcento_endividamento : false),
          excludedBenefits: rawBank.excludedBenefits !== undefined ? rawBank.excludedBenefits : (rawBank.excluded_benefits !== undefined ? rawBank.excluded_benefits : []),
          nonAcceptedBanks: rawBank.nonAcceptedBanks !== undefined ? rawBank.nonAcceptedBanks : (rawBank.non_accepted_banks !== undefined ? rawBank.non_accepted_banks : []),
          specificInstallmentRules: rawBank.specificInstallmentRules !== undefined ? rawBank.specificInstallmentRules : (rawBank.specific_installment_rules !== undefined ? rawBank.specific_installment_rules : []),
          logoUrl: rawBank.logoUrl !== undefined ? rawBank.logoUrl : (rawBank.logo_url !== undefined ? rawBank.logo_url : ''),
          abaterMargemNaPortabilidade: rawBank.abaterMargemNaPortabilidade !== undefined ? rawBank.abaterMargemNaPortabilidade : false,
          bloquearMargemNegativa: rawBank.bloquearMargemNegativa !== undefined ? rawBank.bloquearMargemNegativa : false,
        };

        const log = (reason: string, tabela?: string) => {
          localFilterReasons.push({ bankName: bank.name, reason, tabela });
        };

        if (bank.bloquearMargemNegativa && (negativeCardValue || 0) > 0) {
          log('Não aceita a portabilidade para clientes com margem negativa');
          return;
        }

        const abaterMargem = bank.abaterMargemNaPortabilidade && (negativeCardValue || 0) > 0;
        const parcelaParaRegras = abaterMargem ? Math.max(0, valorParcela - (negativeCardValue || 0)) : valorParcela;
        const parcelaParaContrato = Math.max(0, valorParcela - (negativeCardValue || 0));
        const newRateCalculated = calculateRate(saldoDevedor, parcelaParaRegras, effectiveN) * 100;

        const effectiveIs60Mais = isCliente60Mais != null ? isCliente60Mais : (idade >= 60);
        if (bank.isActive === false) {
          log("Banco inativo");
          return;
        }
        if (profile?.allowedBanks && profile.allowedBanks.length > 0 && !profile.allowedBanks.includes(bank.id)) {
          log("Sem permissão para este banco");
          return;
        }
        if (blockedBanks && (blockedBanks.includes(bank.name) || blockedBanks.includes(bank.id))) {
          log("Bloqueado pelas regras gerais da promotora");
          return;
        }
        
        const bankConvenio = normalizeStr(bank.convenio || 'INSS');
        const simConvenio = normalizeStr(currentSim.convenio || 'INSS');
        if (bankConvenio !== simConvenio) {
          return;
        }
        if (bank.subConvenio && currentSim.subConvenio) {
          if (!checkSubConvenioMatch(bank.subConvenio, currentSim.subConvenio)) {
            return;
          }
        }

        const isInvalidity = ['4', '04', '5', '05', '11', '30', '32', '33', '34', '92'].includes(cleanBeneficio);
        const isLOAS = ['87', '88'].includes(cleanBeneficio);

        if (isInvalidity) {
          if (bank.acceptsInvalidez === false) {
            log("Não aceita espécie 32/92 (Invalidez)");
            return;
          }
          const isActuallyOver60 = idade >= 60;
          if (isActuallyOver60) {
            if (!bank.acceptsOver60Invalidez) {
              log("Invalidez: O banco não aceita espécie 32/92 para clientes acima de 60 anos.");
              return;
            }
          } else {
            const minAgeDisability = bank.invalidezAgeYears || 0;
            if (minAgeDisability > 0 && idade < minAgeDisability) {
              log(`Invalidez: Idade mínima de ${minAgeDisability} anos exigida para espécie 32/92 (Cliente tem ${idade}).`);
              return;
            }
            const requiredMonths = (bank.minBenefitTimeYears || 0) * 12 + (bank.minBenefitTimeMonths || 0);
            if (requiredMonths > 0 && benefitTimeMonths < requiredMonths) {
              log(`Invalidez: Tempo de benefício insuficiente (${benefitTimeMonths}/${requiredMonths} meses).`);
              return;
            }
          }
        }

        const bSumSaldoTrocoGlobal = !!(bank.sumBalanceAndTroco || bank.sumSaldoTroco);
        if (!bSumSaldoTrocoGlobal && bank.minBalance && saldoDevedor < bank.minBalance) {
          log(`Saldo devedor abaixo do permitido: ${formatCurrency(saldoDevedor)} (O banco exige saldo mínimo de ${formatCurrency(bank.minBalance)}).`);
          return;
        }

        if (!isInvalidity) {
          if (bank.minAge > 0 && idade < bank.minAge) {
            log(`Idade do cliente (${idade} anos) é inferior ao mínimo permitido pelo banco (${bank.minAge} anos).`);
            return;
          }
          if (bank.maxAge > 0 && idade > bank.maxAge) {
            log(`Idade do cliente (${idade} anos) excede o limite máximo do banco (${bank.maxAge} anos).`);
            return;
          }
        } else {
          const maxAgeLimit = bank.invalidezMaxAgeYears || bank.maxAge || 0;
          if (maxAgeLimit > 0 && idade > maxAgeLimit) {
            log(`Idade excede o limite máximo para invalidez (${maxAgeLimit} anos).`);
            return;
          }
        }

        if (effectiveIs60Mais && bank.accepts60Mais === false) {
          log("Cliente 60+: O banco não aceita propostas para clientes com 60 anos ou mais.");
          return;
        }
        if (isLOAS) {
          if (!bank.acceptsLOAS) {
            log("O banco não aceita espécie 87/88 (LOAS/BPC).");
            return;
          }
          if (currentSim.isAnalfabeto && !bank.acceptsIlliterate) {
            log("Analfabeto: O banco não aceita contratação para clientes analfabetos.");
            return;
          }
        }
        if (currentSim.isAnalfabeto && !bank.acceptsIlliterate) {
          log("Analfabeto: O banco não aceita propostas para clientes analfabetos.");
          return;
        }

        const targetGeneralRule = generalRules.find((r: any) => checkBankMatch(r.banco, bank.name));
        if (bank.nonAcceptedBanks && bank.nonAcceptedBanks.some((b: string) => checkBankMatch(b, bancoAtual))) {
          log(`Não aceita portabilidade do banco ${bancoAtual}`);
          return;
        }

        // Não aceita portabilidade para si mesmo (mesmo banco atual do contrato)
        if (checkBankMatch(bank.name, bancoAtual)) {
          log(`Portabilidade interna não permitida: o contrato já está no banco ${bancoAtual}`);
          return;
        }

        let requiredInstallments = 0;
        const effectiveParcelasPagas = parcelasPagas !== undefined ? parcelasPagas : (parseInt(prazoTotal || 0) - parseInt(parcelasRestantes || 0));
        const specificRule = bank.specificInstallmentRules?.find((r: any) => checkBankMatch(r.bank, bancoAtual));
        if (specificRule) {
          requiredInstallments = parseInt(specificRule.installments) || 0;
        } else {
          const pInstallment = promotoraInstallments?.[bancoAtual];
          if (pInstallment !== undefined && pInstallment > 0) {
            requiredInstallments = pInstallment;
          } else {
            const generalRule = generalRules.find((r: any) => checkBankMatch(r.banco, bancoAtual));
            if (generalRule) requiredInstallments = generalRule.parcelasAceitas;
          }
          const bankGeneralLimit = bank.minPaidInstallments || targetGeneralRule?.parcelasAceitas || 0;
          requiredInstallments = Math.max(requiredInstallments, bankGeneralLimit);
        }

        if (requiredInstallments > 0 && effectiveParcelasPagas < requiredInstallments) {
          log(`Parcelas pagas insuficientes: ${effectiveParcelasPagas} (Mínimo: ${requiredInstallments} para ${bancoAtual})`);
          return;
        }

        if (!bank.tabelas || bank.tabelas.length === 0) {
          log("Sem tabelas cadastradas para simulação");
          return;
        }

        if (bank.tabelas && bank.tabelas.length > 0) {
          bank.tabelas.forEach((tabela: any) => {
            const parseRate = (val: any) => {
              if (val === undefined || val === null || val === '') return 0;
              if (typeof val === 'number') return val;
              return parseFloat(String(val).replace(',', '.')) || 0;
            };

            // Table Age Limits Validation
            const tableMinAge = parseRate(tabela.minAge || tabela.idadeMinima || 0);
            const tableMaxAge = parseRate(tabela.maxAge || tabela.idadeMaxima || 0);
            if (tableMinAge > 0 && idade < tableMinAge) {
              log(`Passe da tabela ignorado por idade mínima: ${idade} (Mínimo: ${tableMinAge})`, tabela.nome);
              return;
            }
            if (tableMaxAge > 0 && idade > tableMaxAge) {
              log(`Passe da tabela ignorado por idade máxima: ${idade} (Máximo: ${tableMaxAge})`, tabela.nome);
              return;
            }

            const coef = tabela.coeficiente;
            if (!coef || coef <= 0) {
              log("Coeficiente da tabela inválido ou zero", tabela.nome);
              return;
            }
            const valorContrato = parcelaParaContrato / coef;
            const valorTroco = valorContrato - saldoDevedor;
            const bSumSaldoTroco = bSumSaldoTrocoGlobal || !!tabela.somaSaldoTroco;
            if (bSumSaldoTroco && bank.minBalance && (saldoDevedor + valorTroco) < bank.minBalance) {
              log(`Ticket total insuficiente: ${formatCurrency(saldoDevedor + valorTroco)} (Mínimo: ${formatCurrency(bank.minBalance)})`, tabela.nome);
              return;
            }

            const valorAValidar = saldoDevedor + valorTroco;
            const bankMinTroco = parseRate(bank.minTroco);
            const tableMinTicket = (tabela.useMinTicket === true) ? parseRate(tabela.minTicket) : 0;
            const effectiveMinTicket = tableMinTicket; // Decoupled from bankMinTroco

            if (effectiveMinTicket > 0 && valorAValidar < effectiveMinTicket) {
              log(`Ticket total insuficiente: ${formatCurrency(valorAValidar)} (Mínimo da tabela: ${formatCurrency(effectiveMinTicket)})`, tabela.nome);
              return;
            }
            
            const tableMinInst = parseRate(tabela.minInstallmentValue);
            const tableMaxInst = parseRate(tabela.maxInstallmentValue);
            const effectiveMinInst = tableMinInst > 0 ? tableMinInst : (parseRate(bank.minInstallmentValue) || 0);

            if (effectiveMinInst > 0 && parcelaParaRegras < effectiveMinInst) {
              log(`Valor da parcela insuficiente: ${formatCurrency(parcelaParaRegras)} (Mínimo: ${formatCurrency(effectiveMinInst)})`, tabela.nome);
              return;
            }
            if (tableMaxInst > 0 && parcelaParaRegras > tableMaxInst) {
              log(`Valor da parcela excedente: ${formatCurrency(parcelaParaRegras)} (Máximo: ${formatCurrency(tableMaxInst)})`, tabela.nome);
              return;
            }

            const taxaTabelaValida = parseRate(tabela.taxaTabela) > 0 ? parseRate(tabela.taxaTabela) : parseRate(bank.refinRate);
            const tDiferencial = parseRate(tabela.taxaDiferencial);

            const bankAdjustment = parseRate(bank.ajusteTaxa);
            const bankPortRate = parseRate(bank.portabilityRate);
            
            const defaultRate = bankConvenio === 'siape' ? 1.70 : (bankConvenio === 'inss' ? 1.85 : 2.05);
            let orig = originalRate > 0 ? originalRate : (bank.taxaPortabilidadeOrigem || defaultRate);
            
            if (abaterMargem && newRateCalculated > 0) {
                orig = newRateCalculated;
            }
            
            // Dynamic calculation: client rate + bank adjustment
            const novaTaxaPort = Number((orig + bankAdjustment).toFixed(2));
            
            if (bankPortRate > 0 && newRateCalculated > 0 && newRateCalculated < bankPortRate) {
              log(`Nova taxa calculada (${newRateCalculated.toFixed(2)}%) é menor que o mínimo do banco (${bankPortRate}%)`, tabela.nome);
              return;
            }
            if (bankPortRate > 0 && novaTaxaPort < bankPortRate) {
              log(`Taxa portabilidade insuficiente: ${novaTaxaPort}% (Mínimo banco: ${bankPortRate}%)`, tabela.nome);
              return;
            }

            const origFixed = Number(orig.toFixed(2));
            const taxaPonderadaBase = Math.round(((origFixed + novaTaxaPort) / 2) * 100) / 100;
            const ajusteTabela = Number((parseFloat(tabela.ajusteTaxaPonderada) || 0).toFixed(2));
            const taxaPonderadaFinal = Math.round((taxaPonderadaBase + ajusteTabela) * 100) / 100;
            const bUseTaxaPonderada = Boolean(tabela.useTaxaPonderada);

            if (bUseTaxaPonderada === true) {
              if (taxaTabelaValida > 0 && taxaTabelaValida > taxaPonderadaFinal) {
                log(`Taxa ponderada insuficiente: ${taxaPonderadaFinal}% (Tabela exige: ${taxaTabelaValida}%)`, tabela.nome);
                return;
              }
            }

            if (valorTroco <= 0) {
              log(`Troco negativo ou zero: ${formatCurrency(valorTroco)}`, tabela.nome);
              return;
            }

            if (bankMinTroco > 0 && valorTroco < bankMinTroco) {
              log(`Troco insuficiente: ${formatCurrency(valorTroco)} (Mínimo banco: ${formatCurrency(bankMinTroco)})`, tabela.nome);
              return;
            }

            calculatedOffers.push({
              id: `${bank.id}-${tabela.nome}`,
              name: bank.name,
              logo: bank.logoUrl || 'https://picsum.photos/seed/bank/100/100',
              tabela: tabela.nome,
              valorContrato,
              valorTroco,
              saldoDevedor,
              novaTaxaPortabilidade: novaTaxaPort,
              novaTaxaPortTarget: novaTaxaPort,
              taxaPonderada: taxaPonderadaFinal,
              originalRateCalculated: orig,
              taxaBase: taxaTabelaValida,
              priority: (targetGeneralRule?.priority && targetGeneralRule.priority > 0) ? targetGeneralRule.priority : (bank.priority || 0),
              rules: [], // Simplified for map
              convenio: bank.convenio || 'INSS',
              subConvenio: bank.subConvenio,
              tabelasCount: bank.tabelas.length,
              prazoRefinPort: tabela.prazoRefinPort,
              ajusteTaxaPonderada: ajusteTabela,
              useTaxaPonderada: bUseTaxaPonderada,
              // Validation flags for UI seals
              isAnalfabeto: !!currentSim.isAnalfabeto,
              is60Mais: !!effectiveIs60Mais,
              isInvalidity: !!isInvalidity,
              hasMinBalanceRule: !!bank.minBalance,
              minBalanceValue: bank.minBalance || 0
            });
          });
        }
      });

      calculatedOffers.sort((a, b) => {
        const bankIdA = a.id.split('-')[0];
        const bankIdB = b.id.split('-')[0];
        const pA = promotoraPriorities?.[bankIdA] ?? a.priority ?? 999;
        const pB = promotoraPriorities?.[bankIdB] ?? b.priority ?? 999;
        const finalPA = (pA === 0) ? 999 : pA;
        const finalPB = (pB === 0) ? 999 : pB;
        if (finalPA !== finalPB) return finalPA - finalPB;
        return b.valorTroco - a.valorTroco;
      });

      newOffersMap[simulationId] = calculatedOffers;
      newReasonsMap[simulationId] = localFilterReasons;

      // Save to Firestore individually
      if (!savedSimulationIds.current.has(simulationId) && calculatedOffers.length > 0) {
        savedSimulationIds.current.add(simulationId);
        const topOffer = calculatedOffers[0];
        
        // Clean currentSim to avoid document size issues
        const cleanCurrentSim = {
          id: currentSim.id,
          nomeCliente: currentSim.nomeCliente,
          cpfCliente: currentSim.cpfCliente,
          idade: currentSim.idade,
          convenio: currentSim.convenio,
          subConvenio: currentSim.subConvenio,
          bancoAtual: currentSim.bancoAtual,
          valorParcela: currentSim.valorParcela,
          prazoTotal: currentSim.prazoTotal,
          parcelasRestantes: currentSim.parcelasRestantes,
          saldoDevedor: currentSim.saldoDevedor
        };

        const avatarUrl = profile?.avatarUrl || profile?.photoUrl || null;
        const safeAvatarUrl = (avatarUrl && avatarUrl.length < 2000) ? avatarUrl : null;

        const simulationRecord = {
          ...cleanCurrentSim,
          userId: profile?.uid,
          userName: currentSim.userName || profile?.name,
          userAvatar: currentSim.userAvatar || safeAvatarUrl,
          userRole: currentSim.userRole || profile?.role,
          corretorId: currentSim.corretorId || ((profile?.role === 'corretor' || profile?.role === 'vendedor') ? profile?.uid : null),
          createdBy: currentSim.createdBy || profile?.createdBy || null,
          promotoraId: currentSim.promotoraId || (profile?.role === 'promotora' ? profile?.uid : (profile?.promotoraId || profile?.createdBy || 'admin')),
          recommendedBanks: calculatedOffers.slice(0, 3).map(o => o.name),
          topOffer: topOffer?.name || null,
          topOfferTabela: topOffer?.tabela || null,
          topOfferContrato: topOffer?.valorContrato || 0,
          topOfferTroco: topOffer?.valorTroco || 0,
          topOfferTaxa: topOffer?.novaTaxaPortabilidade || 0,
          topOfferPrazo: topOffer.prazoRefinPort || (currentSim.subConvenio === 'Marinha' ? 72 : (currentSim.prazoTotal || 96)),
          createdAt: currentSim.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        setDoc(doc(db, 'simulations', simulationId), simulationRecord, { merge: true }).catch(err => console.error("Error saving simulation:", err));
      }
    });

    setAllCalculatedOffersMap(newOffersMap);
    setFilterReasonsMap(newReasonsMap);

  }, [banks, generalRules, isLoaded, profile, promotoraPriorities, promotoraInstallments, allSimulations]);

  // Update 'Principais Ofertas' (offers) whenever offersWithPrazo or sortBy changes
  useEffect(() => {
    if (offersWithPrazo.length === 0) {
      setOffers([]);
      return;
    }

    let filteredForTop = offersWithPrazo;
    if (selectedBankFilter !== 'all') {
      filteredForTop = offersWithPrazo.filter(o => o.name === selectedBankFilter);
    }

    const sorted = [...filteredForTop].sort((a, b) => {
      if (sortBy === 'valor_troco') {
        return b.valorTroco - a.valorTroco;
      } else if (sortBy === 'valor_contrato') {
        return b.valorContrato - a.valorContrato;
      } else if (sortBy === 'menor_troco') {
        return a.valorTroco - b.valorTroco;
      }
      return 0;
    });

    // Group by bank and pick the best offer for each based on current sortBy
    const bestOfferPerBank: Record<string, Offer> = {};
    
    sorted.forEach(offer => {
      if (!bestOfferPerBank[offer.name]) {
        bestOfferPerBank[offer.name] = offer;
      } else {
        const currentBest = bestOfferPerBank[offer.name];
        let isBetter = false;

        if (offer.convenio === 'SIAPE' && offer.name.toUpperCase() === 'BRB') {
          const isTabela2Offer = offer.tabela.toLowerCase().includes('tabela 2') || offer.tabela.split(' ').includes('2') || offer.tabela === '2';
          const isTabela2Best = currentBest.tabela.toLowerCase().includes('tabela 2') || currentBest.tabela.split(' ').includes('2') || currentBest.tabela === '2';
          
          if (!isTabela2Offer && isTabela2Best) {
            isBetter = true;
          } else if (isTabela2Offer && !isTabela2Best) {
            isBetter = false;
          } else {
            isBetter = offer.valorTroco > currentBest.valorTroco;
          }
        } else {
          if (sortBy === 'valor_troco') {
            isBetter = offer.valorTroco > currentBest.valorTroco;
          } else if (sortBy === 'valor_contrato') {
            isBetter = offer.valorContrato > currentBest.valorContrato;
          } else if (sortBy === 'menor_troco') {
            isBetter = offer.valorTroco < currentBest.valorTroco;
          }
        }
        
        if (isBetter) {
          bestOfferPerBank[offer.name] = offer;
        }
      }
    });

    const uniqueBankOffers = Object.values(bestOfferPerBank).sort((a, b) => {
      // PRIORIDADE MESTRE: Primeiro respeitamos o ranking dos bancos (1, 2, 3...)
      // Bancos com prioridade 0 ou indefinida vão para o final (999)
      const bankIdA = a.id.split('-')[0];
      const bankIdB = b.id.split('-')[0];
      
      const pA = promotoraPriorities[bankIdA] ?? a.priority ?? 999;
      const pB = promotoraPriorities[bankIdB] ?? b.priority ?? 999;
      
      const finalPA = (pA === 0 || pA === undefined) ? 999 : pA;
      const finalPB = (pB === 0 || pB === undefined) ? 999 : pB;
      
      if (finalPA !== finalPB) {
        return finalPA - finalPB;
      }

      // Critério secundário: sortBy escolhido pelo usuário
      if (sortBy === 'valor_troco') return b.valorTroco - a.valorTroco;
      if (sortBy === 'valor_contrato') return b.valorContrato - a.valorContrato;
      if (sortBy === 'menor_troco') return a.valorTroco - b.valorTroco;
      return b.valorTroco - a.valorTroco;
    });

    // We keep all unique bank offers
    setOffers(uniqueBankOffers);
  }, [offersWithPrazo, sortBy, selectedBankFilter, promotoraPriorities]);

  const currentOffers = showAllOffers 
    ? offers
    : offers.slice(0, 3);
  
  const allCalculatedOffersCount = Array.from(new Set(offersWithPrazo.map(o => o.name))).length;
  
  const maxValorTroco = currentOffers.length > 0 ? Math.max(...currentOffers.map(b => b.valorTroco)) : 0;
  const minValorTroco = currentOffers.length > 0 ? Math.min(...currentOffers.map(b => b.valorTroco)) : 0;
  const maxValorContrato = currentOffers.length > 0 ? Math.max(...currentOffers.map(b => b.valorTroco + b.saldoDevedor)) : 0;

  const uniqueBanks = Array.from(new Set(offersWithPrazo.map(o => o.name))).sort();

  const sortedBanks = [...currentOffers].sort((a, b) => {
    // PRIORIDADE MESTRE: Primeiro respeitamos o ranking dos bancos
    const bankIdA = a.id.split('-')[0];
    const bankIdB = b.id.split('-')[0];
    
    const pA = promotoraPriorities[bankIdA] ?? a.priority ?? 999;
    const pB = promotoraPriorities[bankIdB] ?? b.priority ?? 999;
    
    const finalPA = (pA === 0 || pA === undefined) ? 999 : pA;
    const finalPB = (pB === 0 || pB === undefined) ? 999 : pB;
    
    if (finalPA !== finalPB) {
      return finalPA - finalPB;
    }

    // Critério secundário: Filtro selecionado
    if (sortBy === 'valor_troco') {
      return b.valorTroco - a.valorTroco;
    } else if (sortBy === 'valor_contrato') {
      return b.valorContrato - a.valorContrato;
    } else if (sortBy === 'menor_troco') {
      return a.valorTroco - b.valorTroco;
    }
    return 0;
  });

  const handleGeneratePDF = (offer: Offer) => {
    if (!simData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(17, 82, 212); // Primary color
    doc.text('Resultado da Simulação', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 28, { align: 'center' });

    // Simulation Data Section
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.text('Dados da Simulação', 14, 45);

    const simTableData = [];
    if (simData.nomeCliente) simTableData.push(['Cliente', simData.nomeCliente]);
    if (simData.cpfCliente) simTableData.push(['CPF', simData.cpfCliente]);
    simTableData.push(['Banco Atual', simData.bancoAtual || 'Não informado']);
    simTableData.push(['Valor da Parcela', formatCurrency(simData.valorParcela || 0)]);
    simTableData.push(['Saldo Devedor', formatCurrency(simData.saldoDevedor || 0)]);
    simTableData.push(['Parcelas Pagas', `${simData.parcelasPagas || 0} de ${simData.prazoTotal || 0}`]);
    simTableData.push(['Idade', `${simData.idade || 0} anos`]);

    autoTable(doc, {
      startY: 50,
      head: [['Campo', 'Valor']],
      body: simTableData,
      theme: 'striped',
      headStyles: { fillColor: [17, 82, 212] },
    });

    // Offer Data Section
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(16);
    doc.text('Melhor Oferta Selecionada', 14, finalY);

    const offerTableData = [
      ['Banco Destino', offer.name],
      ['Tabela', offer.tabela],
      ['Valor do Contrato', formatCurrency(offer.valorContrato)],
      ['Valor do Troco', formatCurrency(offer.valorTroco)],
      ['Taxa do Refinanciamento', `${(offer.taxaBase !== undefined ? offer.taxaBase : (offer.novaTaxaPortabilidade || 0)).toFixed(2)}%`],
      ['Taxa Ponderada', `${offer.taxaPonderada?.toFixed(2)}%`],
    ];

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Campo', 'Valor']],
      body: offerTableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }, // Emerald 500
    });

    // Footer
    const lastY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text('Esta simulação é apenas informativa e não garante a aprovação do crédito.', pageWidth / 2, lastY, { align: 'center' });
    doc.text('Sujeito a análise cadastral e de crédito pelo banco emissor.', pageWidth / 2, lastY + 5, { align: 'center' });

    doc.save(`simulacao_${offer.name.toLowerCase().replace(/\s+/g, '_')}.pdf`);
  };

  const handleGenerateGlobalPDF = () => {
    if (allSimulations.length === 0) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 20;

    // Header
    doc.setFontSize(22);
    doc.setTextColor(17, 82, 212);
    doc.text('Relatório Integrado de Simulações', pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;

    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 15;

    // Primary Client info if available
    const firstSim = allSimulations[0];
    if (firstSim.nomeCliente || firstSim.cpfCliente) {
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('Informações do Cliente', 14, currentY);
      currentY += 5;
      
      const clientData = [];
      if (firstSim.nomeCliente) clientData.push(['Nome', firstSim.nomeCliente]);
      if (firstSim.cpfCliente) clientData.push(['CPF', firstSim.cpfCliente]);
      
      autoTable(doc, {
        startY: currentY,
        body: clientData,
        theme: 'plain',
        styles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', width: 30 } }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    allSimulations.forEach((sim, index) => {
      // Check if we need a new page
      if (currentY > 200) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(16);
      doc.setTextColor(17, 82, 212);
      doc.text(`Contrato #${index + 1}: ${sim.bancoAtual}`, 14, currentY);
      currentY += 5;

      const simTable = [
        ['Parcela Atual', formatCurrency(sim.valorParcela)],
        ['Saldo Devedor', formatCurrency(sim.saldoDevedor)],
        ['Prazo', `${sim.prazoTotal}x (${sim.parcelasRestantes} rest.)`]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [['Resumo do Contrato', 'Dados']],
        body: simTable,
        theme: 'striped',
        headStyles: { fillColor: [71, 85, 105] },
        styles: { fontSize: 9 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
      
      // Add Top Troco Offer for this simulation
      const simOffers = allCalculatedOffersMap[sim.id] || [];
      const sortedByTroco = [...simOffers].sort((a, b) => b.valorTroco - a.valorTroco);
      const bestTrocoOffer = sortedByTroco[0];

      if (bestTrocoOffer) {
        doc.setFontSize(14);
        doc.setTextColor(16, 185, 129); // Emerald 500
        doc.text('Melhor Oferta de Troco:', 14, currentY);
        currentY += 6;

        const bestOfferData = [
          ['Banco Destino', bestTrocoOffer.name],
          ['Tabela Utilizada', bestTrocoOffer.tabela],
          ['Valor do Contrato', formatCurrency(bestTrocoOffer.valorContrato)],
          ['VALOR DO TROCO', formatCurrency(bestTrocoOffer.valorTroco)],
          ['Taxa de Portabilidade', `${(bestTrocoOffer.novaTaxaPortabilidade || 0).toFixed(2)}%`],
          ['Taxa Ponderada', `${bestTrocoOffer.taxaPonderada?.toFixed(2)}%`]
        ];

        autoTable(doc, {
          startY: currentY,
          body: bestOfferData,
          theme: 'grid',
          styles: { fontSize: 9 },
          columnStyles: { 0: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
          didParseCell: function(data) {
            if (data.row.index === 3) { // VALOR DO TROCO row
              data.cell.styles.fontStyle = 'bold';
              if (data.column.index === 1) data.cell.styles.textColor = [16, 185, 129];
            }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 12;

        // List other top options
        if (sortedByTroco.length > 1) {
          doc.setFontSize(12);
          doc.setTextColor(100, 116, 139);
          doc.text('Principais Tabelas de Troco:', 14, currentY);
          currentY += 5;

          const trocoTableData = sortedByTroco.slice(0, 5).map(o => [
            o.name,
            o.tabela,
            formatCurrency(o.valorTroco),
            `${(o.novaTaxaPortabilidade || 0).toFixed(2)}%`
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [['Banco', 'Tabela', 'Vlr. Troco', 'Taxa']],
            body: trocoTableData,
            theme: 'striped',
            headStyles: { fillColor: [100, 116, 139] },
            styles: { fontSize: 8 }
          });

          currentY = (doc as any).lastAutoTable.finalY + 15;
        }
      } else {
        doc.setFontSize(10);
        doc.setTextColor(239, 68, 68); // Red 500
        doc.text('Nenhuma oferta disponível para este contrato nas regras atuais.', 14, currentY);
        currentY += 15;
      }

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('---', pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
    });

    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text('Relatório emitido pelo Sistema de Portabilidade Consignada.', pageWidth / 2, 285, { align: 'center' });

    doc.save(`relatorio_simulacoes_${firstSim.nomeCliente?.replace(/\s+/g, '_') || 'cliente'}.pdf`);
  };

  const [selectedTableIndices, setSelectedTableIndices] = useState<Record<string, number>>({});

  const handleNextTable = (bankName: string, maxTables: number) => {
    setSelectedTableIndices(prev => ({
      ...prev,
      [bankName]: ((prev[bankName] || 0) + 1) % maxTables
    }));
  };

  const handlePrevTable = (bankName: string, maxTables: number) => {
    setSelectedTableIndices(prev => ({
      ...prev,
      [bankName]: ((prev[bankName] || 0) - 1 + maxTables) % maxTables
    }));
  };

  const parcelasPagas = simData?.parcelasPagas;

  return (
    <div className="flex w-full min-h-screen bg-background text-foreground">
      {/* Desktop Simulator Sidebar with Animation */}
      <motion.div 
        initial={false}
        animate={{ 
          width: isSimulatorOpen ? 520 : 0,
          opacity: isSimulatorOpen ? 1 : 0,
          x: isSimulatorOpen ? 0 : -520
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="hidden md:flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-800 bg-background-light dark:bg-background-dark sticky top-0 h-screen overflow-y-auto"
      >
        <div className="w-[520px]">
          <SimulationForm isEmbedded={true} />
        </div>
      </motion.div>

      <div className={`flex flex-col flex-1 min-w-0 bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display pb-20 pt-2`}>
        <div className="w-full max-w-5xl mx-auto">
          <QuotaAlert />
          {/* Top Header */}
          <div className="flex items-center bg-white/80 dark:bg-black/80 backdrop-blur-md p-2 sticky top-0 z-40 border-b border-slate-100 dark:border-white/10 rounded-b-2xl mx-4 shadow-sm">
            <Link href="/simulacao/nova" className="text-slate-900 dark:text-slate-100 flex size-8 shrink-0 items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h2 className="text-slate-900 dark:text-slate-100 text-base font-bold leading-tight tracking-tight flex-1 text-center">
              Recomendações de Bancos
            </h2>
            
            {/* Nova Simulação Button (Desktop only) */}
            <button 
              onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
              className="hidden md:flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tight hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95"
            >
              <Calculator className="w-4 h-4" />
              <span>{isSimulatorOpen ? 'Fechar Simulador' : 'Nova Simulação'}</span>
            </button>
            
            <div className="w-8 md:hidden" /> {/* Spacer for mobile centering */}
          </div>

          {/* Summary Section */}
          {allSimulations.length > 1 && (
            <div className="mx-4 mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {allSimulations.map((sim, idx) => (
                <button
                  key={sim.id}
                  onClick={() => setActiveSimulationIndex(idx)}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border-2 flex items-center gap-2 ${
                    activeSimulationIndex === idx 
                      ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105' 
                      : 'bg-white dark:bg-surface-dark border-slate-100 dark:border-white/5 text-slate-500 hover:border-primary/50'
                  }`}
                >
                  <Landmark className={`w-3 h-3 ${activeSimulationIndex === idx ? 'text-white' : 'text-slate-400'}`} />
                  <span>Contrato #{idx + 1}</span>
                  {activeSimulationIndex === idx && (
                     <div className="size-1.5 rounded-full bg-white animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          )}

          {simData && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 mt-4 bg-white dark:bg-surface-dark rounded-2xl p-4 border border-slate-200 dark:border-white/10 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-white/5 pb-2">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <History className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-tight">Resumo da Simulação</h3>
                </div>
                <div className="flex items-center gap-2">
                  {allSimulations.length > 1 && (
                    <button 
                      onClick={handleGenerateGlobalPDF}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                    >
                      <Download className="w-3 h-3" />
                      Relatório Geral
                    </button>
                  )}
                  <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-black uppercase">
                    Validação Ativa
                  </div>
                </div>
              </div>

              {(simData.nomeCliente || simData.cpfCliente) && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-white/5">
                  {simData.nomeCliente && (
                    <div className="flex flex-col sm:col-span-3">
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Cliente</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{simData.nomeCliente}</span>
                    </div>
                  )}
                  {simData.cpfCliente && (
                    <div className="flex flex-col sm:col-span-1">
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">CPF</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{simData.cpfCliente}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                <div className="space-y-1 col-span-2 sm:col-span-2">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Banco Atual</p>
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-400 flex items-center justify-center shrink-0">
                      <Landmark className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{simData.bancoAtual}</p>
                  </div>
                </div>
                <div className="space-y-1 col-span-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Saldo Devedor</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(simData.saldoDevedor)}</p>
                </div>
                <div className="space-y-1 col-span-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">
                    {(simData?.negativeCardValue || 0) > 0 ? 'Nova Parcela' : 'Parcela'}
                  </p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {formatCurrency(Math.max(0, (simData?.valorParcela || 0) - (simData?.negativeCardValue || 0)))}
                  </p>
                </div>
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Convênio/Idade</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{simData.convenio} • {simData.idade} anos</p>
                </div>
                <div className="space-y-1 col-span-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Parcelas Pagas</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-primary">
                      {parcelasPagas !== undefined ? parcelasPagas : (simData ? (parseInt(simData.prazoTotal || 0) - parseInt(simData.parcelasRestantes || 0)) : 0)} 
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium">de {simData.prazoTotal}x</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Filters Section */}
          <div className="flex items-center gap-2 px-4 py-1.5 bg-white/90 dark:bg-black/90 backdrop-blur-sm border-b border-slate-100 dark:border-white/10 sticky top-[60px] z-30 mx-4 mt-1 rounded-xl shadow-sm">
        <div className="relative flex-1">
          <button 
            onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
            className="flex w-full h-9 items-center justify-between rounded-xl px-4 text-[11px] font-black uppercase tracking-tight transition-all border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-dark shadow-sm hover:border-primary/50"
          >
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-primary animate-pulse" />
              <span className="text-slate-500 dark:text-slate-400">Classificar por:</span>
              <span className="text-primary">
                {sortBy === 'menor_troco' ? 'Melhor Oferta' : sortBy === 'valor_troco' ? 'Melhor Troco' : 'Maior Contrato'}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isSortDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsSortDropdownOpen(false)}
              />
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
              >
                {[
                  { id: 'menor_troco', label: 'Melhor Oferta', desc: 'Menor valor de troco (ideal para portabilidade pura)' },
                  { id: 'valor_troco', label: 'Melhor Troco', desc: 'Maior valor liberado na conta' },
                  { id: 'valor_contrato', label: 'Maior Contrato', desc: 'Maior valor total de contrato' }
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setSortBy(option.id as SortOption);
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full flex flex-col items-start p-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 last:border-0 ${
                      sortBy === option.id ? 'bg-primary/5' : ''
                    }`}
                  >
                    <span className={`text-[10px] font-black uppercase tracking-tight ${sortBy === option.id ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                      {option.label}
                    </span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {option.desc}
                    </span>
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </div>

        {/* Bank Filter Dropdown moved here for better layout */}
        {uniqueBanks.length > 0 && (
          <div className="relative w-32 sm:w-40">
            <select
              value={selectedBankFilter}
              onChange={(e) => setSelectedBankFilter(e.target.value)}
              className="w-full bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm appearance-none pr-8 h-9"
            >
              <option value="all">Todos Bancos</option>
              {uniqueBanks.map(bankName => (
                <option key={bankName} value={bankName}>{bankName}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      {/* View Toggle and Filter */}
      <div className="px-4 pt-2 pb-1">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex flex-1 bg-slate-100 dark:bg-slate-800/50 p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
            <button
              onClick={() => setShowAllOffers(false)}
              className={`flex-1 py-1.5 text-[10px] font-black rounded-md transition-all duration-300 uppercase tracking-tight ${!showAllOffers ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              Principais Ofertas
            </button>
            <button
              onClick={() => setShowAllOffers(true)}
              className={`flex-1 py-1.5 text-[10px] font-black rounded-md transition-all duration-300 uppercase tracking-tight ${showAllOffers ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              Todas Ofertas ({allCalculatedOffersCount})
            </button>
          </div>
        </div>

        {/* Filtro Prazo Refin de Port */}
        {availablePrazos.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center mt-2">
            <div className="flex flex-1 bg-slate-100 dark:bg-slate-800/50 p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
              {availablePrazos.map(prazo => {
                const countForPrazo = allCalculatedOffers.filter(o => o.prazoRefinPort === prazo).length;
                return (
                  <button
                    key={prazo}
                    onClick={() => setSelectedPrazoFilter(prazo)}
                    className={`flex-1 py-1.5 text-[10px] font-black rounded-md transition-all duration-300 uppercase tracking-tight ${selectedPrazoFilter === prazo ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    {prazo}X ({countForPrazo})
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recommendations List */}
      <div className={`flex flex-col gap-3 p-4 ${showAllOffers ? 'pt-4' : 'pt-2'}`}>
        {!showAllOffers && sortedBanks.length > 0 && (
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Principais Ofertas
              <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {sortedBanks.length} encontradas
              </span>
            </h2>
            {profile?.role === 'admin' && (
              <button
                onClick={handleAIShareWhatsApp}
                disabled={isAISummarizing || sortedBanks.length === 0}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all shadow-lg shadow-emerald-500/20"
              >
                {isAISummarizing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Resumo IA WhatsApp
              </button>
            )}
          </div>
        )}
        {sortedBanks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-white/10">
            <Banknote className="w-12 h-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Nenhuma tabela disponível para essas condições</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Não encontramos bancos elegíveis para os dados informados na simulação.
            </p>
            <Link href="/simulacao/nova" className="mt-8 bg-primary text-white px-8 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 active:scale-95">
              Refazer Simulação
            </Link>
          </div>
        ) : (
        <>
          {sortedBanks.map((bank, index) => {
            // Get all offers for this specific bank
            const bankOffers = offersWithPrazo
              .filter(o => o.name === bank.name)
              .sort((a, b) => {
                if (bank.convenio === 'SIAPE' && bank.name.toUpperCase() === 'BRB') {
                  const isTabela2A = a.tabela.toLowerCase().includes('tabela 2') || a.tabela.includes('2');
                  const isTabela2B = b.tabela.toLowerCase().includes('tabela 2') || b.tabela.includes('2');
                  if (isTabela2A && !isTabela2B) return 1;
                  if (!isTabela2A && isTabela2B) return -1;
                  return b.valorTroco - a.valorTroco;
                }

                if (sortBy === 'menor_troco') return a.valorTroco - b.valorTroco;
                if (sortBy === 'valor_troco') return b.valorTroco - a.valorTroco;
                if (sortBy === 'valor_contrato') return b.valorContrato - a.valorContrato;
                return 0;
              });
            
            const currentTableIndex = selectedTableIndices[bank.name] || 0;
            const currentOffer = bankOffers[currentTableIndex] || bank;

            let badge = null;
            let badgeColor = '';
            let badgeBg = '';
            let isMelhorTroco = false;
            let isMaiorContrato = false;
            let badgeIcon = null;
            
            if (!showAllOffers) {
              // In Principais Ofertas, badges reflect the current filter and rank
              // 1st, 2nd, 3rd highlighted
              
              if (index === 0) {
                badge = 'MELHOR OFERTA';
                badgeColor = 'text-emerald-700 dark:text-emerald-300';
                badgeBg = 'bg-emerald-400/20 dark:bg-emerald-500/30';
                badgeIcon = <Star className="w-3 h-3 fill-emerald-500" />;
              } else if (index === 1) {
                badge = '2ª MELHOR OFERTA';
                badgeColor = 'text-blue-700 dark:text-blue-300';
                badgeBg = 'bg-blue-400/20 dark:bg-blue-500/30';
                badgeIcon = <Star className="w-3 h-3 fill-blue-500" />;
              } else if (index === 2) {
                badge = '3ª MELHOR OFERTA';
                badgeColor = 'text-amber-700 dark:text-amber-300';
                badgeBg = 'bg-amber-400/20 dark:bg-amber-500/30';
                badgeIcon = <Star className="w-3 h-3 fill-amber-500" />;
              } else {
                badge = `${index + 1}ª OFERTA`;
                badgeColor = 'text-slate-500 dark:text-slate-400';
                badgeBg = 'bg-slate-500/10 dark:bg-slate-500/20';
              }
              
              isMelhorTroco = sortBy === 'valor_troco' && index === 0;
              isMaiorContrato = sortBy === 'valor_contrato' && index === 0;
            } else {
              // In All Offers, keep absolute winners badges
              if (currentOffer.valorTroco === minValorTroco && sortedBanks.length > 1) {
                badge = 'MELHOR OFERTA';
                badgeColor = 'text-emerald-600 dark:text-emerald-400';
                badgeBg = 'bg-emerald-500/10 dark:bg-emerald-500/20';
                badgeIcon = <Star className="w-2.5 h-2.5 fill-emerald-500" />;
              } else if (currentOffer.valorTroco === maxValorTroco && sortedBanks.length > 1) {
                badge = 'MELHOR TROCO';
                badgeColor = 'text-amber-600 dark:text-amber-400';
                badgeBg = 'bg-amber-500/10 dark:bg-amber-500/20';
                badgeIcon = <Sparkles className="w-2.5 h-2.5 fill-amber-500" />;
                isMelhorTroco = true;
              } else if (currentOffer.valorTroco + currentOffer.saldoDevedor === maxValorContrato && sortedBanks.length > 1) {
                badge = 'MAIOR CONTRATO';
                badgeColor = 'text-blue-600 dark:text-blue-400';
                badgeBg = 'bg-blue-500/10 dark:bg-blue-500/20';
                isMaiorContrato = true;
              }
            }

            const isTop1 = index === 0 && !showAllOffers;
            const isTop2 = index === 1 && !showAllOffers;
            const isTop3 = index === 2 && !showAllOffers;

            return (
              <motion.div 
                key={bank.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
                className={`group flex flex-col gap-1.5 rounded-2xl bg-white dark:bg-surface-dark ${showAllOffers ? 'p-3' : 'p-3'} shadow-sm hover:shadow-xl border-2 transition-all relative overflow-hidden ${
                  isTop1 ? 'border-primary/30 ring-4 ring-primary/5 shadow-md shadow-primary/10' : 
                  isTop2 ? 'border-blue-500/20 shadow-md' :
                  'border-slate-200 dark:border-white/10'
                } hover:border-primary/50`}
              >
                {/* Background effects for top offers */}
                {isTop1 && <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 blur-3xl pointer-events-none" />}
                {isTop2 && <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 blur-3xl pointer-events-none" />}
                {isTop3 && <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 blur-3xl pointer-events-none" />}
                
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                
                {badge && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className={`${badgeBg} ${badgeColor} px-3 py-1 rounded-bl-xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1.5 backdrop-blur-md border-l border-b border-white/20`}>
                      {badgeIcon}
                      {badge}
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2 relative z-10">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1 min-w-0">
                      <div className="w-14 h-14 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm relative shrink-0">
                        <div className="relative w-full h-full">
                          <Image
                            src={currentOffer.logo}
                            alt={`${currentOffer.name} logo`}
                            fill
                            unoptimized
                            className="object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-slate-900 dark:text-slate-100 text-base font-bold leading-tight truncate">{currentOffer.name}</h3>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 text-white shadow-sm ${
                            currentOffer.convenio === 'SIAPE' 
                              ? 'bg-[#f59e0b]' 
                              : currentOffer.convenio === 'GOVERNO'
                              ? 'bg-[#FF0000]'
                              : currentOffer.convenio === 'FORÇAS ARMADAS'
                              ? 'bg-[#47953D]'
                              : 'bg-[#1152d4]'
                          }`}>
                            {currentOffer.convenio}
                          </span>
                          {currentOffer.subConvenio && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 bg-slate-500 text-white shadow-sm">
                              {currentOffer.subConvenio}
                            </span>
                          )}
                        </div>
                        {bankOffers.length > 1 && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                              {availablePrazos.length > 0 
                                ? `${bankOffers.length} tabelas em ${selectedPrazoFilter}X`
                                : `${bankOffers.length} ofertas disponíveis`}
                            </p>
                            <div className="flex gap-1.5 items-center">
                              <button 
                                onClick={() => handlePrevTable(bank.name, bankOffers.length)}
                                className="size-7 flex items-center justify-center rounded-xl bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20 active:scale-90"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <span className="text-[11px] font-black text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700">{currentTableIndex + 1}/{bankOffers.length}</span>
                              <button 
                                onClick={() => handleNextTable(bank.name, bankOffers.length)}
                                className="size-7 flex items-center justify-center rounded-xl bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20 active:scale-90"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={`${currentOffer.id}-${currentTableIndex}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ 
                          type: "spring",
                          stiffness: 300,
                          damping: 30
                        }}
                        className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1"
                      >
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <p className="text-xs font-medium truncate">
                            Tabela: <span className="text-slate-900 dark:text-white font-bold">{currentOffer.tabela}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Banknote className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <p className="text-xs font-medium truncate">
                            {(simData?.negativeCardValue || 0) > 0 ? 'Nova Parcela: ' : 'Parcela: '}
                            <span className="text-slate-900 dark:text-white font-bold">
                              {formatCurrency(Math.max(0, (simData?.valorParcela || 0) - (simData?.negativeCardValue || 0)))}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <p className="text-xs font-medium truncate">
                            Prazo: <span className="text-slate-900 dark:text-white font-bold">{currentOffer.prazoRefinPort || (simData?.subConvenio === 'Marinha' ? 72 : (simData?.prazoTotal || 96))}X</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Banknote className={`w-3.5 h-3.5 ${isMaiorContrato ? 'text-blue-500' : 'text-slate-400'} shrink-0`} />
                          <p className="text-xs font-medium truncate">
                            Contrato: <span className={`${isMaiorContrato ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'} font-bold`}>{formatCurrency(currentOffer.valorContrato)}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Banknote className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <p className="text-xs font-medium truncate">
                            Saldo Dev.: <span className="text-slate-900 dark:text-white font-bold">{formatCurrency(currentOffer.saldoDevedor)}</span>
                          </p>
                        </div>
                        {currentOffer.taxaBase !== undefined && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Percent className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <p className="text-xs font-medium truncate">
                              Taxa do Refin: <span className="text-slate-900 dark:text-white font-bold">
                                {currentOffer.taxaBase.toFixed(2)}%
                              </span>
                            </p>
                          </div>
                        )}
                        {currentOffer.novaTaxaPortabilidade !== undefined && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Percent className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <p className="text-xs font-medium truncate">
                              Nova Taxa Port.: <span className="text-slate-900 dark:text-white font-bold">{currentOffer.novaTaxaPortabilidade.toFixed(2)}%</span>
                            </p>
                          </div>
                        )}
                        {profile?.role === 'admin' && currentOffer.useTaxaPonderada && currentOffer.novaTaxaPortabilidade !== undefined && currentOffer.originalRateCalculated !== undefined && (
                          <div className="flex flex-col gap-1 col-span-2 mt-1 p-2 bg-primary/5 rounded-lg border border-primary/10">
                            <div className="flex items-center gap-1.5 text-primary">
                              <Calculator className="w-3.5 h-3.5 shrink-0" />
                              <p className="text-[10px] font-bold uppercase">Cálculo Taxa Ponderada (Mesa)</p>
                            </div>
                             <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium tracking-tight">
                               ({currentOffer.originalRateCalculated.toFixed(2)}% + {currentOffer.novaTaxaPortTarget?.toFixed(2) || currentOffer.novaTaxaPortabilidade.toFixed(2)}%)/2 
                               {currentOffer.ajusteTaxaPonderada !== undefined && currentOffer.ajusteTaxaPonderada !== 0 && (
                                 currentOffer.ajusteTaxaPonderada > 0 
                                   ? ` + ${currentOffer.ajusteTaxaPonderada.toFixed(2).replace('.', ',')}` 
                                   : ` - ${Math.abs(currentOffer.ajusteTaxaPonderada).toFixed(2).replace('.', ',')}`
                               )}
                               <span className="font-bold text-primary ml-1">= {currentOffer.taxaPonderada.toFixed(2)}%</span>
                             </p>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <div className="flex flex-col items-end gap-0 mt-0.5 shrink-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest">VALOR TROCO</p>
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.p 
                        key={currentOffer.valorTroco}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        transition={{ 
                          type: "spring",
                          stiffness: 400,
                          damping: 25
                        }}
                        className={`text-2xl sm:text-3xl font-black tracking-tighter ${isTop1 || isMelhorTroco ? 'text-primary' : 'text-slate-900 dark:text-white'} whitespace-nowrap drop-shadow-sm`}
                      >
                        {formatCurrency(currentOffer.valorTroco)}
                      </motion.p>
                    </AnimatePresence>
                    
                    <div className="flex items-center gap-1.5 mt-1">
                      <button 
                        onClick={() => handleShareWhatsApp(currentOffer)}
                        className="flex items-center justify-center gap-1.5 rounded-lg p-1.5 text-xs font-bold transition-all duration-300 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white"
                        title="Compartilhar WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleGeneratePDF(currentOffer)}
                        className={`flex items-center justify-center gap-1.5 rounded-lg p-1.5 text-xs font-bold transition-all duration-300 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700`}
                        title="Baixar PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Validation Seals & Rules Container */}
                <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
                  <div className="flex flex-wrap gap-1">
                    <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-emerald-500/20">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Convênio OK</span>
                    </div>
                    <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Idade OK</span>
                    </div>

                    {/* New Seal: 60 Mais */}
                    {currentOffer.is60Mais && (
                      <div className="flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-amber-500/20 shadow-sm animate-pulse">
                        <Star className="w-3.5 h-3.5 fill-amber-500" />
                        <span>Cliente 60+ OK</span>
                      </div>
                    )}

                    {/* New Seal: Analfabeto */}
                    {currentOffer.isAnalfabeto && (
                      <div className="flex items-center gap-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-indigo-500/20">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Analfabeto OK</span>
                      </div>
                    )}

                    {/* New Seal: Invalidez (Espécie 32/92) */}
                    {currentOffer.isInvalidity && (
                      <div className="flex items-center gap-1 bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-red-500/20">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Espécie Invalidez OK</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-blue-500/20">
                      <History className="w-3.5 h-3.5" />
                      <span>{parcelasPagas !== undefined ? parcelasPagas : (simData ? (parseInt(simData.prazoTotal || 0) - parseInt(simData.parcelasRestantes || 0)) : 0)} Parc. Pagas</span>
                    </div>

                    {/* Saldo Devedor Validation Seal */}
                    {(currentOffer.hasMinBalanceRule) && (
                      <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-emerald-500/20">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Saldo Validado</span>
                      </div>
                    )}
                    
                    {/* Specific dynamic rules */}
                    {currentOffer.rules && currentOffer.rules.length > 0 && currentOffer.rules.map((rule: string, iIdx: number) => (
                      <div key={`${currentOffer.id}-${iIdx}`} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-slate-200 dark:border-slate-700">
                        <Sparkles className="w-3.5 h-3.5 text-primary opacity-50" />
                        <span>{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => handleSelectOffer(currentOffer)}
                  className={`w-full text-white text-sm font-black uppercase tracking-tight py-3.5 rounded-xl transition-all shadow-lg active:scale-[0.98] mt-2 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 shadow-primary/20 hover:shadow-primary/30`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>{isTop1 ? 'Escolher Melhor Oferta' : 'Selecionar e Salvar'}</span>
                </button>
              </motion.div>
            );
          })}
          
          {(() => {
            const validBanksNames = new Set(allCalculatedOffers.map(o => o.name.trim()));
            const currentSimConvenio = (simData?.convenio || 'INSS').trim().toUpperCase();
            
            // Filter by convention and exclusion
            const excludedBanks = banks.filter(bank => {
              const bConv = (bank.convenio || 'INSS').trim().toUpperCase();
              const bConvs = Array.isArray(bank.convenios) ? bank.convenios.map(c => String(c).trim().toUpperCase()) : [bConv];
              
              const sameConvenio = bConvs.includes(currentSimConvenio);
              const notAlreadyValid = !validBanksNames.has(bank.name.trim());
              
              return notAlreadyValid && sameConvenio;
            });
            
            // Unique by name to avoid repetitions
            const uniqueExcludedBanks: any[] = [];
            const seenNames = new Set();
            excludedBanks.forEach(b => {
              const normalizedName = b.name.trim().toLowerCase();
              if (!seenNames.has(normalizedName)) {
                seenNames.add(normalizedName);
                uniqueExcludedBanks.push(b);
              }
            });
            
            if (uniqueExcludedBanks.length === 0) return null;
            
            return (
              <div className="mt-8 mb-4">
                 <h3 className="text-sm font-bold text-slate-500 mb-3 px-4 uppercase tracking-wider">Outros Bancos Indisponíveis ({currentSimConvenio})</h3>
                 {uniqueExcludedBanks.map(bank => {
                   const reasons = filterReasons.filter(r => r.bankName.trim().toLowerCase() === bank.name.trim().toLowerCase());
                   
                   let mainReason = "Banco indisponível para esta configuração.";
                   if (reasons.length > 0) {
                     // Prioritize specific rejection reasons like Analfabeto, 60+, Invalidez, Saldo
                     const priorityRejections = reasons.filter(r => 
                        r.reason.includes("Analfabeto") || 
                        r.reason.includes("60+") || 
                        r.reason.includes("Invalidez") || 
                        r.reason.includes("Saldo devedor")
                     );

                     // Also check weighted rate failures
                     const rateFailures = reasons.filter(r => r.reason.includes("Taxa ponderada"));
                     
                     if (priorityRejections.length > 0) {
                       mainReason = priorityRejections[0].reason;
                     } else if (rateFailures.length > 0) {
                       rateFailures.sort((a, b) => {
                         const aVal = parseFloat(a.reason.match(/Tabela exige: ([\d,.]+)/)?.[1].replace(',', '.') || '999');
                         const bVal = parseFloat(b.reason.match(/Tabela exige: ([\d,.]+)/)?.[1].replace(',', '.') || '999');
                         return aVal - bVal;
                       });
                       mainReason = rateFailures[0].reason;
                     } else {
                       mainReason = reasons[0].reason;
                     }
                   }

                   return (
                     <div key={bank.id} className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5 opacity-60 grayscale mx-4 mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-700 relative overflow-hidden shrink-0 border border-slate-200 dark:border-slate-800 shadow-sm">
                            <Image src={bank.logoUrl || '/placeholder.png'} alt={bank.name} fill className="object-cover" unoptimized />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{bank.name}</h4>
                            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-500 leading-tight mt-0.5">{mainReason}</p>
                          </div>
                        </div>
                        <span className="text-[10px] uppercase font-black text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-lg">Indisponível</span>
                     </div>
                   );
                 })}
              </div>
            );
          })()}
        </>
        )}
      </div>
        </div>
      </div>
      {/* Filter Reasons Modal (Debug) */}
      {showFilterLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white">Motivos de Filtragem</h3>
              <button onClick={() => setShowFilterLog(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs">
              {filterReasons.length === 0 ? (
                <p className="text-slate-500">Nenhum banco filtrado ou dados não carregados.</p>
              ) : (
                <ul className="space-y-4">
                  {filterReasons.map((log, i) => (
                    <li key={`${log.bankName}-${log.reason}-${i}`} className="border-l-2 border-amber-500 pl-3">
                      <strong className="text-amber-600 dark:text-amber-400">{log.bankName}</strong>
                      {log.tabela && <span className="ml-2 text-slate-500">- Tabela: {log.tabela}</span>}
                      <p className="text-slate-700 dark:text-slate-300 mt-1 break-words">{log.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button for Debugging */}
      {process.env.NODE_ENV === 'development' || true ? (
        <button
          onClick={() => setShowFilterLog(true)}
          className="fixed bottom-20 right-4 z-40 bg-slate-800 text-white rounded-full p-3 shadow-lg hover:bg-slate-700 transition"
          title="Ver motivos de bancos filtrados"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      ) : null}

    </div>
  );
}
