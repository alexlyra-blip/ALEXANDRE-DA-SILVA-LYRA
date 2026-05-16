import { GoogleGenAI, Type } from "@google/genai";
import { getAdminDb } from "@/lib/firebase-admin";
import { calculateOffers, SimulationParams } from "@/lib/simulation-engine";
// Initialization logic
const getAI = () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    
    if (!apiKey || apiKey.includes("MY_GEMINI")) {
        console.warn("Invalid or missing API Key for Gemini");
    }
    
    return new GoogleGenAI({ apiKey });
};

// Tool definition for Gemini
const calculateLoanOffersTool = {
    name: "calculate_client_loan_offers",
    description: "Calculates the best loan portability offers based on customer data. Call this when you have collected professional details: convenio, idade, bancoAtual, valorParcela, saldoDevedor, prazoTotal, parcelasPagas, etc.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            idade: { type: Type.NUMBER, description: "Customer age" },
            convenio: { type: Type.STRING, description: "Agreement type (e.g., INSS, SIAPE, GOVERNO)" },
            subConvenio: { type: Type.STRING, description: "Sub-agreement (e.g., Marinha, Exercito)" },
            codigoBeneficio: { type: Type.STRING, description: "Benefit code" },
            dataConcessao: { type: Type.STRING, description: "Benefit concession date/year (e.g., '1995', '20-10-2020')" },
            bancoAtual: { type: Type.STRING, description: "Current bank name or code" },
            valorParcela: { type: Type.NUMBER, description: "Current monthly installment value" },
            saldoDevedor: { type: Type.NUMBER, description: "Current balance to be paid" },
            prazoTotal: { type: Type.NUMBER, description: "Total terms (e.g., 84, 96)" },
            parcelasPagas: { type: Type.NUMBER, description: "Installments already paid" },
            parcelasRestantes: { type: Type.NUMBER, description: "Remaining installments" },
            isAnalfabeto: { type: Type.BOOLEAN, description: "If the customer is illiterate" },
            isCliente60Mais: { type: Type.BOOLEAN, description: "If the customer is 60+ AND resides in AP, PB, TO or RR" }
        },
        required: ["idade", "convenio", "bancoAtual", "valorParcela", "saldoDevedor", "prazoTotal"]
    }
};

