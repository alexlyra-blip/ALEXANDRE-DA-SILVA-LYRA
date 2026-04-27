import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { getAdminDb } from '@/lib/firebase-admin';

// Obtenha as credenciais do ambiente
const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    console.error("Twilio credentials missing. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Secrets.");
    return null;
  }
  return twilio(accountSid, authToken);
};

// Simulação de regras financeiras simplificada para o bot
// O ideal é centralizar isso em uma função exportada de lib/ simulador para reuso
function parseCurrency(value: string | undefined | null) {
  if (!value) return 0;
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
}

const ALL_ORIGIN_BANKS = [
  "121 - AGIBANK", "250 - BCV", "025 - BANCO ALFA", "233 - BANCO CIFRA", "001 - BANCO DO BRASIL",
  "047 - BANCO DO ESTADO DO SERGIPE", "079 - BANCO ORIGINAL", "643 - BANCO PINE", "081 - BANCO SEGURO",
  "041 - BANRISUL", "268 - BARIGUI", "318 - BMG", "237 - BRADESCO S.A.", "070 - BRB", "626 - C6",
  "320 - CCB BRASIL", "104 - CAIXA", "069 - CREFISA", "707 - DAYCOVAL", "335 - DIGIO", "149 - FACTA",
  "012 - INBURSA", "029 - ITAÚ CONSIGNADO", "184 - ITAÚ BBA", "341 - ITAÚ UNIBANCO", "389 - MERCANTIL",
  "422 - SAFRA", "033 - SANTANDER", "082 - BANCO TOPAZIO", "018 - TRICURY", "655 - VOTORANTIM",
  "000 - OUTROS BANCOS", "999 - TODOS OS BANCOS"
];

function normalizeBank(input: string): string {
  if (!input) return '';
  const clean = input.trim().toLowerCase();
  
  // Try exactly code
  const numericCode = clean.replace(/[^0-9]/g, '');
  if (numericCode && numericCode.length > 0) {
    const matchedByCode = ALL_ORIGIN_BANKS.find(b => b.startsWith(numericCode.padStart(3, '0')) || b.startsWith(numericCode));
    if (matchedByCode) return matchedByCode;
  }
  
  // Try name match
  const matchedByName = ALL_ORIGIN_BANKS.find(b => b.toLowerCase().includes(clean));
  if (matchedByName) return matchedByName;
  
  // Try Levenshtein / fuzzy? For now just try words
  const words = clean.split(' ').filter(w => w.length > 2);
  for (const word of words) {
    const match = ALL_ORIGIN_BANKS.find(b => b.toLowerCase().includes(word));
    if (match) return match;
  }
  
  return input; 
}

