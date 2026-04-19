import { db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

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
  originalRateCalculated: number; // Added
  ajusteTaxaPonderada: number; // Added
  priority: number;
  rules: string[][];
  convenio: string;
  subConvenio?: string;
  tabelasCount: number;
  prazoRefinPort?: number;
}

export async function runSimulation(input: SimulationInput): Promise<Offer[]> {
  // Fetch banks and general rules from Firestore
  const banksSnapshot = await getDocs(collection(db, 'banks'));
  const banks = banksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  const generalRulesSnapshot = await getDocs(collection(db, 'general_rules'));
  const generalRules = generalRulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  const calculatedOffers: Offer[] = [];

  const {
    idade,
    codigoBeneficio,
    dataConcessao,
    bancoAtual,
    valorParcela,
    saldoDevedor,
    parcelasPagas,
    parcelasRestantes,
    convenio,
    subConvenio,
    isAnalfabeto,
    taxaJurosMensal
  } = input;

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

  const cleanBeneficio = (codigoBeneficio || '').replace(/^0+/, '');

  const checkBankMatch = (ruleBank: string, currentBank: string) => {
    if (!ruleBank || !currentBank) return false;
    const rule = ruleBank.trim().toLowerCase();
    const current = currentBank.trim().toLowerCase();
    
    if (current === rule) return true;
    
    const parts = current.split('-');
    if (parts.length >= 2) {
      const code = parts[0].trim();
      const name = parts.slice(1).join('-').trim();
      if (rule === code) return true;
      if (rule === name) return true;
      if (rule.length >= 2 && name.includes(rule)) return true;
    }
    return rule.length >= 2 && (current.includes(rule) || rule.includes(current));
  };

  banks.forEach(bank => {
    // Convenio Filter
    const bankConvenio = bank.convenio || 'INSS';
    if (bankConvenio !== convenio) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: Convenio ${bankConvenio} !== ${convenio}`);
        return;
    }

    // Sub-Convenio Filter
    if (bank.subConvenio && bank.subConvenio !== subConvenio) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: SubConvenio ${bank.subConvenio} !== ${subConvenio}`);
        return;
    }

    // Parcela Mínima
    if (bank.minInstallmentValue && valorParcela < bank.minInstallmentValue) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: Parcela ${valorParcela} < Mínima ${bank.minInstallmentValue}`);
        return;
    }

    // Saldo Mínimo
    if (bank.minBalance && saldoDevedor < bank.minBalance) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: Saldo ${saldoDevedor} < Mínimo ${bank.minBalance}`);
        return;
    }
    
    // ... (rest of the code)

    // Idade Geral
    if (!isInvalidity) {
      if ((bank.minAge > 0 && idade < bank.minAge) || (bank.maxAge > 0 && idade > bank.maxAge)) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: Idade ${idade} fora do limite (${bank.minAge}-${bank.maxAge})`);
        return;
      }
    } else {
      const ageLimit = bank.invalidezAgeYears || 0;
      if (ageLimit === 0 && bank.maxAge > 0 && idade > bank.maxAge) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: Idade ${idade} > Máxima ${bank.maxAge} (Invalidez fallback)`);
        return;
      }
    }

    // LOAS
    const isLOAS = ['87', '88'].includes(cleanBeneficio);
    if (isLOAS) {
      if (!bank.acceptsLOAS) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: Não aceita LOAS`);
        return;
      }
      if (isAnalfabeto && !bank.acceptsIlliterate) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: Não aceita Analfabeto (LOAS)`);
        return;
      }
    }

    // Analfabeto (Geral)
    if (isAnalfabeto && !bank.acceptsIlliterate) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: Não aceita Analfabeto (Geral)`);
        return;
    }

    // Banco Atual
    if (bank.nonAcceptedBanks && bank.nonAcceptedBanks.some((b: string) => checkBankMatch(b, bancoAtual))) {
        console.log(`[DEBUG] Filtrando banco ${bank.name}: Banco atual ${bancoAtual} não aceito`);
        return;
    }

    // Parcelas pagas
    let requiredInstallments = 0;
    const specificRule = bank.specificInstallmentRules?.find((r: any) => checkBankMatch(r.bank, bancoAtual));
    if (specificRule) {
      requiredInstallments = specificRule.installments;
    } else {
      const generalRule = generalRules.find((r: any) => checkBankMatch(r.banco, bancoAtual));
      if (generalRule) {
        requiredInstallments = generalRule.parcelasAceitas;
      }
    }

    if (requiredInstallments > 0 && parcelasPagas < requiredInstallments) return;
    if (bank.minPaidInstallments && parcelasPagas < bank.minPaidInstallments) return;

    // Calculate for each table
    if (bank.tabelas && bank.tabelas.length > 0) {
      bank.tabelas.forEach((tabela: any) => {
        const coef = tabela.coeficiente;
        if (!coef || coef <= 0) return;

        const valorContrato = valorParcela / coef;
        const valorTroco = valorContrato - saldoDevedor;
        
        // Ajuste: Se tabela.somaSaldoTroco estiver marcado, valida o saldo mínimo usando (saldoDevedor + valorTroco)
        const valorParaValidarMinTicket = (tabela.somaSaldoTroco === true) ? (saldoDevedor + valorTroco) : saldoDevedor;
        const minTicketValue = (tabela.useMinTicket === true) ? (tabela.minTicket || bank.minTroco || 0) : 0;
        
        if (tabela.useMinTicket === true && minTicketValue > 0 && valorParaValidarMinTicket < minTicketValue) {
            console.log(`[DEBUG] Filtrando banco ${bank.name} - Tabela ${tabela.nome}: valorParaValidarMinTicket (${valorParaValidarMinTicket}) < minTicketValue (${minTicketValue})`);
            return;
        }

        // Regra: Troco > 5% do Novo Endividamento
        if (bank.requireTrocoMaiorQue5PorcentoEndividamento) {
          const novoEndividamento = parcelasRestantes * valorParcela;
          const baseTroco = novoEndividamento * 0.05;
          if (valorTroco <= baseTroco) return;
        }

        const originalRate = taxaJurosMensal ? taxaJurosMensal * 100 : 0;
        const taxaTabelaValida = (tabela.taxaTabela !== undefined && tabela.taxaTabela !== null && tabela.taxaTabela > 0) ? tabela.taxaTabela : (bank.refinRate || 0);
        const taxaDiferencial = (tabela.taxaDiferencial !== undefined && tabela.taxaDiferencial !== null && tabela.taxaDiferencial > 0) ? tabela.taxaDiferencial : taxaTabelaValida;
        
        const convenioRate = originalRate > 0 ? originalRate : (bank.taxaPortabilidadeOrigem || 1.85);
        const bankAdjustment = bank.ajusteTaxa || 0;
        
        // New Rate calculation: Original Rate + Bank Adjustment
        const novaTaxaPortabilidadeAvaliada = (tabela.taxaDiferencial !== undefined && tabela.taxaDiferencial !== null && tabela.taxaDiferencial > 0)
            ? tabela.taxaDiferencial
            : (originalRate + bankAdjustment);

        const taxaParaCalculo = novaTaxaPortabilidadeAvaliada;

        // Regra Nova: Taxa Mínima Port (portabilityRate)
        if (bank.portabilityRate && bank.portabilityRate > 0 && taxaParaCalculo < bank.portabilityRate) {
          console.log(`[DEBUG] Filtrando banco ${bank.name} - Tabela ${tabela.nome}: Nova Taxa (${taxaParaCalculo}) < Taxa Mínima Port (${bank.portabilityRate})`);
          return;
        }

        // Regra de Cálculo Solicitada:
        // 1. Taxa Ponderada = ((Taxa Original [originalRate] + Nova Taxa Portabilidade [taxaParaCalculo]) / 2) com 2 casas decimais
        // 2. Resultado = Taxa Ponderada + Ajuste Tabela
        
        // Garante precisão absoluta convertendo para string formatada e de volta para número
        const orig = Number(originalRate.toFixed(2));
        const port = Number(taxaParaCalculo.toFixed(2));
        
        // Aplica média e fixa em 2 casas decimais rigorosamente
        // Using Math.round(x*100)/100 for better precision instead of toFixed(2)
        const taxaPonderadaBase = Math.round(((orig + port) / 2) * 100) / 100;
        
        // Soma o ajuste da tabela 
        const ajusteTabela = Number((parseFloat(tabela.ajusteTaxaPonderada) || 0).toFixed(2));
        
        // Resultado final estritamente com 2 casas
        const taxaPonderadaFinal = Math.round((taxaPonderadaBase + ajusteTabela) * 100) / 100;

        console.log(`[DEBUG] Banco ${bank.name} - Tabela: ${tabela.nome}`);
        console.log(`[DEBUG]   ORIGINAL (${orig}) + PORT (${port}) = ${orig + port} / 2 = ${taxaPonderadaBase}`);
        console.log(`[DEBUG]   BASE (${taxaPonderadaBase}) + AJUSTE (${ajusteTabela}) = FINAL (${taxaPonderadaFinal})`);

        // Regra de Elegibilidade:
        // Para uma tabela ser ofertada, a Taxa Base da Tabela (taxaTabelaValida) tem que ser MENOR OU IGUAL que a Taxa Ponderada Final
        // Se Taxa Base > Taxa Ponderada Final, a tabela fica indisponível.
        if (tabela.useTaxaPonderada === true && taxaTabelaValida > 0 && taxaTabelaValida > taxaPonderadaFinal) {
            console.log(`[DEBUG]   -> filtered by weighted rate: ${taxaTabelaValida} > ${taxaPonderadaFinal}`);
            return;
        }
        
        const taxaPonderada = taxaPonderadaFinal; 

        if (valorTroco > 0) {
          calculatedOffers.push({
            id: `${bank.id}-${tabela.nome}`,
            name: bank.name,
            logo: bank.logoUrl || '',
            tabela: tabela.nome,
            valorContrato,
            valorTroco,
            saldoDevedor,
            novaTaxaPortabilidade: taxaParaCalculo, // Use a taxa correta aqui
            taxaPonderada,
            taxaBase: taxaTabelaValida,
            originalRateCalculated: originalRate,
            ajusteTaxaPonderada: ajusteTabela,
            priority: bank.priority || 999,
            rules: [],
            convenio: bank.convenio || 'INSS',
            subConvenio: bank.subConvenio,
            tabelasCount: bank.tabelas.length,
            prazoRefinPort: tabela.prazoRefinPort
          });
        }
      });
    }
  });

  // Sort by priority then by valorTroco
  calculatedOffers.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.valorTroco - a.valorTroco;
  });

  return calculatedOffers;
}
