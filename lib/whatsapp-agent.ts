import { GoogleGenAI, Type } from "@google/genai";
import { getAI } from '@/lib/ai-config';
import { getAdminDb } from "@/lib/firebase-admin";
import { calculateOffers, SimulationParams } from "@/lib/simulation-engine";
import { randomUUID } from "crypto";

const ai = getAI();

const calculateLoanOffersTool = {
    name: "calculate_client_loan_offers",
    description: "Calculates loan portability offers. Call ONLY when you have collected all required information from the customer: convenio, idade, bancoAtual, valorParcela, saldoDevedor, prazoTotal, parcelasRestantes. DO NOT call this tool if you are missing any of these values.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            idade: { type: Type.NUMBER, description: "Customer age" },
            convenio: { type: Type.STRING, description: "INSS, SIAPE, GOVERNO, FORÇAS ARMADAS, CLT PRIVADO" },
            subConvenio: { type: Type.STRING, description: "Sub-agreement" },
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
            taxaJurosMensal: { type: Type.NUMBER, description: "Client's current contract interest rate as percentage (e.g. 1.59). Optional." }
        },
        required: ["idade", "convenio", "bancoAtual", "valorParcela", "saldoDevedor", "prazoTotal", "parcelasRestantes"]
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
    if (!b) return `Banco "${ruleIdOrName}" não encontrado.`;

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

    const convenioStr = `${b.convenio || 'INSS'}${b.subConvenio ? ' e ' + b.subConvenio : ''}`;

    let t = `📋 *Resumo de Regras de Portabilidade*\n\n`;
    t += `*Banco:* ${b.name}\n`;
    t += `*Convênio:* ${convenioStr}\n`;
    t += `*Idade Mínima:* ${minAge}\n`;
    t += `*Idade Máxima:* ${maxAge}\n`;
    t += `*Aceita Analfabeto:* ${formatYesNo(acceptsIlliterate)}\n`;
    t += `*Aceita 60+:* ${formatYesNo(accepts60Mais)}\n`;
    t += `*Parcela Mínima:* ${formatCurrency(minInstallmentValue)}\n`;
    t += `*Saldo Mínimo:* ${formatCurrency(minBalance)}\n`;
    t += `*Troco Mínimo:* ${formatCurrency(minTroco)}\n`;
    t += `*Taxa Mínimo Port:* ${formatRate(portabilityRate)}\n`;
    t += `*Taxa Mínima Refin/Port:* ${formatRate(refinRate)}\n`;
    t += `*Bancos que Porta:* ${bancoportStr}\n`;
    t += `*Bancos com Regras específicas:* ${regrasEspecificasStr}`;

    return t;
}

