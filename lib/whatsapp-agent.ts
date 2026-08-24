import { GoogleGenAI, Type } from "@google/genai";
import { getAI } from '@/lib/ai-config';
import { getAdminDb } from "@/lib/firebase-admin";
import { calculateOffers, SimulationParams, calculateRate } from "@/lib/simulation-engine";
import { normalizePhone, validateWhatsAppUser } from "@/lib/whatsapp-utils";
import { getAllActiveCoefficients } from "@/lib/coefficients";
import { buildInssSimulationContracts, consultarCpfMulticorban, extractCpfFromText, getBenefitArray } from "@/lib/multicorban-service";
import { consultarRefinC6, getFirstAvailableC6Table, isC6Consignado, summarizeC6RefinTable, type C6RefinCredentials } from "@/lib/c6-refin-service";
import { getEspecieName } from '@/lib/mappings';

const ai = getAI();

interface WhatsAppRuntimeContext {
    /** Credencial C6 injetada pelo n8n apenas nesta requisição. Nunca é persistida na sessão. */
    c6Credentials?: C6RefinCredentials | null;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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

function checkBankMatch(ruleBank: string, currentBank: string): boolean {
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
    const ruleParts = rule.split('-');
    if (ruleParts.length >= 2) {
        const name = ruleParts.slice(1).join('-').trim();
        if (name.length >= 2 && (current.includes(name) || name.includes(current))) return true;
    }
    return rule.length >= 2 && (current.includes(rule) || rule.includes(current));
}

const calculateLoanOffersTool = {
    name: "calculate_client_loan_offers",
    description: "Calculates loan portability offers. Call ONLY when you have collected all required information from the customer: convenio, idade, bancoAtual, valorParcela, saldoDevedor, prazoTotal, parcelasRestantes. DO NOT call this tool if you are missing any of these values.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            idade: { type: Type.NUMBER, description: "Customer age" },
            convenio: { type: Type.STRING, description: "INSS, SIAPE, GOVERNO, FORÇAS ARMADAS, CLT PRIVADO" },
            subConvenio: { type: Type.STRING, description: "Sub-agreement" },
            codigoBeneficio: { type: Type.STRING, description: "Benefit code (INSS only)" },
            estado: { type: Type.STRING, description: "State (UF) for Governo" },
            dataConcessao: { type: Type.STRING, description: "Benefit concession date (YYYY-MM-DD)" },
            bancoAtual: { type: Type.STRING, description: "Current bank name" },
            valorParcela: { type: Type.NUMBER, description: "Monthly installment" },
            saldoDevedor: { type: Type.NUMBER, description: "Outstanding balance" },
            prazoTotal: { type: Type.NUMBER, description: "Total term months" },
            parcelasPagas: { type: Type.NUMBER, description: "Paid installments" },
            parcelasRestantes: { type: Type.NUMBER, description: "Remaining installments" },
            isAnalfabeto: { type: Type.BOOLEAN, description: "Illiterate" },
            isCliente60Mais: { type: Type.BOOLEAN, description: "60+ in AP/PB/TO/RR" },
            hasTwoCards: { type: Type.BOOLEAN, description: "2 active cards (INSS)" },
            negativeCardValue: { type: Type.NUMBER, description: "Card discount" },
            taxaJurosMensal: { type: Type.NUMBER, description: "Client's current contract interest rate as percentage (e.g. 1.59). Optional." },
            targetBankName: { type: Type.STRING, description: "Optional explicit bank name requested by the user for the new simulation (e.g., 'Facta', 'Bradesco'). Only fill this if the user explicitly asks to see the simulation in a specific bank." }
        },
        required: ["convenio", "idade", "bancoAtual", "valorParcela", "saldoDevedor", "prazoTotal", "parcelasRestantes"]
    }
};

function calcRate(pv: number, pmt: number, n: number) {
    if (pmt <= 0 || pv <= 0 || n <= 0) return 0;
    if (pmt * n <= pv) return 0;
    let lo = 0.0001, hi = 1, r = 0.05, d = 1, i = 0;
    while (d > 0.0001 && hi - lo > 0.00001 && i < 100) {
        const c = (pmt / r) * (1 - Math.pow(1 + r, -n));
        d = Math.abs(c - pv);
        if (c > pv) { lo = r; r = (r + hi) / 2; } else { hi = r; r = (r + lo) / 2; }
        i++;
    }
    return r;
}

let cachedBankRules: any[] = [];
let lastCache = 0;

async function loadRules() {
    if (Date.now() - lastCache > 300000) {
        try {
            const db = getAdminDb();
            if (db) {
                const snap = await db.collection('bankRules').get();
                cachedBankRules = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((b: any) => b.isActive !== false);
                lastCache = Date.now();
            }
        } catch (e) { console.error(e); }
    }
}

function getRuleSummary(ruleIdOrName: string): string {
    let b = cachedBankRules.find(r => r.id === ruleIdOrName);
    if (!b) {
        b = cachedBankRules.find(r => (r.name || '').toLowerCase().includes(ruleIdOrName.toLowerCase()));
    }
    if (!b) return `⚠️ Banco **"${ruleIdOrName}"** não encontrado.`;

    // Normalização das propriedades do banco conforme padrão do simulation-engine.ts
    const minAge = b.minAge !== undefined ? b.minAge : (b.min_age !== undefined ? b.min_age : 0);
    const maxAge = b.maxAge !== undefined ? b.maxAge : (b.max_age !== undefined ? b.max_age : 0);
    const minInstallmentValue = b.minInstallmentValue !== undefined ? b.minInstallmentValue : (b.min_installment_value !== undefined ? b.min_installment_value : 0);
    const minBalance = b.minBalance !== undefined ? b.minBalance : (b.min_balance !== undefined ? b.min_balance : 0);
    const minTroco = b.minTroco !== undefined ? b.minTroco : (b.min_troco !== undefined ? b.min_troco : 0);
    const portabilityRate = b.portabilityRate !== undefined ? b.portabilityRate : (b.portability_rate !== undefined ? b.portability_rate : 0);
    const refinRate = b.refinRate !== undefined ? b.refinRate : (b.refin_rate !== undefined ? b.refin_rate : 0);
    const acceptsIlliterate = b.acceptsIlliterate !== undefined ? b.acceptsIlliterate : (b.accepts_illiterate !== undefined ? b.accepts_illiterate : false);
    const accepts60Mais = b.accepts60Mais !== undefined ? b.accepts60Mais : (b.accepts_60_mais !== undefined ? b.accepts_60_mais : false);
    const nonAcceptedBanks = b.nonAcceptedBanks !== undefined ? b.nonAcceptedBanks : (b.non_accepted_banks !== undefined ? b.non_accepted_banks : []);
    const specificInstallmentRules = b.specificInstallmentRules !== undefined ? b.specificInstallmentRules : (b.specific_installment_rules !== undefined ? b.specific_installment_rules : []);

    // Formatadores
    const formatCurrency = (val: number) => {
        if (val === undefined || val === null || val === 0) return 'R$ 0,00';
        return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatRate = (val: number) => {
        if (val === undefined || val === null || val === 0) return 'Não cadastrada';
        return `${val.toString().replace('.', ',')}%`;
    };

    const formatYesNo = (val: boolean) => val ? 'SIM' : 'Não';

    // Bancos que Porta
    let bancoportStr = 'Todos';
    if (nonAcceptedBanks && nonAcceptedBanks.length > 0) {
        bancoportStr = `Todos, exceto: ${nonAcceptedBanks.join(', ')}`;
    }

    // Bancos com Regras específicas
    let regrasEspecificasStr = 'Nenhum';
    if (specificInstallmentRules && specificInstallmentRules.length > 0) {
        regrasEspecificasStr = specificInstallmentRules.map((r: any) => `${r.bank} (${r.installments} parcelas)`).join(', ');
    }

    const tablesArray = b.tabelas || b.tables || [];
    const plazosSet = new Set<number>();
    tablesArray.forEach((t: any) => {
        const p = t.prazoRefinPort || t.prazo || t.prazoTotal || 0;
        if (p > 0) plazosSet.add(p);
    });
    const sortedPlazos = Array.from(plazosSet).sort((x, y) => x - y);

    const formatPlazos = (plazos: number[]): string => {
        if (!plazos || plazos.length === 0) return "Não informado";
        const mapped = plazos.map(p => `${p}X`);
        if (mapped.length === 1) return mapped[0];
        if (mapped.length === 2) return `${mapped[0]} e ${mapped[1]}`;
        return `${mapped.slice(0, -1).join(', ')} e ${mapped[mapped.length - 1]}`;
    };
    const prazosStr = formatPlazos(sortedPlazos);

    const acceptsInvalidez = b.acceptsInvalidez !== false;
    const invalidezAgeYears = b.invalidezAgeYears || 0;
    const invalidezMaxAgeYears = b.invalidezMaxAgeYears || 0;
    const minBenefitTimeYears = b.minBenefitTimeYears || 0;
    const minBenefitTimeMonths = b.minBenefitTimeMonths || 0;

    let invalidezStr = 'Não';
    if (acceptsInvalidez) {
        if (invalidezAgeYears > 0 || minBenefitTimeYears > 0 || minBenefitTimeMonths > 0) {
            const maxStr = invalidezMaxAgeYears > 0 ? `${invalidezMaxAgeYears} anos` : '60 anos';
            invalidezStr = `SIM (Idade: >=${invalidezAgeYears} anos e <${maxStr}, Tempo de Benefício: ${minBenefitTimeYears} anos e ${minBenefitTimeMonths} meses)`;
        } else {
            invalidezStr = 'SIM';
        }
    }

    const acceptsLOAS = b.acceptsLOAS !== undefined ? b.acceptsLOAS : (b.accepts_loas !== undefined ? b.accepts_loas : false);
    const blockedBenefits: string[] = [];
    if (!acceptsInvalidez) {
        blockedBenefits.push("32 (Invalidez)");
    }
    if (!acceptsLOAS) {
        blockedBenefits.push("87 e 88 (LOAS)");
    }
    const excludedBenefits = b.excludedBenefits !== undefined ? b.excludedBenefits : (b.excluded_benefits !== undefined ? b.excluded_benefits : []);
    if (excludedBenefits && excludedBenefits.length > 0) {
        excludedBenefits.forEach((eb: string) => {
            const clean = eb.trim();
            if (clean === '32' && !blockedBenefits.includes("32 (Invalidez)")) {
                blockedBenefits.push("32 (Invalidez)");
            } else if ((clean === '87' || clean === '88') && !blockedBenefits.includes("87 e 88 (LOAS)")) {
                blockedBenefits.push("87 e 88 (LOAS)");
            } else {
                blockedBenefits.push(clean);
            }
        });
    }

    const convenioStr = `${b.convenio || 'INSS'}${b.subConvenio ? ' - ' + b.subConvenio : ''}`;
    const isINSS = (b.convenio || 'INSS').trim().toUpperCase() === 'INSS';

    let t = `📋 **Resumo de Regras de Portabilidade**\n\n`;
    t += `🏛️ **Banco:** ${b.name}\n`;
    t += `💼 **Convênio:** ${convenioStr}\n`;
    t += `👵 **Idade:** De ${minAge} a ${maxAge} anos\n`;
    t += `📅 **Prazos:** ${prazosStr}\n`;

    if (isINSS) {
        t += `♿ **Aceita Invalidez:** ${invalidezStr}\n`;
        if (blockedBenefits.length > 0) {
            t += `🚫 **Benefício não atendido:** ${blockedBenefits.join(', ')}\n`;
        }
    }

    t += `✍️ **Aceita Analfabeto:** ${formatYesNo(acceptsIlliterate)}\n`;
    t += `🕒 **Aceita 60+:** ${formatYesNo(accepts60Mais)}\n`;
    t += `💵 **Parcela Mínima:** ${formatCurrency(minInstallmentValue)}\n`;
    t += `💰 **Troco Mínimo:** ${formatCurrency(minTroco)}\n`;
    t += `📊 **Saldo Mínimo:** ${formatCurrency(minBalance)}\n`;
    t += `📉 **Taxa Mínimo Port:** ${formatRate(portabilityRate)}\n`;
    t += `🔄 **Taxa Mínima Refin/Port:** ${formatRate(refinRate)}\n`;
    t += `🚫 **Bancos Não Portados (Origem):** ${bancoportStr}\n`;
    t += `⚠️ **Bancos com Regras específicas:** ${regrasEspecificasStr}`;

    return t;
}

function getBankTablesSummary(ruleIdOrName: string, sessionData: any = {}): string {
    let b = cachedBankRules.find(r => r.id === ruleIdOrName);
    if (!b) {
        b = cachedBankRules.find(r => (r.name || '').toLowerCase().includes(ruleIdOrName.toLowerCase()));
    }
    if (!b) return `⚠️ Banco **"${ruleIdOrName}"** não encontrado.`;

    const lastOffers = sessionData.allOffers || sessionData.lastOffers || [];

    // Encontrar as ofertas específicas calculadas e válidas para este banco
    const simulatedOffers = lastOffers.filter((o: any) =>
        checkBankMatch(b.name, o.name)
    );

    if (simulatedOffers.length > 0) {
        const margemNeg = sessionData.lastExtractedParams?.negativeCardValue || sessionData.extractedParams?.negativeCardValue || 0;
        const valParcelaBase = sessionData.lastExtractedParams?.valorParcela || sessionData.extractedParams?.valorParcela || 0;
        const parcelaFinal = valParcelaBase;
        const parcelaLabel = margemNeg > 0 ? `Nova Parcela` : `Valor da Parcela`;

        let t = `📊 **TABELAS E OFERTAS DISPONÍVEIS: ${b.name.toUpperCase()}** 🏛️\n`;
        t += `🤝 **Convênio:** **${b.convenio || 'INSS'}**${b.subConvenio ? ' - ' + b.subConvenio : ''}\n\n`;

        // Ordenar por menor troco (x.valorTroco - y.valorTroco)
        const sortedSimulated = simulatedOffers.sort((x: any, y: any) => x.valorTroco - y.valorTroco);
        sortedSimulated.forEach((o: any, idx: number) => {
            t += `${idx === 0 ? '⭐ ' : '👉 '}**Tabela:** **${o.tabela}**\n`;
            t += `• 💵 **${parcelaLabel}:** **R$ ${fmt(parcelaFinal)}**${margemNeg > 0 ? ` _(desconto de R$ ${fmt(margemNeg)})_` : ''}\n`;
            t += `• 📅 **Prazo:** **${o.prazoRefinPort || o.parcelasRestantes || 96} meses**\n`;
            t += `• ✍️ **Novo Contrato:** **R$ ${fmt(o.valorContrato)}**\n`;
            t += `• 🏦 **Saldo Devedor:** **R$ ${fmt(o.saldoDevedor || sessionData.lastExtractedParams?.saldoDevedor || 0)}**\n`;
            t += `• 📈 **Taxa do Refin:** **${o.taxaBase.toFixed(2)}% a.m.**\n`;
            t += `• 💰 **Troco Liberado:** **R$ ${fmt(o.valorTroco)}** 🤑\n\n`;
        });
        return t;
    } else {
        return `⚠️ O banco **${b.name.toUpperCase()}** não possui nenhuma oferta ou tabela de Refin da Portabilidade elegível para a simulação atual (ou você ainda não realizou uma simulação nesta sessão).`;
    }
}

function parsePortugueseNumber(valStr: string): number | null {
    if (!valStr) return null;
    const match = valStr.match(/[\d.,]+/);
    if (!match) return null;
    let clean = match[0];

    if (clean.includes('.') && clean.includes(',')) {
        if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            clean = clean.replace(/,/g, '');
        }
    } else if (clean.includes(',')) {
        clean = clean.replace(',', '.');
    }

    const parsed = parseFloat(clean);
    return isNaN(parsed) ? null : parsed;
}

