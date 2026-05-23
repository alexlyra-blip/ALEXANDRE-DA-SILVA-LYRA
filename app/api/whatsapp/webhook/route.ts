import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { runSimulation, SimulationInput } from '@/lib/simulation-service';
import { db } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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
        taxaJurosMensal: { type: Type.NUMBER, description: "Taxa de juros mensal atual do contrato (ex: 1.85)" },
        bancoDesejado: { type: Type.STRING, description: "Nome do banco que o cliente deseja ver. Retorne NULO se o cliente não citar o nome de um banco na nova mensagem." }
      }
    },
    wantsMoreOptions: {
      type: Type.BOOLEAN,
      description: "True se o cliente pediu para ver 'tabelas', 'mais', 'outras opções' ou 'próximas'."
    },
    missingFields: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Lista de campos PRINCIPAIS que ainda faltam no histórico. (Principais: Convênio, Valor da Parcela, Saldo Devedor)"
    }
  }
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

      // Buscar sessão anterior no Firestore
      const sessionRef = doc(db, 'whatsapp_sessions', from);
      const sessionSnap = await getDoc(sessionRef);
      const previousSession = sessionSnap.exists() ? sessionSnap.data() : { simulationData: {}, pageIndex: 0 };
      const previousData = previousSession.simulationData || {};
      let lastOfferedBank = previousSession.lastOfferedBank || "";

      // 1. Usar a IA para extrair dados ou gerar resposta
      const ai = getAI();
      const prompt = `Você é um assistente especialista em crédito consignado no Brasil chamado "Gutto".
      Analise a mensagem do cliente em Português: "${text}".
      
      O histórico de dados já informados pelo cliente nesta conversa é: ${JSON.stringify(previousData)}.
      
      REGRAS DE EXTRAÇÃO:
      1. Extraia os dados da nova mensagem e MESCLE com os do histórico.
      2. Se a nova mensagem NÃO INFORMAR um dado que já está no histórico, MANTENHA o valor do histórico. Nunca apague um dado que já foi fornecido.
      3. Se o cliente disser APENAS o nome de um banco (ex: "C6", "Pan") ou pedir para ver de um banco ("mostra tabelas do C6"), preencha bancoDesejado com o nome. Se ele não mencionar NENHUM banco na NOVA mensagem, bancoDesejado DEVE ser null/vazio.
      4. Se o cliente disser "tabelas", "mais", "ver outras", preencha wantsMoreOptions = true.
      5. Se ainda faltar Convênio, Valor da Parcela ou Saldo Devedor no histórico mesclado, preencha missingFields. Senão, deixe vazio.`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: simulationSchema,
        },
      });
      const extraction = JSON.parse(result.text);
      
      // Merge extraction data to ensure defaults and clean state
      // We don't want to overwrite bancoDesejado from history unless the user explicitly requested a new one,
      // actually, bancoDesejado is stateless (only applies to current request).
      const mergedData = {
        ...previousData,
        ...extraction.data,
      };
      
      // Keep bancoDesejado isolated to the current request
      mergedData.bancoDesejado = extraction.data?.bancoDesejado;

      // Handle pagination
      let currentPage = extraction.wantsMoreOptions ? (previousSession.pageIndex || 0) + 1 : 0;
      if (extraction.data?.bancoDesejado) {
        currentPage = 0; // Reset pagination if searching a specific bank
      }

      let replyText = "";
      
      const isReadyToSimulate = Boolean(mergedData.valorParcela && mergedData.saldoDevedor && mergedData.convenio);

      // Verificar se possui os campos mínimos para simular
      if (isReadyToSimulate) {
        // 2. Executar a simulação
        const allOffers = await runSimulation(mergedData as SimulationInput);
        
        if (allOffers.length > 0) {
          // Filtrar pelo banco desejado ou pelo banco anteriormente ofertado
          let offersToProcess = allOffers;
          const requestedBank = extraction.data?.bancoDesejado;
          
          let bankFilter = requestedBank || "";
          if (!bankFilter && (currentPage > 0 || extraction.wantsMoreOptions) && lastOfferedBank) {
            bankFilter = lastOfferedBank;
          }

          if (bankFilter) {
            offersToProcess = allOffers.filter(o => o.name.toLowerCase().includes(bankFilter.toLowerCase()));
          }

          if (offersToProcess.length === 0) {
            replyText = `Encontrei ofertas, mas infelizmente nenhuma delas é do banco ${bankFilter || requestedBank}. Deseja ver as opções disponíveis de outros bancos?`;
          } else {
            // Filtrar pelo maior prazo disponível nas ofertas que sobraram
            const prazos = new Set<number>();
            offersToProcess.forEach(o => {
              if (o.prazoRefinPort) prazos.add(o.prazoRefinPort);
            });
            const availablePrazos = Array.from(prazos).sort((a, b) => b - a);
            
            let offersWithPrazo = offersToProcess;
            let selectedPrazo: number | null = null;
            
            if (availablePrazos.length > 0) {
              selectedPrazo = availablePrazos[0];
              offersWithPrazo = offersToProcess.filter(o => o.prazoRefinPort === selectedPrazo);
            }
            
            const startIndex = currentPage * 3;
            const endIndex = startIndex + 3;
            const topOffers = offersWithPrazo.slice(startIndex, endIndex);
            
            if (topOffers.length === 0 && currentPage > 0) {
               replyText = `Você já viu todas as ofertas disponíveis para esse filtro! 🏁\n\nDeseja simular outro valor ou ver ofertas de outro banco?`;
            } else {
              // Salvar o banco ofertado na primeira posição desta listagem
              if (topOffers.length > 0) {
                lastOfferedBank = topOffers[0].name;
              }

              if (bankFilter) {
                replyText = `✅ Encontrei ${offersWithPrazo.length} ofertas do banco *${bankFilter}* para você no prazo de ${selectedPrazo || 'atual'}X!\n`;
                if (currentPage > 0) replyText += `Mostrando opções ${startIndex + 1} a ${Math.min(endIndex, offersWithPrazo.length)}:\n\n`;
                else replyText += `\n`;
              } else if (selectedPrazo) {
                replyText = `✅ Encontrei ${offersWithPrazo.length} tabelas disponíveis para você no prazo de ${selectedPrazo}X!\n`;
                if (currentPage > 0) replyText += `Mostrando opções ${startIndex + 1} a ${Math.min(endIndex, offersWithPrazo.length)}:\n\n`;
                else replyText += `\n`;
              } else {
                replyText = `✅ Encontrei ${offersWithPrazo.length} ofertas disponíveis para você!\n`;
                if (currentPage > 0) replyText += `Mostrando opções ${startIndex + 1} a ${Math.min(endIndex, offersWithPrazo.length)}:\n\n`;
                else replyText += `\n`;
              }
              
              topOffers.forEach((offer, i) => {
                replyText += `*${startIndex + i + 1}ª Opção: ${offer.name}*\n`;
                replyText += `💰 Troco estimado: R$ ${offer.valorTroco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
                replyText += `📉 Nova Taxa: ${offer.novaTaxaPortabilidade.toFixed(2)}%\n`;
                replyText += `📋 Tabela: ${offer.tabela}\n\n`;
              });

              if (offersWithPrazo.length > endIndex) {
                replyText += `Deseja prosseguir com alguma dessas opções ou quer ver **mais tabelas**? Digite "mais" para ver as próximas.`;
              } else {
                replyText += `Deseja prosseguir com alguma dessas opções? Digite o número da opção.`;
              }
            }
          }
        } else {
          replyText = `Poxa, com os dados informados não encontrei ofertas liberadas nos bancos parceiros no momento. 😕\n\nIsso pode acontecer por causa da idade, tempo de benefício ou saldo devedor.`;
        }
      } else {
        // 3. Gerar resposta conversacional pedindo o que falta
        const chatPrompt = `Você é o "Gutto", um assistente de crédito consignado cordial e prestativo. O cliente disse: "${text}". 
        Obrigatório responder em Português do Brasil (PT-BR).
        Os dados já informados/extraídos são: ${JSON.stringify(mergedData)}. 
        Os campos que faltam são: ${extraction.missingFields?.join(', ') || 'Idade, Convênio, Banco Atual, Valor da Parcela e Saldo Devedor'}.
        Gere uma resposta curta, amigável e profissional pedindo os dados que faltam para fazer a simulação de portabilidade.`;
        
        const chatResult = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: chatPrompt
        });
        replyText = chatResult.text;
      }

      // Salvar a nova sessão atualizada no Firestore
      await setDoc(sessionRef, {
        simulationData: mergedData,
        pageIndex: currentPage,
        lastOfferedBank,
        updatedAt: new Date().toISOString()
      }, { merge: true });

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