export async function POST(req: Request) {
  console.log('--- WHATSAPP WEBHOOK CALLED ---');
  try {
    const body = await req.text();
    console.log('Twilio Body:', body);
    const params = new URLSearchParams(body);
    
    const from = params.get('From');
    const to = params.get('To');
    const bodyText = params.get('Body')?.trim() || '';

    const sessionId = from?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown';
    console.log(`From: ${from}, To: ${to}, BodyText: ${bodyText}`);
    console.log(`Checking session existence at: whatsappSessions/${sessionId}`);

    if (!from) {
      console.log('Missing From missing -> return 400');
      return NextResponse.json({ error: 'Missing From' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error("Failed to initialize admin database");
    }

    const sessionRef = adminDb.collection('whatsappSessions').doc(sessionId);
    console.log('Session Ref Path:', sessionRef.path);
    let sessionSnap;
    try {
      sessionSnap = await sessionRef.get();
    } catch (e: any) {
      console.error("Error fetching session from admin db:", e.message);
      throw new Error("Failed to fetch session: " + e.message);
    }
    console.log('Session Snap exists:', sessionSnap.exists);
    
    let sessionData = sessionSnap.exists ? sessionSnap.data() : { step: 'START', data: {} };
    if (!sessionData) sessionData = { step: 'START', data: {} };

    let reply = '';

    const sendTwilioMessage = async (message: string) => {
      try {
        const twilioClient = getTwilioClient();
        if (twilioClient) {
          const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || '';
          await twilioClient.messages.create({
            from: twilioNumber || to || '',
            to: from,
            body: message
          });
        }
      } catch (err) {
        console.error('Twilio Error:', err);
      }
    };

    // Fluxo da conversa
    if (sessionData.step === 'START' || bodyText.toLowerCase() === 'oi' || bodyText.toLowerCase() === 'olá') {
      reply = `Olá! 👋 Sou o assistente de *Portabilidade PRO*.\n\nVou pedir alguns dados para fazermos a sua simulação, ok?\n\nQual é o seu *Convênio*?\nResponda com o nome, ex: INSS, SIAPE, Forças Armadas, Governo, etc.`;
      sessionData.step = 'ASK_CONVENIO';
      sessionData.data = {};
    } 
    else if (sessionData.step === 'ASK_CONVENIO') {
      sessionData.data.convenio = bodyText.toUpperCase();
      reply = `Ótimo! Em qual *banco* está o seu empréstimo atual? (ex: Itaú, Bradesco)`;
      sessionData.step = 'ASK_BANCO_ATUAL';
    }
    else if (sessionData.step === 'ASK_BANCO_ATUAL') {
      sessionData.data.bancoAtual = normalizeBank(bodyText);
      // Optional: Inform recognized bank
      if (sessionData.data.bancoAtual !== bodyText.trim()) {
         reply = `Entendi, o banco é *${sessionData.data.bancoAtual}*.\nE qual é a sua *idade*? (ex: 65)`;
      } else {
         reply = `E qual é a sua *idade*? (ex: 65)`;
      }
      sessionData.step = 'ASK_IDADE';
    }
    else if (sessionData.step === 'ASK_IDADE') {
      sessionData.data.idade = parseInt(bodyText) || 0;
      reply = `Qual é a *Espécie do Benefício* do Cliente? (Pode digitar apenas o código)`;
      sessionData.step = 'ASK_ESPECIE';
    }
    else if (sessionData.step === 'ASK_ESPECIE') {
      const especieStr = bodyText.replace(/[^0-9]/g, '');
      sessionData.data.codigoBeneficio = especieStr || bodyText;
      
      const invalidezCodes = ['4', '04', '5', '05', '11', '30', '32', '33', '34', '92'];
      if (invalidezCodes.includes(sessionData.data.codigoBeneficio) && sessionData.data.idade < 60) {
        reply = `Qual é a *data de concessão* do benefício? (para validar o tempo do benefício - ex: DDMMAAAA ou Mês/Ano)`;
        sessionData.step = 'ASK_DATA_CONCESSAO';
      } else {
        reply = `O Cliente é *Analfabeto*? Responda SIM ou NÃO`;
        sessionData.step = 'ASK_ANALFABETO';
      }
    }
    else if (sessionData.step === 'ASK_DATA_CONCESSAO') {
      sessionData.data.dataConcessao = bodyText;
      reply = `O Cliente é *Analfabeto*? Responda SIM ou NÃO`;
      sessionData.step = 'ASK_ANALFABETO';
    }
    else if (sessionData.step === 'ASK_ANALFABETO') {
      sessionData.data.isAnalfabeto = bodyText.trim().toUpperCase() === 'SIM';
      if (sessionData.data.idade >= 60) {
        reply = `O cliente é 60+, residente nos estados de AP, PB, TO e RR? Responda SIM ou NÃO.`;
        sessionData.step = 'ASK_ESTADO_60_MAIS';
      } else {
        reply = `Certo. Qual é o *prazo total* original do seu empréstimo em meses? (ex: 84 ou 96)`;
        sessionData.step = 'ASK_PRAZO_TOTAL';
      }
    }
    else if (sessionData.step === 'ASK_ESTADO_60_MAIS') {
      sessionData.data.estado60Mais = bodyText.trim().toUpperCase() === 'SIM';
      reply = `Certo. Qual é o *prazo total* original do seu empréstimo em meses? (ex: 84 ou 96)`;
      sessionData.step = 'ASK_PRAZO_TOTAL';
    }
    else if (sessionData.step === 'ASK_PRAZO_TOTAL') {
      sessionData.data.prazoTotal = parseInt(bodyText) || 0;
      reply = `Quantas *parcelas restantes* faltam para terminar de pagar? (ex: 60)`;
      sessionData.step = 'ASK_PRAZO_RESTANTE';
    }
    else if (sessionData.step === 'ASK_PRAZO_RESTANTE') {
      sessionData.data.parcelasRestantes = parseInt(bodyText) || 0;
      reply = `Entendi. Qual é o *valor da prestação* (parcela) atual que você paga? (ex: 500 ou 500,00)`;
      sessionData.step = 'ASK_PARCELA';
    }
    else if (sessionData.step === 'ASK_PARCELA') {
      sessionData.data.valorParcela = bodyText;
      reply = `Anotado, parcela de R$ ${bodyText}.\n\nPara calcularmos a Portabilidade, qual é o *valor do saldo devedor* atual? (ex: 15000,00)`;
      sessionData.step = 'ASK_SALDO';
    }
    else if (sessionData.step === 'ASK_SALDO') {
      sessionData.data.saldoDevedor = bodyText;
      
      reply = `⏳ *Calculando suas opções...*\n\nDados confirmados:\n- Convênio: ${sessionData.data.convenio}\n- Banco: ${sessionData.data.bancoAtual}\n- Parcela: R$ ${sessionData.data.valorParcela}\n- Saldo: R$ ${sessionData.data.saldoDevedor}\n\nVou verificar a melhor oferta em nosso sistema...`;
      
      await sendTwilioMessage(reply);
      
      try {
        const banksRef = adminDb.collection('bankRules');
        const bankSnap = await banksRef.where('isActive', '==', true).get();
        const allBanks = bankSnap.docs.map(d => ({id: d.id, ...d.data()}));
        
        const rulesRef = adminDb.collection('generalRules');
        const rulesSnap = await rulesRef.get();
        const generalRules = rulesSnap.docs.map(d => ({id: d.id, ...d.data()}));
        
        // Dynamic import of the calculator to avoid circular dependencies in some setups, but static is fine here since it's an API route.
        const { calculateOffers } = await import('@/lib/simulation-engine');
        
        const normalizeDate = (val: string) => {
          if (!val) return '';
          const parts = val.match(/\d+/g);
          if (!parts) return '';
          if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
          if (parts.length === 2) return `${parts[1]}-${parts[0]}-01`;
          return '';
        };

        const params = {
          idade: parseInt(sessionData.data.idade) || 50,
          convenio: sessionData.data.convenio || 'INSS',
          bancoAtual: sessionData.data.bancoAtual || '',
          valorParcela: parseCurrency(sessionData.data.valorParcela),
          saldoDevedor: parseCurrency(sessionData.data.saldoDevedor),
          prazoTotal: parseInt(sessionData.data.prazoTotal) || 84,
          parcelasRestantes: parseInt(sessionData.data.parcelasRestantes) || 60,
          taxaJurosMensal: 0.015,
          codigoBeneficio: sessionData.data.codigoBeneficio || '',
          dataConcessao: normalizeDate(sessionData.data.dataConcessao || ''),
          isAnalfabeto: sessionData.data.isAnalfabeto,
          isCliente60Mais: sessionData.data.estado60Mais
        };
        
        const offers = calculateOffers(params, allBanks, generalRules);
        
        if (offers && offers.length > 0) {
          // Sort offers by troco
          offers.sort((a, b) => b.valorTroco - a.valorTroco);
          const bestOffer = offers[0];
          
          reply = `🎉 *Simulação Concluída!*\n\nEncontramos uma oferta ideal para você no *${bestOffer.name}*:\n\n` +
                  `📊 *Tabela:* ${bestOffer.tabela}\n` +
                  `💰 *Troco Estimado:* R$ ${bestOffer.valorTroco.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` + 
                  `📑 *Novo Contrato:* R$ ${bestOffer.valorContrato.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
                  `💲 *Valor da Parcela:* R$ ${(params.valorParcela).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
                  `⏳ *Prazo do Refin/Port:* ${bestOffer.prazoRefinPort || 84} meses\n\n`;

          const otherBanks = Array.from(new Set(offers.map(o => o.name).filter(name => name !== bestOffer.name)));
          if (otherBanks.length > 0) {
            reply += `Também liberamos ofertas para outros bancos:\n${otherBanks.map(b => `- ${b}`).join('\n')}\n\n`;
            reply += `Caso queira ver a oferta detalhada de algum desses, basta digitar o *Nome do Banco* agora!`;
            
            // SECURITY/SIZE FIX: Save ONLY essential data to stay under 1MB limit
            sessionData.offers = offers.map(o => ({
              name: o.name || '',
              tabela: o.tabela || '',
              valorTroco: o.valorTroco || 0,
              valorContrato: o.valorContrato || 0,
              prazoRefinPort: o.prazoRefinPort || 84
            }));
            sessionData.step = 'ASK_OTHER_BANK';
          } else {
             reply += `Neste momento, não temos ofertas disponíveis em outros bancos para esse perfil.`;
             sessionData.step = 'START';
             sessionData.data = {};
          }
        } else {
          reply = `Infelizmente, não encontramos tabelas disponíveis para essas condições neste momento.\nVocê pode tentar novamente com outros parâmetros respondendo "Oi".`;
          sessionData.step = 'START';
          sessionData.data = {};
        }
        
      } catch(e: any) {
        console.error("Error calculating local offers:", e.message);
        reply = `Houve um erro ao processar as propostas online. Tente novamente enviando "Oi".`;
        sessionData.step = 'START';
        sessionData.data = {};
      }
    }
    else if (sessionData.step === 'ASK_OTHER_BANK') {
       const requestedBank = bodyText.trim().toUpperCase();
       if (sessionData.offers && Array.isArray(sessionData.offers)) {
          const bankOffers = sessionData.offers.filter((o: any) => o.name.toUpperCase().includes(requestedBank));
          if (bankOffers.length > 0) {
             const bestBankOffer = bankOffers.sort((a: any, b: any) => b.valorTroco - a.valorTroco)[0];
             const parcela = parseCurrency(sessionData.data.valorParcela || '0');
             reply = `🎉 Oferta no *${bestBankOffer.name}*:\n\n` +
                     `📊 *Tabela:* ${bestBankOffer.tabela}\n` +
                     `💰 *Troco Estimado:* R$ ${bestBankOffer.valorTroco.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` + 
                     `📑 *Novo Contrato:* R$ ${bestBankOffer.valorContrato.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
                     `💲 *Valor da Parcela:* R$ ${(parcela).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
                     `⏳ *Prazo do Refin/Port:* ${bestBankOffer.prazoRefinPort || 84} meses\n\n`;
             reply += `Se quiser ver de outro banco, basta digitar o nome. Ou digite "Oi" para uma nova simulação.`;
          } else {
             if (requestedBank === 'OI' || requestedBank === 'OLÁ') {
                reply = `Olá! 👋 Sou o assistente de *Portabilidade PRO*.\n\nVou pedir alguns dados para fazermos a sua simulação, ok?\n\nQual é o seu *Convênio*?\nResponda com o nome, ex: INSS, SIAPE, Forças Armadas, Governo, etc.`;
                sessionData.step = 'ASK_CONVENIO';
                sessionData.data = {};
                sessionData.offers = [];
             } else {
                reply = `Não encontramos ofertas disponíveis para o banco "${bodyText}". Tente outro nome da lista ou digite "Oi" para recomeçar.`;
             }
          }
       } else {
          reply = `Desculpe, perdi os dados da simulação anterior. Digite "Oi" para recomeçar.`;
          sessionData.step = 'START';
          sessionData.data = {};
       }
    }

    // Save state
    try {
      await sessionRef.set(sessionData);
    } catch (e: any) {
      console.error("Error saving session to admin db:", e.message);
      throw new Error("Failed to save session: " + e.message);
    }

    const MessagingResponse = twilio.twiml.MessagingResponse;
    const twiml = new MessagingResponse();
    twiml.message(reply);

    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: { 'Content-Type': 'text/xml' }
    });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
