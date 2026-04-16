import { NextResponse } from 'next/server';
import { GoogleGenAI, SchemaType } from '@google/genai';
import { runSimulation, SimulationInput } from '@/lib/simulation-service';

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' 
});

// Tokens de configuração
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'simulador_token_123';
const WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// Schema para extração de dados da simulação
const simulationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    isSimulationData: {
      type: SchemaType.BOOLEAN,
      description: "Verdadeiro se a mensagem contém dados suficientes para uma simulação."
    },
    data: {
      type: SchemaType.OBJECT,
      properties: {
        valorParcela: { type: SchemaType.NUMBER },
        saldoDevedor: { type: SchemaType.NUMBER },
        idade: { type: SchemaType.NUMBER },
        convenio: { 
          type: SchemaType.STRING,
          enum: ['INSS', 'SIAPE', 'GOVERNO', 'FORÇAS ARMADAS']
        },
        subConvenio: { type: SchemaType.STRING },
        parcelasPagas: { type: SchemaType.NUMBER },
        parcelasRestantes: { type: SchemaType.NUMBER },
        codigoBeneficio: { type: SchemaType.STRING },
        dataConcessao: { type: SchemaType.STRING, description: "Formato YYYY-MM-DD" },
        isAnalfabeto: { type: SchemaType.BOOLEAN },
        bancoAtual: { type: SchemaType.STRING },
        taxaJurosMensal: { type: SchemaType.NUMBER, description: "Taxa de juros mensal atual do contrato (ex: 1.85)" }
      }
    },
    missingFields: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
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

      if (!process.env.GEMINI_API_KEY && !process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
        console.error('ERRO: GEMINI_API_KEY não configurada nos Secrets!');
      }

      // 1. Usar a IA para extrair dados ou gerar resposta
      const model = ai.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: simulationSchema,
        },
      });

      const prompt = `Você é um assistente de crédito consignado. Analise a mensagem do cliente: "${text}".
      Extraia os dados para simulação de portabilidade. 
      Campos necessários: Idade, Convênio (INSS, SIAPE, etc), Banco Atual, Valor da Parcela, Saldo Devedor, Parcelas Pagas, Parcelas Restantes, Código do Benefício, Taxa de Juros Atual (se mencionada).
      Se o cliente não enviou tudo, identifique o que falta.`;

      const result = await model.generateContent(prompt);
      const extraction = JSON.parse(result.response.text());

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
        const chatModel = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
        const chatPrompt = `Você é um assistente de crédito. O cliente disse: "${text}". 
        Os dados extraídos foram: ${JSON.stringify(extraction.data)}. 
        Os campos que faltam são: ${extraction.missingFields?.join(', ') || 'todos'}.
        Gere uma resposta curta e amigável pedindo os dados que faltam para fazer a simulação de portabilidade. 
        Se for apenas um "Oi", peça: Idade, Convênio, Banco Atual, Valor da Parcela e Saldo Devedor.`;
        
        const chatResult = await chatModel.generateContent(chatPrompt);
        replyText = chatResult.response.text();
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