function calculateInterestRateAgent(pv: number, pmt: number, n: number) {
    if (pmt <= 0 || pv <= 0 || n <= 0) return 0;
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

export async function processWhatsAppMessage(message: string, history: any[] = [], currentPhone: string = '') {
    const ai = getAI();
        if (!ai || (ai as any).error) {
            return `DEBUG_NULL_AI: ${(ai as any)?.error || "unknown"}`;
        }

    let userProfileForSimulation = { role: 'admin' } as any;

    // Validate phone and get profile
    if (currentPhone) {
        const cleanPhone = currentPhone.replace(/\D/g, ''); // Extract only digits
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

            if (!foundUser) {
                return "Desculpe, seu número de telefone não está cadastrado no sistema. Por favor, entre em contato com o administrador para solicitar o acesso.";
            }

            userProfileForSimulation = foundUser;
        }
    }

    const systemInstruction = `Você é o "Gutto", o Agente de IA especialista em Portabilidade de Crédito Consignado da Portabilidade PRO.
Seja sempre ágil, direto e com respostas curtas.

O QUE COLETAR DO PARCEIRO (DIRETO E OBJETIVO):
Vá pedindo OS DADOS SEGUINDO A ORDEM sem enrolação. Nunca repita perguntas se o usuário já forneceu os dados.

IMPORTANTE: Faça apenas UMA pergunta por vez e espere o usuário responder antes de fazer a próxima. Não junte duas perguntas (ex: analfabeto e 60+) na mesma mensagem.

Fluxo Exato (Siga esta ordem rigorosamente e faça as perguntas UMA POR UMA):
1. COMEÇO (CONVÊNIO E IDADE):
Bot: "Olá! 🧑🏻‍🦲 Sou o assistente de *Portabilidade PRO*. Vou pedir alguns dados para fazermos a sua simulação, ok? Qual é o seu *Convênio* e a *Idade* do cliente? (Ex: INSS, SIAPE, Governo, Forças Armadas ou CLT Privado)."
(Obs: O usuário pode responder "Forças", "CLT" ou "Privado" de forma abreviada, entenda isso normalmente).

2. SUB-CONVÊNIO / ESPÉCIE / DATA DE CONCESSÃO:
De acordo com o convênio informado, você fará uma validação específica:
- SE CONVÊNIO FOR "SIAPE": NÃO peça a Espécie do Benefício. Pule direto para a pergunta de Analfabetismo (Passo 3).
- SE CONVÊNIO FOR "FORÇAS ARMADAS": Pergunte: "Qual é a sua Força Militar? 01- Exército, 02- Aeronáutica ou 03- Marinha." (O que o usuário responder será o "subConvenio" na simulação).
- SE CONVÊNIO FOR "GOVERNO": Pergunte o Estado: "Qual é a sigla do seu Estado?" (O que o usuário responder será o "subConvenio" na simulação).
- PARA OS DEMAIS CONVÊNIOS (E APÓS AS PERGUNTAS ACIMA): Bot: "Qual é a *Espécie do Benefício* do Cliente? (Pode digitar apenas o código)."
- VALIDAÇÃO EXTRA OBRIGATÓRIA: Se a espécie informada for de invalidez (ex: 32) e a idade for inferior a 60 anos, pergunte EXCLUSIVAMENTE a data de concessão do benefício. Esta validação de tempo em anos e meses é necessária para as regras de aceitação de diversos bancos do motor de simulação.

3. ANALFABETISMO:
Após realizar as validações do passo 2 (se aplicáveis e o usuário responder), peça para o cliente confirmar o analfabetismo (Sozinho, numa mensagem única):
Bot: "O Cliente é *Analfabeto*? Responda SIM ou NÃO."

4. VALIDAÇÃO LOCALIDADE 60+:
Se a idade informada do cliente for igual ou maior a 60 anos, ESPERE ele responder sobre o analfabetismo, e então pergunte OBRIGATORIAMENTE (Sozinho, numa mensagem única):
Bot: "Aproveitando, como o cliente tem 60 anos ou mais, ele reside nos estados de *AP, PB, TO ou RR*? (Responda SIM ou NÃO)."
(Se a idade for inferior a 60 anos, pule diretamente para o passo 5).

5. BANCO ATUAL:
Em seguida, pergunte:
Bot: "Legal! E qual é o seu *Banco Atual*? (Ex: Itaú, Bradesco, PAN, etc). Você pode informar o nome do banco ou o código do banco."

6. PRAZOS E PARCELAS:
Continue recolhendo as informações:
Bot: "Certo. Qual é o *prazo total* original do seu empréstimo em meses e quantas *parcelas já foram pagas* (ou restantes)? (Ex: Prazo 84, Pagas 15)."

7. VALORES (FIM):
Para finalizar a coleta de dados:
Bot: "E por fim, qual o valor da *parcela* e o *saldo devedor* atual?"

Atenção: Logo que obtiver o Valor da Parcela, Saldo Devedor, e Prazo Total, você JÁ PODE INVOCAR A FERRAMENTA 'calculate_client_loan_offers' e gerar a simulação se já obteve o resto.

APÓS A SIMULAÇÃO (FORMATAÇÃO OBRIGATÓRIA EXATA E FIDELIDADE AOS DADOS):
ATENÇÃO: Você PROIBIDO de inventar ou criar tabelas. Você deve usar ESTRITAMENTE as tabelas e os bancos devolvidos no JSON da ferramenta 'calculate_client_loan_offers'. Use os dados do objeto 'bestTroco' para preencher a primeira oferta, sem nenhuma invenção.

Ao ter o resultado da função 'calculate_client_loan_offers', o JSON de resposta conterá o objeto 'bestTroco'. Use os campos 'name', 'tabela', 'valorTroco', 'valorContrato', 'valorParcela' (que é o mesmo da simulação), 'prazoRefinPort', 'taxaBase' e 'tabelasCount' para preencher o layout.

Exiba as informações da melhor oferta usando EXATAMENTE ESTE LAYOUT VISUAL:

Encontramos uma oferta ideal para você no *[NOME DO BANCO]*:
⭐ *[tabelasCount] tabelas disponíveis*

📊 *Tabela:* [tabela]
💰 *Troco Estimado:* R$ [valorTroco]
📄 *Novo Contrato:* R$ [valorContrato]
💲 *Valor da Parcela:* R$ [valor da parcela da simulação]
⏳ *Prazo do Refin/Port:* [prazoRefinPort] meses
📈 *Taxa do Refinanciamento:* [taxaBase]%

REGRAS DE BANCO ATUAL (Mapeamento de Códigos):
Se o usuário disser o nome do banco, use o código se souber:
Bradesco: 237, Itaú: 341, Santander: 033, Banco do Brasil: 001, Caixa: 104, PAN: 623, BMG: 311, Safra: 422, C6: 626, Daycoval: 707, Banrisul: 041.

Também liberamos ofertas para outros bancos (somente se houver 'allBanksWithOffers'):
- [NOME BANCO 2]
- [NOME BANCO 3]
- [NOME BANCO 4]

Opções no final da mensagem (obrigatório):
Para ver as outras tabelas disponíveis deste banco, digite *Tabelas*.
Caso queira ver a oferta detalhada de outro banco, basta digitar o *Nome do Banco* agora!

(Se ele pedir detalhes de outro banco listado, use o mesmo formato mudando o cabeçalho para '🎉 Oferta no *[Nome do Banco]*:' e no final diga 'Se quiser ver de outro banco, basta digitar o nome. Ou digite "Oi" para uma nova simulação.')

ENCERRAMENTO:
Se o usuário encerrar ou não quiser mais simulações, se despeça e OBRIGATORIAMENTE anexe a tag \`[END_SESSION]\` à sua mensagem.`;

    try {
        const contents = [
            ...history.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.content }]
            })),
            { role: "user", parts: [{ text: message }] }
        ];

        let result = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents,
            config: {
                systemInstruction,
                tools: [{ functionDeclarations: [calculateLoanOffersTool] }]
            }
        });
        
        const functionCalls = result.functionCalls;
        
        if (functionCalls && functionCalls[0].name === "calculate_client_loan_offers") {
            const call = functionCalls[0];
            const params = call.args as unknown as SimulationParams;
            
            // Calculate taxaJurosMensal if missing so that C6 Bank and other bank rules apply correctly
            if (!params.taxaJurosMensal) {
                const pmt = params.valorParcela || 0;
                const pv = params.saldoDevedor || 0;
                const pagas = params.parcelasPagas || 0;
                const total = params.prazoTotal || 0;
                const n = params.parcelasRestantes || (total > 0 ? total - pagas : 0);
                if (pmt > 0 && pv > 0 && n > 0) {
                    params.taxaJurosMensal = calculateInterestRateAgent(pv, pmt, n);
                }
            }

            const adminDb = getAdminDb();
            if (!adminDb) return "⚠️ Erro técnico: Falha ao conectar ao banco de dados Firestore.";

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

            // Preparar metadados para a IA gerar a resposta técnica
            const sanitizeOffer = (o: any) => o ? { ...o, logo: undefined } : null;
            
            const bestTrocoOfferOriginal = allOffers.length > 0 ? allOffers[0] : null;
            
            const bestTrocoOffer = sanitizeOffer(bestTrocoOfferOriginal);
            const sanitizedSampleOffers = allOffers.slice(0, 5).map(sanitizeOffer);
            const uniqueBanks = Array.from(new Set(allOffers.map(o => o.name)));
            
            const simId = crypto.randomUUID();
            try {
                const simulationData = {
                    userId: userProfileForSimulation.uid || 'whatsapp-bot',
                    userName: userProfileForSimulation.name || 'WhatsApp Bot',
                    userEmail: userProfileForSimulation.email || '',
                    promotoraId: userProfileForSimulation.promotoraId || '',
                    clientName: 'Cliente via WhatsApp',
                    convenio: params.convenio || 'INSS',
                    bancoAtual: params.bancoAtual || '',
                    valorParcela: params.valorParcela || 0,
                    saldoDevedor: params.saldoDevedor || 0,
                    selectedOffer: bestTrocoOfferOriginal,
                    allOffers: allOffers.slice(0, 5),
                    topOffer: bestTrocoOfferOriginal?.name || '',
                    topOfferContrato: bestTrocoOfferOriginal?.valorContrato || 0,
                    topOfferTroco: bestTrocoOfferOriginal?.valorTroco || 0,
                    topOfferTaxa: bestTrocoOfferOriginal?.novaTaxaPortabilidade || 0,
                    topOfferTabela: bestTrocoOfferOriginal?.tabela || '',
                    createdAt: new Date(),
                    timestamp: Date.now(),
                    origin: 'whatsapp'
                };
                
                await adminDb.collection('simulations').doc(simId).set(simulationData);
                
                await adminDb.collection('whatsappSimulations').doc(simId).set({
                    params,
                    topOffer: bestTrocoOfferOriginal,
                    createdAt: new Date().toISOString()
                });
            } catch (err: any) {
                console.error("Erro saving sim to dashboard collection: ", err.message);
            }

            // Resposta com o resultado da função - enriquecida com metadados técnicos
            const followUpResult = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: [
                    ...contents,
                    result.candidates?.[0]?.content || { role: "model", parts: [{ text: "" }] }, 
                    {
                        role: "user",
                        parts: [{
                            functionResponse: {
                                name: "calculate_client_loan_offers",
                                response: { 
                                    offersCount: allOffers.length,
                                    banksCount: uniqueBanks.length,
                                    bestTroco: bestTrocoOffer,
                                    allBanksWithOffers: uniqueBanks,
                                    simulationId: simId,
                                    // Mandamos algumas propostas de exemplo apenas para referência da IA
                                    sampleOffers: sanitizedSampleOffers 
                                }
                            }
                        }]
                    }
                ],
                config: { systemInstruction }
            });
            
            return followUpResult.text || "Operação realizada. Encontrei propostas interessantes para o seu contrato!";
        }

        return result.text || "Como posso ajudar na sua simulação hoje, parceiro?";

    } catch (error: any) {
        console.error("AI Agent Error EXACT:", error);
        return `DEBUG_CATCH_ERROR: ${error.message} [Key: ${((getAI() as any)?.apiKey || "").substring(0,5)}]`;
    }
}
