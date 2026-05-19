
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

function checkSubConvenioMatch(ruleSub: string, currentSub: string): boolean {
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
}

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

export function calculateOffers(
  params: SimulationParams,
  banks: any[],
  generalRules: any[],
  promotoraPriorities: Record<string, number> = {},
  promotoraInstallments: Record<string, number> = {},
  profile: any = {},
  nonPortableBanks: string[] = []
): Offer[] {
  const {
    idade,
    convenio,
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

  // Global Non-portable bank check
  if (nonPortableBanks && nonPortableBanks.some((b: string) => checkBankMatch(b, bancoAtual))) {
    return [];
  }

  const originalRate = params.taxaJurosMensal ? params.taxaJurosMensal * 100 : 0;
  
  // Calculate the NEW calculated rate with the current (potentially reduced) valorParcela
  const effectiveN = parcelasRestantes || (prazoTotal > 0 && parcelasPagas !== undefined ? prazoTotal - parcelasPagas : 0);
  const newRateCalculated = calculateRate(saldoDevedor, valorParcela, effectiveN) * 100;
  
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
      nonPortableBanks: rawBank.nonPortableBanks !== undefined ? rawBank.nonPortableBanks : (rawBank.non_portable_banks !== undefined ? rawBank.non_portable_banks : []),
      specificInstallmentRules: rawBank.specificInstallmentRules !== undefined ? rawBank.specificInstallmentRules : (rawBank.specific_installment_rules !== undefined ? rawBank.specific_installment_rules : []),
      logoUrl: rawBank.logoUrl !== undefined ? rawBank.logoUrl : (rawBank.logo_url !== undefined ? rawBank.logo_url : ''),
    };

    if (bank.isActive === false) return;
    
    // Allowed Banks Filter
    if (profile?.allowedBanks && profile.allowedBanks.length > 0 && !profile.allowedBanks.includes(bank.id)) {
      return;
    }

    // Convenio Filter
    const bankConvenio = normalizeStr(bank.convenio || 'INSS');
    const simConvenio = normalizeStr(params.convenio || 'INSS');
    if (bankConvenio !== simConvenio) return;

    // Sub-Convenio Filter
    if (bank.subConvenio && params.subConvenio) {
      if (!checkSubConvenioMatch(bank.subConvenio, params.subConvenio)) return;
    }

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
        if (minAgeDisability > 0 && idade < minAgeDisability) return;
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

    // Destination restriction: banks that cannot be ported to any other bank
    if (banks.some(r => r.nonPortableBanks && r.nonPortableBanks.some((b: string) => checkBankMatch(b, bank.name)))) return;

    // Prevent same-bank portability
    if (checkBankMatch(bank.name, bancoAtual)) return;

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

        // Table Age Limits Validation
        const tableMinAge = parseRate(tabela.minAge || tabela.idadeMinima || 0);
        const tableMaxAge = parseRate(tabela.maxAge || tabela.idadeMaxima || 0);
        if (tableMinAge > 0 && idade < tableMinAge) return; // skip table
        if (tableMaxAge > 0 && idade > tableMaxAge) return; // skip table

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

        // Check Min/Max Installment Value
        const tableMinInst = parseRate(tabela.minInstallmentValue);
        const tableMaxInst = parseRate(tabela.maxInstallmentValue);
        const effectiveMinInst = tableMinInst > 0 ? tableMinInst : (parseRate(bank.minInstallmentValue) || 0);

        if (effectiveMinInst > 0 && valorParcela < effectiveMinInst) return;
        if (tableMaxInst > 0 && valorParcela > tableMaxInst) return;

        // Rates and Validations
        const tDiferencial = parseRate(tabela.taxaDiferencial);
        
        const bankPortRate = parseRate(bank.portabilityRate);
        const bankAdjustment = parseRate(bank.ajusteTaxa);

        const defaultRate = convenio?.toUpperCase() === 'SIAPE' ? 1.70 : (convenio?.toUpperCase() === 'INSS' ? 1.85 : 2.05);
        const origRateCalculated = originalRate > 0 ? originalRate : (parseRate(bank.taxaPortabilidadeOrigem) || defaultRate);

        // Dynamic calculation: client rate + bank adjustment
        const novaTaxaPortTarget = Number((origRateCalculated + bankAdjustment).toFixed(2));
        
        // 1. Validation: Does the NEW calculated rate (with reduced installment) meet the bank's minimum portability rate?
        if (bankPortRate > 0 && newRateCalculated > 0 && newRateCalculated < bankPortRate) return;
        
        // 2. Validation: Does the table's target rate meet the bank's minimum portability rate?
        if (bankPortRate > 0 && novaTaxaPortTarget < bankPortRate) return;

        // Weighted Rate
        const orig = Number(origRateCalculated.toFixed(2));
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
          useTaxaPonderada: Boolean(tabela.useTaxaPonderada),
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

  // Final sort by Priority then Troco (Lowest Troco first for best broker profitability)
  return calculatedOffers.sort((a, b) => {
    const bankIdA = a.id.split('-')[0];
    const bankIdB = b.id.split('-')[0];
    const pA = promotoraPriorities[bankIdA] ?? a.priority ?? 999;
    const pB = promotoraPriorities[bankIdB] ?? b.priority ?? 999;
    const finalPA = pA === 0 ? 999 : pA;
    const finalPB = pB === 0 ? 999 : pB;
    if (finalPA !== finalPB) return finalPA - finalPB;
    return a.valorTroco - b.valorTroco; // Menor troco primeiro (melhor rentabilidade)
  });
}
