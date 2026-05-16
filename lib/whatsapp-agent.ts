import { GoogleGenAI, Type } from "@google/genai";
import { getAdminDb } from "@/lib/firebase-admin";
import { calculateOffers, SimulationParams } from "@/lib/simulation-engine";

const getAI = () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    if (!apiKey || apiKey.includes("MY_GEMINI")) {
        console.warn("Invalid or missing API Key for Gemini");
    }
    return new GoogleGenAI({ apiKey });
};

const calculateLoanOffersTool = {
    name: "calculate_client_loan_offers",
    description: "Calculates loan portability offers. Call this ONLY after collecting ALL required data: convenio, idade, bancoAtual, valorParcela, saldoDevedor, prazoTotal.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            idade: { type: Type.NUMBER, description: "Customer age" },
            convenio: { type: Type.STRING, description: "Agreement type (INSS, SIAPE, GOVERNO, FORCAS_ARMADAS)" },
            subConvenio: { type: Type.STRING, description: "Sub-agreement (Marinha, Exercito, etc.)" },
            bancoAtual: { type: Type.STRING, description: "Current bank name" },
            valorParcela: { type: Type.NUMBER, description: "Current monthly installment value" },
            saldoDevedor: { type: Type.NUMBER, description: "Outstanding balance" },
            prazoTotal: { type: Type.NUMBER, description: "Total term in months (e.g. 84, 96)" },
            parcelasPagas: { type: Type.NUMBER, description: "Installments already paid" },
            parcelasRestantes: { type: Type.NUMBER, description: "Remaining installments" },
            isAnalfabeto: { type: Type.BOOLEAN, description: "If customer is illiterate" },
            isCliente60Mais: { type: Type.BOOLEAN, description: "If customer is 60+ in AP/PB/TO/RR" },
            hasTwoCards: { type: Type.BOOLEAN, description: "If client has 2 active cards (INSS only)" },
            negativeCardValue: { type: Type.NUMBER, description: "Card discount value" }
        },
        required: ["idade", "convenio", "bancoAtual", "valorParcela", "saldoDevedor", "prazoTotal"]
    }
};

function calculateInterestRateAgent(pv: number, pmt: number, n: number) {
    if (pmt <= 0 || pv <= 0 || n <= 0) return 0;
    let low = 0.0001, high = 1, rate = 0.05, diff = 1, iterations = 0;
    while (diff > 0.0001 && high - low > 0.00001 && iterations < 100) {
        const calc = (pmt / rate) * (1 - Math.pow(1 + rate, -n));
        diff = Math.abs(calc - pv);
        if (calc > pv) { low = rate; rate = (rate + high) / 2; }
        else { high = rate; rate = (rate + low) / 2; }
        iterations++;
    }
    return rate;
}

let cachedBankRules: any[] = [];
let lastCacheTime = 0;

async function loadBankRules() {
    const now = Date.now();
    if (now - lastCacheTime > 5 * 60 * 1000) {
        try {
            const adminDb = getAdminDb();
            if (adminDb) {
                const snap = await adminDb.collection('bankRules').get();
                cachedBankRules = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((b: any) => b.isActive !== false);
                lastCacheTime = now;
            }
        } catch (e) { console.error("Cache load error:", e); }
    }
    return cachedBankRules;
}