// Extrai dados coletados do histórico da conversa
function updateParamsFromMessage(params: any, lastQuestion: string, userMsg: string) {
    const txt = userMsg.toLowerCase().trim();
    const prev = lastQuestion.toLowerCase();

    // Convênio
    if (!params.convenio) {
        if (/\binss\b/i.test(txt)) params.convenio = 'INSS';
        else if (/\bsiape\b/i.test(txt)) params.convenio = 'SIAPE';
        else if (/\bgoverno\b/i.test(txt)) params.convenio = 'GOVERNO';
        else if (/for[çc]as?\s*armadas?/i.test(txt)) params.convenio = 'FORÇAS ARMADAS';
        else if (/\bclt\b/i.test(txt)) params.convenio = 'CLT PRIVADO';
    }
    // Idade
    if (!params.idade && (prev.includes('idade') || prev.includes('anos'))) {
        const m = txt.match(/(\d{2})/);
        if (m && parseInt(m[1]) >= 18 && parseInt(m[1]) <= 100) params.idade = parseInt(m[1]);
    }
    // Estado (AP, PB, TO, RR)
    if (!params.estado && (prev.includes('estado') || prev.includes('reside') || prev.includes('mora'))) {
        const stateNormalized = txt.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos
        if (stateNormalized.includes("amapa") || /\bap\b/.test(stateNormalized)) {
            params.estado = "AP";
        } else if (stateNormalized.includes("paraiba") || /\bpb\b/.test(stateNormalized)) {
            params.estado = "PB";
        } else if (stateNormalized.includes("tocantins") || /\bto\b/.test(stateNormalized)) {
            params.estado = "TO";
        } else if (stateNormalized.includes("roraima") || /\brr\b/.test(stateNormalized)) {
            params.estado = "RR";
        } else {
            // Se o usuário falou outro estado (ex: "sao paulo", "sp", "rio de janeiro", "rj", "outro")
            const stateAcronymMatch = stateNormalized.match(/\b([a-z]{2})\b/);
            if (stateAcronymMatch) {
                params.estado = stateAcronymMatch[1].toUpperCase();
            } else if (stateNormalized.includes("outro") || stateNormalized.includes("outra")) {
                params.estado = "Outro";
            } else {
                // Caso contrário, salva o texto limpo digitado
                params.estado = userMsg.trim().substring(0, 20);
            }
        }
        if (params.idade >= 60) {
            params.isCliente60Mais = true;
        }
    }
    // Código do Benefício / Sub-convênio / Situação Funcional
    if (
        (!params.codigoBeneficio && !params.subConvenio) &&
        (prev.includes('benefício') || prev.includes('beneficio') ||
            prev.includes('espécie') || prev.includes('especie') ||
            prev.includes('sub-convênio') || prev.includes('sub-convenio') ||
            prev.includes('órgão') || prev.includes('orgao') ||
            prev.includes('funcional') || prev.includes('situação') || prev.includes('situacao'))
    ) {
        const m = txt.match(/(\d+)/);
        if (m && !prev.includes('funcional') && !prev.includes('situação') && !prev.includes('situacao')) {
            params.codigoBeneficio = m[1];
        } else {
            let sc = userMsg.trim();
            const scLower = sc.toLowerCase();
            if (params.convenio === 'SIAPE') {
                if (scLower.includes('s1') || scLower.includes('ativo') || scLower.includes('aposentado') || scLower.includes('aposentadno')) {
                    sc = 'S1';
                } else if (scLower.includes('s2') || scLower.includes('pensão') || scLower.includes('pensao') || scLower.includes('pensionista')) {
                    sc = 'S2';
                }
            }
            params.subConvenio = sc;
        }
    }
    // Analfabeto
    if (params.isAnalfabeto === undefined && prev.includes('analfabeto')) {
        params.isAnalfabeto = /sim/.test(txt);
    }
    // Cartões Consignados
    if (params.hasTwoCards === undefined && (prev.includes('cartões') || prev.includes('cartoes') || prev.includes('rmc') || prev.includes('rcc') || prev.includes('cartão') || prev.includes('cartao'))) {
        params.hasTwoCards = /sim|2|dois|ambos/.test(txt);
        if (/apenas\s*um|1|só\s*um|so\s*um/.test(txt)) {
            params.hasTwoCards = false;
        }
    }
    // Margem negativa
    if (params.hasTwoCards === true && params.negativeCardValue === undefined && (prev.includes('margem') || prev.includes('negativa'))) {
        const num = parsePortugueseNumber(userMsg);
        if (num !== null) params.negativeCardValue = num;
        else params.negativeCardValue = 0; // fallback caso o usuário diga que não tem
    }
    // Data de Concessão
    if (!params.dataConcessao && (prev.includes('concessão') || prev.includes('concessao') || prev.includes('data'))) {
        const m = txt.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
        if (m) {
            params.dataConcessao = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        } else {
            const m2 = txt.match(/(\d{4})/);
            if (m2 && parseInt(m2[1]) > 1900 && parseInt(m2[1]) <= new Date().getFullYear()) {
                params.dataConcessao = `${m2[1]}-01-01`;
            }
        }
    }
    // Banco atual
    if (!params.bancoAtual && prev.includes('banco') && (prev.includes('atual') || prev.includes('contrato'))) {
        params.bancoAtual = userMsg.trim();
    }
    // Prazo total
    if (!params.prazoTotal && (prev.includes('prazo total') || prev.includes('prazo do contrato') || (prev.includes('quantas') && prev.includes('total')))) {
        const m = txt.match(/(\d+)/);
        if (m) params.prazoTotal = parseInt(m[1]);
    }
    // Prazo restante
    if (!params.parcelasRestantes && (prev.includes('restante') || prev.includes('faltam') || prev.includes('restantes') || (prev.includes('quantas') && prev.includes('resta')))) {
        const m = txt.match(/(\d+)/);
        if (m) params.parcelasRestantes = parseInt(m[1]);
    }
    // Valor da parcela
    if (!params.valorParcela && prev.includes('parcela') && (prev.includes('valor') || prev.includes('quanto') || prev.includes('mensal'))) {
        const num = parsePortugueseNumber(userMsg);
        if (num !== null) params.valorParcela = num;
    }
    // Saldo devedor
    if (!params.saldoDevedor && (prev.includes('saldo') || prev.includes('devedor') || prev.includes('dívida') || prev.includes('divida') || prev.includes('debito') || prev.includes('débito') || txt.includes('saldo') || txt.includes('devedor'))) {
        const num = parsePortugueseNumber(userMsg);
        if (num !== null) params.saldoDevedor = num;
    }
    // Taxa de juros atual
    if (!params.taxaJurosMensal && (prev.includes('taxa') || prev.includes('juros') || txt.includes('taxa de juros') || txt.includes('taxa atual'))) {
        const match = txt.match(/(?:taxa|juros|atual)\s*(?:de)?\s*([0-9.,]+)%?/);
        if (match) {
            const num = parsePortugueseNumber(match[1]);
            if (num !== null && num > 0) {
                params.taxaJurosMensal = num > 0.1 ? num / 100 : num;
            }
        } else {
            const num = parsePortugueseNumber(userMsg);
            if (num !== null && num > 0) {
                params.taxaJurosMensal = num > 0.1 ? num / 100 : num;
            }
        }
    }

    // Se for Governo e não tiver subConvenio ou estado, vamos tentar extrair de qualquer forma
    if (params.convenio === 'GOVERNO' && (!params.subConvenio || !params.estado)) {
        const stateNormalized = txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let detectedState = "";
        if (stateNormalized.includes("amapa") || /\bap\b/.test(stateNormalized)) detectedState = "AP";
        else if (stateNormalized.includes("paraiba") || /\bpb\b/.test(stateNormalized)) detectedState = "PB";
        else if (stateNormalized.includes("tocantins") || /\bto\b/.test(stateNormalized)) detectedState = "TO";
        else if (stateNormalized.includes("roraima") || /\brr\b/.test(stateNormalized)) detectedState = "RR";
        else if (stateNormalized.includes("bahia") || /\bba\b/.test(stateNormalized)) detectedState = "BA";
        else if (stateNormalized.includes("pernambuco") || /\bpe\b/.test(stateNormalized)) detectedState = "PE";
        else if (stateNormalized.includes("maranhao") || /\bma\b/.test(stateNormalized)) detectedState = "MA";
        else if (stateNormalized.includes("goias") || /\bgo\b/.test(stateNormalized)) detectedState = "GO";
        else {
            const match = stateNormalized.match(/\b([a-z]{2})\b/);
            if (match) detectedState = match[1].toUpperCase();
        }

        if (detectedState) {
            if (!params.estado) params.estado = detectedState;
            if (!params.subConvenio) params.subConvenio = detectedState;
        }
    }

    // Sincronizar estado e subConvenio para convênio Governo
    if (params.convenio === 'GOVERNO') {
        if (params.estado && !params.subConvenio) {
            params.subConvenio = params.estado;
        } else if (params.subConvenio && !params.estado) {
            params.estado = params.subConvenio;
        }
    }
}

function hasAllRequired(d: any): boolean {
    if (!d.convenio || !d.idade || !d.valorParcela || !d.saldoDevedor || !d.prazoTotal || !d.parcelasRestantes) {
        return false;
    }
    if (d.convenio === 'INSS') {
        if (!d.codigoBeneficio) return false;
        const cbClean = d.codigoBeneficio.toString().replace(/^0+/, '');
        const isInvalidity = ['4', '5', '11', '30', '32', '33', '34', '92'].includes(cbClean);
        if (isInvalidity && d.idade < 60 && !d.dataConcessao) return false;
    }
    if (['GOVERNO', 'SIAPE', 'FORÇAS ARMADAS'].includes(d.convenio) && !d.subConvenio) {
        return false;
    }
    if (d.isAnalfabeto === undefined) {
        return false;
    }
    if (d.idade >= 60 && !d.estado) {
        return false;
    }
    return true;
}

