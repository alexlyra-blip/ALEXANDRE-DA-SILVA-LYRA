'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ChevronDown, Banknote, FileText, Download, Calendar, Percent, Calculator } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QuotaAlert } from '@/components/QuotaAlert';
import { useState, useEffect, useRef } from 'react';
import { useRules } from '@/contexts/RuleContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  taxaPonderada?: number;
  priority?: number;
  rules?: string[][];
  convenio: 'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS';
  subConvenio?: string;
  tabelasCount: number;
  prazoRefinPort?: number;
}

import NovaSimulacao from '../nova/page';

export default function Recomendacoes() {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<SortOption>('menor_troco');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [allCalculatedOffers, setAllCalculatedOffers] = useState<Offer[]>([]);
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [expandedBankId, setExpandedBankId] = useState<string | null>(null);
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>('all');
  const [simData, setSimData] = useState<any>(null);
  const { banks, generalRules, promotoraPriorities, isLoaded } = useRules();
  const { profile } = useAuth();
  const savedSimulationId = useRef<string | null>(null);

  const handleSelectOffer = (offer: Offer) => {
    const stored = sessionStorage.getItem('selectedOffers');
    const selected = stored ? JSON.parse(stored) : [];
    selected.push(offer);
    sessionStorage.setItem('selectedOffers', JSON.stringify(selected));
    
    // Redirect to new proposal page
    router.push(`/propostas/nova?bank=${encodeURIComponent(offer.name)}&tabela=${encodeURIComponent(offer.tabela)}&valor=${offer.valorContrato}&troco=${offer.valorTroco}`);
  };

  useEffect(() => {
    if (!isLoaded || !profile) return;

    const storedData = sessionStorage.getItem('simulationData');
    if (!storedData) return;

    const simDataParsed = JSON.parse(storedData);
    setSimData(simDataParsed);
    const {
      id: simulationId,
      idade,
      codigoBeneficio,
      dataConcessao,
      bancoAtual,
      valorParcela,
      saldoDevedor,
      parcelasPagas
    } = simDataParsed;

    const calculatedOffers: Offer[] = [];

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
    banks.forEach(bank => {
      const isTargetBank = ['C6', 'FACTA', 'PAN', 'DAYCOVAL', 'ITAÚ'].some(n => bank.name.toUpperCase().includes(n));
      if (isTargetBank) console.log(`Checking target bank: ${bank.name} (ID: ${bank.id})`);
      
      // 0. Allowed Banks Filter
      if (profile.allowedBanks && profile.allowedBanks.length > 0 && !profile.allowedBanks.includes(bank.id)) {
        if (isTargetBank) console.log(`${bank.name} filtered by allowedBanks`);
        return;
      }

      // 0.1 Convenio Filter
      const bankConvenio = bank.convenio || 'INSS'; // Default to INSS if not set
      const simConvenio = simDataParsed.convenio || 'INSS'; // Default to INSS if not set
      if (bankConvenio !== simConvenio) {
        if (isTargetBank) console.log(`${bank.name} filtered by convenio: ${bankConvenio} !== ${simConvenio}`);
        return;
      }

      // 0.2 Sub-Convenio Filter
      if (bank.subConvenio && bank.subConvenio !== simDataParsed.subConvenio) {
        if (isTargetBank) console.log(`${bank.name} filtered by subConvenio: ${bank.subConvenio} !== ${simDataParsed.subConvenio}`);
        return;
      }

      // 1. Espécie Invalidez (04, 32, 92) - CHECK THIS FIRST
      const isInvalidity = ['4', '04', '32', '92'].includes(cleanBeneficio);
      if (isInvalidity) {
        if (bank.acceptsInvalidez === false) {
          if (isTargetBank) console.log(`${bank.name} filtrado: Não aceita espécie Invalidez`);
          return;
        }

        const ageLimit = bank.invalidezAgeYears || 0;
        const requiredMonths = (bank.minBenefitTimeYears || 0) * 12 + (bank.minBenefitTimeMonths || 0);
        
        const isOver60AndAccepted = bank.acceptsOver60Invalidez && idade >= 60;

        if (!isOver60AndAccepted) {
          // Se o banco marcou "Aceita > 60" mas não configurou idade mínima alternativa, e o cliente tem < 60, bloqueia.
          if (bank.acceptsOver60Invalidez && ageLimit === 0) {
            if (isTargetBank) console.log(`${bank.name} filtrado: Exige idade >= 60 para Invalidez`);
            return;
          }

          // Valida idade mínima específica
          if (ageLimit > 0 && idade < ageLimit) {
            if (isTargetBank) console.log(`${bank.name} filtrado por idade mínima invalidez: ${idade} < ${ageLimit}`);
            return;
          }
          
          // Valida tempo de benefício
          if (requiredMonths > 0 && benefitTimeMonths < requiredMonths) {
            if (isTargetBank) console.log(`${bank.name} filtrado por tempo de benefício: ${benefitTimeMonths} < ${requiredMonths} meses`);
            return;
          }
        }
      }

      // 2. Parcela Mínima
      if (bank.minInstallmentValue && valorParcela < bank.minInstallmentValue) {
        if (isTargetBank) console.log(`${bank.name} filtered by minInstallmentValue`);
        return;
      }

      // 3. Saldo Mínimo
      if (bank.minBalance && saldoDevedor < bank.minBalance) {
        if (isTargetBank) console.log(`${bank.name} filtered by minBalance`);
        return;
      }

      // 4. Idade Geral
      // Se for invalidez, a regra de idade já foi validada acima (ou o banco não tem regra específica)
      // Mas o maxAge geral do banco ainda deve ser respeitado como limite absoluto
      if (!isInvalidity) {
        if ((bank.minAge > 0 && idade < bank.minAge) || (bank.maxAge > 0 && idade > bank.maxAge)) {
          if (isTargetBank) console.log(`${bank.name} filtered by general age: ${idade} (min: ${bank.minAge}, max: ${bank.maxAge})`);
          return;
        }
      } else {
        // Para invalidez, se o banco NÃO tem ageLimit específico, ainda validamos o maxAge geral
        const ageLimit = bank.invalidezAgeYears || 0;
        if (ageLimit === 0 && bank.maxAge > 0 && idade > bank.maxAge) {
          if (isTargetBank) console.log(`${bank.name} filtered by general maxAge (Invalidez fallback): ${idade} > ${bank.maxAge}`);
          return;
        }
      }

      // 5. LOAS (87, 88)
      const isLOAS = ['87', '88'].includes(cleanBeneficio);
      if (isLOAS) {
        if (!bank.acceptsLOAS) {
          if (isTargetBank) console.log(`${bank.name} filtered by acceptsLOAS`);
          return;
        }
        if (simDataParsed.isAnalfabeto && !bank.acceptsIlliterate) {
          if (isTargetBank) console.log(`${bank.name} filtered by acceptsIlliterate (LOAS)`);
          return;
        }
      }

      // 5.1 Analfabeto (Geral)
      if (simDataParsed.isAnalfabeto && !bank.acceptsIlliterate) {
        if (isTargetBank) console.log(`${bank.name} filtered by acceptsIlliterate (General)`);
        return;
      }

      // 6. Banco Atual (Não portam)
      const bancoAtualLower = bancoAtual.trim().toLowerCase();
      if (bank.nonAcceptedBanks && bank.nonAcceptedBanks.some(b => {
        const bLower = b.trim().toLowerCase();
        return bancoAtualLower.includes(bLower) || bLower.includes(bancoAtualLower);
      })) {
        if (isTargetBank) console.log(`${bank.name} filtered by nonAcceptedBanks: ${bancoAtual}`);
        return;
      }

      // 7. Quantidade de parcelas pagas
      let requiredInstallments = 0;
      
      // Check specific rule first
      const specificRule = bank.specificInstallmentRules?.find(r => {
        const rLower = r.bank.trim().toLowerCase();
        return bancoAtualLower.includes(rLower) || rLower.includes(bancoAtualLower);
      });
      if (specificRule) {
        requiredInstallments = specificRule.installments;
      } else {
        // Check general rule
        const generalRule = generalRules.find(r => {
          const rLower = r.banco.trim().toLowerCase();
          return bancoAtualLower.includes(rLower) || rLower.includes(bancoAtualLower);
        });
        if (generalRule) {
          requiredInstallments = generalRule.parcelasAceitas;
        }
      }

      if (requiredInstallments > 0 && parcelasPagas < requiredInstallments) {
        if (isTargetBank) console.log(`${bank.name} filtered by requiredInstallments: ${parcelasPagas} < ${requiredInstallments}`);
        return;
      }

      // 7.1 Mínimo de parcelas pagas (New field)
      if (bank.minPaidInstallments && parcelasPagas < bank.minPaidInstallments) {
        if (isTargetBank) console.log(`${bank.name} filtered by minPaidInstallments: ${parcelasPagas} < ${bank.minPaidInstallments}`);
        return;
      }

      // If eligible, calculate for each table
      if (bank.tabelas && bank.tabelas.length > 0) {
        bank.tabelas.forEach(tabela => {
          const coef = tabela.coeficiente;
          
          // Skip if coefficient is not valid for division
          if (!coef || coef <= 0) {
            if (isTargetBank) console.log(`${bank.name} - Table ${tabela.nome} skipped: invalid coefficient ${coef}`);
            return;
          }

          const valorContrato = valorParcela / coef;
          const valorTroco = valorContrato - saldoDevedor;
          
          // Ticket Mínimo (Total Contrato)
          const minTicketValue = (tabela.useMinTicket !== false) ? (tabela.minTicket || bank.minTroco || 0) : 0;
          
          if (minTicketValue > 0 && valorContrato < minTicketValue) {
            if (isTargetBank) console.log(`${bank.name} - Table ${tabela.nome} filtered by minTicket: ${valorContrato.toFixed(2)} < ${minTicketValue.toFixed(2)}`);
            return;
          }
          if (isTargetBank) {
            console.log(`${bank.name} - Table ${tabela.nome}:`, {
              coef,
              valorContrato,
              valorTroco,
              minTicketValue
            });
          }

          const originalRate = simDataParsed.taxaJurosMensal ? simDataParsed.taxaJurosMensal * 100 : 0;
          let taxaTabelaValida = (tabela.taxaTabela !== undefined && tabela.taxaTabela !== null && tabela.taxaTabela > 0) ? tabela.taxaTabela : (bank.refinRate || 0);
          let taxaDiferencial = (tabela.taxaDiferencial !== undefined && tabela.taxaDiferencial !== null && tabela.taxaDiferencial > 0) ? tabela.taxaDiferencial : taxaTabelaValida;
          
          // Cap rates at 1.85 as requested by the user
          if (taxaTabelaValida > 1.85) taxaTabelaValida = 1.85;
          if (taxaDiferencial > 1.85) taxaDiferencial = 1.85;

          const novaTaxaPortabilidade = (bank.novaTaxaReferencia !== undefined && bank.novaTaxaReferencia !== null && bank.novaTaxaReferencia > 0) 
            ? bank.novaTaxaReferencia 
            : taxaTabelaValida;
          const convenioRate = originalRate > 0 ? originalRate : (bank.taxaPortabilidadeOrigem || 1.85);
          const taxaPonderada = ((convenioRate + taxaDiferencial) / 2) + (tabela.ajusteTaxaPonderada || 0);

          // Validação da Taxa Ponderada vs Taxa da Tabela
          // Regra: Taxa da tabela deve ser menor ou igual à taxa ponderada
          // Se useTaxaPonderada for false, ignora esta regra
          if (tabela.useTaxaPonderada !== false && taxaTabelaValida > 0 && taxaTabelaValida > taxaPonderada) {
            if (isTargetBank) console.log(`${bank.name} - Table ${tabela.nome} filtered by taxaPonderada: ${taxaPonderada} < ${taxaTabelaValida}`);
            return;
          }

          const cleanBeneficio = codigoBeneficio.replace(/^0+/, '');
          const isInvalidity = ['4', '04', '32', '92'].includes(cleanBeneficio);

          const rules: string[][] = [];
          
          const financeRules = [];
          if (bank.minBalance) financeRules.push(`Saldo Mín: ${formatCurrency(bank.minBalance)}`);
          if (minTicketValue > 0) financeRules.push(`Ticket Mín: ${formatCurrency(minTicketValue)}`);
          if (financeRules.length > 0) rules.push(financeRules);

          if (bank.acceptsLOAS) rules.push(['Aceita LOAS']);
          if (bank.acceptsIlliterate) rules.push(['Aceita Analfabeto']);
          if (bank.minPaidInstallments) rules.push([`Mín. ${bank.minPaidInstallments} Parc. Pagas`]);
          
          if (isInvalidity) {
            const invalidezRules = [];
            if (bank.acceptsOver60Invalidez && bank.invalidezAgeYears) {
              invalidezRules.push(`Invalidez: 60+ anos ou ${bank.invalidezAgeYears}+ anos`);
            } else if (bank.acceptsOver60Invalidez) {
              invalidezRules.push(`Invalidez: 60+ anos`);
            } else if (bank.invalidezAgeYears) {
              invalidezRules.push(`Invalidez: ${bank.invalidezAgeYears}+ anos`);
            }
            
            if (bank.minBenefitTimeYears || bank.minBenefitTimeMonths) {
              const timeStr = `Tempo Benefício: ${bank.minBenefitTimeYears || 0}a ${bank.minBenefitTimeMonths || 0}m+`;
              if (bank.acceptsOver60Invalidez) {
                invalidezRules.push(`${timeStr} (se < 60 anos)`);
              } else {
                invalidezRules.push(timeStr);
              }
            }
            if (invalidezRules.length > 0) rules.push(invalidezRules);
          }

          if (valorTroco > 0) {
            calculatedOffers.push({
              id: `${bank.id}-${tabela.nome}`,
              name: bank.name,
              logo: bank.logoUrl || 'https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?q=80&w=100&auto=format&fit=crop',
              tabela: tabela.nome,
              valorContrato,
              valorTroco,
              saldoDevedor,
              novaTaxaPortabilidade,
              taxaPonderada,
              priority: bank.priority || 0,
              rules,
              convenio: bank.convenio || 'INSS',
              subConvenio: bank.subConvenio,
              tabelasCount: bank.tabelas.length,
              prazoRefinPort: tabela.prazoRefinPort
            });
          } else {
            if (isTargetBank) console.log(`${bank.name} - Table ${tabela.nome} filtered by valorTroco <= 0: ${valorTroco}`);
          }
        });
      } else {
        if (isTargetBank) console.log(`${bank.name} filtered by no tables`);
      }
    });

    // Sort by priority (ascending, lower is better) then by valorTroco (descending)
    calculatedOffers.sort((a, b) => {
      const bankIdA = a.id.split('-')[0];
      const bankIdB = b.id.split('-')[0];
      
      // Use promotora priority if set, otherwise fallback to bank's default priority
      const pA = promotoraPriorities[bankIdA] ?? a.priority ?? 999;
      const pB = promotoraPriorities[bankIdB] ?? b.priority ?? 999;
      
      // Treat 0 or undefined as lowest priority (999)
      const finalPA = (pA === 0 || pA === undefined) ? 999 : pA;
      const finalPB = (pB === 0 || pB === undefined) ? 999 : pB;
      
      if (finalPA !== finalPB) {
        return finalPA - finalPB;
      }
      return b.valorTroco - a.valorTroco;
    });
    
    setAllCalculatedOffers(calculatedOffers);
    
    // Save simulation to Firestore if it hasn't been saved yet
    if (simulationId && savedSimulationId.current !== simulationId && calculatedOffers.length > 0) {
      savedSimulationId.current = simulationId;
      
      const topOffer = calculatedOffers[0];
      const simulationRecord = {
        ...simDataParsed,
        userId: profile.uid,
        userName: profile.name,
        userAvatar: profile.avatarUrl || profile.photoUrl || null,
        userRole: profile.role,
        createdBy: profile.createdBy || null,
        promotoraId: profile.role === 'promotora' ? profile.uid : (profile.promotoraId || profile.createdBy || 'admin'),
        recommendedBanks: calculatedOffers.slice(0, 3).map(o => o.name),
        topOffer: topOffer?.name || null,
        topOfferTabela: topOffer?.tabela || null,
        topOfferContrato: topOffer?.valorContrato || 0,
        topOfferTroco: topOffer?.valorTroco || 0,
        topOfferTaxa: topOffer?.novaTaxaPortabilidade || 0,
        topOfferPrazo: topOffer.prazoRefinPort || (simDataParsed.subConvenio === 'Marinha' ? 72 : (simDataParsed.prazoTotal || 96)),
        createdAt: serverTimestamp()
      };

      console.log("Saving simulation record:", {
        id: simulationId,
        userId: simulationRecord.userId,
        authUid: profile.uid,
        match: simulationRecord.userId === profile.uid
      });

      setDoc(doc(db, 'simulations', simulationId), simulationRecord)
        .catch(err => {
          console.error("Error saving simulation:", err);
          // Firestore error handling as per instructions
          const errInfo = {
            error: err instanceof Error ? err.message : String(err),
            operationType: 'create',
            path: `simulations/${simulationId}`,
            authInfo: {
              userId: profile?.uid,
              email: profile?.email,
            }
          };
          console.error('Firestore Error: ', JSON.stringify(errInfo));
          // We don't throw here to avoid breaking the UI, but we log the detailed error
        });
    }

  }, [banks, generalRules, isLoaded, profile, promotoraPriorities]);

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

    const finalOffers: Offer[] = [];
    
    // 1. Best Offer
    if (sorted.length > 0) {
      finalOffers.push(sorted[0]);
    }

    // 2. Second Best (Different Bank if possible)
    const secondOffer = sorted.find(o => o.name !== finalOffers[0]?.name) || sorted[1];
    if (secondOffer && !finalOffers.some(f => f.id === secondOffer.id)) {
      finalOffers.push(secondOffer);
    }

    // 3. Third Best (Different Bank if possible)
    const thirdOffer = sorted.find(o => !finalOffers.some(f => f.id === o.id));
    if (thirdOffer) {
      finalOffers.push(thirdOffer);
    }

    setOffers(finalOffers);
  }, [allCalculatedOffers, sortBy, selectedBankFilter]);

  const currentOffers = showAllOffers 
    ? allCalculatedOffers
        .filter(o => selectedBankFilter === 'all' || o.name === selectedBankFilter)
    : offers;
  const maxValorTroco = currentOffers.length > 0 ? Math.max(...currentOffers.map(b => b.valorTroco)) : 0;
  const minValorTroco = currentOffers.length > 0 ? Math.min(...currentOffers.map(b => b.valorTroco)) : 0;
  const maxValorContrato = currentOffers.length > 0 ? Math.max(...currentOffers.map(b => b.valorTroco + b.saldoDevedor)) : 0;

  const uniqueBanks = Array.from(new Set(allCalculatedOffers.map(o => o.name))).sort();

  const sortedBanks = [...currentOffers].sort((a, b) => {
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
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

  return (
    <div className={`flex w-full min-h-screen bg-background text-foreground ${showAllOffers ? 'overflow-hidden' : ''}`}>
      {/* Desktop Simulator Sidebar with Animation */}
      <motion.div 
        initial={false}
        animate={{ 
          width: isSimulatorOpen ? 450 : 0,
          opacity: isSimulatorOpen ? 1 : 0,
          x: isSimulatorOpen ? 0 : -450
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="hidden md:flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-800 bg-background-light dark:bg-background-dark relative overflow-y-auto"
      >
        <div className="w-[450px]">
          <NovaSimulacao isEmbedded={true} />
        </div>
      </motion.div>

      <div className={`flex flex-col flex-1 min-w-0 bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display ${showAllOffers ? 'pb-20 h-screen overflow-y-auto' : 'pb-6'} pt-2`}>
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
              Todas Ofertas ({allCalculatedOffers.length})
            </button>
          </div>
        </div>
      </div>

      {/* Recommendations List */}
      <div className={`flex flex-col gap-3 p-4 ${showAllOffers ? 'pt-4' : 'pt-2'}`}>
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
            let badge = null;
            let badgeColor = '';
            let badgeBg = '';
            let isMelhorTroco = false;
            let isMaiorContrato = false;
            
            if (bank.valorTroco === minValorTroco && sortedBanks.length > 1) {
              badge = 'MELHOR OFERTA';
              badgeColor = 'text-emerald-600 dark:text-emerald-400';
              badgeBg = 'bg-emerald-500/10 dark:bg-emerald-500/20';
            } else if (bank.valorTroco === maxValorTroco && sortedBanks.length > 1) {
              badge = 'MELHOR TROCO';
              badgeColor = 'text-amber-600 dark:text-amber-400';
              badgeBg = 'bg-amber-500/10 dark:bg-amber-500/20';
              isMelhorTroco = true;
            } else if (bank.valorTroco + bank.saldoDevedor === maxValorContrato && sortedBanks.length > 1) {
              badge = 'MAIOR CONTRATO';
              badgeColor = 'text-blue-600 dark:text-blue-400';
              badgeBg = 'bg-blue-500/10 dark:bg-blue-500/20';
              isMaiorContrato = true;
            }

            const sortedExpandedOffers = [...allCalculatedOffers]
              .filter(o => o.name === bank.name && o.id !== bank.id)
              .sort((a, b) => Number(a.valorTroco || 0) - Number(b.valorTroco || 0));

            if (expandedBankId === bank.id) {
              console.log(`Sorted expanded offers for ${bank.name}:`, sortedExpandedOffers.map(o => o.valorTroco));
            }

            return (
              <motion.div 
                key={bank.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className={`group flex flex-col gap-1.5 rounded-xl bg-white dark:bg-surface-dark ${showAllOffers ? 'p-3' : 'p-2.5'} shadow-sm hover:shadow-md border border-slate-200 dark:border-white/10 hover:border-primary/30 transition-all relative overflow-hidden`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                {badge && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className={`${badgeBg} ${badgeColor} px-2 py-0.5 rounded-bl-lg text-[9px] font-bold uppercase tracking-wider shadow-sm`}>
                      {badge}
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2 relative z-10">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm relative shrink-0">
                        <div className="relative w-full h-full">
                          <Image
                            src={bank.logo}
                            alt={`${bank.name} logo`}
                            fill
                            unoptimized
                            className="object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-slate-900 dark:text-slate-100 text-sm font-bold leading-tight truncate">{bank.name}</h3>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 text-white shadow-sm ${
                            bank.convenio === 'SIAPE' 
                              ? 'bg-[#f59e0b]' 
                              : bank.convenio === 'GOVERNO'
                              ? 'bg-[#FF0000]'
                              : bank.convenio === 'FORÇAS ARMADAS'
                              ? 'bg-[#47953D]'
                              : 'bg-[#1152d4]'
                          }`}>
                            {bank.convenio}
                          </span>
                          {bank.subConvenio && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 text-white shadow-sm bg-slate-500">
                              {bank.subConvenio}
                            </span>
                          )}
                        </div>
                        {bank.tabelasCount > 1 && (
                          <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">
                            +{bank.tabelasCount - 1} ofertas
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Exibição do subconvênio para Governo e Forças Armadas */}
                    {(bank.convenio === 'GOVERNO' || bank.convenio === 'FORÇAS ARMADAS') && bank.subConvenio && (
                      <div className="mt-1">
                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          Subconvênio: {bank.subConvenio}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0 mt-0.5">
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                          <p className="text-[10px] font-medium truncate">
                            Tabela: <span className="text-slate-900 dark:text-white font-bold">{bank.tabela}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Banknote className="w-3 h-3 text-slate-400 shrink-0" />
                          <p className="text-[10px] font-medium truncate">
                            Parcela: <span className="text-slate-900 dark:text-white font-bold">{formatCurrency(simData?.valorParcela || 0)}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <p className="text-[10px] font-medium truncate">
                            Prazo: <span className="text-slate-900 dark:text-white font-bold">{bank.prazoRefinPort || (simData?.subConvenio === 'Marinha' ? 72 : (simData?.prazoTotal || 96))}X</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Banknote className={`w-3 h-3 ${isMaiorContrato ? 'text-blue-500' : 'text-slate-400'} shrink-0`} />
                          <p className="text-[10px] font-medium truncate">
                            Contrato: <span className={`${isMaiorContrato ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'} font-bold`}>{formatCurrency(bank.valorContrato)}</span>
                          </p>
                        </div>
                        {bank.taxaPonderada !== undefined && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Percent className="w-3 h-3 text-slate-400 shrink-0" />
                            <p className="text-[10px] font-medium truncate">
                              Taxa da Port.: <span className="text-slate-900 dark:text-white font-bold">{bank.taxaPonderada.toFixed(2)}%</span>
                            </p>
                          </div>
                        )}
                        {bank.novaTaxaPortabilidade !== undefined && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Percent className="w-3 h-3 text-slate-400 shrink-0" />
                            <p className="text-[10px] font-medium truncate">
                              Taxa do Refin: <span className="text-slate-900 dark:text-white font-bold">{bank.novaTaxaPortabilidade.toFixed(2)}%</span>
                            </p>
                          </div>
                        )}
                      </div>
                  </div>
                  <div className="flex flex-col items-end gap-0 mt-0.5 shrink-0">
                    <p className="text-[8px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">VALOR TROCO</p>
                    <p className={`text-lg sm:text-xl font-black tracking-tight ${isMelhorTroco || (index === 0 && !showAllOffers) ? 'text-primary' : 'text-slate-900 dark:text-white'} whitespace-nowrap`}>{formatCurrency(bank.valorTroco)}</p>
                    
                    {bank.tabelasCount > 1 && (
                      <button 
                        onClick={() => setExpandedBankId(expandedBankId === bank.id ? null : bank.id)}
                        className="mt-2 text-[9px] font-bold text-slate-400 hover:text-primary transition-colors"
                      >
                        {expandedBankId === bank.id ? 'Ocultar' : `Ver Outras Ofertas (${bank.tabelasCount - 1})`}
                      </button>
                    )}
                    
                    <button 
                      onClick={() => handleGeneratePDF(bank)}
                      className={`mt-1 flex items-center justify-center gap-1.5 rounded-lg p-1.5 text-xs font-bold transition-all duration-300 ${
                        index === 0 && !showAllOffers 
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                      title="Baixar PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => handleSelectOffer(bank)}
                  className="w-full bg-primary hover:bg-primary/90 text-white text-xs font-black uppercase tracking-tight py-2.5 rounded-lg transition-all shadow-sm mt-1.5"
                >
                  Selecionar
                </button>

                {bank.rules && bank.rules.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/50">
                    {bank.rules.map((ruleGroup, i) => (
                      <div key={i} className="flex gap-1">
                        {ruleGroup.map((rule, j) => (
                          <span key={j} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[8px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm whitespace-nowrap">
                            {rule}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {expandedBankId === bank.id && (
                  <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h4 className="text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Outras Tabelas</h4>
                    <div className="space-y-1">
                      {sortedExpandedOffers.map(otherOffer => (
                          <div key={otherOffer.id} className="flex justify-between items-center text-[10px] p-1.5 bg-white dark:bg-surface-dark rounded-md border border-slate-100 dark:border-white/5">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{otherOffer.tabela}</span>
                            <span className="font-bold text-primary">{formatCurrency(otherOffer.valorTroco)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
        </div>
      </div>
    </div>
  );
}
