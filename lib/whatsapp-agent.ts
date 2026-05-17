import { GoogleGenAI, Type } from "@google/genai";
import { getAdminDb } from "@/lib/firebase-admin";
import { calculateOffers, SimulationParams } from "@/lib/simulation-engine";

const getAI = () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    if (!apiKey || apiKey.includes("MY_GEMINI")) console.warn("Missing API Key");
    return new GoogleGenAI({ apiKey });
};

const calculateLoanOffersTool = {
    name: "calculate_client_loan_offers",
    description: "Calculates loan portability offers. Call IMMEDIATELY when you have: convenio, idade, bancoAtual, valorParcela, saldoDevedor, prazoTotal.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            idade: { type: Type.NUMBER, description: "Customer age" },
            convenio: { type: Type.STRING, description: "INSS, SIAPE, GOVERNO, FORCAS_ARMADAS, CLT PRIVADO" },
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
            negativeCardValue: { type: Type.NUMBER, description: "Card discount" }
        },
        required: ["idade", "convenio", "bancoAtual", "valorParcela", "saldoDevedor", "prazoTotal"]
    }
};

function calcRate(pv: number, pmt: number, n: number) {
    if (pmt <= 0 || pv <= 0 || n <= 0) return 0;
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

function getRuleSummary(bankName: string): string {
    const b = cachedBankRules.find(r => (r.name || '').toLowerCase().includes(bankName.toLowerCase()));
    if (!b) return `Banco "${bankName}" não encontrado. Disponíveis: ${cachedBankRules.map(r => r.name).join(', ')}`;
    let t = `📋 *Regras do ${b.name}*:\n• Idade: ${b.minAge || 18} a ${b.maxAge || 80}\n`;
    if (b.portabilityRate) t += `• Taxa Port: ${b.portabilityRate}%\n`;
    if (b.refinRate) t += `• Taxa Refin: ${b.refinRate}%\n`;
    if (b.minBalance) t += `• Saldo mín: R$ ${b.minBalance}\n`;
    if (b.minTroco) t += `• Troco mín: R$ ${b.minTroco}\n`;
    return t;
}

// Extrai dados coletados do histórico da conversa
function extractDataFromHistory(history: any[], currentMsg: string): Partial<SimulationParams> {
    const data: any = {};
    const allMessages = [...history, { role: 'user', content: currentMsg }];
    
    for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];
        if (msg.role !== 'user') continue;
        const txt = (msg.content || '').toLowerCase().replace(/[.,]/g, '');
        const prev = i > 0 ? (allMessages[i - 1].content || '').toLowerCase() : '';
        
        // Convênio
        if (prev.includes('convênio') || prev.includes('convenio') || i <= 2) {
            if (/\binss\b/.test(txt)) data.convenio = 'INSS';
            else if (/\bsiape\b/.test(txt)) data.convenio = 'SIAPE';
            else if (/\bgoverno\b/.test(txt)) data.convenio = 'GOVERNO';
            else if (/for[çc]as?\s*armadas?/.test(txt)) data.convenio = 'FORCAS_ARMADAS';
            else if (/\bclt\b/.test(txt)) data.convenio = 'CLT PRIVADO';
        }
        // Idade
        if (prev.includes('idade') || prev.includes('anos')) {
            const m = txt.match(/(\d{2})/);
            if (m && parseInt(m[1]) >= 18 && parseInt(m[1]) <= 100) data.idade = parseInt(m[1]);
        }
        // Banco atual
        if (prev.includes('banco') && (prev.includes('atual') || prev.includes('contrato'))) {
            data.bancoAtual = msg.content.trim();
        }
        // Prazo total
        if (prev.includes('prazo total') || prev.includes('prazo do contrato') || prev.includes('quantas parcelas')) {
            const m = txt.match(/(\d+)/);
            if (m) data.prazoTotal = parseInt(m[1]);
        }
        // Prazo restante
        if (prev.includes('restante') || prev.includes('faltam') || prev.includes('prazo restante')) {
            const m = txt.match(/(\d+)/);
            if (m) data.parcelasRestantes = parseInt(m[1]);
        }
        // Valor da parcela
        if (prev.includes('parcela') && (prev.includes('valor') || prev.includes('quanto') || prev.includes('mensal'))) {
            const m = txt.match(/([\d]+)/);
            if (m) data.valorParcela = parseFloat(m[1]);
        }
        // Saldo devedor
        if (prev.includes('saldo') || txt.includes('saldo')) {
            const m = txt.match(/([\d]+)/);
            if (m) data.saldoDevedor = parseFloat(m[1]);
        }
        // Analfabeto
        if (prev.includes('analfabeto')) {
            data.isAnalfabeto = /sim/.test(txt);
        }
    }
    return data;
}