function getBankTablesSummary(ruleIdOrName: string): string {
    let b = cachedBankRules.find(r => r.id === ruleIdOrName);
    if (!b) {
        b = cachedBankRules.find(r => (r.name || '').toLowerCase().includes(ruleIdOrName.toLowerCase()));
    }
    if (!b) return `Banco "${ruleIdOrName}" não encontrado.`;
    
    if (!b.tables || b.tables.length === 0) {
        return `O banco *${b.name.toUpperCase()}* não possui tabelas de Refin da Portabilidade cadastradas no momento.`;
    }
    
    let t = `📈 *Tabelas de Refin da Portabilidade: ${b.name.toUpperCase()}*\n`;
    t += `*Convênio:* ${b.convenio || 'INSS'}${b.subConvenio ? ' e ' + b.subConvenio : ''}\n\n`;
    
    b.tables.forEach((tab: any) => {
        const tax = tab.taxaTabela !== undefined ? tab.taxaTabela : (tab.taxa_tabela !== undefined ? tab.taxa_tabela : 0);
        const minTicket = tab.minTicket !== undefined ? tab.minTicket : (tab.min_ticket !== undefined ? tab.min_ticket : 0);
        const idMin = tab.idadeMinima || 0;
        const idMax = tab.idadeMaxima || 0;
        t += `• *${tab.nome}* | Taxa: ${tax.toString().replace('.', ',')}%`;
        if (minTicket > 0) {
            t += ` | Valor Mínimo: R$ ${minTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        if (idMin > 0 || idMax > 0) {
            t += ` | Idade: ${idMin > 0 ? idMin : '0'}-${idMax > 0 ? idMax : '99'} anos`;
        }
        t += `\n`;
    });
    return t;
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
    if (!params.convenio && (prev === '' || prev.includes('convênio') || prev.includes('convenio'))) {
        if (/\binss\b/.test(txt)) params.convenio = 'INSS';
        else if (/\bsiape\b/.test(txt)) params.convenio = 'SIAPE';
        else if (/\bgoverno\b/.test(txt)) params.convenio = 'GOVERNO';
        else if (/for[çc]as?\s*armadas?/.test(txt)) params.convenio = 'FORÇAS ARMADAS';
        else if (/\bclt\b/.test(txt)) params.convenio = 'CLT PRIVADO';
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
}

function hasAllRequired(d: any): boolean {
    return !!(d.convenio && d.idade && d.bancoAtual && d.valorParcela && d.saldoDevedor && d.prazoTotal && d.parcelasRestantes);
}

function fmt(v: number) { return v?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'; }

function formatResult(top: any, banks: string[], grouped: any[], p: SimulationParams): string {
    if (!top) return "❌ Não encontramos ofertas viáveis para o seu perfil no momento com as regras atuais dos bancos.";
    const tables = grouped.find(g => g.bankName === top.name)?.offers?.length || 1;

    let m = `✅ *Simulação concluída com sucesso!*\n\n`;
    m += `⭐ *MELHOR OFERTA ENCONTRADA: ${top.name.toUpperCase()}*\n`;
    m += `📊 *${tables} tabela(s) disponível(is)*\n\n`;

    m += `📋 *DETALHES DA OPERAÇÃO (CONTRATO):*\n`;
    if (top.tabela) m += `• *Tabela:* ${top.tabela}\n`;
    m += `• *Valor da Parcela:* R$ ${fmt(p.valorParcela || 0)}\n`;
    m += `• *Prazo:* ${top.prazoRefinPort || p.parcelasRestantes || 96} meses\n`;
    m += `• *Novo Contrato:* R$ ${fmt(top.valorContrato)}\n`;
    m += `• *Saldo Devedor:* R$ ${fmt(top.saldoDevedor || p.saldoDevedor || 0)}\n`;

    if (top.taxaBase !== undefined) {
        m += `• *Taxa do Refin:* ${top.taxaBase.toFixed(2)}% a.m.\n`;
    }

    m += `\n💰 *VALOR DO TROCO LIBERADO:* R$ ${fmt(top.valorTroco)}\n\n`;

    const others = banks.filter(b => b !== top.name);
    if (others.length > 0) {
        m += `🏦 *BANCOS ELEGÍVEIS COM OFERTA:* ${others.join(', ')}\n`;
    }

    m += `\n_Caso queira ver a oferta de outro banco listado, digite o nome dele (Ex: "Itau", "Pan")._`;

    if (tables > 1) {
        m += `\n\n💡 *Dica:* Encontramos *${tables}* tabelas com ofertas viáveis para o banco *${top.name.toUpperCase()}*. Se quiser ver as outras opções de tabelas para este banco, basta digitar *tabelas*!`;
    }
    return m;
}

async function doCalculation(params: SimulationParams, userProfile: any, targetBankName?: string, sessionData: any = {}): Promise<string> {
    try {
        if (params.taxaJurosMensal && params.taxaJurosMensal > 0.1) {
            params.taxaJurosMensal = params.taxaJurosMensal / 100;
        }
        if (!params.taxaJurosMensal) {
            const n = params.parcelasRestantes || ((params.prazoTotal || 0) - (params.parcelasPagas || 0));
            if ((params.valorParcela || 0) > 0 && (params.saldoDevedor || 0) > 0 && n > 0) {
                params.taxaJurosMensal = calcRate(params.saldoDevedor!, params.valorParcela!, n);
            }
        }

        // Set parcelas pagas for simulation engine
        if (params.prazoTotal && params.parcelasRestantes && !params.parcelasPagas) {
            params.parcelasPagas = params.prazoTotal - params.parcelasRestantes;
        }

        const db = getAdminDb();
        if (!db) return "⚠️ Erro de conexão com o banco de dados.";
        const promotoraId = userProfile?.role === 'admin' ? 'admin' : (userProfile?.role === 'promotora' ? userProfile?.uid : userProfile?.createdBy || 'admin');
        const [bSnap, rSnap, sSnap] = await Promise.all([
            db.collection('bankRules').get(), db.collection('generalRules').get(), db.collection('settings').doc(promotoraId).get()
        ]);
        const banks = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const rules = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const sd = sSnap.exists ? sSnap.data() : {};
        const pp = sd?.bankPriorities || {};
        const pi = sd?.bankInstallments || {};

        const offers = calculateOffers(params, banks, rules, pp, pi, userProfile, sd?.nonPortableBanks || []);
        console.log(`[Gutto] Total Offers: ${offers.length}`);

        if (offers.length === 0) {
            return "❌ Infelizmente, analisando as regras dos bancos, não encontramos nenhuma oferta vantajosa ou compatível com esses dados no momento.";
        }

        const groups = offers.reduce((a, o) => { if (!a[o.name]) a[o.name] = { bankName: o.name, offers: [] }; a[o.name].offers.push(o); return a; }, {} as Record<string, any>);

        // Ordenar ofertas de cada banco pelo MAIOR troco (b.valorTroco - a.valorTroco)
        const sorted = Object.values(groups).map((g: any) => {
            const s = g.offers.sort((a: any, b: any) => b.valorTroco - a.valorTroco);
            return { ...g, offers: s, topOffer: s[0] };
        })
            // Ordenar bancos pela prioridade e depois pelo MAIOR troco
            .sort((a: any, b: any) => {
                const bankIdA = a.topOffer.id?.split('-')[0];
                const bankIdB = b.topOffer.id?.split('-')[0];
                const pA = pp[bankIdA] ?? a.topOffer.priority ?? 999;
                const pB = pp[bankIdB] ?? b.topOffer.priority ?? 999;
                const finalPA = pA === 0 ? 999 : pA;
                const finalPB = pB === 0 ? 999 : pB;
                if (finalPA !== finalPB) return finalPA - finalPB;
                return b.topOffer.valorTroco - a.topOffer.valorTroco;
            });

        const matchedBank = targetBankName
            ? sorted.find((g: any) => g.bankName.toLowerCase().includes(targetBankName.toLowerCase()) || targetBankName.toLowerCase().includes(g.bankName.toLowerCase()))
            : null;

        const top = matchedBank ? matchedBank.topOffer : (sorted.length > 0 ? sorted[0].topOffer : null);
        const bankNames = sorted.map((g: any) => g.bankName);

        if (top) {
            sessionData.lastOffers = offers;
            sessionData.lastOfertadoBank = top.name;
        }

        try {
            await db.collection('simulations').doc(randomUUID()).set({
                userId: userProfile.uid || 'bot', userName: userProfile.name || 'WhatsApp',
                userAvatar: userProfile.logoUrl || userProfile.avatarUrl || '',
                convenio: params.convenio, bancoAtual: params.bancoAtual, valorParcela: params.valorParcela,
                saldoDevedor: params.saldoDevedor, selectedOffer: top, topOffer: top?.name || '',
                topOfferContrato: top?.valorContrato || 0, topOfferTroco: top?.valorTroco || 0,
                topOfferTaxa: top?.novaTaxaPortabilidade || 0, topOfferTabela: top?.tabela || '',
                createdAt: new Date(), timestamp: Date.now(), origin: 'whatsapp'
            });
        } catch (e) { console.error("Error saving simulation:", e); }

        return formatResult(top, bankNames, sorted, params);
    } catch (err: any) {
        console.error("Critical calculation error:", err);
        return `⚠️ Ops! Tivemos um erro ao processar as propostas: ${err.message || err}. Por favor, contate o administrador.`;
    }
}

export async function processWhatsAppMessage(message: string, history: any[] = [], currentPhone: string = '', sessionData: any = {}) {
    const ai = getAI();
    await loadRules();

    if (history.length === 0) {
        return `Olá! Eu sou o *Gutto*, especialista em portabilidade.\n\nPara iniciarmos a sua simulação, qual é o seu *convênio*?\n\n*Opções disponíveis:*\n👉 INSS\n👉 SIAPE\n👉 Governo\n👉 Forças Armadas\n👉 CLT Privado\n\n(Ou pergunte as regras de algum banco, ex: "Regras do Bradesco")`;
    }

    const lower = message.toLowerCase().trim();

    // Interceptar comando "tabelas" ou "tabela"
    if (lower === 'tabelas' || lower === 'tabela' || lower === 'tabelas disponíveis' || lower === 'outras tabelas') {
        const lastOffers = sessionData.lastOffers || [];
        const lastBank = sessionData.lastOfertadoBank || '';
        
        if (lastOffers.length === 0 || !lastBank) {
            return `Você ainda não possui uma simulação ativa nesta sessão. Por favor, inicie informando o seu *convênio* para simularmos!`;
        }
        
        // Filter offers for the last bank that was simulated/offered
        const bankOffers = lastOffers.filter((o: any) => o.name.toLowerCase() === lastBank.toLowerCase());
        
        if (bankOffers.length === 0) {
            return `Não foram encontradas outras tabelas disponíveis para o banco *${lastBank.toUpperCase()}* na simulação recente.`;
        }
        
        // Sort by troco descending
        const sortedOffers = bankOffers.sort((a: any, b: any) => b.valorTroco - a.valorTroco);
        
        let m = `📊 *TODAS AS TABELAS E OFERTAS DISPONÍVEIS: ${lastBank.toUpperCase()}*\n\n`;
        sortedOffers.forEach((o: any, idx: number) => {
            m += `${idx === 0 ? '⭐ ' : '👉 '}*Tabela:* ${o.tabela}\n`;
            m += `• *Valor da Parcela:* R$ ${fmt(o.valorParcela || 0)}\n`;
            m += `• *Prazo:* ${o.prazoRefinPort || o.parcelasRestantes || 96} meses\n`;
            m += `• *Novo Contrato:* R$ ${fmt(o.valorContrato)}\n`;
            m += `• *Taxa do Refin:* ${o.taxaBase.toFixed(2)}% a.m.\n`;
            m += `• *Troco Liberado:* R$ ${fmt(o.valorTroco)}\n\n`;
        });
        
        m += `_Caso queira ver mais informações ou seguir com alguma das opções acima, é só me dizer!_`;
        return m;
    }

    // Verificar agradecimentos / encerramento se a última mensagem do bot foi uma simulação
    const thanksKeywords = ['obrigado', 'obrigada', 'valeu', 'agradeço', 'grato', 'grata', 'tchau', 'obg', 'perfeito', 'show', 'blz', 'beleza', 'excelente', 'resolvido', 'ajudou', 'satisfeito'];
    const lastBotMsgContent = history.length > 0 ? history[history.length - 1].content || '' : '';
    const wasLastMsgSimulation = lastBotMsgContent.includes('Simulação concluída') ||
        lastBotMsgContent.includes('DETALHES DA OPERAÇÃO') ||
        lastBotMsgContent.includes('VALOR DO TROCO LIBERADO');

    const isThanks = thanksKeywords.some(kw => lower.includes(kw));

    if (isThanks && wasLastMsgSimulation) {
        sessionData.extractedParams = {}; // Limpa parâmetros
        sessionData.lastExtractedParams = null; // Limpa histórico
        return `Por nada! 😊 Fico extremamente feliz em ajudar na sua busca pelas melhores taxas.\n\nEstou à sua total disposição sempre que precisar de uma nova simulação ou tirar dúvidas sobre portabilidade. Tenha um excelente dia e ótimos negócios! 🚀💼`;
    }

    // Interceptar consulta específica de tabelas de um determinado banco (ex: "tabelas do C6", "tabelas Daycoval")
    const tableRequestMatch = lower.match(/\btabelas?\s+(?:do\s+|da\s+|de\s+|do\s+banco\s+)?([a-z0-9\sáéíóúçãõâêô]+)/i);
    if (tableRequestMatch) {
        const searchName = tableRequestMatch[1].trim();
        // Garantir que não é apenas o comando "tabelas" (da simulação recente)
        if (searchName.length >= 2 && searchName !== 'disponíveis' && searchName !== 'do refin' && searchName !== 'da portabilidade') {
            const matchingBanks = cachedBankRules.filter(b =>
                (b.name || '').toLowerCase().includes(searchName) ||
                searchName.includes((b.name || '').toLowerCase())
            );
            if (matchingBanks.length > 0) {
                return getBankTablesSummary(matchingBanks[0].id);
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
            "qualibanking": ["qualibanking"],
            "total cash": ["total cash", "totalcash"]
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

            let m = `📋 Encontrei o banco *${bankName}* cadastrado para mais de um convênio.\n\n`;
            m += `Por favor, digite qual convênio você gostaria de consultar:\n`;
            conveniosDisponiveis.forEach(c => {
                m += `👉 *${c}*\n`;
            });
            m += `\n_(Exemplo: digite "${bankName} ${conveniosDisponiveis[0]}")_`;
            return m;
        }

        // Se identificou a pergunta sobre regras/roteiro/resumo mas não encontrou o banco ou o banco não está cadastrado no sistema
        const extractMatch = lower.match(/(?:roteiro|resumo|regras?(?:\s+de\s+portabilidade)?)\s+(?:do\s+|da\s+|de\s+|do\s+banco\s+|da\s+tabela\s+)?([a-z0-9\sáéíóúçãõâêô]+)/i);
        const attemptedBank = extractMatch ? extractMatch[1].trim() : '';
        if (attemptedBank && attemptedBank.length >= 2) {
            const uniqueNames = Array.from(new Set(cachedBankRules.map(b => b.name.toUpperCase()))).sort();
            return `O banco "${attemptedBank}" não foi encontrado no sistema com regras cadastradas. Bancos disponíveis para consulta:\n${uniqueNames.map(name => `• ${name}`).join('\n')}`;
        }
    }

    if (/\b(bancos|lista)\b/.test(lower) && !history.some(h => h.content?.includes('Troco Estimado'))) {
        const uniqueNames = Array.from(new Set(cachedBankRules.map(b => b.name.toUpperCase()))).sort();
        return `🏦 *Bancos Cadastrados:* ${uniqueNames.join(', ')}\n\nDigite: *Regras do [banco]* para ver as regras detalhadas de portabilidade.`;
    }

    // Validar telefone e carregar estado da sessão
    let userProfile = { role: 'admin' } as any;
    if (currentPhone) {
        const clean = currentPhone.replace(/\D/g, '');
        const db = getAdminDb();
        if (db) {
            const snap = await db.collection('users').get();
            let found = null;
            snap.forEach(doc => { const d = doc.data(); if (d.phone) { const cp = d.phone.replace(/\D/g, ''); if (cp.length >= 8 && clean.endsWith(cp)) found = { uid: doc.id, ...d }; } });
            if (!found) return "Desculpe, seu número de telefone não está cadastrado ou autorizado no sistema.";
            userProfile = found;
        }
    }

    // Carrega extractedParams diretamente de sessionData (passado por referência do route.ts)
    let extracted = sessionData.extractedParams || {};
    let lastExtracted = sessionData.lastExtractedParams;

    // Resetar parâmetros se palavras-chave de reinício forem encontradas
    const restartKeywords = ['simular', 'nova simulação', 'começar', 'reiniciar', 'iniciar', 'resetar'];
    const isRestart = restartKeywords.some(kw => lower.includes(kw));

    if (isRestart) {
        extracted = {};
        sessionData.extractedParams = {};
        sessionData.lastExtractedParams = null;
        console.log(`[Gutto] Resetting session parameters.`);
        return `Perfeito! Reiniciei a simulação para você.\n\nPara começarmos do zero, qual é o seu *convênio*?\n\n👉 INSS\n👉 SIAPE\n👉 Governo\n👉 Forças Armadas\n👉 CLT Privado`;
    } else {
        // Se temos lastExtracted e o usuário digitou o nome de um banco
        const cleanMsg = lower.replace(/[^\w\s]/g, '').trim();
        const matchedCachedBank = lastExtracted && cachedBankRules.find(b =>
            b.name.toLowerCase().includes(cleanMsg) || cleanMsg.includes(b.name.toLowerCase())
        );
        if (matchedCachedBank && lastExtracted) {
            console.log(`[Gutto] User selected bank ${matchedCachedBank.name} from previous calculation.`);
            return await doCalculation(lastExtracted as SimulationParams, userProfile, matchedCachedBank.name, sessionData);
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
        sessionData.lastExtractedParams = { ...extracted }; // Salva no histórico da sessão
        sessionData.extractedParams = {}; // Limpa parâmetros pós-sucesso
        return res;
    }

    // Construir sumário dos dados já coletados para orientar a IA de forma precisa
    let dataSummary = '';
    if (extracted.convenio) dataSummary += `• Convênio: ${extracted.convenio}\n`;
    if (extracted.idade) dataSummary += `• Idade: ${extracted.idade} anos\n`;
    if (extracted.estado) dataSummary += `• Estado: ${extracted.estado}\n`;
    if (extracted.codigoBeneficio) dataSummary += `• Código do Benefício: ${extracted.codigoBeneficio}\n`;
    if (extracted.subConvenio) dataSummary += `• Sub-convênio/órgão: ${extracted.subConvenio}\n`;
    if (extracted.isAnalfabeto !== undefined) dataSummary += `• Analfabeto: ${extracted.isAnalfabeto ? 'Sim' : 'Não'}\n`;
    if (extracted.hasTwoCards !== undefined) dataSummary += `• Possui 2 cartões consignados ativos: ${extracted.hasTwoCards ? 'Sim' : 'Não'}\n`;
    if (extracted.bancoAtual) dataSummary += `• Banco Atual: ${extracted.bancoAtual}\n`;
    if (extracted.prazoTotal) dataSummary += `• Prazo Total: ${extracted.prazoTotal} meses\n`;
    if (extracted.parcelasRestantes) dataSummary += `• Prazo Restante: ${extracted.parcelasRestantes} meses\n`;
    if (extracted.valorParcela) dataSummary += `• Valor da Parcela: R$ ${fmt(extracted.valorParcela)}\n`;
    if (extracted.saldoDevedor) dataSummary += `• Saldo Devedor: R$ ${fmt(extracted.saldoDevedor)}\n`;
    if (extracted.taxaJurosMensal) dataSummary += `• Taxa de Juros: ${(extracted.taxaJurosMensal * 100).toFixed(2)}%\n`;

    const showStateQuestion = extracted.idade >= 60 && !extracted.estado && !extracted.bancoAtual && !extracted.prazoTotal;
    const step3Text = showStateQuestion
        ? "3. Se Idade for maior ou igual a 60 anos e o Estado ainda NÃO foi coletado: Pergunta em qual estado o cliente reside (Amapá - AP, Paraíba - PB, Tocantins - TO ou Roraima - RR? Se for outro, pode apenas dizer qual)."
        : "3. (PULADO - Estado não necessário ou já coletado)";

    // Construir contexto de regras reais dos bancos cadastrados no sistema
    let bankRulesContext = '';
    cachedBankRules.forEach(b => {
        const minAge = b.minAge ?? b.min_age ?? 0;
        const maxAge = b.maxAge ?? b.max_age ?? 0;
        const minInstallment = b.minInstallmentValue ?? b.min_installment_value ?? 0;
        const acceptsIlliterate = b.acceptsIlliterate ?? b.accepts_illiterate ?? false;
        const accepts60Mais = b.accepts60Mais ?? b.accepts_60_mais ?? false;
        const refinRate = b.refinRate ?? b.refin_rate ?? 0;
        const portabilityRate = b.portabilityRate ?? b.portability_rate ?? 0;
        const nonAccepted = b.nonAcceptedBanks ?? b.non_accepted_banks ?? [];
        
        bankRulesContext += `\n- BANCO: ${b.name} (Convênio: ${b.convenio || 'INSS'}${b.subConvenio ? ' - ' + b.subConvenio : ''})
  * Idade Mínima: ${minAge} anos
  * Idade Máxima: ${maxAge} anos
  * Aceita Analfabeto: ${acceptsIlliterate ? 'SIM' : 'NÃO'}
  * Aceita 60+: ${accepts60Mais ? 'SIM' : 'NÃO'}
  * Parcela Mínima: R$ ${minInstallment.toFixed(2)}
  * Taxa Mínima Portabilidade: ${portabilityRate}%
  * Taxa Mínima Refin/Port: ${refinRate}%
  * Bancos Não Portados (origem): ${nonAccepted.join(', ') || 'Nenhum'}`;
        
        if (b.tables && b.tables.length > 0) {
            bankRulesContext += `\n  * Tabelas de Refin da Portabilidade Cadastradas:`;
            b.tables.forEach((t: any) => {
                const taxa = t.taxaTabela ?? t.taxa_tabela ?? t.coeficiente ?? 0;
                const minTicket = t.minTicket ?? t.min_ticket ?? 0;
                const idadeMin = t.idadeMinima || 0;
                const idadeMax = t.idadeMaxima || 0;
                bankRulesContext += `\n    - Tabela: "${t.nome}" | Taxa Base/Tabela: ${taxa}%${minTicket > 0 ? ` | Valor Mínimo da Operação: R$ ${minTicket.toFixed(2)}` : ''}${idadeMin > 0 ? ` | Idade Mínima: ${idadeMin} anos` : ''}${idadeMax > 0 ? ` | Idade Máxima: ${idadeMax} anos` : ''}`;
            });
        }
    });

    const sysInst = `Você é o Gutto, assistente especialista em portabilidade do portal.

REGRAS DE PORTABILIDADE E TABELAS DOS BANCOS CADASTRADOS NO SISTEMA:
Use APENAS as regras abaixo para responder perguntas individuais sobre roteiro, regras, idade mínima/máxima, tabelas ou resumos de cada banco (NUNCA use ou invente dados externos):
${bankRulesContext}

SOBRE REGRAS, ROTEIROS OU RESUMOS DE PORTABILIDADE:
- Se o usuário perguntar sobre roteiro, resumo ou regras de um banco, use os dados acima para responder com absoluta precisão científica e de forma super amigável!
- Se ele perguntar se um banco aceita analfabeto, qual a idade mínima, ou as taxas de uma tabela específica, responda citando diretamente os valores reais cadastrados listados acima.
- Se o usuário pedir para listar as tabelas de Refin de um banco, liste cada tabela informando a taxa e o valor mínimo da operação (se houver valor mínimo configurado na tabela; caso não haja valor mínimo listado acima para a tabela, NÃO exiba nem mencione o texto "valor mínimo" ou "operação mínima").
- Se o usuário pedir para você listar os bancos, ou perguntar de forma genérica sobre as regras de algum banco sem fornecer o nome de um banco cadastrado no sistema, instrua-o amigavelmente a perguntar especificando o banco no formato: "Regras do [Nome do Banco]" ou "Roteiro do [Nome do Banco]" (ex: "Regras do Bradesco").

REGRA CRÍTICA ABSOLUTA: Faça APENAS UMA pergunta por vez. Nunca pergunte dois ou mais dados na mesma mensagem.

DADOS JÁ COLETADOS ATÉ AGORA (Nunca pergunte estes novamente!):
${dataSummary || 'Nenhum dado coletado ainda.'}

VOCÊ DEVE IDENTIFICAR O PRÓXIMO DADO QUE FALTA E PERGUNTAR SEGUINDO A ORDEM EXATA ABAIXO:
1. Convênio (INSS, SIAPE, Governo, Forças Armadas ou CLT Privado)
   - IMPORTANTE: Se o convênio não constar na lista de dados coletados, você DEVE pedir o convênio e listar estas 5 opções exatas de convênio para o cliente escolher.
2. Idade
${step3Text}
4. Para o próximo dado:
   - Se o convênio for INSS, pergunte o Código do Benefício.
   - Se o convênio for SIAPE, pergunte exatamente: "Como o seu convênio é SIAPE, qual é a sua Situação Funcional?\nS1 - Ativo/Aposentado\nS2 - Pensionista"
   - Se o convênio for Governo ou Forças Armadas, pergunte o Sub-convênio/órgão.
   - Se convênio for CLT Privado, PULE esta pergunta.
5. Se o cliente é Analfabeto? (Sim/Não)
   - IMPORTANTE: Para esta pergunta, você DEVE usar EXATAMENTE esta frase com as palavras em negrito usando asteriscos: "Você se considera *analfabeto* ou possui alguma *dificuldade para ler e escrever*? (Responda com *Sim* ou *Não*)"
6. Se convênio for INSS: Possui 2 cartões de crédito consignado ativos?
7. Banco atual onde está o contrato que deseja portar.
8. Prazo total do contrato original (em meses, ex: 84 ou 96).
9. Prazo restante / Parcelas restantes que ainda faltam pagar (em meses).
   - ATENÇÃO: Pergunte o prazo restante imediatamente após coletar o prazo total. Ex: "E desse contrato de [prazoTotal] meses, quantas parcelas ainda faltam pagar?"
10. Valor da parcela mensal (R$).
11. Saldo devedor aproximado do contrato (R$).
12. Se o cliente souber/desejar informar: Taxa de juros atual do contrato (Relação opcional, ex: "taxa de 1,59%").

CONFIRME de forma extremamente amigável e breve o dado que o usuário acabou de fornecer e pergunte em seguida APENAS O PRÓXIMO dado que falta na lista.
IMPORTANTE: Você DEVE coletar o Saldo Devedor do cliente na pergunta 11. Nunca chame a ferramenta calculate_client_loan_offers sem antes perguntar e de fato obter o Saldo Devedor.
Quando tiver TODOS os dados obrigatórios listados e coletados de fato (incluindo o saldo devedor), chame calculate_client_loan_offers imediatamente para exibir os resultados das ofertas.`;

    try {
        const contents = [
            ...history.slice(-16).map(h => ({ role: h.role === 'user' ? 'user' as const : 'model' as const, parts: [{ text: h.content }] })),
            { role: "user" as const, parts: [{ text: message }] }
        ];

        const result = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents,
            config: { systemInstruction: sysInst, tools: [{ functionDeclarations: [calculateLoanOffersTool] }] }
        });

        // Detectar function call
        const candidates = (result as any).candidates || [];
        const parts = candidates[0]?.content?.parts || [];
        const fc = parts.find((p: any) => p.functionCall);

        if (fc?.functionCall?.name === "calculate_client_loan_offers") {
            console.log(`[Gutto] AI triggered calculate_client_loan_offers tool call!`);
            const params = fc.functionCall.args as unknown as SimulationParams;
            if (params.convenio === 'INSS' && (params as any).hasTwoCards)
                params.valorParcela = Math.max(0, (params.valorParcela || 0) - ((params as any).negativeCardValue || 81.05));
            sessionData.lastExtractedParams = { ...params }; // Salva no histórico da sessão
            sessionData.extractedParams = {}; // Limpa parâmetros pós-sucesso
            return await doCalculation(params, userProfile, undefined, sessionData);
        }

        const text = parts.find((p: any) => p.text)?.text || (result as any).text;
        return text || "Como posso ajudar na sua simulação hoje?";

    } catch (error: any) {
        console.error("Agent Error:", error);
        if (hasAllRequired(extracted)) {
            const res = await doCalculation(extracted as SimulationParams, userProfile, undefined, sessionData);
            sessionData.lastExtractedParams = { ...extracted }; // Salva no histórico da sessão
            sessionData.extractedParams = {}; // Limpa parâmetros pós-sucesso
            return res;
        }
        return `⚠️ Ops! Tivemos uma pequena falha de conexão: ${error.message || 'Erro interno'}. Por favor, digite o dado novamente.`;
    }
}
