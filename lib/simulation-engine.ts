
export interface Offer {
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
  rules?: string[];
  convenio: string;
  subConvenio?: string;
  tabelasCount: number;
  prazoRefinPort?: number;
}

export interface SimulationParams {
  idade: number;
  convenio: string;
  subConvenio?: string;
  codigoBeneficio: string;
  dataConcessao: string;
  bancoAtual: string;
  valorParcela: number;
  saldoDevedor: number;
  parcelasPagas?: number;
  prazoTotal: number;
  parcelasRestantes?: number;
  taxaJurosMensal?: number;
  isCliente60Mais?: boolean;
  isAnalfabeto?: boolean;
}

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

export function calculateOffers(
  params: SimulationParams,
  banks: any[],
  generalRules: any[],
  promotoraPriorities: Record<string, number> = {},
  promotoraInstallments: Record<string, number> = {},
  profile: any = {}
): Offer[] {
  const {
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
    isAnalfabeto
  } = params;

  const originalRate = params.taxaJurosMensal ? params.taxaJurosMensal * 100 : 0;
  const calculatedOffers: Offer[] = [];
  
  const cleanBeneficio = codigoBeneficio ? String(codigoBeneficio).replace(/^0+/, '') : '';
  
  // Calculate benefit time in months
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

  banks.forEach(bank => {
    if (bank.isActive === false) return;
    
    // Allowed Banks Filter
    if (profile?.allowedBanks && profile.allowedBanks.length > 0 && !profile.allowedBanks.includes(bank.id)) {
      return;
    }

    // Convenio Filter
    const bankConvenio = bank.convenio || 'INSS';
    const simConvenio = params.convenio || 'INSS';
    if (bankConvenio !== simConvenio) return;

    // Sub-Convenio Filter
    if (bank.subConvenio && bank.subConvenio !== params.subConvenio) return;

    // Invalidez Rule
    const isInvalidity = ['4', '04', '5', '05', '11', '30', '32', '33', '34', '92'].includes(cleanBeneficio);
    const isLOAS = ['87', '88'].includes(cleanBeneficio);

    if (isInvalidity) {
      if (bank.acceptsInvalidez === false) return;
      const isActuallyOver60 = idade >= 60;
      if (isActuallyOver60) {
        if (!bank.acceptsOver60Invalidez) return;
      } else {
        const minAgeDisability = bank.invalidezAgeYears || 0;
        if (minAgeDisability === 0) return;
        if (idade < minAgeDisability) return;
        const requiredMonths = (bank.minBenefitTimeYears || 0) * 12 + (bank.minBenefitTimeMonths || 0);
        if (requiredMonths > 0 && benefitTimeMonths < requiredMonths) return;
      }
    }

    // Installment Value
    if (bank.minInstallmentValue && valorParcela < bank.minInstallmentValue) return;

    // Min Balance
    const bSumSaldoTrocoGlobal = !!(bank.sumBalanceAndTroco || bank.sumSaldoTroco);
    if (!bSumSaldoTrocoGlobal && bank.minBalance && saldoDevedor < bank.minBalance) return;

    // General Age
    if (!isInvalidity) {
      if ((bank.minAge > 0 && idade < bank.minAge) || (bank.maxAge > 0 && idade > bank.maxAge)) return;
    } else {
      const ageLimit = bank.invalidezAgeYears || 0;
      if (ageLimit === 0 && bank.maxAge > 0 && idade > bank.maxAge) return;
      if (ageLimit > 0 && idade > ageLimit) return;
    }

    // 60+ Rule
    const effectiveIs60Mais = isCliente60Mais != null ? isCliente60Mais : (idade >= 60);
    if (effectiveIs60Mais && bank.accepts60Mais === false) return;

    // LOAS
    if (isLOAS) {
      if (!bank.acceptsLOAS) return;
      if (isAnalfabeto && !bank.acceptsIlliterate) return;
    }

    // Analfabeto
    if (isAnalfabeto && !bank.acceptsIlliterate) return;

    // Non-accepted banks (Origins)
    if (bank.nonAcceptedBanks && bank.nonAcceptedBanks.some((b: string) => checkBankMatch(b, bancoAtual))) return;

    // Installments Rule
    let requiredInstallments = 0;
    const effectiveParcelasPagas = parcelasPagas !== undefined ? parcelasPagas : (parseInt(String(prazoTotal || 0)) - parseInt(String(parcelasRestantes || 0)));
    const specificRule = bank.specificInstallmentRules?.find((r: any) => checkBankMatch(r.bank, bancoAtual));
    
    if (specificRule) {
      requiredInstallments = parseInt(specificRule.installments) || 0;
    } else {
      const pInstallment = promotoraInstallments[bancoAtual];
      if (pInstallment !== undefined && pInstallment > 0) {
        requiredInstallments = pInstallment;
      } else {
        const generalRule = generalRules.find((r: any) => checkBankMatch(r.banco, bancoAtual));
        if (generalRule) requiredInstallments = generalRule.parcelasAceitas;
      }
      const bankGeneralLimit = bank.minPaidInstallments || 0;
      requiredInstallments = Math.max(requiredInstallments, bankGeneralLimit);
    }

    if (requiredInstallments > 0 && effectiveParcelasPagas < requiredInstallments) return;

    // Calculate for each table
    if (bank.tabelas && bank.tabelas.length > 0) {
      bank.tabelas.forEach((tabela: any) => {
        const parseRate = (val: any) => {
          if (val === undefined || val === null || val === '') return 0;
          if (typeof val === 'number') return val;
          return parseFloat(String(val).replace(',', '.')) || 0;
        };

        const coef = parseRate(tabela.coeficiente);
        if (coef <= 0) return;

        const valorContrato = valorParcela / coef;
        const valorTroco = valorContrato - saldoDevedor;
        
        const bSumSaldoTroco = bSumSaldoTrocoGlobal || !!tabela.somaSaldoTroco;
        if (bSumSaldoTroco && bank.minBalance && (saldoDevedor + valorTroco) < bank.minBalance) return;

        const valorAValidar = bSumSaldoTroco ? (saldoDevedor + valorTroco) : saldoDevedor;
        const bankMinTroco = parseRate(bank.minTroco);
        const tableMinTicket = (tabela.useMinTicket === true) ? parseRate(tabela.minTicket) : 0;
        
        // Check Ticket
        if (tableMinTicket > 0 && valorAValidar < tableMinTicket) return;
        
        // Check Min Troco
        if (bankMinTroco > 0 && valorTroco < bankMinTroco) return;

        // Rates and Validations
        const tDiferencial = parseRate(tabela.taxaDiferencial);
        const bankNovaTaxaRef = parseRate(bank.novaTaxaReferencia);
        const bankPortRate = parseRate(bank.portabilityRate);
        const bankAdjustment = parseRate(bank.ajusteTaxa);

        const targetCandidates = [tDiferencial, bankNovaTaxaRef].filter(v => v > 0);
        const novaTaxaPortTarget = targetCandidates.length > 0 ? Math.min(...targetCandidates) : (originalRate + bankAdjustment);
        
        if (bankPortRate > 0 && novaTaxaPortTarget < bankPortRate) return;

        // Weighted Rate
        const orig = Number(originalRate.toFixed(2));
        const portTarget = Number(novaTaxaPortTarget.toFixed(2));
        const taxaPonderadaBase = Math.round(((orig + portTarget) / 2) * 100) / 100;
        const ajusteTabela = Number((parseFloat(tabela.ajusteTaxaPonderada) || 0).toFixed(2));
        const taxaPonderadaFinal = Math.round((taxaPonderadaBase + ajusteTabela) * 100) / 100;
        
        const bUseTaxaPonderada = Boolean(tabela.useTaxaPonderada);
        const tTabela = parseRate(tabela.taxaTabela);
        const taxaTabelaValida = tTabela > 0 ? tTabela : parseRate(bank.refinRate);

        if (bUseTaxaPonderada === true) {
          if (taxaTabelaValida > 0 && taxaTabelaValida > taxaPonderadaFinal) return;
        }

        if (valorTroco <= 0) return;

        const rules: string[] = [];
        if (bank.acceptsLOAS) rules.push('Aceita LOAS');
        if (bank.acceptsIlliterate && params.isAnalfabeto) rules.push('Aceita Analfabeto');
        if (bank.acceptsInvalidez !== false && isInvalidity) rules.push('Aceita Invalidez');
        if (bank.accepts60Mais && (idade >= 60 || params.isCliente60Mais)) rules.push('Aceita 60+');
        if (bSumSaldoTroco) rules.push('Soma Saldo+Troco');
        if (bUseTaxaPonderada) rules.push('Taxa Ponderada Mesa');

        calculatedOffers.push({
          id: `${bank.id}-${tabela.nome}`,
          name: bank.name,
          logo: bank.logoUrl || '',
          tabela: tabela.nome,
          valorContrato,
          valorTroco,
          saldoDevedor,
          novaTaxaPortabilidade: novaTaxaPortTarget,
          taxaPonderada: taxaPonderadaFinal,
          originalRateCalculated: orig,
          taxaBase: taxaTabelaValida,
          priority: bank.priority || 0,
          rules,
          convenio: bank.convenio || 'INSS',
          subConvenio: bank.subConvenio,
          tabelasCount: bank.tabelas?.length || 0,
          prazoRefinPort: tabela.prazoRefinPort
        });
      });
    }
  });

  // Final sort by Priority then Troco
  return calculatedOffers.sort((a, b) => {
    const bankIdA = a.id.split('-')[0];
    const bankIdB = b.id.split('-')[0];
    const pA = promotoraPriorities[bankIdA] ?? a.priority ?? 999;
    const pB = promotoraPriorities[bankIdB] ?? b.priority ?? 999;
    const finalPA = pA === 0 ? 999 : pA;
    const finalPB = pB === 0 ? 999 : pB;
    if (finalPA !== finalPB) return finalPA - finalPB;
    return b.valorTroco - a.valorTroco;
  });
}
