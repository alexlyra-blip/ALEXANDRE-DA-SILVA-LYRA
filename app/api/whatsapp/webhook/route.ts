import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });

// Tokens de configuração (devem ser configurados nas variáveis de ambiente / Secrets)
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'simulador_token_123';
const WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// O método GET é usado pelo Meta (Facebook) para verificar se o seu webhook é válido
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso pelo Meta!');
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// O método POST é onde recebemos as mensagens reais dos clientes
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Verifica se é um evento do WhatsApp
    if (body.object !== 'whatsapp_business_account') {
      return new NextResponse('Not Found', { status: 404 });
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    // Se recebemos uma mensagem de texto
    if (message?.type === 'text') {
      const from = message.from; // Número do cliente
      const text = message.text.body; // Texto que o cliente enviou

      console.log(`Mensagem recebida de ${from}: ${text}`);

      // 1. Usar a IA (Gemini) para interpretar a mensagem e gerar uma resposta
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Você é um assistente virtual especialista em crédito consignado e portabilidade. 
        Um cliente enviou a seguinte mensagem no WhatsApp: "${text}".
        
        Regras de resposta:
        1. Se for apenas uma saudação (ex: "oi", "bom dia"), seja educado e peça os dados necessários para uma simulação de portabilidade (Idade, Convênio, Banco Atual, Valor da Parcela e Saldo Devedor).
        2. Se o cliente já enviou os dados, confirme que você recebeu, liste os dados que você entendeu e diga que está processando as melhores ofertas e retornará em instantes.
        3. Use emojis, seja persuasivo, profissional e mantenha a mensagem curta (formato WhatsApp).`,
      });

      const replyText = response.text;

      // 2. Enviar a resposta de volta para o cliente via API Oficial do WhatsApp
      if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
        await fetch(`https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: { body: replyText },
          }),
        });
        console.log('Resposta enviada com sucesso!');
      } else {
        console.log("⚠️ WHATSAPP_API_TOKEN não configurado. A mensagem gerada pela IA foi:", replyText);
      }
    }

    // Sempre retorne 200 OK para o Meta, senão eles tentam reenviar a mensagem
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Erro no webhook do WhatsApp:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