function fmt(v: number) { return v?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'; }

function formatResult(top: any, banks: string[], grouped: any[], p: SimulationParams): string {
    if (!top) return "❌ *Atenção:* Infelizmente, não encontramos ofertas viáveis para o seu perfil no momento com as regras atuais dos bancos.";
    const tables = grouped.find(g => g.bankName === top.name)?.offers?.length || 1;

    let m = `🎉 *Excelente notícia! Simulação concluída com sucesso!* 🚀\n\n`;
    m += `⭐ **MELHOR OFERTA ENCONTRADA: ${top.name.toUpperCase()}**\n`;
    m += `📊 **${tables} tabela(s) de Refin da Portabilidade disponível(is)**\n\n`;

    m += `📋 **DETALHES DA OPERAÇÃO:**\n`;
    if (top.tabela) m += `• 🏷️ **Tabela:** **${top.tabela}**\n`;

    const margemNegativa = (p as any).negativeCardValue || 0;
    if (margemNegativa > 0) {
        const novaParcela = Math.max(0, (p.valorParcela || 0) - margemNegativa);
        m += `• 💵 **Nova Parcela:** **R$ ${fmt(novaParcela)}** _(desconto de R$ ${fmt(margemNegativa)} da margem negativa)_\n`;
    } else {
        m += `• 💵 **Valor da Parcela:** **R$ ${fmt(p.valorParcela || 0)}**\n`;
    }
    m += `• 📅 **Prazo:** **${top.prazoRefinPort || p.parcelasRestantes || 96} meses**\n`;
    m += `• ✍️ **Novo Contrato:** **R$ ${fmt(top.valorContrato)}**\n`;
    m += `• 🏦 **Saldo Devedor:** **R$ ${fmt(top.saldoDevedor || p.saldoDevedor || 0)}**\n`;

    if (top.taxaBase !== undefined) {
        m += `• 📈 **Taxa do Refin:** **${top.taxaBase.toFixed(2)}% a.m.**\n`;
    }

    m += `\n💰 **VALOR DO TROCO ESTIMADO LIBERADO: R$ ${fmt(top.valorTroco)}** 🤑💵\n\n`;

    const others = banks.filter(b => b !== top.name);
    if (others.length > 0) {
        m += `🏛️ **Outros bancos também elegíveis:** ${others.map(b => `**${b}**`).join(', ')}\n`;
        m += `\n💡 _Deseja ver a oferta de outro banco elegível acima? Basta digitar o nome dele (Ex: "Itau", "Pan")!_`;
    }

    if (tables > 1) {
        m += `\n\n✨ **Dica de Ouro:** Encontramos **${tables}** tabelas com ofertas elegíveis para o **${top.name.toUpperCase()}**. Para conhecer e comparar todas as opções deste banco ordenadas pelo menor troco, basta digitar **tabelas**! 📊`;
    }
    return m;
}

async function doCalculation(params: SimulationParams, userProfile: any, targetBankName?: string, sessionData: any = {}): Promise<string> {
    try {
        const margemNegativa = (params as any).negativeCardValue || 0;

        // Normalizar convênio que a IA pode ter enviado fora do padrão
        if (params.convenio) {
            const conv = params.convenio.toLowerCase();
            if (conv.includes('inss')) params.convenio = 'INSS';
            else if (conv.includes('siape')) params.convenio = 'SIAPE';
            else if (conv.includes('gov')) params.convenio = 'GOVERNO';
            else if (conv.includes('forç') || conv.includes('forc')) params.convenio = 'FORÇAS ARMADAS';
            else if (conv.includes('clt')) params.convenio = 'CLT PRIVADO';
        }

        // Sincronizar estado e subConvenio para convênio Governo
        if (params.convenio === 'GOVERNO') {
            if (params.estado && !params.subConvenio) params.subConvenio = params.estado;
            if (params.subConvenio && !params.estado) params.estado = params.subConvenio;
        }

        if (params.idade >= 60) {
            params.isCliente60Mais = true;
        }

        if (params.taxaJurosMensal && params.taxaJurosMensal > 0.1) {
            params.taxaJurosMensal = params.taxaJurosMensal / 100;
        }

        // Set parcelas pagas for simulation engine
        if (params.prazoTotal && params.parcelasRestantes && !params.parcelasPagas) {
            params.parcelasPagas = params.prazoTotal - params.parcelasRestantes;
        }

        // AUTO-CALCULATE MISSING RATE (exactly like the Web Simulator and simulation-service)
        if (!params.taxaJurosMensal && params.saldoDevedor > 0 && params.valorParcela > 0 && params.parcelasRestantes > 0) {
            params.taxaJurosMensal = calculateRate(params.saldoDevedor, params.valorParcela, params.parcelasRestantes);
        }

        const db = getAdminDb();
        if (!db) return "⚠️ Erro de conexão com o banco de dados.";
        const promotoraId = userProfile?.role === 'admin' ? 'admin' : (userProfile?.role === 'promotora' ? userProfile?.uid : userProfile?.createdBy || 'admin');
        const [bSnap, rSnap, sSnap] = await Promise.all([
            db.collection('bankRules').get(), db.collection('generalRules').get(), db.collection('settings').doc(promotoraId).get()
        ]);
        const rawBanks = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const banks = dedupBanks(rawBanks);
        const rules = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const sd = sSnap.exists ? sSnap.data() : {};
        const pp = sd?.bankPriorities || {};
        const pi = sd?.bankInstallments || {};

        const offers = calculateOffers(params, banks, rules, pp, pi, userProfile, sd?.nonPortableBanks || [], sd?.blockedBanks || []);
        console.log(`[Gutto] Total Offers: ${offers.length}`);
        sessionData.allOffers = JSON.parse(JSON.stringify(offers)); // Guaranty we save them without undefined values


        if (offers.length === 0) {
            return "❌ Infelizmente, analisando as regras dos bancos, não encontramos nenhuma oferta vantajosa ou compatível com esses dados no momento.";
        }

        let targetOffers = offers;
        if (targetBankName) {
            const explicitBankOffers = offers.filter((o: any) => o.name.toLowerCase().includes(targetBankName.toLowerCase()) || targetBankName.toLowerCase().includes(o.name.toLowerCase()));
            if (explicitBankOffers.length > 0) {
                targetOffers = explicitBankOffers;
            } else {
                return `❌ *Atenção:* Não encontramos tabelas ou ofertas elegíveis para o banco **${targetBankName.toUpperCase()}** no momento. Tente outro banco ou digite "tabelas" para ver as ofertas disponíveis.`;
            }
        }

        // 1. Filtrar pelo maior prazo disponível nas ofertas elegíveis
        const prazos = new Set<number>();
        targetOffers.forEach(o => {
            if (o.prazoRefinPort) prazos.add(o.prazoRefinPort);
        });
        const availablePrazos = Array.from(prazos).sort((a, b) => b - a);

        let offersWithPrazo = targetOffers;
        let selectedPrazo: number | null = null;
        if (availablePrazos.length > 0) {
            selectedPrazo = availablePrazos[0];
            offersWithPrazo = targetOffers.filter(o => o.prazoRefinPort === selectedPrazo);
        }

        // 2. Ordenar todas as ofertas por prioridade (crescente) e depois por troco (crescente/menor primeiro)
        const sortedOffers = [...offersWithPrazo].sort((a: any, b: any) => {
            const bankIdA = a.id?.split('-')[0];
            const bankIdB = b.id?.split('-')[0];
            const pA = pp[bankIdA] ?? a.priority ?? 999;
            const pB = pp[bankIdB] ?? b.priority ?? 999;
            const finalPA = pA === 0 ? 999 : pA;
            const finalPB = pB === 0 ? 999 : pB;
            if (finalPA !== finalPB) return finalPA - finalPB;
            return a.valorTroco - b.valorTroco; // MENOR troco primeiro!
        });

        if (sortedOffers.length === 0) {
            return "❌ Infelizmente, não encontramos nenhuma oferta elegível para o prazo selecionado no momento.";
        }

        // 3. Montar agrupamento compatível com o formatResult
        const groups = sortedOffers.reduce((acc, o) => {
            if (!acc[o.name]) acc[o.name] = { bankName: o.name, offers: [] };
            acc[o.name].offers.push(o);
            return acc;
        }, {} as Record<string, any>);

        const sorted = Object.values(groups)
            .sort((a: any, b: any) => {
                const bankIdA = a.offers[0].id?.split('-')[0];
                const bankIdB = b.offers[0].id?.split('-')[0];
                const pA = pp[bankIdA] ?? a.offers[0].priority ?? 999;
                const pB = pp[bankIdB] ?? b.offers[0].priority ?? 999;
                const finalPA = pA === 0 ? 999 : pA;
                const finalPB = pB === 0 ? 999 : pB;
                if (finalPA !== finalPB) return finalPA - finalPB;
                return a.offers[0].valorTroco - b.offers[0].valorTroco;
            });

        const top = sortedOffers[0];
        const bankNames = Array.from(new Set(offers.map((o: any) => o.name)));

        if (top) {
            sessionData.lastOffers = JSON.parse(JSON.stringify(sortedOffers));
            sessionData.allOffers = JSON.parse(JSON.stringify(offers));
            sessionData.lastOfertadoBank = top.name;
        }

        try {
            await db.collection('simulations').doc(generateUUID()).set({
                userId: userProfile.uid || userProfile.id || 'bot', userName: userProfile.name || 'WhatsApp',
                userAvatar: userProfile.logoUrl || userProfile.avatarUrl || userProfile.photoUrl || userProfile.photoURL || '',
                convenio: params.convenio, bancoAtual: params.bancoAtual, valorParcela: params.valorParcela,
                saldoDevedor: params.saldoDevedor, selectedOffer: top, topOffer: top?.name || '',
                topOfferContrato: top?.valorContrato || 0, topOfferTroco: top?.valorTroco || 0,
                topOfferTaxa: top?.novaTaxaPortabilidade || 0, topOfferTabela: top?.tabela || '',
                simData: params,
                createdAt: new Date(), timestamp: Date.now(), origin: 'whatsapp'
            });
        } catch (e) { console.error("Error saving simulation:", e); }

        return formatResult(top, bankNames, sorted, params);
    } catch (err: any) {
        console.error("Critical calculation error:", err);
        return `⚠️ Ops! Tivemos um erro ao processar as propostas: ${err.message || err}. Por favor, contate o administrador.`;
    }
}


function getTopOfferForAutomaticCpf(offers: any[], priorities: Record<string, number>) {
    if (!offers || offers.length === 0) return { top: null, sortedOffers: [] as any[] };

    const prazos = new Set<number>();
    offers.forEach((o: any) => {
        if (o.prazoRefinPort) prazos.add(o.prazoRefinPort);
    });
    const largestPrazo = Array.from(prazos).sort((a, b) => b - a)[0];
    const samePrazo = largestPrazo
        ? offers.filter((o: any) => o.prazoRefinPort === largestPrazo)
        : offers;

    const sortedOffers = [...samePrazo].sort((a: any, b: any) => {
        const bankIdA = a.id?.split('-')[0];
        const bankIdB = b.id?.split('-')[0];
        const pA = priorities[bankIdA] ?? a.priority ?? 999;
        const pB = priorities[bankIdB] ?? b.priority ?? 999;
        const finalPA = pA === 0 ? 999 : pA;
        const finalPB = pB === 0 ? 999 : pB;
        if (finalPA !== finalPB) return finalPA - finalPB;
        return a.valorTroco - b.valorTroco;
    });

    return { top: sortedOffers[0] || null, sortedOffers };
}

function parseAutomaticNumber(value: any): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (value === null || value === undefined) return 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    const normalized = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
        : raw.replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function truncateAutomatic(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.floor(value * 100) / 100;
}

function normalizeBenefitKey(value: any): string {
    const raw = String(value ?? '').trim();
    const digits = raw.replace(/\D/g, '');
    return digits || raw.toUpperCase();
}

function formatBenefitNumber(value: any): string {
    const raw = String(value ?? '').trim();
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 9) digits = digits.padStart(10, '0');
    if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d)/, '$1.$2.$3-$4');
    return raw || 'NÃO INFORMADO';
}

function maskCpfForWhatsApp(value: any): string {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length !== 11) return String(value || 'NÃO INFORMADO');
    return `${digits.slice(0, 3)}.XXX.XXX-${digits.slice(-2)}`;
}

function normalizeAutomaticDate(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function calculateAutomaticAge(value: any): number {
    const iso = normalizeAutomaticDate(value);
    if (!iso) return 0;
    const birth = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(birth.getTime())) return 0;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
    return Math.max(0, age);
}

function inferAutomaticIlliterate(rawBenefit: any): boolean {
    const beneficiary = rawBenefit?.Beneficiario || {};
    const direct = beneficiary?.Analfabeto ?? beneficiary?.analfabeto ?? rawBenefit?.Analfabeto ?? rawBenefit?.analfabeto;
    if (typeof direct === 'boolean') return direct;
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
        const normalized = String(direct).trim().toLowerCase();
        if (['sim', 's', '1', 'true'].includes(normalized)) return true;
        if (['nao', 'não', 'n', '0', 'false'].includes(normalized)) return false;
    }
    const literate = beneficiary?.Alfabetizado ?? beneficiary?.alfabetizado ?? rawBenefit?.Alfabetizado ?? rawBenefit?.alfabetizado;
    if (typeof literate === 'boolean') return !literate;
    if (literate !== undefined && literate !== null && String(literate).trim() !== '') {
        const normalized = String(literate).trim().toLowerCase();
        if (['nao', 'não', 'n', '0', 'false'].includes(normalized)) return true;
        if (['sim', 's', '1', 'true'].includes(normalized)) return false;
    }
    // A API atual do Multicorban normalmente não retorna alfabetização; mantém o comportamento histórico.
    return false;
}

function getDailyMarginCoefficient(settings: any): number {
    const candidates = [
        settings?.dailyMarginCoefficient,
        settings?.marginCoefficient,
        settings?.coeficienteMargem,
        process.env.INSS_MARGIN_DAILY_COEFFICIENT,
        0.02270,
    ];
    for (const candidate of candidates) {
        const parsed = parseAutomaticNumber(candidate);
        if (parsed > 0) return parsed;
    }
    return 0.02270;
}

function getBenefitMarginSummary(rawBenefit: any, dailyCoefficient: number) {
    const beneficiary = rawBenefit?.Beneficiario || {};
    const summary = rawBenefit?.ResumoFinanceiro || {};
    const loans = Array.isArray(rawBenefit?.Emprestimos)
        ? rawBenefit.Emprestimos
        : (rawBenefit?.Emprestimos ? [rawBenefit.Emprestimos] : []);
    const rmc = Array.isArray(rawBenefit?.Rmc) ? rawBenefit.Rmc : (rawBenefit?.Rmc ? [rawBenefit.Rmc] : []);
    const rcc = Array.isArray(rawBenefit?.RCC) ? rawBenefit.RCC : (rawBenefit?.RCC ? [rawBenefit.RCC] : []);

    const benefitValue = parseAutomaticNumber(
        summary?.ValorBeneficio ?? summary?.BaseCalculo ?? summary?.Bruto ?? summary?.ValorLiquido,
    );
    let committed = 0;
    for (const loan of loans) committed += parseAutomaticNumber(loan?.ValorParcela ?? loan?.Parcela);
    for (const card of [...rmc, ...rcc]) committed += parseAutomaticNumber(card?.ValorParcela ?? card?.Desconto);

    const rawSpecies = String(beneficiary?.Especie || '').trim();
    const speciesMatch = rawSpecies.match(/\d{1,2}/);
    const speciesCode = speciesMatch ? speciesMatch[0].padStart(2, '0') : rawSpecies;
    const isLoas = speciesCode === '87' || speciesCode === '88';
    const marginPercentage = isLoas ? 0.35 : 0.40;
    const consignable = truncateAutomatic(benefitValue * marginPercentage);
    const calculatedMargin = truncateAutomatic(consignable - committed);
    const rawApiMargin = summary?.MargemDisponivelEmprestimo;
    const hasApiMargin = rawApiMargin !== undefined && rawApiMargin !== null && String(rawApiMargin).trim() !== '';
    // Prioriza a margem explicitamente retornada pelo Multicorban. Se não vier, usa a mesma regra de cálculo da Consulta CPF.
    const availableMargin = hasApiMargin ? truncateAutomatic(parseAutomaticNumber(rawApiMargin)) : calculatedMargin;
    const releasedAmount = availableMargin > 0 && dailyCoefficient > 0
        ? truncateAutomatic(availableMargin / dailyCoefficient)
        : 0;

    return { benefitValue, availableMargin, releasedAmount, speciesCode };
}

function getAutomaticSpeciesLabel(rawSpecies: any): string {
    const raw = String(rawSpecies || '').trim();
    if (!raw) return 'NÃO INFORMADA';
    const match = raw.match(/\d{1,2}/);
    if (!match) return raw.toUpperCase();
    return getEspecieName(match[0].padStart(2, '0')).toUpperCase();
}

function cleanAutomaticBankName(value: any): string {
    let name = String(value || '').trim();
    name = name.replace(/^\d{1,4}\s*-\s*/, '');
    name = name.replace(/\s+S\.?A\.?$/i, '');
    return name.toUpperCase() || 'BANCO NÃO INFORMADO';
}

function getC6ReleasedAmount(summary: any): number {
    if (!summary) return 0;
    const released = parseAutomaticNumber(summary?.valorLiberado);
    if (released > 0) return released;
    return Math.max(0, parseAutomaticNumber(summary?.troco));
}