function formatBankRuleSummary(bankName: string): string {
    const bank = cachedBankRules.find(b => 
        (b.name || '').toLowerCase().includes(bankName.toLowerCase()) ||
        bankName.toLowerCase().includes((b.name || '').toLowerCase())
    );
    if (!bank) return `Não encontrei regras para o banco "${bankName}". Bancos disponíveis: ${cachedBankRules.map(b => b.name).join(', ')}.`;
    
    let txt = `📋 *Regras do ${bank.name}*:\n`;
    txt += `• Idade: ${bank.minAge || 18} a ${bank.maxAge || 80} anos\n`;
    if (bank.portabilityRate) txt += `• Taxa Portabilidade: ${bank.portabilityRate}%\n`;
    if (bank.refinRate) txt += `• Taxa Refin: ${bank.refinRate}%\n`;
    if (bank.minBalance) txt += `• Saldo mínimo: R$ ${bank.minBalance}\n`;
    if (bank.minTroco) txt += `• Troco mínimo: R$ ${bank.minTroco}\n`;
    if (bank.minInstallmentValue) txt += `• Parcela mínima: R$ ${bank.minInstallmentValue}\n`;
    if (bank.nonAcceptedBanks?.length > 0) txt += `• Bancos que NÃO aceita: ${bank.nonAcceptedBanks.join(', ')}\n`;
    return txt;
}

function formatAllBankNames(): string {
    return cachedBankRules.map(b => b.name).join(', ');
}

// Formata o resultado da simulação diretamente, sem depender da IA
function formatSimulationResult(topOffer: any, otherBanks: string[], groupedBanks: any[], params: SimulationParams): string {
    if (!topOffer) {
        return "❌ Não encontramos ofertas viáveis para o seu perfil no momento. Verifique os dados e tente novamente.";
    }

    const fmt = (v: number) => v?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00';
    
    let msg = `✅ *Simulação concluída!*\n\n`;
    msg += `Encontramos a melhor oferta para você no *${topOffer.name}*:\n\n`;
    
    const totalTables = groupedBanks.find(g => g.bankName === topOffer.name)?.offers?.length || 1;
    msg += `⭐ *${totalTables} tabela(s) disponível(is)*\n\n`;
    
    if (topOffer.tabela) msg += `📊 *Tabela:* ${topOffer.tabela}\n`;
    msg += `💰 *Troco Estimado:* R$ ${fmt(topOffer.valorTroco)}\n`;
    msg += `📄 *Novo Contrato:* R$ ${fmt(topOffer.valorContrato)}\n`;
    msg += `💲 *Valor da Parcela:* R$ ${fmt(params.valorParcela || 0)}\n`;
    msg += `⏳ *Prazo:* ${topOffer.prazoRefinPort || topOffer.prazoTotal || 96} meses\n`;
    if (topOffer.novaTaxaPortabilidade) msg += `📈 *Taxa:* ${topOffer.novaTaxaPortabilidade}%\n`;
    
    const otherBankNames = otherBanks.filter(b => b !== topOffer.name);
    if (otherBankNames.length > 0) {
        msg += `\n🏦 *Outros Bancos Disponíveis:* ${otherBankNames.join(', ')}\n`;
    }
    
    msg += `\n_Digite o *nome de outro banco* para ver a oferta dele._`;
    
    return msg;
}