function hasAllRequired(d: any): boolean {
    return !!(d.convenio && d.idade && d.bancoAtual && d.valorParcela && d.saldoDevedor && d.prazoTotal);
}

function fmt(v: number) { return v?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'; }

function formatResult(top: any, banks: string[], grouped: any[], p: SimulationParams): string {
    if (!top) return "❌ Não encontramos ofertas viáveis para o seu perfil.";
    const tables = grouped.find(g => g.bankName === top.name)?.offers?.length || 1;
    let m = `✅ *Simulação concluída!*\n\nMelhor oferta no *${top.name}*:\n⭐ *${tables} tabela(s)*\n\n`;
    if (top.tabela) m += `📊 *Tabela:* ${top.tabela}\n`;
    m += `💰 *Troco Estimado:* R$ ${fmt(top.valorTroco)}\n`;
    m += `📄 *Novo Contrato:* R$ ${fmt(top.valorContrato)}\n`;
    m += `💲 *Parcela:* R$ ${fmt(p.valorParcela || 0)}\n`;
    m += `⏳ *Prazo:* ${top.prazoRefinPort || 96} meses\n`;
    if (top.novaTaxaPortabilidade) m += `📈 *Taxa:* ${top.novaTaxaPortabilidade}%\n`;
    const others = banks.filter(b => b !== top.name);
    if (others.length > 0) m += `\n🏦 *Outros Bancos:* ${others.join(', ')}\n`;
    m += `\n_Digite o *nome de outro banco* para ver a oferta dele._`;
    return m;
}

async function doCalculation(params: SimulationParams, userProfile: any): Promise<string> {
    if (!params.taxaJurosMensal) {
        const n = params.parcelasRestantes || ((params.prazoTotal || 0) - (params.parcelasPagas || 0));
        if ((params.valorParcela || 0) > 0 && (params.saldoDevedor || 0) > 0 && n > 0) {
            params.taxaJurosMensal = calcRate(params.saldoDevedor!, params.valorParcela!, n);
        }
    }
    const db = getAdminDb();
    if (!db) return "⚠️ Erro de conexão.";
    const [bSnap, rSnap, sSnap] = await Promise.all([
        db.collection('bankRules').get(), db.collection('generalRules').get(), db.collection('settings').doc('admin').get()
    ]);
    const banks = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rules = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sd = sSnap.exists ? sSnap.data() : {};
    const pp = sd?.bankPriorities || {};
    const pi = sd?.bankInstallments || {};
    const offers = calculateOffers(params, banks, rules, pp, pi, userProfile);
    console.log(`[Gutto] Offers: ${offers.length}`);
    const groups = offers.reduce((a, o) => { if (!a[o.name]) a[o.name] = { bankName: o.name, offers: [] }; a[o.name].offers.push(o); return a; }, {} as Record<string, any>);
    const sorted = Object.values(groups).map((g: any) => { const s = g.offers.sort((a: any, b: any) => a.valorTroco - b.valorTroco); return { ...g, offers: s, topOffer: s[0] }; })
        .sort((a: any, b: any) => { const pA = pp[a.topOffer.id?.split('-')[0]] ?? 999; const pB = pp[b.topOffer.id?.split('-')[0]] ?? 999; return (pA || 999) !== (pB || 999) ? (pA || 999) - (pB || 999) : a.topOffer.valorTroco - b.topOffer.valorTroco; });
    const top = sorted.length > 0 ? sorted[0].topOffer : null;
    const bankNames = sorted.map((g: any) => g.bankName);
    try {
        await db.collection('simulations').doc(crypto.randomUUID()).set({
            userId: userProfile.uid || 'bot', userName: userProfile.name || 'WhatsApp',
            userAvatar: userProfile.logoUrl || userProfile.avatarUrl || '',
            convenio: params.convenio, bancoAtual: params.bancoAtual, valorParcela: params.valorParcela,
            saldoDevedor: params.saldoDevedor, selectedOffer: top, topOffer: top?.name || '',
            topOfferContrato: top?.valorContrato || 0, topOfferTroco: top?.valorTroco || 0,
            topOfferTaxa: top?.novaTaxaPortabilidade || 0, topOfferTabela: top?.tabela || '',
            createdAt: new Date(), timestamp: Date.now(), origin: 'whatsapp'
        });
    } catch (e) { console.error(e); }
    return formatResult(top, bankNames, sorted, params);
}

export async function processWhatsAppMessage(message: string, history: any[] = [], currentPhone: string = '') {
    const ai = getAI();
    await loadRules();

    if (history.length === 0) {
        return `Olá! Eu sou o *Gutto*, especialista em portabilidade.\n\nDigite *"Simular"* para iniciar ou pergunte as *regras de um banco* (ex: "Regras do Bradesco").`;
    }

    const lower = message.toLowerCase().trim();

    // Consulta de regras por banco
    const rulesMatch = lower.match(/regras?\s+(?:do\s+)?(.+)/i);
    if (rulesMatch) return getRuleSummary(rulesMatch[1].trim());
    if (/\b(bancos|lista)\b/.test(lower) && !history.some(h => h.content?.includes('Troco Estimado')))
        return `🏦 *Bancos:* ${cachedBankRules.map(b => b.name).join(', ')}\n\nDigite: *Regras do [banco]*`;

    // Validar telefone
    let userProfile = { role: 'admin' } as any;
    if (currentPhone) {
        const clean = currentPhone.replace(/\D/g, '');
        const db = getAdminDb();
        if (db) {
            const snap = await db.collection('users').get();
            let found = null;
            snap.forEach(doc => { const d = doc.data(); if (d.phone) { const cp = d.phone.replace(/\D/g, ''); if (cp.length >= 8 && clean.endsWith(cp)) found = { uid: doc.id, ...d }; } });
            if (!found) return "Desculpe, seu número não está cadastrado.";
            userProfile = found;
        }
    }

    // FALLBACK: Extrair dados do histórico e calcular diretamente se tiver tudo
    const extracted = extractDataFromHistory(history, message);
    console.log(`[Gutto] Extracted:`, JSON.stringify(extracted));

    if (hasAllRequired(extracted)) {
        console.log(`[Gutto] All data present! Forcing calculation.`);
        return await doCalculation(extracted as SimulationParams, userProfile);
    }

    // Construir summary dos dados já coletados para ajudar a IA
    let dataSummary = '';
    if (extracted.convenio) dataSummary += `Convênio: ${extracted.convenio}\n`;
    if (extracted.idade) dataSummary += `Idade: ${extracted.idade}\n`;
    if (extracted.bancoAtual) dataSummary += `Banco: ${extracted.bancoAtual}\n`;
    if (extracted.prazoTotal) dataSummary += `Prazo: ${extracted.prazoTotal}\n`;
    if (extracted.parcelasRestantes) dataSummary += `Restante: ${extracted.parcelasRestantes}\n`;
    if (extracted.valorParcela) dataSummary += `Parcela: ${extracted.valorParcela}\n`;
    if (extracted.saldoDevedor) dataSummary += `Saldo: ${extracted.saldoDevedor}\n`;

    const sysInst = `Você é o Gutto, assistente de portabilidade.

REGRA: Faça APENAS UMA pergunta por vez.

DADOS COLETADOS:
${dataSummary || 'Nenhum ainda.'}

ORDEM DE COLETA (pergunte o PRÓXIMO dado que ainda falta):
1. Convênio (INSS, SIAPE, Governo, Forças Armadas ou CLT Privado)
2. Idade
3. Se 60+: reside em AP/PB/TO/RR?
4. Sub-convênio
5. Analfabeto?
6. Se INSS: 2 cartões ativos?
7. Banco atual
8. Prazo total (meses)
9. Prazo restante (parcelas que faltam)
10. Valor da parcela
11. Saldo devedor

Quando tiver TODOS os dados obrigatórios, chame calculate_client_loan_offers.`;

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
            console.log(`[Gutto] Function call detected!`);
            const params = fc.functionCall.args as unknown as SimulationParams;
            if (params.convenio === 'INSS' && (params as any).hasTwoCards)
                params.valorParcela = Math.max(0, (params.valorParcela || 0) - ((params as any).negativeCardValue || 81.05));
            return await doCalculation(params, userProfile);
        }

        const text = parts.find((p: any) => p.text)?.text || (result as any).text;
        return text || "Qual informação deseja fornecer?";

    } catch (error: any) {
        console.error("Agent Error:", error);
        // Se deu erro mas temos dados suficientes, tenta calcular mesmo assim
        if (hasAllRequired(extracted)) {
            return await doCalculation(extracted as SimulationParams, userProfile);
        }
        return `⚠️ Erro: ${error.message || 'desconhecido'}`;
    }
}