async function getAutomaticGuttoC6Refin(
    item: any,
    credentials?: C6RefinCredentials | null,
): Promise<{ available: boolean; summary?: any; errorCode?: string }> {
    if (!isC6Consignado(item?.bancoCodigo || '', item?.bancoNome || '')) return { available: false };

    if (!credentials?.username || !credentials?.password) {
        console.warn('[Gutto C6] Credencial C6 não foi enviada pelo n8n nesta requisição. Portabilidade seguirá normalmente.');
        return { available: false, errorCode: 'C6_CREDENTIAL_MISSING' };
    }

    try {
        const raw = await consultarRefinC6({
            cpf: item.cpf,
            beneficio: item.beneficio,
            contrato: item.contrato,
            bancoCodigo: item.bancoCodigo,
            bancoNome: item.bancoNome,
            dataNascimento: item.dataNascimento,
            rendaMensal: item.rendaMensal,
            valorParcela: item.params?.valorParcela,
            // O serviço C6 força 108x para todo refin INSS.
            prazo: 108,
            credentials,
        });
        const firstTable = getFirstAvailableC6Table(raw);
        const summary = summarizeC6RefinTable(firstTable);
        const releasedAmount = getC6ReleasedAmount(summary);
        return { available: !!summary && releasedAmount > 0, summary };
    } catch (error: any) {
        console.error(`[Gutto C6] Falha no contrato ${item?.contrato || ''}:`, error?.message || error);
        // Regra de atendimento: falha/inelegibilidade de refin não polui a resposta; segue portabilidade.
        return { available: false, errorCode: error?.code || 'C6_REFIN_ERROR' };
    }
}

function buildAutomaticContractBlock(
    item: any,
    contractIndex: number,
    offers: any[],
    top: any,
    c6Refin: { available: boolean; summary?: any },
): { text: string; displayedOffer: any | null } {
    const params: any = item.params || {};
    const bankNames = Array.from(new Set((offers || []).map((offer: any) => cleanAutomaticBankName(offer?.name))));

    let simulationName = '';
    let simulationTable = '';
    let releasedAmount = 0;
    let displayedOffer: any | null = null;

    if (c6Refin.available && c6Refin.summary) {
        const summary = c6Refin.summary;
        releasedAmount = getC6ReleasedAmount(summary);
        simulationName = 'C6 CONSIGNADO - REFIN 108X';
        simulationTable = String(summary?.tabela || 'PRIMEIRA CONDIÇÃO DISPONÍVEL').toUpperCase();
        displayedOffer = {
            name: 'C6 CONSIGNADO',
            tabela: simulationTable,
            valorTroco: releasedAmount,
            valorContrato: parseAutomaticNumber(summary?.valorContrato),
            taxaBase: parseAutomaticNumber(summary?.taxa),
            prazoRefinPort: 108,
            source: 'c6-refin',
        };
    } else if (top) {
        releasedAmount = Math.max(0, parseAutomaticNumber(top?.valorTroco));
        if (releasedAmount > 0) {
            simulationName = cleanAutomaticBankName(top?.name);
            simulationTable = String(top?.tabela || 'TABELA DISPONÍVEL').toUpperCase();
            displayedOffer = top;
        }
    }

    const chosenBankName = displayedOffer ? cleanAutomaticBankName(displayedOffer?.name) : '';
    const others = bankNames.filter((name: string) => name && (!chosenBankName || !checkBankMatch(name, chosenBankName)));

    if (!displayedOffer) {
        return { text: '', displayedOffer: null };
    }

    let block = `📌 *CONTRATO ${contractIndex}:* ${item?.contrato || 'NÃO INFORMADO'}\n`;
    block += `🏦 BANCO: ${cleanAutomaticBankName(item?.bancoNome || params?.bancoAtual)}\n`;
    block += `🔢 PARCELAS RESTANTES: ${params?.parcelasRestantes || 0}\n`;
    block += `💵 VALOR DE PARCELA: R$ ${fmt(parseAutomaticNumber(params?.valorParcela))}\n`;
    block += `💳 SALDO DEVEDOR: R$ ${fmt(parseAutomaticNumber(params?.saldoDevedor))}\n`;
    block += `\n🏆 SIMULAÇÃO: *${simulationName}*\n`;
    block += `🏷️ TABELA: ${simulationTable}\n`;
    block += `💰 VALOR LIBERADO: *R$ ${fmt(releasedAmount)}*`;

    // Refinanciamento C6 é uma operação interna do próprio banco.
    // Bancos alternativos aparecem somente na Portabilidade.
    if (!c6Refin.available && others.length > 0) {
        block += `\n✅ OUTROS BANCOS DISPONÍVEIS: ${others.join('/ ')}`;
    }

    return { text: block, displayedOffer };
}