export async function processWhatsAppMessage(message: string, history: any[] = [], currentPhone: string = '') {
    const ai = getAI();
    if (!ai || (ai as any).error) {
        return `Erro de configuração do assistente. Por favor, tente mais tarde.`;
    }

    // Carregar regras dos bancos
    await loadBankRules();

    // Primeira mensagem - boas-vindas
    if (history.length === 0) {
        return `Olá! Eu sou o *Gutto*, seu especialista em portabilidade de crédito consignado.\n\nDigite *"Simular"* para iniciar uma simulação ou pergunte sobre as *regras de um banco específico* (ex: "Regras do Banco do Brasil").`;
    }

    const lowerMsg = message.toLowerCase().trim();

    // Consulta de regras - AGORA POR BANCO ESPECÍFICO
    const rulesMatch = lowerMsg.match(/regras?\s+(?:do\s+)?(.+)/i);
    if (rulesMatch) {
        const bankName = rulesMatch[1].trim();
        return formatBankRuleSummary(bankName);
    }
    
    // Pedir lista de bancos
    if (/\b(bancos|lista|quais bancos)\b/.test(lowerMsg) && !history.some(h => h.content?.includes('Troco Estimado'))) {
        return `🏦 *Bancos disponíveis:*\n${formatAllBankNames()}\n\nPara ver as regras de um banco, digite: *Regras do [nome do banco]*`;
    }

    // Validar telefone
    let userProfileForSimulation = { role: 'admin' } as any;
    if (currentPhone) {
        const cleanPhone = currentPhone.replace(/\D/g, '');
        const adminDb = getAdminDb();
        if (adminDb) {
            const usersRef = await adminDb.collection('users').get();
            let foundUser = null;
            usersRef.forEach(doc => {
                const userData = doc.data();
                if (userData.phone) {
                    const cleanDbPhone = userData.phone.replace(/\D/g, '');
                    if (cleanDbPhone.length >= 8 && cleanPhone.endsWith(cleanDbPhone)) {
                        foundUser = { uid: doc.id, ...userData };
                    }
                }
            });
            if (!foundUser) return "Desculpe, seu número não está cadastrado no sistema.";
            userProfileForSimulation = foundUser;
        }
    }

    // Construir o prompt do sistema - ULTRA CONCISO
    const systemInstruction = `Você é o Gutto, assistente de portabilidade.

REGRA ABSOLUTA: Faça APENAS UMA pergunta por vez. Nunca pergunte duas coisas na mesma mensagem.

DADOS A COLETAR (nesta ordem, um por vez):
1. Convênio
2. Idade
3. Se idade >= 60: reside em AP/PB/TO/RR?
4. Sub-convênio (se aplicável)
5. Analfabeto? (sim/não)
6. Se INSS: possui 2 cartões ativos? Valor desconto?
7. Banco atual do contrato
8. Prazo total (meses)
9. Valor da parcela mensal
10. Saldo devedor

IMPORTANTE:
- Verifique o histórico antes de perguntar. Se o dado já existe, pule para o próximo.
- Quando tiver TODOS os dados obrigatórios (convenio, idade, bancoAtual, valorParcela, saldoDevedor, prazoTotal), chame a ferramenta calculate_client_loan_offers IMEDIATAMENTE.
- Confirme cada dado recebido de forma breve antes de pedir o próximo.
- Se o usuário informar o nome de um banco após uma simulação, chame a ferramenta novamente trocando apenas bancoAtual.`;

    try {
        // Limitar histórico para as últimas 16 mensagens
        const recentHistory = history.slice(-16);
        
        const contents = [
            ...recentHistory.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.content }]
            })),
            { role: "user", parts: [{ text: message }] }
        ];

        console.log(`[Gutto] Calling Gemini with ${contents.length} messages`);

        const result = await ai.models.generateContent({
            model: "gemini-2.0-flash-001",
            contents,
            config: {
                systemInstruction,
                tools: [{ functionDeclarations: [calculateLoanOffersTool] }]
            }
        });

        // Detectar function call
        const candidates = (result as any).candidates || [];
        const firstCandidate = candidates[0];
        const parts = firstCandidate?.content?.parts || [];
        const fcPart = parts.find((p: any) => p.functionCall);

        console.log(`[Gutto] Function call detected: ${!!fcPart}`);

        if (fcPart && fcPart.functionCall?.name === "calculate_client_loan_offers") {
            console.log(`[Gutto] Executing calculation with args:`, JSON.stringify(fcPart.functionCall.args).substring(0, 200));
            
            const params = fcPart.functionCall.args as unknown as SimulationParams;

            // Regra dos 2 cartões
            if (params.convenio === 'INSS' && (params as any).hasTwoCards) {
                params.valorParcela = Math.max(0, (params.valorParcela || 0) - ((params as any).negativeCardValue || 81.05));
            }

            // Calcular taxa se necessário
            if (!params.taxaJurosMensal) {
                const pmt = params.valorParcela || 0;
                const pv = params.saldoDevedor || 0;
                const total = params.prazoTotal || 0;
                const pagas = params.parcelasPagas || 0;
                const n = params.parcelasRestantes || (total > 0 ? total - pagas : 0);
                if (pmt > 0 && pv > 0 && n > 0) {
                    params.taxaJurosMensal = calculateInterestRateAgent(pv, pmt, n);
                }
            }

            const adminDb = getAdminDb();
            if (!adminDb) return "⚠️ Erro de conexão com o banco de dados.";

            const [banksSnap, rulesSnap, settingsSnap] = await Promise.all([
                adminDb.collection('bankRules').get(),
                adminDb.collection('generalRules').get(),
                adminDb.collection('settings').doc('admin').get()
            ]);

            const banks = banksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const rules = rulesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const settingsData = settingsSnap.exists ? settingsSnap.data() : {};
            const promotoraPriorities = settingsData?.bankPriorities || {};
            const promotoraInstallments = settingsData?.bankInstallments || {};

            const allOffers = calculateOffers(params, banks, rules, promotoraPriorities, promotoraInstallments, userProfileForSimulation);

            console.log(`[Gutto] Offers calculated: ${allOffers.length} total`);

            // Agrupar e ordenar
            const bankGroups = allOffers.reduce((acc, offer) => {
                if (!acc[offer.name]) acc[offer.name] = { bankName: offer.name, offers: [] };
                acc[offer.name].offers.push(offer);
                return acc;
            }, {} as Record<string, { bankName: string, offers: any[] }>);

            const groupedBanks = Object.values(bankGroups).map(group => {
                const sorted = group.offers.sort((a, b) => a.valorTroco - b.valorTroco);
                return { ...group, offers: sorted, topOffer: sorted[0] };
            }).sort((a, b) => {
                const pA = promotoraPriorities[a.topOffer.id?.split('-')[0]] ?? a.topOffer.priority ?? 999;
                const pB = promotoraPriorities[b.topOffer.id?.split('-')[0]] ?? b.topOffer.priority ?? 999;
                if ((pA || 999) !== (pB || 999)) return (pA || 999) - (pB || 999);
                return a.topOffer.valorTroco - b.topOffer.valorTroco;
            });

            const topOffer = groupedBanks.length > 0 ? groupedBanks[0].topOffer : null;
            const otherBanks = groupedBanks.map(g => g.bankName);

            // Salvar simulação
            try {
                const simId = crypto.randomUUID();
                await adminDb.collection('simulations').doc(simId).set({
                    userId: userProfileForSimulation.uid || 'bot',
                    userName: userProfileForSimulation.name || 'WhatsApp',
                    userAvatar: userProfileForSimulation.logoUrl || userProfileForSimulation.avatarUrl || '',
                    convenio: params.convenio,
                    bancoAtual: params.bancoAtual,
                    valorParcela: params.valorParcela,
                    saldoDevedor: params.saldoDevedor,
                    selectedOffer: topOffer,
                    topOffer: topOffer?.name || '',
                    topOfferContrato: topOffer?.valorContrato || 0,
                    topOfferTroco: topOffer?.valorTroco || 0,
                    topOfferTaxa: topOffer?.novaTaxaPortabilidade || 0,
                    topOfferTabela: topOffer?.tabela || '',
                    createdAt: new Date(),
                    timestamp: Date.now(),
                    origin: 'whatsapp'
                });
            } catch (e) { console.error("Sim save error:", e); }

            // RETORNA RESULTADO FORMATADO DIRETAMENTE - sem segunda chamada à IA
            return formatSimulationResult(topOffer, otherBanks, groupedBanks, params);
        }

        // Se não houve function call, retorna o texto da IA
        const textPart = parts.find((p: any) => p.text);
        const aiText = textPart?.text || (result as any).text;
        
        if (aiText) return aiText;
        
        return "Como posso ajudar na sua simulação?";

    } catch (error: any) {
        console.error("Agent Error:", error);
        return `⚠️ Erro técnico: ${error.message || 'desconhecido'}. Tente novamente em instantes.`;
    }
}
