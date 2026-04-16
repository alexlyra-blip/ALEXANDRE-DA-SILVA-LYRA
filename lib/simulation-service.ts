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
        
        // Se a tabela possuir uma taxa diferencial estipulada via UI (Nova Taxa), usamos ela. 
        // Caso contrário, calculamos dinamicamente (Taxa Original + Ajuste do Banco).
        const novaTaxaPortabilidadeAvaliada = (tabela.taxaDiferencial !== undefined && tabela.taxaDiferencial !== null && tabela.taxaDiferencial > 0)
            ? tabela.taxaDiferencial
            : (originalRate + bankAdjustment);

        const taxaParaCalculo = novaTaxaPortabilidadeAvaliada;

        // Regra Nova: Taxa Mínima Port (portabilityRate)
        // Usada EXCLUSIVAMENTE para verificar se o banco/tabela fica elegível para simulação.
        // Se a Nova Taxa Port (taxaParaCalculo) for abaixo da Taxa Mínima Port (portabilityRate), indisponibiliza a tabela.
        if (bank.portabilityRate && bank.portabilityRate > 0 && taxaParaCalculo < bank.portabilityRate) {
          console.log(`[DEBUG] Filtrando banco ${bank.name} - Tabela ${tabela.nome}: Nova Taxa (${taxaParaCalculo}) < Taxa Mínima Port (${bank.portabilityRate})`);
          return;
        }

        // Regra solicitada:
        // 1. taxaPonderada = (Taxa Juros Mensal do Contrato + Nova Taxa Portabilidade) / 2
        // 2. A taxa ponderada pode sofrer alteração conforme um diferencial (ajusteTaxaPonderada)
        // 3. taxaPonderadaFinal = taxaPonderada + ajusteTaxaPonderada
        
        const taxaPonderadaBase = (originalRate + taxaParaCalculo) / 2;
        const taxaPonderadaFinal = taxaPonderadaBase + (parseFloat(tabela.ajusteTaxaPonderada) || 0);

        console.log(`[DEBUG] Banco ${bank.name} - Tabela ${tabela.nome}: originalRate (${originalRate}), taxaParaCalculo (${taxaParaCalculo}), taxaPonderadaBase (${taxaPonderadaBase.toFixed(4)}), ajuste (${parseFloat(tabela.ajusteTaxaPonderada) || 0}), taxaPonderadaFinal (${taxaPonderadaFinal.toFixed(4)})`);

        // Regra: Para uma tabela ser ofertada, a taxa base da tabela (taxaTabelaValida) tem que estar sempre ABAIXO da taxa ponderada (taxaPonderadaFinal)
        // Logo, se taxa base >= taxa ponderada, a tabela fica indisponível.
        if (tabela.useTaxaPonderada === true && taxaTabelaValida > 0 && taxaTabelaValida >= taxaPonderadaFinal) {
            console.log(`[DEBUG] Filtrando banco ${bank.name} - Tabela ${tabela.nome}: taxaTabelaValida (${taxaTabelaValida}) >= taxaPonderadaFinal (${taxaPonderadaFinal.toFixed(4)})`);
            return;
        }
        
        const taxaPonderada = taxaPonderadaFinal; // Para uso posterior no objeto de oferta

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
