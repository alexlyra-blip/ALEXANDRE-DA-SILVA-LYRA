'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ChevronDown, Banknote, FileText, Download, Calendar, Percent, Calculator, ChevronLeft, ChevronRight, MessageCircle, Sparkles, Loader2, LayoutDashboard, ShieldCheck, CheckCircle2, History, DollarSign, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QuotaAlert } from '@/components/QuotaAlert';
import { useState, useEffect, useRef } from 'react';
import { useRules } from '@/contexts/RuleContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { safeStringify } from '@/lib/utils';

const getAI = () => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  return new GoogleGenerativeAI(apiKey);
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
  convenio: 'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS';
  subConvenio?: string;
  tabelasCount: number;
  prazoRefinPort?: number;
}

import SimulationForm from '@/components/SimulationForm';

export default function Recomendacoes() {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<SortOption>('menor_troco');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [allCalculatedOffers, setAllCalculatedOffers] = useState<Offer[]>([]);
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>('all');
  const [simData, setSimData] = useState<any>(null);
  const [filterReasons, setFilterReasons] = useState<{bankName: string, reason: string, tabela?: string}[]>([]);
  const [showFilterLog, setShowFilterLog] = useState(false);
  const [isAISummarizing, setIsAISummarizing] = useState(false);
  const { banks, generalRules, promotoraPriorities, promotoraInstallments, isLoaded } = useRules();
  const { profile } = useAuth();
  const savedSimulationId = useRef<string | null>(null);

  const handleSelectOffer = async (offer: Offer) => {
    try {
      const simulationId = simData?.id || savedSimulationId.current || crypto.randomUUID();
      const docRef = doc(db, 'simulations', simulationId);
      
      // Comprehensive save to ensure it appears correctly in Dashboard
      await setDoc(docRef, {
        userId: simData?.userId || profile?.uid,
        userName: simData?.userName || profile?.name,
        userAvatar: simData?.userAvatar || profile?.photoUrl || profile?.avatarUrl || null,
        promotoraId: simData?.promotoraId || profile?.promotoraId || profile?.uid,
        corretorId: profile?.role === 'corretor' || profile?.role === 'vendedor' ? profile?.uid : null,
        createdBy: profile?.createdBy || null,
        createdAt: simData?.createdAt || new Date().toISOString(),
        simData: simData,
        offers: allCalculatedOffers.slice(0, 10).map(o => ({
          ...o,
          rules: [] // Remove rules to save space
        })),
        recommendedBanks: allCalculatedOffers.slice(0, 3).map(o => o.name),
        topOffer: offer.name,
        topOfferTabela: offer.tabela,
        topOfferContrato: offer.valorContrato,
        topOfferTroco: offer.valorTroco,
        topOfferTaxa: offer.novaTaxaPortabilidade,
        topOfferPrazo: offer.prazoRefinPort || (simData?.subConvenio === 'Marinha' ? 72 : (simData?.prazoTotal || 96))
      }, { merge: true });

    } catch (err) {
      console.error('Error updating selected offer in simulations:', err);
    }

    const stored = sessionStorage.getItem('selectedOffers');
    const selected = stored ? JSON.parse(stored) : [];
    selected.push(offer);
    sessionStorage.setItem('selectedOffers', safeStringify(selected));
    
    // Redirect to new proposal page
    router.push(`/propostas/nova?bank=${encodeURIComponent(offer.name)}&tabela=${encodeURIComponent(offer.tabela)}&valor=${offer.valorContrato}&troco=${offer.valorTroco}&parcela=${simData?.valorParcela || 0}&saldoDevedor=${offer.saldoDevedor}&bancoPortado=${encodeURIComponent(simData?.bancoAtual || '')}`);
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
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const topOffers = offers.slice(0, 3);
      const offersText = topOffers.map((o, i) => 
        `Oferta ${i+1}: Banco ${o.name}, Tabela ${o.tabela}, Troco de ${formatCurrency(o.valorTroco)}, Taxa de ${o.novaTaxaPortabilidade?.toFixed(2)}%`
      ).join('\n');

      const response = await model.generateContent(`Crie uma mensagem profissional e persuasiva para WhatsApp enviando os resultados de uma simulação de portabilidade de crédito consignado para um cliente.
        Dados da simulação:
        Parcela atual: ${formatCurrency(simData?.valorParcela || 0)}
        
        Principais Ofertas encontradas:
        ${offersText}
        
        A mensagem deve ser amigável, destacar o valor do troco e convidar o cliente para escolher a melhor opção. Use emojis e negrito para destacar valores.`);

      const message = response.response.text();
      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    } catch (error) {
      console.error("Erro ao gerar resumo com IA:", error);
      alert("Não foi possível gerar o resumo com IA. Tente usar o compartilhamento individual.");
    } finally {
      setIsAISummarizing(false);
    }
  };

  // 1. Load simulation data from sessionStorage
  useEffect(() => {
    const storedData = sessionStorage.getItem('simulationData');
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        setSimData(parsed);
      } catch (e) {
        console.error("Error parsing simulationData:", e);
      }
    }
  }, [isSimulatorOpen]); // Re-check when simulator closes/opens

  // 2. Calculate offers when data or rules change
  const lastSimulationTimeRef = useRef<number>(0);
  const calculationsCount = useRef<number>(0);

  useEffect(() => {
    // We only wait for isLoaded and simData. Profile is optional for basic calculation but good to have.
    if (!isLoaded || !simData || !banks.length) {
      return;
    }

    calculationsCount.current++;
    console.log(`[SIMULATION #${calculationsCount.current}] CALCULATING OFFERS -`, new Date().toLocaleTimeString());
    console.log("Banks version (last updated):", new Date(Math.max(...banks.map(b => (b as any).updatedAt || 0))).toLocaleTimeString());
    console.log("Rules being used:", banks.map(b => ({ name: b.name, id: b.id, updatedAt: (b as any).updatedAt })));
    
    if (!profile) {
      console.log("Profile not yet loaded, using fallback roles");
    }
    
    console.log("Simulation Data:", simData);

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
      isCliente60Mais
    } = simData;

    const originalRate = simData.taxaJurosMensal ? simData.taxaJurosMensal * 100 : 0;

    console.log("--- SIMULATION DATA ---", {
      idade,
      convenio: simData.convenio,
      valorParcela,
      saldoDevedor,
      taxaJurosMensal: simData.taxaJurosMensal,
      originalRate: originalRate.toFixed(4)
    });

    const calculatedOffers: Offer[] = [];
    const localFilterReasons: {bankName: string, reason: string, tabela?: string}[] = [];

    // Calculate time of benefit in months
    let benefitTimeMonths = 0;
    if (dataConcessao) {
      const concessaoDate = new Date(dataConcessao + 'T12:00:00');
      const now = new Date();
      
      let years = now.getFullYear() - concessaoDate.getFullYear();
      let months = now.getMonth() - concessaoDate.getMonth();
      
      if (now.getDate() < concessaoDate.getDate()) {
        months--;
      }
      
      if (months < 0) {
        years--;
        months += 12;
      }
      
      benefitTimeMonths = years * 12 + months;
    }

    const cleanBeneficio = codigoBeneficio.replace(/^0+/, '');

    console.log(`Processing ${banks.length} banks for simulation. Target banks: PAN, C6, FACTA, etc.`);
    // Helper function to safely match bank rules (by code or name)
    const checkBankMatch = (ruleBank: string, currentBank: string) => {
      if (!ruleBank || !currentBank) return false;
      const rule = ruleBank.trim().toLowerCase();
      const current = currentBank.trim().toLowerCase();
      
      if (current === rule) return true;
      
      const parts = current.split('-');
      if (parts.length >= 2) {
        const code = parts[0].trim();
        const name = parts.slice(1).join('-').trim();
        
        // Match exact code (e.g., "318")
        if (rule === code) return true;
        
        // Match exact name (e.g., "bmg")
        if (rule === name) return true;
        
        // Match substring in name (e.g., "bmg" inside "banco bmg")
        if (rule.length >= 2 && name.includes(rule)) return true;
      }
      
      // Fallback for partial matches, requiring at least 2 chars to avoid false positives
      return rule.length >= 2 && (current.includes(rule) || rule.includes(current));
    };

    banks.forEach(bank => {
      const log = (reason: string, tabela?: string) => {
        localFilterReasons.push({ bankName: bank.name, reason, tabela });
        console.log(`[${bank.name}] ${tabela ? `- Tabela ${tabela}: ` : ''}${reason}`);
      };

      // 0. General Cliente 60+ status
      const effectiveIs60Mais = isCliente60Mais != null ? isCliente60Mais : (idade >= 60);

      // 0. Active Filter
      if (bank.isActive === false) return;

      // 0.1 Allowed Banks Filter
      if (profile.allowedBanks && profile.allowedBanks.length > 0 && !profile.allowedBanks.includes(bank.id)) {
        log(`filtrado por allowedBanks`);
        return;
      }

      // 0.1 Convenio Filter
      const bankConvenio = bank.convenio || 'INSS'; // Default to INSS if not set
      const simConvenio = simData.convenio || 'INSS'; // Default to INSS if not set
      if (bankConvenio !== simConvenio) {
        log(`filtrado por convenio: ${bankConvenio} !== ${simConvenio}`);
        return;
      }

      // 0.2 Sub-Convenio Filter
      if (bank.subConvenio && bank.subConvenio !== simData.subConvenio) {
        log(`filtrado por subConvenio: ${bank.subConvenio} !== ${simData.subConvenio}`);
        return;
      }

      // 1. Espécie Invalidez (04, 05, 11, 30, 32, 33, 34, 92) - CHECK THIS FIRST
      const isInvalidity = ['4', '04', '5', '05', '11', '30', '32', '33', '34', '92'].includes(cleanBeneficio);
      const isLOAS = ['87', '88'].includes(cleanBeneficio);

      if (isInvalidity) {
        // 1. Rule: Aceita Espécie Invalidez field must be checked
        if (bank.acceptsInvalidez === false) {
          log(`filtrado: Banco não aceita espécie Invalidez`);
          return;
        }

        // 2. Rule: If client REAL AGE is 60+
        const isActuallyOver60 = idade >= 60;
        
        if (isActuallyOver60) {
          // Check specific Invalidez 60+ field
          if (!bank.acceptsOver60Invalidez) {
            log(`filtrado: Banco não aceita espécie Invalidez para clientes acima de 60 anos (Regra Específica Invalidez)`);
            return;
          }
          // LIBERATED: If actually 60+ and acceptsOver60Invalidez is true, we DON'T validate benefit time.
          log(`Liberado: Cliente 60+ com Invalidez aceita (sem validar tempo de benefício)`);
        } else {
          // 3. Rule: If client is < 60
          const minAgeDisability = bank.invalidezAgeYears || 0;
          
          // "se estiver como 0 e o cliente estiver menos de 60 anos não será liberado"
          if (minAgeDisability === 0) {
            log(`filtrado: Banco não configurou Idade Mínima para Invalidez < 60 (Idade Mínima = 0)`);
            return;
          }

          // Validate Minimum client age for disability
          if (idade < minAgeDisability) {
            log(`filtrado por idade mínima invalidez: ${idade} < ${minAgeDisability}`);
            return;
          }
          
          // Validate Minimum time with benefit (concession date)
          const requiredMonths = (bank.minBenefitTimeYears || 0) * 12 + (bank.minBenefitTimeMonths || 0);
          if (requiredMonths > 0 && benefitTimeMonths < requiredMonths) {
            log(`filtrado por tempo mínimo de benefício: ${benefitTimeMonths} < ${requiredMonths} meses`);
            return;
          }
        }
      }

      // 2. Parcela Mínima
      if (bank.minInstallmentValue && valorParcela < bank.minInstallmentValue) {
        log(`filtrado por minInstallmentValue`);
        return;
      }

      // 3. Saldo Mínimo
      const bSumSaldoTrocoGlobal = !!(bank.sumBalanceAndTroco || bank.sumSaldoTroco);
      if (!bSumSaldoTrocoGlobal && bank.minBalance && saldoDevedor < bank.minBalance) {
        log(`filtrado por minBalance (${saldoDevedor} < ${bank.minBalance})`);
        return;
      }

      // 4. Idade Geral
      // Se for invalidez, a regra de idade já foi validada acima (ou o banco não tem regra específica)
      // Mas o maxAge geral do banco ainda deve ser respeitado como limite absoluto
      if (!isInvalidity) {
        if ((bank.minAge > 0 && idade < bank.minAge) || (bank.maxAge > 0 && idade > bank.maxAge)) {
          log(`filtered by general age: ${idade} (min: ${bank.minAge}, max: ${bank.maxAge})`);
          return;
        }
      } else {
        // Para invalidez, se o banco NÃO tem ageLimit específico, ainda validamos o maxAge geral
        const ageLimit = bank.invalidezAgeYears || 0;
        if (ageLimit === 0 && bank.maxAge > 0 && idade > bank.maxAge) {
          log(`filtered by general maxAge (Invalidez fallback): ${idade} > ${bank.maxAge}`);
          return;
        }
        if (ageLimit > 0 && idade > ageLimit) {
          log(`filtered by specific Invalidez ageLimit: ${idade} > ${ageLimit}`);
          return;
        }
      }

      // 4.1 60 Mais
      if (effectiveIs60Mais && bank.accepts60Mais === false) {
        log(`filtered: Não aceita 60+`);
        return;
      }

      // 5. LOAS (87, 88)
      if (isLOAS) {
        if (!bank.acceptsLOAS) {
          log(`filtered by acceptsLOAS`);
          return;
        }
        if (simData.isAnalfabeto && !bank.acceptsIlliterate) {
          log(`filtered by acceptsIlliterate (LOAS)`);
          return;
        }
      }

      // 5.1 Analfabeto (Geral)
      if (simData.isAnalfabeto && !bank.acceptsIlliterate) {
        log(`filtered by acceptsIlliterate (General)`);
        return;
      }

      const targetGeneralRule = generalRules.find((r: any) => checkBankMatch(r.banco, bank.name));

      // 6. Banco Atual (Não portam)
      // Se o banco escolhido na simulação estiver na lista de bancos que NÃO PORTA, ele não será ofertado.
      if (bank.nonAcceptedBanks && bank.nonAcceptedBanks.some((b: string) => checkBankMatch(b, bancoAtual))) {
        log(`filtered by nonAcceptedBanks: ${bancoAtual} is in the exclusion list for ${bank.name}`);
        localFilterReasons[bank.id] = `O banco ${bank.name} não realiza portabilidade do ${bancoAtual}.`;
        return;
      }

      // 7. Bancos que porta com regras específicas (Quantidade de Parcelas)
      let requiredInstallments = 0;
      let hasSpecificRule = false;
      
      const effectiveParcelasPagas = parcelasPagas !== undefined ? parcelasPagas : (parseInt(prazoTotal || 0) - parseInt(parcelasRestantes || 0));

      // Verifica se o banco de origem consta no campo "Bancos que porta com regras específicas"
      const specificRule = bank.specificInstallmentRules?.find((r: any) => checkBankMatch(r.bank, bancoAtual));
      
      if (specificRule) {
        // Se houver regra específica, ela é SOBERANA e ÚNICA para este par de bancos.
        requiredInstallments = parseInt(specificRule.installments) || 0;
        hasSpecificRule = true;
        log(`Specific rule found for ${bank.name} -> ${bancoAtual}: requires ${requiredInstallments} installments.`);
      } else {
        // Se NÃO estiver na lista específica, segue a hierarquia normal de regras de parcelas
        
        // 1. Regra da Promotora/Broker para este banco de origem
        const pInstallment = promotoraInstallments[bancoAtual];
        if (pInstallment !== undefined && pInstallment > 0) {
          requiredInstallments = pInstallment;
        } else {
          // 2. Regra Geral do sistema para este banco de origem
          const generalRule = generalRules.find((r: any) => checkBankMatch(r.banco, bancoAtual));
          if (generalRule) {
            requiredInstallments = generalRule.parcelasAceitas;
          }
        }
        
        // 3. Consolida com o limite mínimo padrão do Banco de Destino (o mais restritivo prevalece)
        const bankGeneralLimit = bank.minPaidInstallments || targetGeneralRule?.parcelasAceitas || 0;
        
        requiredInstallments = Math.max(requiredInstallments, bankGeneralLimit);
      }

      // FILTRO FINAL DE PARCELAS: A quantidade de parcelas deve ser IGUAL ou MAIOR a quantidade informada.
      if (requiredInstallments > 0 && effectiveParcelasPagas < requiredInstallments) {
        log(`filtered by installments: current ${effectiveParcelasPagas} < required ${requiredInstallments} (${hasSpecificRule ? 'Specific Rule' : 'General Hierarchy'})`);
        localFilterReasons[bank.id] = `O banco ${bank.name} exige no mínimo ${requiredInstallments} parcelas pagas para portar ${bancoAtual}.`;
        return;
      }

      let hasValidTable = false;

      // If eligible, calculate for each table
      if (bank.tabelas && bank.tabelas.length > 0) {
        bank.tabelas.forEach((tabela: any) => {
          const parseRate = (val: any) => {
            if (val === undefined || val === null || val === '') return 0;
            if (typeof val === 'number') return val;
            return parseFloat(String(val).replace(',', '.')) || 0;
          };

          const coef = tabela.coeficiente;
          
          // Skip if coefficient is not valid for division
          if (!coef || coef <= 0) {
            log(`invalid coefficient ${coef}`, tabela.nome);
            return;
          }

          const valorContrato = valorParcela / coef;
          const valorTroco = valorContrato - saldoDevedor;
          
          // REFINEMENT: Ticket Mínimo / Saldo Mínimo Check
          const bSumSaldoTroco = bSumSaldoTrocoGlobal || !!tabela.somaSaldoTroco;

          // Se a opção de somar estiver ativa, validamos o Saldo+Troco contra o Saldo Mínimo do Banco
          if (bSumSaldoTroco && bank.minBalance && (saldoDevedor + valorTroco) < bank.minBalance) {
            log(`filtered by minBalance (Balance + Troco): ${(saldoDevedor + valorTroco).toFixed(2)} < ${bank.minBalance}`, tabela.nome);
            return;
          }

          const valorAValidar = bSumSaldoTroco ? (saldoDevedor + valorTroco) : saldoDevedor;
          
          const bankMinTroco = parseRate(bank.minTroco);
          const tableMinTicket = (tabela.useMinTicket === true) ? parseRate(tabela.minTicket) : 0;
          const effectiveMinTicket = tableMinTicket > 0 ? tableMinTicket : bankMinTroco;

          if (effectiveMinTicket > 0 && valorAValidar < effectiveMinTicket) {
            log(`filtered by minTicket (${bSumSaldoTroco ? 'Saldo+Troco' : 'Saldo'}): ${valorAValidar.toFixed(2)} < ${effectiveMinTicket.toFixed(2)}`, tabela.nome);
            return;
          }

          // 2. Parcela Mínima
          if (bank.minInstallmentValue && valorParcela < bank.minInstallmentValue) {
            log(`filtered by minInstallmentValue: ${valorParcela} < ${bank.minInstallmentValue}`, tabela.nome);
            return;
          }

          const tTabela = parseRate(tabela.taxaTabela);
          const taxaTabelaValida = tTabela > 0 ? tTabela : parseRate(bank.refinRate);
          const bankAdjustment = parseRate(bank.ajusteTaxa);
          
          const tDiferencial = parseRate(tabela.taxaDiferencial);
          const bankNovaTaxaRef = parseRate(bank.novaTaxaReferencia);
          const bankPortRate = parseRate(bank.portabilityRate);
          
          // --- CORREÇÃO CÁLCULO TAXA PONDERADA ---
          // 1. Calcular a "NOVA TAXA PORT."
          const novaTaxaPort = Number((originalRate + bankAdjustment).toFixed(2));
          
          // 2. Validação da Taxa Mínima do Banco (Piso)
          // Regra: Se a "Nova Taxa Port." for menor que a "Taxa Mínima" do banco, o banco não fica disponível.
          if (bankPortRate > 0 && novaTaxaPort < bankPortRate) {
            log(`FILTRADO POR TAXA MÍNIMA: Nova Taxa Port. (${novaTaxaPort.toFixed(2)}%) < Taxa Mínima do Banco (${bankPortRate.toFixed(2)}%)`, tabela.nome);
            return;
          }
          
          // 3. Calcular a TAXA PONDERADA para o Filtro da Mesa
          // Regra Correta: (TAXA ATUAL + NOVA TAXA PORT) / 2 + AJUSTE
          const orig = Number(originalRate.toFixed(2));
          
          const taxaPonderadaBase = Math.round(((orig + novaTaxaPort) / 2) * 100) / 100;
          const ajusteTabela = Number((parseFloat(tabela.ajusteTaxaPonderada) || 0).toFixed(2));
          const taxaPonderadaFinal = Math.round((taxaPonderadaBase + ajusteTabela) * 100) / 100;
          
          const bUseTaxaPonderada = Boolean(tabela.useTaxaPonderada);
          
          // PRIORIDADE ROBUSTA DEBUG
          if (bank.name.toLowerCase().includes('digio') || bank.name.toLowerCase().includes('dibio') || bank.name.toLowerCase().includes('c6')) {
             console.log(`[DEBUG RATES] Banco: ${bank.name}, Tabela: ${tabela.nome}`);
             console.log(`   Taxa Atual (Orig): ${orig}%`);
             console.log(`   Nova Taxa Port: ${novaTaxaPort}%`);
             console.log(`   Taxa Mínima (Piso): ${bankPortRate}%`);
             console.log(`   Taxa Ponderada (Base): ${taxaPonderadaBase}%`);
             console.log(`   Ajuste Ponderada: ${ajusteTabela}%`);
             console.log(`   Taxa Ponderada Final: ${taxaPonderadaFinal}%`);
          }

          // CRITICAL FILTER: As tabelas só devem ser ofertadas se a taxa base da tabela for menor ou igual a 'Taxa Ponderada'
          // weighted rate is the maximum allowed table rate in this mode.
          if (bUseTaxaPonderada === true) {
            if (taxaTabelaValida > 0 && taxaTabelaValida > taxaPonderadaFinal) {
              log(`FILTRADO POR TAXA PONDERADA: Taxa Tabela (${taxaTabelaValida.toFixed(2)}%) > Taxa Ponderada (${taxaPonderadaFinal.toFixed(2)}%)`, tabela.nome);
              return;
            }
          }
          
          // Final portability rate to be used in installments calculation
          const finalNovaTaxaPort = novaTaxaPort;

          const taxaPonderada = taxaPonderadaFinal;
          const rules: string[][] = [];

          // POPULAR REGRAS/SELOS VISUAIS
          if (bank.acceptsLOAS) rules.push(['Aceita LOAS']); // Manteve o LOAS porque o usuário não pediu para mudar, mas podemos filtrar também
          if (bank.acceptsIlliterate && simData.isAnalfabeto) rules.push(['Aceita Analfabeto']);
          if (bank.acceptsInvalidez !== false && isInvalidity) rules.push(['Aceita Invalidez']);
          if (bank.accepts60Mais && (simData.idade >= 60 || simData.isCliente60Mais)) rules.push(['Aceita 60+']);
          if (bank.sumBalanceAndTroco || bank.sumSaldoTroco) rules.push(['Soma Saldo+Troco']);
          if (tabela.useTaxaPonderada) rules.push(['Taxa Ponderada Mesa']);

          // Regra final de elegibilidade básica
          if (valorTroco <= 0) {
            log(`filtered by valorTroco <= 0: ${valorTroco.toFixed(2)}`, tabela.nome);
            return;
          }

          hasValidTable = true;
          calculatedOffers.push({
              id: `${bank.id}-${tabela.nome}`,
              name: bank.name,
              logo: bank.logoUrl || 'https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?q=80&w=100&auto=format&fit=crop',
              tabela: tabela.nome,
              valorContrato,
              valorTroco,
              saldoDevedor,
              novaTaxaPortabilidade: novaTaxaPort,
              novaTaxaPortTarget: novaTaxaPort,
              taxaPonderada,
              originalRateCalculated: orig,
              taxaBase: taxaTabelaValida,
              priority: (targetGeneralRule?.priority && targetGeneralRule.priority > 0) ? targetGeneralRule.priority : (bank.priority || 0),
              rules,
              convenio: bank.convenio || 'INSS',
              subConvenio: bank.subConvenio,
              tabelasCount: bank.tabelas.length,
              prazoRefinPort: tabela.prazoRefinPort,
              ajusteTaxaPonderada: ajusteTabela,
              useTaxaPonderada: bUseTaxaPonderada
            });
        });
      } else {
        log(`filtered: sem tabelas`);
      }
      
      if (!hasValidTable && bank.tabelas && bank.tabelas.length > 0) {
        // Se tinha tabelas mas nenhuma passou, log extra opcional
      }
    });

    // Sort calculated offers before comparison and state update
    calculatedOffers.sort((a, b) => {
      const bankIdA = a.id.split('-')[0];
      const bankIdB = b.id.split('-')[0];
      
      const pA = promotoraPriorities[bankIdA] ?? a.priority ?? 999;
      const pB = promotoraPriorities[bankIdB] ?? b.priority ?? 999;
      
      const finalPA = (pA === 0 || pA === undefined) ? 999 : pA;
      const finalPB = (pB === 0 || pB === undefined) ? 999 : pB;
      
      if (finalPA !== finalPB) {
        return finalPA - finalPB;
      }
      return b.valorTroco - a.valorTroco;
    });

    // Check if offers actually changed before updating state
    const currentOffersStr = JSON.stringify(calculatedOffers);
    const prevOffersStr = JSON.stringify(allCalculatedOffers);

    if (currentOffersStr !== prevOffersStr) {
        console.log(`[SIMULATION #${calculationsCount.current}] UPDATING OFFERS STATE - Found ${calculatedOffers.length} offers`);
        setAllCalculatedOffers(calculatedOffers);
    }
    
    // Guard filter reasons update
    const currentReasonsStr = JSON.stringify(localFilterReasons);
    const prevReasonsStr = JSON.stringify(filterReasons);
    if (currentReasonsStr !== prevReasonsStr) {
      setFilterReasons(localFilterReasons);
    }
    
    // Save simulation to Firestore if it hasn't been saved yet
    if (simulationId && savedSimulationId.current !== simulationId && calculatedOffers.length > 0) {
      savedSimulationId.current = simulationId;
      
      const topOffer = calculatedOffers[0];
      const simulationRecord = {
        ...simData,
        userId: profile?.uid,
        userName: profile?.name,
        userAvatar: profile?.avatarUrl || profile?.photoUrl || null,
        userRole: profile?.role,
        corretorId: (profile?.role === 'corretor' || profile?.role === 'vendedor') ? profile?.uid : null,
        createdBy: profile?.createdBy || null,
        promotoraId: profile?.role === 'promotora' ? profile?.uid : (profile?.promotoraId || profile?.createdBy || 'admin'),
        recommendedBanks: calculatedOffers.slice(0, 3).map(o => o.name),
        topOffer: topOffer?.name || null,
        topOfferTabela: topOffer?.tabela || null,
        topOfferContrato: topOffer?.valorContrato || 0,
        topOfferTroco: topOffer?.valorTroco || 0,
        topOfferTaxa: topOffer?.novaTaxaPortabilidade || 0,
        topOfferPrazo: topOffer.prazoRefinPort || (simData.subConvenio === 'Marinha' ? 72 : (simData.prazoTotal || 96))
      };

      console.log("Saving simulation record:", {
        id: simulationId,
        userId: simulationRecord.userId,
        authUid: profile?.uid,
        match: simulationRecord.userId === profile?.uid
      });

      const docRef = doc(db, 'simulations', simulationId);
      getDoc(docRef).then(docSnap => {
        if (!docSnap.exists()) {
          setDoc(docRef, { ...simulationRecord, createdAt: serverTimestamp() })
            .catch(err => {
              console.error("Error saving simulation:", err);
              const errInfo = {
                error: err instanceof Error ? err.message : String(err),
                operationType: 'create',
                path: `simulations/${simulationId}`,
                authInfo: {
                  userId: profile?.uid,
                  email: profile?.email,
                }
              };
              console.error('Firestore Error: ', safeStringify(errInfo));
            });
        } else {
          setDoc(docRef, simulationRecord, { merge: true })
            .catch(err => {
              console.error("Error updating simulation:", err);
            });
        }
      });
    }

  }, [banks, generalRules, isLoaded, profile, promotoraPriorities, promotoraInstallments, simData]);

  // Update 'Principais Ofertas' (offers) whenever allCalculatedOffers or sortBy changes
  useEffect(() => {
    if (allCalculatedOffers.length === 0) {
      setOffers([]);
      return;
    }

    let filteredForTop = allCalculatedOffers;
    if (selectedBankFilter !== 'all') {
      filteredForTop = allCalculatedOffers.filter(o => o.name === selectedBankFilter);
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
        if (sortBy === 'valor_troco') {
          isBetter = offer.valorTroco > currentBest.valorTroco;
        } else if (sortBy === 'valor_contrato') {
          isBetter = offer.valorContrato > currentBest.valorContrato;
        } else if (sortBy === 'menor_troco') {
          isBetter = offer.valorTroco < currentBest.valorTroco;
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
  }, [allCalculatedOffers, sortBy, selectedBankFilter, promotoraPriorities]);

  const currentOffers = showAllOffers 
    ? offers
    : offers.slice(0, 3);
  
  const allCalculatedOffersCount = Array.from(new Set(allCalculatedOffers.map(o => o.name))).length;
  
  const maxValorTroco = currentOffers.length > 0 ? Math.max(...currentOffers.map(b => b.valorTroco)) : 0;
  const minValorTroco = currentOffers.length > 0 ? Math.min(...currentOffers.map(b => b.valorTroco)) : 0;
  const maxValorContrato = currentOffers.length > 0 ? Math.max(...currentOffers.map(b => b.valorTroco + b.saldoDevedor)) : 0;

  const uniqueBanks = Array.from(new Set(allCalculatedOffers.map(o => o.name))).sort();

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(value || 0);
  };

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

    const simTableData = [
      ['Banco Atual', simData.bancoAtual || 'Não informado'],
      ['Valor da Parcela', formatCurrency(simData.valorParcela || 0)],
      ['Saldo Devedor', formatCurrency(simData.saldoDevedor || 0)],
      ['Parcelas Pagas', `${simData.parcelasPagas || 0} de ${simData.prazoTotal || 0}`],
      ['Idade', `${simData.idade || 0} anos`],
    ];

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
      ['Nova Taxa Port.', `${(offer.novaTaxaPortabilidade !== undefined && offer.novaTaxaPortabilidade > 1.85 ? 1.85 : (offer.novaTaxaPortabilidade || 0)).toFixed(2)}%`],
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
                <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-black uppercase">
                  Validação Ativa
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                <div className="space-y-1 col-span-2 sm:col-span-3">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Banco Atual</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{simData.bancoAtual}</p>
                </div>
                <div className="space-y-1 col-span-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Parcela</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(simData.valorParcela)}</p>
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
          sortedBanks.map((bank, index) => {
            // Get all offers for this specific bank
            const bankOffers = allCalculatedOffers
              .filter(o => o.name === bank.name)
              .sort((a, b) => {
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
                              {bankOffers.length} ofertas disponíveis
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
                            Parcela: <span className="text-slate-900 dark:text-white font-bold">{formatCurrency(simData?.valorParcela || 0)}</span>
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
                    <div className="flex items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-blue-500/20">
                      <History className="w-3.5 h-3.5" />
                      <span>{parcelasPagas !== undefined ? parcelasPagas : (simData ? (parseInt(simData.prazoTotal || 0) - parseInt(simData.parcelasRestantes || 0)) : 0)} Parc. Pagas</span>
                    </div>
                    {currentOffer.minTicket && (
                      <div className="flex items-center gap-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-purple-500/20">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Saldo OK</span>
                      </div>
                    )}
                    
                    {/* Specific dynamic rules */}
                    {currentOffer.rules && currentOffer.rules.length > 0 && currentOffer.rules.map((ruleGroup: string[], iIdx: number) => (
                      <div key={`${currentOffer.id}-${iIdx}`} className="flex gap-1">
                        {ruleGroup.map((rule, jIdx) => (
                          <div key={`${iIdx}-${jIdx}-${rule}`} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border border-slate-200 dark:border-slate-700">
                            <Sparkles className="w-3.5 h-3.5 text-primary opacity-50" />
                            <span>{rule}</span>
                          </div>
                        ))}
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
          })
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