async function simulateInssByCpf(cpf: string, userProfile: any, sessionData: any = {}, runtimeContext: WhatsAppRuntimeContext = {}): Promise<string> {
    try {
        const multicorbanData = await consultarCpfMulticorban(cpf, 'inss');
        const benefits = getBenefitArray(multicorbanData);
        if (benefits.length === 0) {
            return `🔎 *Consulta INSS concluída*\n\nNão encontrei benefício INSS para o CPF *${maskCpfForWhatsApp(cpf)}*.`;
        }

        // Processa os contratos de todos os benefícios. O agrupamento na resposta é feito pelo NB.
        const contracts = buildInssSimulationContracts(multicorbanData, cpf, 50);

        const db = getAdminDb();
        if (!db) return '⚠️ Erro de conexão com o banco de dados.';

        const promotoraId = userProfile?.role === 'admin'
            ? 'admin'
            : (userProfile?.role === 'promotora' ? userProfile?.uid : userProfile?.createdBy || 'admin');

        const [bSnap, rSnap, sSnap] = await Promise.all([
            db.collection('bankRules').get(),
            db.collection('generalRules').get(),
            db.collection('settings').doc(promotoraId).get(),
        ]);
        const banks = dedupBanks(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const rules = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const sd = sSnap.exists ? sSnap.data() : {};
        const pp = sd?.bankPriorities || {};
        const pi = sd?.bankInstallments || {};
        const dailyMarginCoefficient = getDailyMarginCoefficient(sd);

        const firstRawBenefit = benefits[0] || {};
        const firstBeneficiary = firstRawBenefit?.Beneficiario || {};
        const clientName = String(firstBeneficiary?.Nome || contracts[0]?.nomeCliente || 'NÃO INFORMADO').trim().toUpperCase();
        const clientAge = parseAutomaticNumber(firstBeneficiary?.Idade) || calculateAutomaticAge(firstBeneficiary?.DataNascimento || contracts[0]?.dataNascimento);
        const isIlliterate = inferAutomaticIlliterate(firstRawBenefit);

        let response = `✅ *CONSULTA INSS + SIMULAÇÃO AUTOMÁTICA*\n\n`;
        response += `👤 *DADOS DO CLIENTE*\n`;
        response += `NOME: *${clientName}*\n`;
        response += `🪪 CPF: ${maskCpfForWhatsApp(cpf)}\n`;
        response += `🎂 IDADE: ${clientAge > 0 ? `${Math.trunc(clientAge)} ANOS` : 'NÃO INFORMADA'}\n`;
        response += `✍️ ANALFABETO: ${isIlliterate ? 'SIM' : 'NÃO'}\n`;
        response += `======================`;

        let firstSuccessful: any = null;

        // Totais consolidados exibidos ao final da consulta.
        // Margem livre soma apenas valores efetivamente positivos/liberáveis.
        let totalMarginReleased = 0;
        let portabilityCount = 0;
        let totalPortabilityReleased = 0;
        let c6RefinCount = 0;
        let totalC6RefinReleased = 0;

        for (let benefitIndex = 0; benefitIndex < benefits.length; benefitIndex++) {
            const rawBenefit = benefits[benefitIndex];
            const beneficiary = rawBenefit?.Beneficiario || {};
            const benefitNumber = String(beneficiary?.Beneficio || '').trim();
            const benefitKey = normalizeBenefitKey(benefitNumber);
            const benefitContracts = contracts.filter(item => normalizeBenefitKey(item?.beneficio) === benefitKey);
            const margin = getBenefitMarginSummary(rawBenefit, dailyMarginCoefficient);
            if (margin.releasedAmount > 0) {
                totalMarginReleased += margin.releasedAmount;
            }

            response += `\n\n📄 BENEFÍCIO: *${formatBenefitNumber(benefitNumber)}*\n`;
            response += `📌 ESPÉCIE: ${getAutomaticSpeciesLabel(beneficiary?.Especie)}\n`;
            response += `💵 VALOR R$: ${fmt(margin.benefitValue)}\n`;
            response += `📊 MARGEM DISPONÍVEL: R$ ${fmt(margin.availableMargin)} (LIBERA *R$ ${fmt(margin.releasedAmount)}*)`;

            const benefitSimulationBlocks: string[] = [];
            let displayedContractNumber = 0;

            if (benefitContracts.length > 0) {
                for (let contractIndex = 0; contractIndex < benefitContracts.length; contractIndex++) {
                    const item = benefitContracts[contractIndex];
                    const params: any = { ...item.params };
                    params.isAnalfabeto = inferAutomaticIlliterate(rawBenefit);

                    if (!params.taxaJurosMensal && params.saldoDevedor > 0 && params.valorParcela > 0 && params.parcelasRestantes > 0) {
                        params.taxaJurosMensal = calculateRate(params.saldoDevedor, params.valorParcela, params.parcelasRestantes);
                    }

                    // C6: tenta o refin 108x primeiro. Sem refin válido, segue portabilidade normalmente.
                    const c6Refin = await getAutomaticGuttoC6Refin(item, runtimeContext.c6Credentials);
                    const offers = calculateOffers(
                        params,
                        banks,
                        rules,
                        pp,
                        pi,
                        userProfile,
                        sd?.nonPortableBanks || [],
                        sd?.blockedBanks || [],
                    );
                    const { top, sortedOffers } = getTopOfferForAutomaticCpf(offers, pp);
                    const rendered = buildAutomaticContractBlock(
                        item,
                        displayedContractNumber + 1,
                        offers,
                        top,
                        c6Refin,
                    );

                    // O Gutto mostra somente contratos com uma simulação realmente disponível.
                    if (rendered.displayedOffer && rendered.text) {
                        displayedContractNumber++;
                        benefitSimulationBlocks.push(rendered.text);

                        const released = Math.max(0, parseAutomaticNumber(rendered.displayedOffer?.valorTroco));
                        if (released > 0) {
                            if (c6Refin.available) {
                                c6RefinCount++;
                                totalC6RefinReleased += released;
                            } else {
                                portabilityCount++;
                                totalPortabilityReleased += released;
                            }
                        }
                    }

                    if (!firstSuccessful && top && rendered.displayedOffer) {
                        firstSuccessful = {
                            item,
                            params,
                            top,
                            offers,
                            sortedOffers,
                            displayedOffer: rendered.displayedOffer,
                            c6RefinAvailable: Boolean(c6Refin.available),
                        };
                    }

                    if (rendered.displayedOffer) {
                        try {
                            const displayed = rendered.displayedOffer;
                            await db.collection('simulations').doc(generateUUID()).set({
                                userId: userProfile.uid || userProfile.id || 'bot',
                                userName: userProfile.name || 'WhatsApp',
                                userAvatar: userProfile.logoUrl || userProfile.avatarUrl || userProfile.photoUrl || userProfile.photoURL || '',
                                nomeCliente: item.nomeCliente,
                                cpfCliente: item.cpf,
                                numeroBeneficio: item.beneficio,
                                numeroContrato: item.contrato,
                                convenio: 'INSS',
                                bancoAtual: params.bancoAtual,
                                valorParcela: params.valorParcela,
                                saldoDevedor: params.saldoDevedor,
                                selectedOffer: displayed,
                                topOffer: displayed?.name || '',
                                topOfferContrato: displayed?.valorContrato || 0,
                                topOfferTroco: displayed?.valorTroco || 0,
                                topOfferTaxa: displayed?.novaTaxaPortabilidade || displayed?.taxaBase || 0,
                                topOfferTabela: displayed?.tabela || '',
                                simData: params,
                                source: c6Refin.available ? 'multicorban-cpf-c6-refin' : 'multicorban-cpf',
                                c6Refin: c6Refin.summary || null,
                                c6RefinPrazo: c6Refin.available ? 108 : null,
                                dailyMarginCoefficient,
                                createdAt: new Date(),
                                timestamp: Date.now(),
                                origin: 'whatsapp',
                            });
                        } catch (saveError) {
                            console.error('[Gutto CPF] Erro ao salvar simulação:', saveError);
                        }
                    }
                }
            }

            if (benefitSimulationBlocks.length > 0) {
                response += `\n\n${benefitSimulationBlocks.join('\n\n--------------------------------------------\n\n')}`;
            } else {
                response += `\n\n❌ *NENHUM CONTRATO ELEGÍVEL PARA PORTABILIDADE PARA ESTE BENEFÍCIO*`;
            }

            if (benefitIndex < benefits.length - 1) {
                response += `\n\n--------------------------------------------`;
            }
        }

        if (firstSuccessful) {
            sessionData.lastExtractedParams = JSON.parse(JSON.stringify(firstSuccessful.params));
            sessionData.extractedParams = {};
            sessionData.lastOffers = JSON.parse(JSON.stringify(firstSuccessful.sortedOffers));
            sessionData.allOffers = JSON.parse(JSON.stringify(firstSuccessful.offers));
            sessionData.lastOfertadoBank = firstSuccessful.top.name;
        }
        sessionData.lastCpfConsulted = cpf;
        sessionData.lastDailyMarginCoefficient = dailyMarginCoefficient;
        sessionData.status = 'active';


        const totalReleased = totalMarginReleased + totalPortabilityReleased + totalC6RefinReleased;

        // Sem margem livre e sem nenhuma proposta com liberação positiva não há
        // resumo financeiro para exibir. Mantém somente a mensagem do benefício.
        if (totalReleased > 0) {
            response += `\n\n======================`;
            response += `\n\n📊 *RESUMO DAS LIBERAÇÕES*\n`;

            if (totalMarginReleased > 0) {
                response += `\n💵 MARGEM LIVRE: R$ ${fmt(totalMarginReleased)}`;
            }
            if (portabilityCount > 0) {
                const label = portabilityCount === 1 ? 'PORTABILIDADE' : 'PORTABILIDADES';
                response += `\n🔄 ${portabilityCount} ${label}: R$ ${fmt(totalPortabilityReleased)}`;
            }
            if (c6RefinCount > 0) {
                const label = c6RefinCount === 1 ? 'REFIN C6' : 'REFINS C6';
                response += `\n🏦 ${c6RefinCount} ${label}: R$ ${fmt(totalC6RefinReleased)}`;
            }

            response += `\n\n💰 *TOTAL LIBERADO: R$ ${fmt(totalReleased)}*`;
        }

        // Pós-simulação inteligente: só oferece uma ação quando existe uma alternativa real
        // para o mesmo contrato usado como referência. Evita instruções sem utilidade.
        if (firstSuccessful) {
            const positiveOffers = (firstSuccessful?.offers || []).filter(
                (offer: any) => Math.max(0, parseAutomaticNumber(offer?.valorTroco)) > 0,
            );
            const firstBank = cleanAutomaticBankName(firstSuccessful?.top?.name || '');
            const positiveBankNames = Array.from(new Set(
                positiveOffers
                    .map((offer: any) => cleanAutomaticBankName(offer?.name))
                    .filter((name: string) => name && name !== 'BANCO NÃO INFORMADO'),
            ));
            const firstBankOffers = positiveOffers.filter(
                (offer: any) => checkBankMatch(cleanAutomaticBankName(offer?.name), firstBank),
            );
            const tableNames = Array.from(new Set(
                firstBankOffers
                    .map((offer: any) => String(offer?.tabela || '').trim().toUpperCase())
                    .filter((table: string) => table.length > 0),
            ));
            const availableTerms = Array.from(new Set(
                firstBankOffers
                    .map((offer: any) => Number(offer?.prazoRefinPort || 0))
                    .filter((term: number) => term > 0),
            )).sort((a: number, b: number) => b - a);
            const currentTerm = Number(firstSuccessful?.top?.prazoRefinPort || 0);
            const alternateTerms = availableTerms.filter((term: number) => term !== currentTerm);
            const displayedBank = cleanAutomaticBankName(firstSuccessful?.displayedOffer?.name || firstBank);
            const otherBanks = positiveBankNames.filter((name: string) => !checkBankMatch(name, displayedBank));

            const hasOtherBank = otherBanks.length > 0;
            const hasMoreTables = tableNames.length > 1;
            const hasOtherTerms = availableTerms.length > 1;
            const hasNavigationOptions = hasOtherBank || hasMoreTables || hasOtherTerms;

            if (hasNavigationOptions) {
                response += `\n\n━━━━━━━━━━━━━━━━━━━━`;
                response += `\n💬 *OPÇÕES DA SIMULAÇÃO*`;

                if (hasOtherBank) {
                    response += `\n🏛️ Outros bancos com oferta para este contrato: *${otherBanks.join(', ')}*.`;
                    response += `\n➡️ Envie o *nome do banco* para ver a outra simulação.`;
                }

                if (hasMoreTables || hasOtherTerms) {
                    response += `\n📊 Existem outras ${hasMoreTables ? 'tabelas' : 'condições'}${firstBank ? ` no *${firstBank}*` : ''}. Digite *TABELAS* para visualizar.`;
                }

                if (hasOtherTerms && alternateTerms.length > 0) {
                    response += `\n📅 Também há outro prazo disponível. Exemplo: *TABELAS ${alternateTerms[0]}*.`;
                }

                response += `\n✅ Você pode continuar por aqui sem iniciar uma nova simulação.`;
            }
        }

        return response;
    } catch (error: any) {
        console.error('[Gutto CPF] Falha na consulta/simulação automática:', error);
        const msg = error?.message || 'Falha ao consultar o CPF';
        return `⚠️ Não consegui concluir a consulta automática do INSS para esse CPF. Motivo: ${msg}.`;
    }
}

async function internalProcessWhatsAppMessage(message: string, history: any[] = [], currentPhone: string = '', sessionData: any = {}, webUserIdOrProfile: any = null, runtimeContext: WhatsAppRuntimeContext = {}) {
    const ai = getAI();
    await loadRules();

    const isFirstMessage = (!history || history.length === 0);

    const lower = message.toLowerCase().trim();

    // Validar telefone/UID e carregar estado da sessão
    let userProfile = { role: 'admin' } as any;
    const db = getAdminDb();
    if (db) {
        if (webUserIdOrProfile && typeof webUserIdOrProfile === 'object') {
            userProfile = webUserIdOrProfile;
        } else if (webUserIdOrProfile && typeof webUserIdOrProfile === 'string') {
            try {
                const userDoc = await db.collection('users').doc(webUserIdOrProfile).get();
                if (userDoc.exists) {
                    userProfile = { uid: userDoc.id, ...userDoc.data() };
                }
            } catch (e) { console.error("Error loading web user profile:", e); }
        } else if (currentPhone) {
            try {
                const normalizedPhone = normalizePhone(currentPhone);
                const auth = await validateWhatsAppUser(normalizedPhone);
                if (!auth.authorized) {
                   return "Desculpe, seu número de telefone não está cadastrado ou autorizado no sistema.";
                }
                userProfile = auth.user;
            } catch (e) { console.error("Error loading phone user profile:", e); }
        }
    }

    // Fluxo rápido INSS: CPF -> Multicorban -> regras -> simulação -> resposta para o n8n/WhatsApp.
    // Este interceptador roda antes da IA para não pedir novamente dados que já existem na consulta.
    const cpfFromMessage = extractCpfFromText(message);
    if (cpfFromMessage) {
        console.log(`[Gutto CPF] CPF válido detectado: ${cpfFromMessage.slice(0, 3)}***${cpfFromMessage.slice(-2)}`);
        return await simulateInssByCpf(cpfFromMessage, userProfile, sessionData, runtimeContext);
    }

    // Contexto da última mensagem do bot
    const lastBotMsgContent = history.length > 0 ? history[history.length - 1].content || '' : '';
    const wasLastMsgSimOrTable = lastBotMsgContent.includes('Simulação concluída') ||
        lastBotMsgContent.includes('CONSULTA INSS + SIMULAÇÃO AUTOMÁTICA') ||
        lastBotMsgContent.includes('RESUMO DAS LIBERAÇÕES') ||
        lastBotMsgContent.includes('OPÇÕES DA SIMULAÇÃO') ||
        lastBotMsgContent.includes('DETALHES DA OPERAÇÃO') ||
        lastBotMsgContent.includes('TABELAS E OFERTAS DISPONÍVEIS');

    // Interceptar comando "tabelas" com ou sem prazo (ex: "tabelas 96") ou apenas número isolado (ex: "96")
    const tabelasMatch = lower.match(/^tabelas?(?:\s+(?:dispon[ií]veis|outras))?(?:\s+(?:do\s+refin|da\s+portabilidade))?(?:\s+(\d{2,3})x?)?$/i);
    const justNumberMatch = lower.match(/^(\d{2,3})x?$/i);

    if (lower === 'tabelas' || lower === 'tabela' || lower === 'tabelas disponíveis' || lower === 'outras tabelas' || tabelasMatch || (wasLastMsgSimOrTable && justNumberMatch)) {
        let requestedPrazo = null;
        if (tabelasMatch && tabelasMatch[1]) requestedPrazo = parseInt(tabelasMatch[1]);
        else if (wasLastMsgSimOrTable && justNumberMatch && justNumberMatch[1]) requestedPrazo = parseInt(justNumberMatch[1]);

        let lastOffers = sessionData.allOffers || sessionData.lastOffers || [];
        let lastBank = sessionData.lastOfertadoBank || '';

        if (lastOffers.length === 0 || !lastBank) {
            // Tentar recuperar do Firestore (coletando a última simulação ativa na web ou whatsapp)
            if (db && userProfile?.uid) {
                try {
                    const simSnap = await db.collection('simulations')
                        .where('userId', '==', userProfile.uid)
                        .orderBy('createdAt', 'desc')
                        .limit(1)
                        .get();
                    if (!simSnap.empty) {
                        const simDoc = simSnap.docs[0].data();

                        // Obter as regras e prioridades do Firestore para recalcular com precisão in-memory
                        const promotoraId = userProfile?.role === 'admin' ? 'admin' : (userProfile?.role === 'promotora' ? userProfile?.uid : userProfile?.createdBy || 'admin');
                        const [bSnap, rSnap, sSnap] = await Promise.all([
                            db.collection('bankRules').get(), db.collection('generalRules').get(), db.collection('settings').doc(promotoraId).get()
                        ]);
                        const rawBanks = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                        const banks = dedupBanks(rawBanks);
                        const rules = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                        const sd = sSnap.exists ? sSnap.data() : {};

                        const cleanParams = (simDoc && simDoc.simData) ? simDoc.simData : {
                            idade: simDoc?.idade,
                            convenio: simDoc?.convenio,
                            subConvenio: simDoc?.subConvenio,
                            bancoAtual: simDoc?.bancoAtual,
                            valorParcela: simDoc?.valorParcela,
                            saldoDevedor: simDoc?.saldoDevedor,
                            prazoTotal: simDoc?.prazoTotal,
                            parcelasRestantes: simDoc?.parcelasRestantes,
                            taxaJurosMensal: simDoc?.taxaJurosMensal,
                        };

                        if (cleanParams && cleanParams.convenio) {
                            sessionData.lastExtractedParams = cleanParams;

                            if (!cleanParams.taxaJurosMensal && cleanParams.saldoDevedor > 0 && cleanParams.valorParcela > 0 && cleanParams.parcelasRestantes > 0) {
                                cleanParams.taxaJurosMensal = calculateRate(cleanParams.saldoDevedor, cleanParams.valorParcela, cleanParams.parcelasRestantes);
                            }

                            const recalcOffers = calculateOffers(
                                cleanParams as SimulationParams,
                                banks,
                                rules,
                                sd?.bankPriorities || {},
                                sd?.bankInstallments || {},
                                userProfile,
                                sd?.nonPortableBanks || [],
                                sd?.blockedBanks || []
                            );
                            if (recalcOffers.length > 0) {
                                sessionData.allOffers = JSON.parse(JSON.stringify(recalcOffers));
                                lastOffers = recalcOffers;

                                if (simDoc.topOffer) {
                                    sessionData.lastOfertadoBank = simDoc.topOffer;
                                    lastBank = simDoc.topOffer;
                                } else {
                                    const sortedRecalc = [...recalcOffers].sort((a: any, b: any) => {
                                        const bankIdA = a.id?.split('-')[0];
                                        const bankIdB = b.id?.split('-')[0];
                                        const pp = sd?.bankPriorities || {};
                                        const pA = pp[bankIdA] ?? a.priority ?? 999;
                                        const pB = pp[bankIdB] ?? b.priority ?? 999;
                                        const finalPA = pA === 0 ? 999 : pA;
                                        const finalPB = pB === 0 ? 999 : pB;
                                        if (finalPA !== finalPB) return finalPA - finalPB;
                                        return a.valorTroco - b.valorTroco;
                                    });
                                    sessionData.lastOfertadoBank = sortedRecalc[0].name;
                                    lastBank = sortedRecalc[0].name;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("Erro ao recuperar simulação recente para tabelas:", e);
                }
            }
        }

        if (lastOffers.length === 0 || !lastBank) {
            return `⚠️ *Ops!* Você ainda não possui uma simulação ativa nesta sessão.\n\nPor favor, inicie informando o seu **convênio** para que eu possa simular as melhores ofertas para você! 👇\n\n👉 **INSS**\n👉 **SIAPE**\n👉 **GOVERNO**\n👉 **FORÇAS ARMADAS**\n👉 **CLT PRIVADO**`;
        }

        // Filter offers for the exact last bank that was simulated/offered
        const bankOffers = lastOffers.filter((o: any) => o.name === lastBank);

        if (bankOffers.length === 0) {
            return `⚠️ *Atenção:* Não foram encontradas outras tabelas disponíveis para o banco **${lastBank.toUpperCase()}** na simulação recente.`;
        }

        const prazosDisponiveis = new Set<number>();
        bankOffers.forEach((o: any) => { if (o.prazoRefinPort) prazosDisponiveis.add(o.prazoRefinPort); });
        const availablePrazos = Array.from(prazosDisponiveis).sort((a, b) => b - a);

        let prazoAtual = requestedPrazo;
        if (!prazoAtual && availablePrazos.length > 0) {
            // Se o usuário não pediu um prazo específico, exibe o maior (que foi o ofertado)
            prazoAtual = availablePrazos[0];
        }

        let filteredOffers = bankOffers;
        if (prazoAtual) {
            filteredOffers = bankOffers.filter((o: any) => o.prazoRefinPort === prazoAtual);
        }
        if (filteredOffers.length === 0) {
            return `⚠️ *Atenção:* Não encontramos tabelas disponíveis no prazo de **${prazoAtual}X** para o banco **${lastBank.toUpperCase()}**.`;
        }

        // Sort by troco ascending (menor troco primeiro)
        const sortedOffers = filteredOffers.sort((a: any, b: any) => a.valorTroco - b.valorTroco);

        const margemNeg = sessionData.lastExtractedParams?.negativeCardValue || sessionData.extractedParams?.negativeCardValue || 0;
        const valParcelaBase = sessionData.lastExtractedParams?.valorParcela || sessionData.extractedParams?.valorParcela || 0;
        const parcelaFinal = valParcelaBase;
        const parcelaLabel = margemNeg > 0 ? `Nova Parcela` : `Valor da Parcela`;

        let m = `📊 *TABELAS E OFERTAS DISPONÍVEIS: ${lastBank.toUpperCase()}* 🏛️\n\n`;
        sortedOffers.forEach((o: any, idx: number) => {
            m += `${idx === 0 ? '⭐ ' : '👉 '}*Tabela:* **${o.tabela}**\n`;
            m += `• 💵 *${parcelaLabel}:* **R$ ${fmt(parcelaFinal)}**${margemNeg > 0 ? ` _(desconto de R$ ${fmt(margemNeg)})_` : ''}\n`;
            m += `• 📅 *Prazo:* **${o.prazoRefinPort || o.parcelasRestantes || 96} meses**\n`;
            m += `• ✍️ *Novo Contrato:* **R$ ${fmt(o.valorContrato)}**\n`;
            m += `• 🏦 *Saldo Devedor:* **R$ ${fmt(o.saldoDevedor || sessionData.lastExtractedParams?.saldoDevedor || 0)}**\n`;
            m += `• 📈 *Taxa do Refin:* **${o.taxaBase.toFixed(2)}% a.m.**\n`;
            m += `• 💰 *Troco Liberado:* **R$ ${fmt(o.valorTroco)}** 🤑\n\n`;
        });

        const otherPrazos = availablePrazos.filter(p => p !== prazoAtual);
        if (otherPrazos.length > 0) {
            m += `💡 _Temos tabelas disponíveis também em outros prazos: ${otherPrazos.map(p => `*${p}X*`).join(', ')}. Para visualizá-las, digite por exemplo:_ *tabelas ${otherPrazos[0]}*`;
        } else {
            m += `💡 _Caso queira ver mais informações ou seguir com alguma das opções acima, é só me dizer!_`;
        }
        return m;
    }

    // Verificar agradecimentos / encerramento se a última mensagem do bot foi uma simulação
    const thanksKeywords = ['obrigado', 'obrigada', 'valeu', 'agradeço', 'grato', 'grata', 'tchau', 'obg', 'perfeito', 'show', 'blz', 'beleza', 'excelente', 'resolvido', 'ajudou', 'satisfeito'];

    const wasLastMsgSimulation = lastBotMsgContent.includes('Simulação concluída') ||
        lastBotMsgContent.includes('CONSULTA INSS + SIMULAÇÃO AUTOMÁTICA') ||
        lastBotMsgContent.includes('RESUMO DAS LIBERAÇÕES') ||
        lastBotMsgContent.includes('DETALHES DA OPERAÇÃO') ||
        lastBotMsgContent.includes('VALOR DO TROCO LIBERADO');

    const isThanks = thanksKeywords.some(kw => lower.includes(kw));

    if (isThanks && wasLastMsgSimulation) {
        sessionData.extractedParams = {};
        sessionData.lastExtractedParams = null;
        return `Por nada! 😊 Fico extremamente feliz em ajudar na sua busca pelas melhores taxas.\n\nEstou à sua total disposição sempre que precisar de uma nova simulação ou tirar dúvidas sobre portabilidade. Tenha um excelente dia e ótimos negócios! 🚀💼\n[END_SESSION]`;
    }

    // Interceptar consulta específica de tabelas de um determinado banco (ex: "tabelas do C6", "tabelas Daycoval")
    const tableRequestMatch = lower.match(/\btabelas?\s+(?:do\s+|da\s+|de\s+|do\s+banco\s+)?([a-z0-9\sáéíóúçãõâêô]+)/i);
    if (tableRequestMatch) {
        const searchName = tableRequestMatch[1].trim();
        // Garantir que não é apenas o comando "tabelas" (da simulação recente)
        if (searchName.length >= 2 && searchName !== 'disponíveis' && searchName !== 'do refin' && searchName !== 'da portabilidade') {
            const matchingBanks = cachedBankRules.filter(b =>
                checkBankMatch(b.name, searchName)
            );
            if (matchingBanks.length > 0) {
                return getBankTablesSummary(matchingBanks[0].id, sessionData);
            }
        }
    }

    // Interceptar perguntas sobre roteiro, resumo ou regras de portabilidade de um banco
    const isAskingRules = /\b(roteiro|resumo|regras?|portabilidade)\b/i.test(lower);
    if (isAskingRules) {
        // Obter extractedParams da sessão por referência
        let extracted = sessionData.extractedParams || {};

        // Extrair convênio se mencionado no texto
        let targetConvenio = '';
        if (/\binss\b/i.test(lower)) targetConvenio = 'INSS';
        else if (/\bsiape\b/i.test(lower)) targetConvenio = 'SIAPE';
        else if (/\bgoverno\b/i.test(lower)) targetConvenio = 'GOVERNO';
        else if (/for[çc]as?\s*armadas?/i.test(lower)) targetConvenio = 'FORÇAS ARMADAS';
        else if (/\bclt\b/i.test(lower)) targetConvenio = 'CLT PRIVADO';

        // Usar convênio da simulação ativa se nenhum foi fornecido na mensagem
        if (!targetConvenio && extracted?.convenio) {
            targetConvenio = extracted.convenio;
        }

        const BANK_CUSTOM_ALIASES: Record<string, string[]> = {
            "c6": ["c6", "c6 consig", "c6 consignado", "c6 bank"],
            "itau": ["itau", "itaú"],
            "bradesco": ["bradesco"],
            "santander": ["santander"],
            "banco do brasil": ["bb", "banco do brasil", "bancodobrasil"],
            "caixa": ["caixa", "cef", "caixa economica", "caixa econômica"],
            "pan": ["pan", "banco pan"],
            "bmg": ["bmg"],
            "safra": ["safra"],
            "daycoval": ["daycoval"],
            "banrisul": ["banrisul"],
            "picpay": ["picpay"],
            "brb": ["brb", "banco de brasilia", "banco de brasília"],
            "crefisa": ["crefisa"],
            "agibank": ["agibank"],
            "inbursa": ["inbursa"],
            "facta": ["facta"],
            "icred": ["icred"],
            "happy": ["happy"],
            "havecred": ["havecred"],
            "finanto": ["finanto"],
            "digio": ["digio"],
            "qualibanking": ["qualibanking"]
        };

        // Encontrar regras candidatas no banco de dados baseado no nome ou alias
        let matchingRules: any[] = [];
        for (const b of cachedBankRules) {
            const bName = (b.name || '').toLowerCase();

            // 1. Correspondência por nome completo
            if (bName.length > 2 && lower.includes(bName)) {
                matchingRules.push(b);
                continue;
            }

            // 2. Correspondência por aliases customizados
            let matchedByAlias = false;
            for (const [key, aliases] of Object.entries(BANK_CUSTOM_ALIASES)) {
                if (bName.includes(key)) {
                    const hasAliasMatch = aliases.some(alias => {
                        const regex = new RegExp(`\\b${alias}\\b`, 'i');
                        return regex.test(lower);
                    });
                    if (hasAliasMatch) {
                        matchingRules.push(b);
                        matchedByAlias = true;
                        break;
                    }
                }
            }
        }

        // Tentar extrair pelo padrão do texto caso não encontrou por correspondência direta
        if (matchingRules.length === 0) {
            const match = lower.match(/(?:roteiro|resumo|regras?(?:\s+de\s+portabilidade)?)\s+(?:do\s+|da\s+|de\s+|do\s+banco\s+|da\s+tabela\s+)?([a-z0-9\sáéíóúçãõâêô]+)/i);
            if (match) {
                const searchName = match[1].trim();
                if (searchName.length >= 2) {
                    matchingRules = cachedBankRules.filter(b =>
                        (b.name || '').toLowerCase().includes(searchName) ||
                        searchName.includes((b.name || '').toLowerCase())
                    );
                }
            }
        }

        // Se encontramos correspondências
        if (matchingRules.length > 0) {
            // Se houver apenas uma regra cadastrada para este banco
            if (matchingRules.length === 1) {
                return getRuleSummary(matchingRules[0].id);
            }

            // Se houver múltiplas regras e temos convênio (seja extraído da mensagem ou da sessão ativa)
            if (targetConvenio) {
                const rule = matchingRules.find(r => (r.convenio || 'INSS').trim().toUpperCase() === targetConvenio.toUpperCase());
                if (rule) {
                    return getRuleSummary(rule.id);
                }
            }

            // Se houver múltiplas regras e não sabemos o convênio, perguntamos ao usuário de forma amigável
            const conveniosDisponiveis = Array.from(new Set(matchingRules.map(r => r.convenio || 'INSS')));
            const bankName = matchingRules[0].name.toUpperCase();

            let m = `📋 *Encontrei o banco ${bankName} cadastrado para mais de um convênio!*\n\n`;
            m += `Por favor, digite qual convênio você gostaria de consultar: 👇\n`;
            conveniosDisponiveis.forEach(c => {
                m += `👉 **${c}**\n`;
            });
            m += `\n_(Exemplo: digite "${bankName} ${conveniosDisponiveis[0]}")_`;
            return m;
        }

        // Se identificou a pergunta sobre regras/roteiro/resumo mas não encontrou o banco ou o banco não está cadastrado no sistema
        const extractMatch = lower.match(/(?:roteiro|resumo|regras?(?:\s+de\s+portabilidade)?)\s+(?:do\s+|da\s+|de\s+|do\s+banco\s+|da\s+tabela\s+)?([a-z0-9\sáéíóúçãõâêô]+)/i);
        const attemptedBank = extractMatch ? extractMatch[1].trim() : '';
        if (attemptedBank && attemptedBank.length >= 2) {
            const uniqueNames = Array.from(new Set(cachedBankRules.map(b => b.name.toUpperCase()))).sort();
            return `🔍 *Banco não encontrado:* O banco **${attemptedBank}** não possui regras ativas cadastradas no momento.\n\n🏦 *Bancos disponíveis para consulta:*\n${uniqueNames.map(name => `• **${name}**`).join('\n')}`;
        }
    }

    if (/\b(bancos|lista)\b/.test(lower) && !history.some(h => h.content?.includes('Troco Estimado'))) {
        const uniqueNames = Array.from(new Set(cachedBankRules.map(b => b.name.toUpperCase()))).sort();
        return `🏦 *Bancos Cadastrados no Sistema:* ${uniqueNames.map(name => `**${name}**`).join(', ')}\n\n💡 *Dica:* Digite **Regras do [banco]** (ex: _Regras do C6_) para ver o roteiro detalhado de portabilidade deste banco!`;
    }

    // Carrega extractedParams diretamente de sessionData (passado por referência do route.ts)
    let extracted = sessionData.extractedParams || {};
    let lastExtracted = sessionData.lastExtractedParams;

    // Resetar parâmetros se palavras‑chave de reinício forem encontradas
    // ou se o usuário indicar um novo convênio após terminar a simulação.
    const cleanMsg = lower.replace(/[^\w\s]/g, '').trim();

    // Apenas reiniciar se for explicitamente solicitado, ou se for uma saudação isolada no meio da conversa
    const explicitRestart = ['reiniciar', 'resetar', 'cancelar simulação', 'cancelar simulacao', 'recomeçar', 'recomecar'];
    const exactGreetings = ['ola', 'oi', 'hello', 'bom dia', 'boa tarde', 'boa noite'];
    const convenioKeywords = ['inss', 'siape', 'governo', 'forças armadas', 'forcas armadas', 'clt'];

    const isRestart = explicitRestart.some(kw => lower.includes(kw)) ||
        exactGreetings.includes(cleanMsg) ||
        (sessionData.status === 'finished' && convenioKeywords.some(kw => lower.includes(kw)));



    if (isRestart) {
        extracted = {};

        // Gerar novo protocolo imediatamente
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const randomHex = Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0').toUpperCase();
        sessionData.protocolNumber = `GUTTO-${dateStr}-${randomHex}`;
        sessionData.status = 'active';
        sessionData.history = [];
        sessionData.extractedParams = {};
        sessionData.lastExtractedParams = null;
        sessionData.allOffers = [];

        console.log(`[Gutto] Resetting session parameters and generating new protocol: ${sessionData.protocolNumber}`);
        const userName = sessionData.pushName || userProfile.name || '';
        const greetingName = userName ? `Olá ${userName}, ` : 'Olá, ';
        return `${greetingName}👋 Eu sou o Gutto, especialista em portabilidade de crédito consignado. 🤖✨\n\nO seu protocolo de atendimento é: *${sessionData.protocolNumber}*.\n\nPodemos seguir para uma nova simulação de portabilidade? Ou você também pode me perguntar as regras de portabilidade de qualquer banco, por exemplo: "Regras do C6" ou "Tabelas do Daycoval"!, Ou se quiser tirar apenas uma dúvida é so falar 🤝💼`;
    } else {
        // Se a simulação acabou de ser feita e o usuário está apenas agradecendo/concordando
        if (lastExtracted && Object.keys(extracted).length === 0) {
            const endWords = ['obrigado', 'obrigada', 'valeu', 'obg', 'tchau', 'agradeço', 'perfeito', 'ok', 'certo', 'joia', 'entendi', 'ótimo', 'otimo', 'bom', 'show', 'top', 'legal'];
            const words = cleanMsg.split(/\s+/);
            const isEnd = words.every(w => endWords.includes(w) || w.length <= 3) && words.some(w => endWords.includes(w) && w.length >= 2);

            if (isEnd) {
                sessionData.status = 'finished';
                const protocol = sessionData.protocolNumber || 'N/A';
                console.log(`[Gutto] User thanked/ended session. Protocol: ${protocol}`);
                return `Eu que agradeço! Fico muito feliz em ajudar.\n\nO seu número de protocolo de atendimento foi: *${protocol}*.\n\nEste atendimento foi encerrado. Se precisar de uma nova simulação no futuro, é só me mandar um 'Olá'. Um abraço e um excelente dia! ✨\n[END_SESSION]`;
            }
        }

        const isNewConvenio = cleanMsg === 'inss' || cleanMsg === 'siape' || cleanMsg === 'governo' || (cleanMsg.includes('forcas') && cleanMsg.includes('armadas')) || (cleanMsg.includes('forças') && cleanMsg.includes('armadas'));
        if (isNewConvenio && lastExtracted && lastExtracted.convenio && !cleanMsg.includes(lastExtracted.convenio.toLowerCase())) {
            sessionData.status = 'finished';
            return `🔄 Percebi que você quer consultar um novo convênio. Encerrei o protocolo anterior.\n\nPor favor, envie a sua mensagem novamente para iniciar o novo atendimento!`;
        }

        // 2. Se o usuário digitou o nome de um banco e temos parâmetros de simulação completos
        const paramsToUse = lastExtracted || sessionData.extractedParams || {};
        if (hasAllRequired(paramsToUse)) {
            const offersToUse = (sessionData.allOffers && sessionData.allOffers.length > 0) ? sessionData.allOffers : (sessionData.lastOffers || []);
            const banksInOffers = Array.from(new Set(offersToUse.map((o: any) => o.name))) as string[];
            const matchedBankInOffers = banksInOffers.find(bName => checkBankMatch(bName, cleanMsg));

            if (matchedBankInOffers) {
                console.log(`[Gutto] User selected bank ${matchedBankInOffers} from active calculation offers.`);
                return await doCalculation(paramsToUse as SimulationParams, userProfile, matchedBankInOffers, sessionData);
            }

            // Fallback to rules if not in specific offers list
            const matchedCachedBank = cachedBankRules.find(b => checkBankMatch(b.name, cleanMsg));
            if (matchedCachedBank) {
                console.log(`[Gutto] User selected bank ${matchedCachedBank.name} from previous calculation.`);
                return await doCalculation(paramsToUse as SimulationParams, userProfile, matchedCachedBank.name, sessionData);
            }
        }

        const lastBotMessage = history.length > 0 ? history[history.length - 1].content || '' : '';
        updateParamsFromMessage(extracted, lastBotMessage, message);
    }

    // Salva de volta no objeto sessionData por referência
    sessionData.extractedParams = extracted;

    console.log(`[Gutto] Extracted fields:`, JSON.stringify(extracted));

    // Se temos tudo necessário, calcula imediatamente e limpa o estado para uma próxima simulação
    if (hasAllRequired(extracted)) {
        console.log(`[Gutto] All required data present! Performing simulation...`);
        const res = await doCalculation(extracted as SimulationParams, userProfile, undefined, sessionData);
        sessionData.lastExtractedParams = JSON.parse(JSON.stringify(extracted)); // Salva no histórico da sessão
        sessionData.extractedParams = {}; // Limpa parâmetros pós-sucesso
        return res;
    }

    // Construir sumário dos dados já coletados para orientar a IA de forma precisa
    const summaryData = { ...(lastExtracted || {}), ...extracted };
    let dataSummary = '';
    if (summaryData.convenio) dataSummary += `• Convênio: ${summaryData.convenio}\n`;
    if (summaryData.idade) dataSummary += `• Idade: ${summaryData.idade} anos\n`;
    if (summaryData.estado) dataSummary += `• Estado: ${summaryData.estado}\n`;
    if (summaryData.codigoBeneficio) dataSummary += `• Código do Benefício: ${summaryData.codigoBeneficio}\n`;
    if (summaryData.dataConcessao) dataSummary += `• Data de Concessão: ${summaryData.dataConcessao}\n`;
    if (summaryData.subConvenio) dataSummary += `• Sub-convênio/órgão: ${summaryData.subConvenio}\n`;
    if (summaryData.isAnalfabeto !== undefined) dataSummary += `• Analfabeto: ${summaryData.isAnalfabeto ? 'Sim' : 'Não'}\n`;
    if (summaryData.hasTwoCards !== undefined) dataSummary += `• Possui 2 cartões consignados ativos: ${summaryData.hasTwoCards ? 'Sim' : 'Não'}\n`;
    if (summaryData.negativeCardValue !== undefined) dataSummary += `• Margem Negativa: R$ ${fmt(summaryData.negativeCardValue)}\n`;
    if (summaryData.bancoAtual) dataSummary += `• Banco Atual: ${summaryData.bancoAtual}\n`;
    if (summaryData.prazoTotal) dataSummary += `• Prazo Total: ${summaryData.prazoTotal} meses\n`;
    if (summaryData.parcelasRestantes) dataSummary += `• Prazo Restante: ${summaryData.parcelasRestantes} meses\n`;
    if (summaryData.valorParcela) dataSummary += `• Valor da Parcela: R$ ${fmt(summaryData.valorParcela)}\n`;
    if (summaryData.saldoDevedor) dataSummary += `• Saldo Devedor: R$ ${fmt(summaryData.saldoDevedor)}\n`;
    if (summaryData.taxaJurosMensal) dataSummary += `• Taxa de Juros: ${(summaryData.taxaJurosMensal * 100).toFixed(2)}%\n`;

    const showStateQuestion = (summaryData.idade >= 60 || summaryData.convenio === 'GOVERNO') && !summaryData.estado;
    const step3Text = showStateQuestion
        ? "3. Se o Estado ainda NÃO foi coletado e (a idade for igual ou superior a 60 anos OU o convênio for Governo): Pergunte apenas qual é o Estado. Se o convênio for Governo, use exatamente esta frase: 'Como o seu convênio é Governo, me informe o Estado? (Ex: Bahia - BA, Maranhão - MA, Paraíba - PB, Pernambuco - PE)'"
        : "3. (PULADO - Estado não necessário ou já coletado)";

    const cbClean = summaryData.codigoBeneficio ? summaryData.codigoBeneficio.toString().replace(/^0+/, '') : '';
    const isInvalidityContext = ['4', '5', '11', '30', '32', '33', '34', '92'].includes(cbClean);
    const showDataConcessaoQuestion = summaryData.convenio === 'INSS' && isInvalidityContext && summaryData.idade < 60 && !summaryData.dataConcessao;
    const stepConcessaoText = showDataConcessaoQuestion
        ? "4.5. Se o benefício for Invalidez (espécie 32, 92, etc) e o cliente tiver menos de 60 anos, e a Data de Concessão AINDA NÃO FOI COLETADA: Pergunte qual é a **Data de Concessão do Benefício** (exemplo: informe a data exata como DD/MM/AAAA ou pelo menos o ano)."
        : "4.5. (PULADO - Data de concessão não necessária ou já coletada)";

    // Construir contexto de regras reais dos bancos cadastrados no sistema
    let bankRulesContext = '';
    cachedBankRules.forEach(b => {
        const minAge = b.minAge ?? b.min_age ?? 0;
        const maxAge = b.maxAge ?? b.max_age ?? 0;
        const minInstallment = b.minInstallmentValue ?? b.min_installment_value ?? 0;
        const minTroco = b.minTroco !== undefined ? b.minTroco : (b.min_troco !== undefined ? b.min_troco : 0);
        const acceptsIlliterate = b.acceptsIlliterate ?? b.accepts_illiterate ?? false;
        const accepts60Mais = b.accepts60Mais ?? b.accepts_60_mais ?? false;
        const refinRate = b.refinRate ?? b.refin_rate ?? 0;
        const portabilityRate = b.portabilityRate ?? b.portability_rate ?? 0;
        const nonAccepted = b.nonAcceptedBanks ?? b.non_accepted_banks ?? [];
        const specificRules = b.specificInstallmentRules !== undefined ? b.specificInstallmentRules : (b.specific_installment_rules !== undefined ? b.specific_installment_rules : []);
        const specificRulesStr = specificRules.length > 0 ? specificRules.map((r: any) => `${r.bank} (${r.installments} parcelas)`).join(', ') : 'Nenhum';

        const tablesArray = b.tabelas || b.tables || [];
        const plazosSet = new Set<number>();
        tablesArray.forEach((t: any) => {
            const p = t.prazoRefinPort || t.prazo || t.prazoTotal || 0;
            if (p > 0) plazosSet.add(p);
        });
        const sortedPlazos = Array.from(plazosSet).sort((x, y) => x - y);
        const formatPlazos = (plazos: number[]): string => {
            if (!plazos || plazos.length === 0) return "Não informado";
            const mapped = plazos.map(p => `${p}X`);
            if (mapped.length === 1) return mapped[0];
            if (mapped.length === 2) return `${mapped[0]} e ${mapped[1]}`;
            return `${mapped.slice(0, -1).join(', ')} e ${mapped[mapped.length - 1]}`;
        };
        const prazosStr = formatPlazos(sortedPlazos);

        const acceptsInvalidez = b.acceptsInvalidez !== false;
        const invalidezAgeYears = b.invalidezAgeYears || 0;
        const invalidezMaxAgeYears = b.invalidezMaxAgeYears || 0;
        const minBenefitTimeYears = b.minBenefitTimeYears || 0;
        const minBenefitTimeMonths = b.minBenefitTimeMonths || 0;
        let invalidezStr = 'Não';
        if (acceptsInvalidez) {
            if (invalidezAgeYears > 0 || minBenefitTimeYears > 0 || minBenefitTimeMonths > 0) {
                const maxStr = invalidezMaxAgeYears > 0 ? `${invalidezMaxAgeYears} anos` : '60 anos';
                invalidezStr = `SIM (Idade: >=${invalidezAgeYears} anos e <${maxStr}, Tempo de Benefício: ${minBenefitTimeYears} anos e ${minBenefitTimeMonths} meses)`;
            } else {
                invalidezStr = 'SIM';
            }
        }

        const acceptsLOAS = b.acceptsLOAS !== undefined ? b.acceptsLOAS : (b.accepts_loas !== undefined ? b.accepts_loas : false);
        const blockedBenefits: string[] = [];
        if (!acceptsInvalidez) {
            blockedBenefits.push("32 (Invalidez)");
        }
        if (!acceptsLOAS) {
            blockedBenefits.push("87 e 88 (LOAS)");
        }
        const excludedBenefits = b.excludedBenefits !== undefined ? b.excludedBenefits : (b.excluded_benefits !== undefined ? b.excluded_benefits : []);
        if (excludedBenefits && excludedBenefits.length > 0) {
            excludedBenefits.forEach((eb: string) => {
                const clean = eb.trim();
                if (clean === '32' && !blockedBenefits.includes("32 (Invalidez)")) {
                    blockedBenefits.push("32 (Invalidez)");
                } else if ((clean === '87' || clean === '88') && !blockedBenefits.includes("87 e 88 (LOAS)")) {
                    blockedBenefits.push("87 e 88 (LOAS)");
                } else {
                    blockedBenefits.push(clean);
                }
            });
        }
        const blockedBenefitsStr = blockedBenefits.length > 0 ? blockedBenefits.join(', ') : 'Nenhum';
        const isINSS = (b.convenio || 'INSS').trim().toUpperCase() === 'INSS';

        let bankRuleText = `\n- BANCO: ${b.name} (Convênio: ${b.convenio || 'INSS'}${b.subConvenio ? ' - ' + b.subConvenio : ''})
  * Idade Mínima: ${minAge} anos
  * Idade Máxima: ${maxAge} anos
  * Prazos de Refin: ${prazosStr}`;

        if (isINSS) {
            bankRuleText += `\n  * Aceita Invalidez: ${invalidezStr}
  * Benefício não atendido: ${blockedBenefitsStr}`;
        }

        bankRuleText += `\n  * Aceita Analfabeto: ${acceptsIlliterate ? 'SIM' : 'NÃO'}
  * Aceita 60+: ${accepts60Mais ? 'SIM' : 'NÃO'}
  * Parcela Mínima: R$ ${minInstallment.toFixed(2)}
  * Troco Mínimo: R$ ${minTroco.toFixed(2)}
  * Taxa Mínima Portabilidade: ${portabilityRate}%
  * Taxa Mínima Refin/Port: ${refinRate}%
  * Bancos Não Portados (origem): ${nonAccepted.join(', ') || 'Nenhum'}
  * Bancos com Regras específicas: ${specificRulesStr}`;

        bankRulesContext += bankRuleText;

        if (tablesArray.length > 0) {
            bankRulesContext += `\n  * Tabelas de Refin da Portabilidade Cadastradas:`;
            tablesArray.forEach((t: any) => {
                const taxa = t.taxaTabela ?? t.taxa_tabela ?? t.coeficiente ?? 0;
                const minTicket = t.minTicket ?? t.min_ticket ?? 0;
                const idadeMin = t.idadeMinima || 0;
                const idadeMax = t.idadeMaxima || 0;
                bankRulesContext += `\n    - Tabela: "${t.nome}" | Taxa Base/Tabela: ${taxa}%${minTicket > 0 ? ` | Valor Mínimo da Operação: R$ ${minTicket.toFixed(2)}` : ''}${idadeMin > 0 ? ` | Idade Mínima: ${idadeMin} anos` : ''}${idadeMax > 0 ? ` | Idade Máxima: ${idadeMax} anos` : ''}`;
            });
        }
    });

    const activeCoefsINSS = await getAllActiveCoefficients('INSS');
    const activeCoefsSIAPE = await getAllActiveCoefficients('SIAPE');
    let coefsContext = '\nCOEFICIENTES DIÁRIOS (TAXA LIVRE):\n';

    if (Object.keys(activeCoefsINSS).length > 0) {
        coefsContext += '- INSS:\n';
        for (const [code, val] of Object.entries(activeCoefsINSS)) {
            coefsContext += `  * Banco ${code}: ${val}\n`;
        }
    }

    if (Object.keys(activeCoefsSIAPE).length > 0) {
        coefsContext += '- SIAPE:\n';
        for (const [code, val] of Object.entries(activeCoefsSIAPE)) {
            coefsContext += `  * Banco ${code}: ${val}\n`;
        }
    }

    const sysInst = `Você é o Gutto, assistente especialista em portabilidade do portal.

REGRAS DE PORTABILIDADE E TABELAS DOS BANCOS CADASTRADOS NO SISTEMA:
Use APENAS as regras abaixo para responder perguntas individuais sobre roteiro, regras, idade mínima/máxima, tabelas ou resumos de cada banco (NUNCA use ou invente dados externos):
${bankRulesContext}
${coefsContext}

SOBRE PROTOCOLO DE ATENDIMENTO E ENCERRAMENTO:
- O número de protocolo deste atendimento é: ${sessionData.protocolNumber || 'GUTTO-0000'}.
- INÍCIO E APRESENTAÇÃO: O sistema já envia automaticamente a apresentação ("👋 Olá! Eu sou o Gutto... O seu protocolo é: GUTTO-XXX.") na primeira mensagem da conversa. Você NUNCA deve repetir essa apresentação inicial ou o número do protocolo na sua mensagem de saudação, apenas prossiga com as perguntas ou respostas de forma contínua.

- APÓS A APRESENTAÇÃO INICIAL: Você deve perguntar se o cliente quer fazer uma simulação ou se quer consultar as regras, exatamente com este sentido:
"Pode me informar se quer fazer uma nova simulação ou você também pode me perguntar as regras de portabilidade de qualquer banco, por exemplo: 'Regras do Bradesco' ou 'Tabelas do C6'!"

- ATENÇÃO: NÃO peça o convênio na primeira mensagem. Espere o cliente responder o que ele deseja fazer.

- ENCERRAMENTO: Se o cliente agradecer de forma final (ex: "Obrigado", "Valeu", "Não quero simular", "Tchau"), você DEVE se despedir de forma educada, agradecer o contato, REPETIR o número do protocolo e, obrigatoriamente, incluir a tag exata [END_SESSION] no final absoluto da sua mensagem. Isso avisará o sistema para encerrar a sessão.

SOBRE SIMULAR EM OUTRO BANCO APÓS A PRIMEIRA SIMULAÇÃO (REGRA DE OURO MÁXIMA):
- Se o usuário JÁ realizou uma simulação com sucesso e, na sequência, apenas digitar o nome de um banco (ex: "Havecred", "Pan", "Itaú") ou pedir para ver a oferta dele, isso significa que ele quer RECÁLCULO. Você DEVE IMEDIATAMENTE E OBRIGATORIAMENTE chamar a ferramenta \`calculate_client_loan_offers\` informando este nome no campo "targetBankName".
- É ESTRITAMENTE PROIBIDO fazer qualquer pergunta adicional (nem mesmo o Saldo Devedor) se o usuário apenas pedir para simular em outro banco. Chame a ferramenta imediatamente!
- NUNCA, SOB HIPÓTESE ALGUMA, responda com o roteiro de regras se o cliente está claramente em um fluxo de simulação ou pedindo "e no banco X". O resumo só serve se o cliente explicitamente pedir: "Quais as regras do banco X?" ou "Me passe o roteiro do banco Y". Se ele só digitar o nome, CHAME A FERRAMENTA!

SOBRE REGRAS, ROTEIROS OU RESUMOS DE PORTABILIDADE (USAR APENAS SE EXPLICITAMENTE SOLICITADO):
- Se o usuário solicitar explicitamente o resumo, regras ou roteiro de um banco (ex: "Quais as regras do banco Pan?"), use os dados acima para responder com absoluta precisão científica com as seguintes diretrizes:
  * Para o convênio INSS, use a estrutura de layout e emojis premium abaixo:
    🏛️ **Banco**: [Nome do Banco]
    👵 **Idade**: De [Idade Mínima] a [Idade Máxima] anos
    📅 **Prazos**: [Prazos de Refin]
    ♿ **Aceita Invalidez**: [Aceita Invalidez]
    🚫 **Benefício não atendido**: [Benefício não atendido, ex: 32 (Invalidez), 87 e 88 (LOAS). Se Nenhum, OMITA esta linha completa.]
    ✍️ **Aceita Analfabeto**: [SIM/NÃO]
    🕒 **Aceita 60+**: [SIM/NÃO]
    💵 **Parcela Mínima**: R$ [Valor formatado, ex: 20,00]
    💰 **Troco Mínimo**: R$ [Valor formatado, ex: 100,00]
    📉 **Taxa Mínima Portabilidade**: [Taxa]%
    🔄 **Taxa Mínima Refin/Port**: [Taxa]%
    🚫 **Bancos Não Portados (Origem)**: [Lista de Bancos Não Portados]
    ⚠️ **Bancos com Regras específicas**: [Lista de Bancos com Regras específicas]

  * Para os convênios SIAPE, FORÇAS ARMADAS, CLT PRIVADO e GOVERNO, use a estrutura de layout e emojis premium abaixo (ATENÇÃO: NUNCA exiba as linhas "Aceita Invalidez" ou "Benefício não atendido" para esses convênios, pois são específicos do INSS):
    🏛️ **Banco**: [Nome do Banco]
    👵 **Idade**: De [Idade Mínima] a [Idade Máxima] anos
    📅 **Prazos**: [Prazos de Refin]
    ✍️ **Aceita Analfabeto**: [SIM/NÃO]
    🕒 **Aceita 60+**: [SIM/NÃO]
    💵 **Parcela Mínima**: R$ [Valor formatado, ex: 20,00]
    💰 **Troco Mínimo**: R$ [Valor formatado, ex: 100,00]
    📉 **Taxa Mínima Portabilidade**: [Taxa]%
    🔄 **Taxa Mínima Refin/Port**: [Taxa]%
    🚫 **Bancos Não Portados (Origem)**: [Lista de Bancos Não Portados]
    ⚠️ **Bancos com Regras específicas**: [Lista de Bancos com Regras específicas]

- Se ele perguntar se um banco aceita analfabeto, qual a idade mínima, ou as taxas de uma tabela específica, responda citando diretamente os valores reais cadastrados listados acima.
- Se o usuário pedir para listar as tabelas de Refin de um banco, liste cada tabela informando a taxa e o valor mínimo da operação (se houver valor mínimo configurado na tabela; caso não haja valor mínimo listado acima para a tabela, NÃO exiba nem mencione o texto "valor mínimo" ou "operação mínima").
- Se o usuário pedir para você listar os bancos, ou perguntar de forma genérica sobre as regras de algum banco sem fornecer o nome de um banco cadastrado no sistema, instrua-o amigavelmente a perguntar especificando o banco no formato: "Regras do [Nome do Banco]" ou "Roteiro do [Nome do Banco]" (ex: "Regras do Bradesco").
- Sempre que você trouxer a resposta com regras, roteiros ou tabelas, coloque-se à disposição para iniciar uma simulação.

REGRA CRÍTICA ABSOLUTA: Faça APENAS UMA pergunta por vez. Nunca pergunte dois ou mais dados na mesma mensagem.

DADOS JÁ COLETADOS ATÉ AGORA (Nunca pergunte estes novamente!):
${dataSummary || 'Nenhum dado coletado ainda.'}

VOCÊ DEVE IDENTIFICAR O PRÓXIMO DADO QUE FALTA E PERGUNTAR SEGUINDO A ORDEM EXATA ABAIXO. IMPORTANTE: Só inicie a coleta do Convênio (Passo 1) SE O CLIENTE CONFIRMAR QUE QUER FAZER UMA SIMULAÇÃO! Se for a primeira mensagem (ex: "olá"), você DEVE perguntar exatamente assim: "Podemos seguir para uma nova simulação de portabilidade? Ou você também pode me perguntar as regras de portabilidade de qualquer banco, por exemplo: \"Regras do C6\" ou \"Tabelas do Daycoval\"!, Ou se quiser tirar apenas uma dúvida é so falar 🤝💼" e aguarde a resposta do usuário.
1. Convênio (INSS, SIAPE, Governo, Forças Armadas ou CLT Privado)
   - IMPORTANTE: Para pedir o convênio, use EXATAMENTE a frase: "Para iniciarmos a sua simulação personalizada e rápida, por favor, me informe qual é o seu convênio: 👇" e liste as opções abaixo:
     👉 **INSS**
     👉 **SIAPE**
     👉 **GOVERNO**
     👉 **FORÇAS ARMADAS**
     👉 **CLT PRIVADO**
2. Idade
${step3Text}
4. Para o próximo dado:
   - Se o convênio for INSS, pergunte o Código do Benefício.
   - Se o convênio for SIAPE, pergunte exatamente: "Como o seu convênio é SIAPE, qual é a sua Situação Funcional?\nS1 - Ativo/Aposentado\nS2 - Pensionista"
   - Se o convênio for Forças Armadas, pergunte qual a sua Força Militar (Ex: Aeronáutica, Exército ou Marinha).
   - Se convênio for CLT Privado, PULE esta pergunta.
${stepConcessaoText}
5. Se o cliente é Analfabeto? (Sim/Não)
   - IMPORTANTE: Para esta pergunta, você DEVE usar EXATAMENTE esta frase com as palavras em negrito usando asteriscos: "Você se considera **analfabeto** ou possui alguma **dificuldade para ler e escrever**? (Responda com **Sim** ou **Não**)"
6. Se convênio for INSS:
   - Pergunte PRIMEIRO: "Possui 2 cartões de crédito consignado ativos?"
   - Se o cliente responder que SIM (que possui os 2 cartões), faça UMA PERGUNTA ADICIONAL ANTES DE AVANÇAR: "Informe o valor da sua margem negativa atual, se houver (se não houver, digite 0)."
7. Banco atual onde está o contrato que deseja portar.
8. Prazo total do contrato original (em meses, ex: 84 ou 96).
9. Prazo restante / Parcelas restantes que ainda faltam pagar (em meses).
   - ATENÇÃO: Pergunte o prazo restante imediatamente após coletar o prazo total. Ex: "E desse contrato de [prazoTotal] meses, quantas parcelas ainda faltam pagar?"
10. Valor da parcela mensal (R$).
11. Saldo devedor aproximado do contrato (R$).
12. Se o cliente souber/desejar informar: Taxa de juros atual do contrato (Relação opcional, ex: "taxa de 1,59%").

CONFIRME de forma extremamente amigável, acolhedora e breve o dado que o usuário acabou de fornecer e pergunte em seguida APENAS O PRÓXIMO dado que falta na lista.
IMPORTANTE: Você DEVE usar EMOJIS (😊, 🚀, ✨, 💬, etc) em TODAS as suas mensagens para deixá-las sempre muito animadas, agradáveis e com um tom amigável e profissional.
Quando tiver TODOS os dados obrigatórios listados e coletados de fato pelas respostas do usuário (incluindo o saldo devedor real), chame a ferramenta apropriada imediatamente para exibir os resultados das ofertas.`;

    try {
        const words = cleanMsg.split(/\s+/);
        if (words.length <= 3 && sessionData.status !== 'finished') {
            const matchedBank = cachedBankRules.find(b => checkBankMatch(b.name, cleanMsg));
            if (matchedBank) {
                console.log(`[Gutto] CATCH-ALL: User typed bank name '${matchedBank.name}'. Forcing bypass.`);

                // Tenta usar parâmetros de lastExtracted, extractedParams ou extrair do histórico de ofertas
                let p = Object.keys(lastExtracted || {}).length > 0 ? lastExtracted : (sessionData.extractedParams || {});
                if (Object.keys(p).length === 0 && sessionData.lastOffers && sessionData.lastOffers.length > 0) {
                    console.log(`[Gutto] CATCH-ALL: Using fallback params from previous simulation state.`);
                    // Fallback to allow doCalculation to fetch the correct offers anyway
                    p = { convenio: 'INSS', idade: 50, valorParcela: 100, saldoDevedor: 1000, prazoTotal: 84, parcelasRestantes: 50 };
                }

                if (Object.keys(p).length > 0) {
                    const merged = { ...p };
                    return await doCalculation(merged as SimulationParams, userProfile, matchedBank.name, sessionData);
                }
            }
        }

        const contents = [
            ...history.slice(-16).map(h => ({ role: h.role === 'user' ? 'user' as const : 'model' as const, parts: [{ text: h.content }] })),
            { role: "user" as const, parts: [{ text: message }] }
        ];

        const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents,
            config: { systemInstruction: sysInst, tools: [{ functionDeclarations: [calculateLoanOffersTool] }] }
        });

        // Detectar function call
        const candidates = (result as any).candidates || [];
        const parts = candidates[0]?.content?.parts || [];
        const fc = parts.find((p: any) => p.functionCall);

        if (fc?.functionCall?.name === "calculate_client_loan_offers") {
            const params = fc.functionCall.args as any;
            console.log("[Gutto] AI calling calculation:", params);

            // Mescla com lastExtractedParams garantindo que null/undefined/'' da IA não sobrescreva os dados reais já coletados
            const mergedParams = { ...(sessionData.lastExtractedParams || {}) };
            for (const key of Object.keys(params)) {
                if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                    mergedParams[key] = params[key];
                }
            }

            sessionData.lastExtractedParams = JSON.parse(JSON.stringify(mergedParams));
            sessionData.extractedParams = {};
            return await doCalculation(mergedParams, userProfile, params.targetBankName, sessionData);
        }

        const text = parts.find((p: any) => p.text)?.text || (result as any).text;
        let finalReply = text || "Como posso ajudar na sua simulação hoje?";

        // Strip the hallucinated "model" string from the end of Gemini's response
        finalReply = finalReply.replace(/\s+model$/i, '').trim();

        if (isFirstMessage) {
            const userName = sessionData.pushName || userProfile.name || '';
            const greetingName = userName ? `Olá ${userName}, ` : 'Olá, ';
            finalReply = `${greetingName}👋 Eu sou o Gutto, especialista em portabilidade de crédito consignado. 🤖✨\n\nO seu protocolo de atendimento é: ${sessionData.protocolNumber || 'GUTTO-0000'}.\n\nPodemos seguir para uma nova simulação de portabilidade? Ou você também pode me perguntar as regras de portabilidade de qualquer banco, por exemplo: "Regras do C6" ou "Tabelas do Daycoval"!, Ou se quiser tirar apenas uma dúvida é so falar 🤝💼`;
        }
        return finalReply;

    } catch (error: any) {
        console.error("Agent Error:", error);
        if (hasAllRequired(extracted)) {
            const res = await doCalculation(extracted as SimulationParams, userProfile, undefined, sessionData);
            sessionData.lastExtractedParams = JSON.parse(JSON.stringify(extracted)); // Salva no histórico da sessão
            sessionData.extractedParams = {}; // Limpa parâmetros pós-sucesso
            return res;
        }
        return `⚠️ Ops! Tivemos uma pequena falha de conexão: ${error.message || 'Erro interno'}. Por favor, digite o dado novamente.`;
    }
}

function formatForWhatsApp(text: string): string {
    if (!text) return text;

    let formatted = text;

    // WhatsApp usa *texto* para NEGRITO. Portanto, qualquer *texto* que ja
    // venha pronto do Gutto deve ser preservado exatamente como esta.
    // Apenas normalizamos o Markdown padrao da IA (**texto**) para a sintaxe
    // nativa do WhatsApp (*texto*).

    // Bold + italic do Markdown -> bold + italic do WhatsApp.
    formatted = formatted.replace(/\*\*\*([^\*]+?)\*\*\*/g, '_*$1*_');
    formatted = formatted.replace(/\*\*\_([^\*\_]+?)\_\*\*/g, '_*$1*_');
    formatted = formatted.replace(/\_\*\*([^\*\_]+?)\*\*\_/g, '_*$1*_');

    // Bold Markdown -> bold WhatsApp.
    formatted = formatted.replace(/\*\*([^\*]+?)\*\*/g, '*$1*');

    // IMPORTANTE: nao converter *texto* para _texto_. No WhatsApp, *texto*
    // e justamente a marcacao de negrito que queremos enviar ao usuario.
    return formatted;
}

function dedupBanks(rawBanks: any[]): any[] {
    const seenKeys = new Map<string, any>();
    const getUpdatedTime = (b: any): number => {
        if (!b?.updatedAt) return 0;
        if (typeof b.updatedAt === 'number') return b.updatedAt;
        if (typeof b.updatedAt.toMillis === 'function') return b.updatedAt.toMillis();
        if (b.updatedAt.seconds) return b.updatedAt.seconds * 1000;
        const parsed = Date.parse(String(b.updatedAt));
        return isNaN(parsed) ? 0 : parsed;
    };

    rawBanks.forEach(bank => {
        const key = `${bank.name}-${bank.convenio}-${bank.subConvenio || ''}`.toUpperCase();
        const existing = seenKeys.get(key);
        const tBank = getUpdatedTime(bank);
        const tExisting = getUpdatedTime(existing);

        if (!existing || tBank > tExisting || (tBank === tExisting && bank.id.localeCompare(existing.id) > 0)) {
            seenKeys.set(key, bank);
        }
    });
    return Array.from(seenKeys.values());
}

export async function processWhatsAppMessage(message: string, history: any[] = [], currentPhone: string = '', sessionData: any = {}, webUserIdOrProfile: any = null, runtimeContext: WhatsAppRuntimeContext = {}): Promise<string> {
    const rawResult = await internalProcessWhatsAppMessage(message, history, currentPhone, sessionData, webUserIdOrProfile, runtimeContext);
    return formatForWhatsApp(rawResult);
}
