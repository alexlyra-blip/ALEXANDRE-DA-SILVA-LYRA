import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { runSimulation, SimulationInput } from '@/lib/simulation-service';

export const dynamic = 'force-dynamic';

const getAI = () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    return new GoogleGenAI({ apiKey });
};

// Tokens de configuração
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'simulador_token_123';
const WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// Schema para extração de dados da simulação
const simulationSchema = {
  type: Type.OBJECT,
  properties: {
    isSimulationData: {
      type: Type.BOOLEAN,
      description: "Verdadeiro se a mensagem contém dados suficientes para uma simulação."
    },
    data: {
      type: Type.OBJECT,
      properties: {
        valorParcela: { type: Type.NUMBER },
        saldoDevedor: { type: Type.NUMBER },
        idade: { type: Type.NUMBER },
        convenio: { 
          type: Type.STRING,
          enum: ['INSS', 'SIAPE', 'GOVERNO', 'FORÇAS ARMADAS']
        },
        subConvenio: { type: Type.STRING },
        parcelasPagas: { type: Type.NUMBER },
        parcelasRestantes: { type: Type.NUMBER },
        codigoBeneficio: { type: Type.STRING },
        dataConcessao: { type: Type.STRING, description: "Formato YYYY-MM-DD" },
        isAnalfabeto: { type: Type.BOOLEAN },
        bancoAtual: { type: Type.STRING },
        taxaJurosMensal: { type: Type.NUMBER, description: "Taxa de juros mensal atual do contrato (ex: 1.85)" }
      }
    },
    missingFields: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Lista de campos que ainda faltam para completar a simulação."
    }
  },
  required: ["isSimulationData"]
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('Tentativa de verificação de Webhook:', { mode, token });

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso!');
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Log do corpo recebido para diagnóstico
    console.log('Webhook recebido:', JSON.stringify(body));

    if (body.object !== 'whatsapp_business_account') {
      return new NextResponse('Not Found', { status: 404 });
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message?.type === 'text') {
      const from = message.from;
      const text = message.text.body;

      console.log(`Processando mensagem de ${from}: ${text}`);

      if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
        console.error('ERRO: NEXT_PUBLIC_GEMINI_API_KEY não configurada nos Secrets!');
      }

      // 1. Usar a IA para extrair dados ou gerar resposta
      const ai = getAI();
      const prompt = `Você é um assistente especialista em crédito consignado no Brasil. Analise a mensagem do cliente em Português: "${text}".
      Extraia os dados para simulação de portabilidade. 
      Campos necessários: Idade, Convênio (ex: INSS, SIAPE), Banco Atual, Valor da Parcela, Saldo Devedor, Parcelas Pagas, Parcelas Restantes, Código do Benefício, Taxa de Juros Atual (se mencionada).
      Se o cliente não enviou tudo, identifique o que falta.`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: simulationSchema,
        },
      });
      const extraction = JSON.parse(result.text);

      let replyText = "";

      if (extraction.isSimulationData && extraction.data.valorParcela && extraction.data.saldoDevedor) {
        // 2. Executar a simulação
        const offers = await runSimulation(extraction.data as SimulationInput);
        
        if (offers.length > 0) {
          const topOffers = offers.slice(0, 3);
          replyText = `✅ Encontrei as melhores ofertas para você!\n\n`;
          topOffers.forEach((offer, i) => {
            replyText += `*${i+1}ª Opção: ${offer.name}*\n`;
            replyText += `💰 Troco estimado: R$ ${offer.valorTroco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
            replyText += `📉 Nova Taxa: ${offer.novaTaxaPortabilidade.toFixed(2)}%\n`;
            replyText += `📋 Tabela: ${offer.tabela}\n\n`;
          });
          replyText += `Deseja prosseguir com alguma dessas opções? Digite o número da opção.`;
        } else {
          replyText = `Poxa, com os dados informados não encontrei ofertas liberadas nos bancos parceiros no momento. 😕\n\nIsso pode acontecer por causa da idade, tempo de benefício ou saldo devedor.`;
        }
      } else {
        // 3. Gerar resposta conversacional pedindo o que falta
        const chatPrompt = `Você é o "Gutto", um assistente de crédito consignado cordial e prestativo. O cliente disse: "${text}". 
        Obrigatório responder em Português do Brasil (PT-BR).
        Os dados extraídos foram: ${JSON.stringify(extraction.data)}. 
        Os campos que faltam são: ${extraction.missingFields?.join(', ') || 'todos'}.
        Gere uma resposta curta, amigável e profissional pedindo os seguintes dados que faltam para fazer a simulação de portabilidade. 
        Se for apenas uma saudação (Oi, Olá), apresente-se como Gutto e peça: Idade, Convênio, Banco Atual, Valor da Parcela e Saldo Devedor.`;
        
        const chatResult = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: chatPrompt
        });
        replyText = chatResult.text;
      }

      // 4. Enviar a resposta via WhatsApp
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
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
