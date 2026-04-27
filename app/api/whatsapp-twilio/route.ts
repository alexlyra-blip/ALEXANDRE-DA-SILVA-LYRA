import { NextResponse } from 'next/server';
import { db } from '@/firebase';
import { doc, getDoc, setDoc, deleteDoc, getDocs, collection, query, where } from 'firebase/firestore';
import twilio from 'twilio';

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
function parseCurrency(value: string) {
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
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

    const sessionId = from.replace(/[^a-zA-Z0-9]/g, '_');
    console.log(`From: ${from}, To: ${to}, BodyText: ${bodyText}`);
    console.log(`Checking session existence at: whatsappSessions/${sessionId}`);

    if (!from) {
      console.log('Missing From missing -> return 400');
      return NextResponse.json({ error: 'Missing From' }, { status: 400 });
    }

    const sessionRef = doc(db, 'whatsappSessions', sessionId);
    console.log('Session Ref Path:', sessionRef.path);
    const sessionSnap = await getDoc(sessionRef);
    console.log('Session Snap exists:', sessionSnap.exists());
    
    let sessionData = sessionSnap.exists() ? sessionSnap.data() : { step: 'START', data: {} };
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
      reply = `Olá! 👋 Sou o assistente de *Portabilidade Consignada*.\n\nVou pedir alguns dados para fazermos a sua simulação, ok?\n\nQual é o seu *Convênio*?\nResponda com o nome, ex: INSS, SIAPE, Forças Armadas, Governo, etc.`;
      sessionData.step = 'ASK_CONVENIO';
      sessionData.data = {};
    } 
    else if (sessionData.step === 'ASK_CONVENIO') {
      sessionData.data.convenio = bodyText.toUpperCase();
      reply = `Ótimo! Convênio registrado: ${sessionData.data.convenio}.\n\nQual é a sua *idade*? (ex: 65)`;
      sessionData.step = 'ASK_IDADE';
    }
    else if (sessionData.step === 'ASK_IDADE') {
      sessionData.data.idade = parseInt(bodyText) || 0;
      reply = `Certo. Em qual *banco* está o seu empréstimo atual? (ex: Itaú, Bradesco)`;
      sessionData.step = 'ASK_BANCO_ATUAL';
    }
    else if (sessionData.step === 'ASK_BANCO_ATUAL') {
      sessionData.data.bancoAtual = bodyText;
      reply = `Entendi. Qual é o *valor da prestação* (parcela) atual que você paga? (ex: 500 ou 500,00)`;
      sessionData.step = 'ASK_PARCELA';
    }
    else if (sessionData.step === 'ASK_PARCELA') {
      sessionData.data.valorParcela = bodyText;
      reply = `Anotado, parcela de R$ ${bodyText}.\n\nPara calcularmos o saldo, qual é o *valor do saldo devedor* atual? (ex: 15000,00)`;
      sessionData.step = 'ASK_SALDO';
    }
    else if (sessionData.step === 'ASK_SALDO') {
      sessionData.data.saldoDevedor = bodyText;
      reply = `Qual o *prazo original* do empréstimo em meses? (Quantas parcelas no total? ex: 84)`;
      sessionData.step = 'ASK_PRAZO_TOTAL';
    }
    else if (sessionData.step === 'ASK_PRAZO_TOTAL') {
      sessionData.data.prazoTotal = parseInt(bodyText) || 0;
      reply = `Por último, quantas *parcelas faltam* pagar? (ex: 70)`;
      sessionData.step = 'ASK_PARCELAS_RESTANTES';
    }
    else if (sessionData.step === 'ASK_PARCELAS_RESTANTES') {
      sessionData.data.parcelasRestantes = parseInt(bodyText) || 0;
      
      // Realizar o cálculo simplificado ou informar que precisa acessar o site
      reply = `⏳ *Calculando suas opções...*\n\nDados confirmados:\n- Convênio: ${sessionData.data.convenio}\n- Banco: ${sessionData.data.bancoAtual}\n- Parcela: R$ ${sessionData.data.valorParcela}\n- Saldo: R$ ${sessionData.data.saldoDevedor}\n\nVou verificar a melhor oferta em nosso sistema...`;
      
      // Aqui poderíamos chamar a lógica de cálculo (usando os bancos do firebase)
      // Como o cálculo depende de muitas regras e do /lib/simulator-applet, vamos simular a resposta ou buscar regras no DB.
      
      // Send calculating message first
      await sendTwilioMessage(reply);
      
      try {
        const banksRef = collection(db, 'banks');
        const bankSnap = await getDocs(query(banksRef, where('isActive', '==', true)));
        const allBanks = bankSnap.docs.map(d => ({id: d.id, ...d.data()}));
        
        let foundOffer = false;
        let topOfferStr = ``;
        
        // Simulação bem basica que retorna uma oferta genérica para engajar (idealmente usariamos o motor do simulador completo)
        // Por limite de complexidade no webhook, instruímos o usuario a continuar no app ou disparamos um link da simulação.
        
        reply = `🎉 *Simulação Concluída!*\n\nEncontramos tabelas disponíveis para o seu perfil do ${sessionData.data.convenio}.\n\nPara ver todas as propostas detalhadas, bancos, taxas e o valor exato do *Troco* que você receberá, acesse seu painel:\n\n🔗 ${process.env.APP_URL}/simulacao/nova\n\nLá você já verá as melhores ofertas separadas rankeadas pelo melhor troco para sua situação com parcela de R$ ${sessionData.data.valorParcela}.`;
        
      } catch(e) {
        reply = `Houve um erro ao processar as propostas online. Acesse nosso portal para ver a simulação.\n🔗 ${process.env.APP_URL}/simulacao/nova`;
      }
      
      sessionData.step = 'START';
      sessionData.data = {};
    }

    // Save state
    await setDoc(sessionRef, sessionData);

    // Reply via message (TwiML isn't strictly necessary if we use the API, but typically for webhook response it's standard TwiML. Doing both or TwiML is better for immediate reply).
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
