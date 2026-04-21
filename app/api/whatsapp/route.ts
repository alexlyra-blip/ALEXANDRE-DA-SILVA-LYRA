import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { calculateOffers, SimulationParams } from '@/lib/simulation-engine';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizePhone, validateWhatsAppUser, logWhatsAppAttempt } from '@/lib/whatsapp-utils';

// Função para obter o modelo Gemini de forma preguiçosa (evita erros de inicialização se a chave faltar no boot)
function getGeminiModel() {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  
  const ai = new GoogleGenerativeAI(apiKey);
  return ai.getGenerativeModel({ model: "gemini-1.5-flash" });
}

// Handler para GET (Verificação de Webhook do WhatsApp/Meta + Diagnóstico)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const adminDb = getAdminDb();
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  // Token esperado
  const EXPECTED_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'simulador_token_123';

  // Se for uma chamada de validação da Meta
  if (mode === 'subscribe' && token) {
    if (token === EXPECTED_TOKEN) {
      console.log('✅ WEBHOOK VERIFIED');
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    return new Response('Token Inválido', { status: 403 });
  }

  // DIAGNÓSTICO PARA O USUÁRIO (Quando abre no navegador)
  const diagnostics = {
    WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN ? '✅ DEFINIDO' : '❌ FALTANDO NO MENU SECRETS',
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ? '✅ DEFINIDO' : '❌ FALTANDO NO MENU SECRETS',
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT ? '✅ DEFINIDO' : '❌ FALTANDO NO MENU SECRETS',
    GEMINI_API_KEY: apiKey ? '✅ DEFINIDO' : '❌ FALTANDO (Use o nome: NEXT_PUBLIC_GEMINI_API_KEY nos Secrets)',
    FIREBASE_INITIALIZED: !!adminDb ? '✅ SIM' : '❌ NÃO (Verifique o JSON do Service Account)',
  };

  return new Response(`
    <html>
      <body style="font-family: sans-serif; padding: 40px; line-height: 1.6;">
        <h1>Status do Webhook WhatsApp</h1>
        <p>Este link deve ser usado na Meta como <b>URL de Callback</b>.</p>
        <hr/>
        <h3>Diagnóstico de Configuração:</h3>
        <pre style="background: #f4f4f4; padding: 20px; border-radius: 8px;">${JSON.stringify(diagnostics, null, 2)}</pre>
        <p><b>Atenção:</b> A chave do Gemini deve se chamar <u>NEXT_PUBLIC_GEMINI_API_KEY</u> nos Secrets para funcionar corretamente.</p>
        <p><i>Se algum item estiver como ❌, o robô não responderá. Configure no menu <b>Secrets</b> e clique em <b>Publish</b> novamente.</i></p>
      </body>
    </html>
  `, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// Handler para POST (Recebe mensagens do WhatsApp)
export async function POST(req: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const model = getGeminiModel();

    if (!adminDb) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    if (!model) {
      console.error("Gemini AI model not initialized. Missing API Key.");
      // Tentar enviar uma mensagem de erro para o usuário se possível, ou apenas logar
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    const body = await req.json();
    
    // --- MODO DE INVESTIGAÇÃO PROFUNDA (Logar absolutamente tudo que chega da Meta) ---
    try {
      await adminDb.collection('whatsappLogs').add({
        type: 'RAW_WEBHOOK_RECEIVE',
        timestamp: new Date(),
        createdAt: new Date().toISOString(),
        body: body // Salva o payload inteiro para vermos o que a Meta tentou mandar
      });
    } catch (logErr) {
      console.error("Erro ao salvar log RAW", logErr);
    }
    // ---------------------------------------------------------------------------------

    // Check if it's a message event from WhatsApp Business API (Cloud API)
    const messageEntry = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    
    if (!messageEntry) {
      return NextResponse.json({ status: 'ignored' });
    }

    const senderNumber = messageEntry.from;
    const messageText = messageEntry.text?.body;

    if (!messageText) {
      return NextResponse.json({ status: 'no_text' });
    }

    // --- NOVA CAMADA DE AUTORIZAÇÃO ---
    const normalizedPhone = normalizePhone(senderNumber);
    const auth = await validateWhatsAppUser(normalizedPhone);

    // Registrar Log
    await logWhatsAppAttempt({
      rawPhone: senderNumber,
      normalizedPhone,
      message: messageText,
      authorized: auth.authorized,
      reason: auth.reason,
      userId: auth.user?.id
    });

    if (!auth.authorized) {
      let blockMessage = "Este número não está autorizado para utilizar este atendimento. Solicite o cadastro ou a atualização do número na plataforma.";
      
      if (auth.reason === 'Usuário inativo') {
        blockMessage = "Seu cadastro está inativo no momento. Procure o administrador do sistema.";
      } else if (auth.reason === 'Erro interno de validação') {
        blockMessage = "Não foi possível validar seu acesso neste momento. Tente novamente mais tarde.";
      }

      await sendWhatsAppMessage(senderNumber, blockMessage);
      console.log(`WhatsApp Blocked (${auth.reason}) for ${senderNumber}`);
      return NextResponse.json({ status: 'blocked', reason: auth.reason });
    }

    console.log(`WhatsApp message from ${senderNumber} (Authorized as ${auth.user?.name || 'User'}): ${messageText}`);
    // --- FIM DA CAMADA DE AUTORIZAÇÃO ---

    // 1. Usar Gemini para extrair parâmetros da simulação
    const prompt = `Analise a seguinte mensagem de WhatsApp de um cliente interessado em simulação de crédito consignado:
    "${messageText}"
    
    Extraia os seguintes parâmetros no formato JSON:
    - idade (número)
    - convenio (um de: "INSS", "SIAPE", "GOVERNO", "FORÇAS ARMADAS")
    - codigoBeneficio (string)
    - dataConcessao (string no formato YYYY-MM-DD)
    - bancoAtual (string, ex: "ITAU", "BRADESCO")
    - valorParcela (número)
    - saldoDevedor (número)
    - prazoTotal (número, padrão 96)
    - parcelasPagas (número)
    
    Se algum parâmetro não puder ser extraído, deixe o campo como null.
    Retorne APENAS o JSON, sem explicações.`;

    const result = await model.generateContent(prompt);
    const textExtraido = result.response.text().trim();
    
    let simParams: Partial<SimulationParams> = {};
    try {
      // Limpar possível markdown do Gemini
      const jsonStr = textExtraido.replace(/```json|```/g, '');
      simParams = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Erro ao processar JSON do Gemini:", e);
      return NextResponse.json({ status: 'ai_parse_error' });
    }

    // 2. Verificar se temos o básico para uma simulação inicial
    const REQUIRED_FIELDS = ['idade', 'valorParcela', 'saldoDevedor', 'bancoAtual'];
    const missingFields = REQUIRED_FIELDS.filter(f => !(simParams as any)[f]);

    if (missingFields.length > 0) {
      const responseMsg = `Recebi sua solicitação, mas preciso de mais alguns dados para fazer a simulação completa:
      
${missingFields.map(f => `- ${f === 'idade' ? 'Sua Idade' : f === 'valorParcela' ? 'Valor da Parcela' : f === 'saldoDevedor' ? 'Saldo Devedor Aproximado' : 'Nome do Banco Atual'}`).join('\n')}

Por favor, informe esses dados para eu calcular as melhores ofertas para você!`;

      await sendWhatsAppMessage(senderNumber, responseMsg);
      return NextResponse.json({ status: 'params_requested' });
    }

    // 3. Buscar Regras e Bancos do Firestore
    const banksSnap = await adminDb.collection('bankRules').get();
    const banks = banksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const generalRulesSnap = await adminDb.collection('generalRules').get();
    const generalRules = generalRulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 4. Executar Simulação
    // Definimos valores padrão para campos opcionais
    const finalParams: SimulationParams = {
      idade: Number(simParams.idade),
      convenio: simParams.convenio || 'INSS',
      subConvenio: (simParams as any).subConvenio || 'Aposentadoria / Pensao',
      codigoBeneficio: simParams.codigoBeneficio || '31', // Default 31
      dataConcessao: simParams.dataConcessao || '2020-01-01',
      bancoAtual: simParams.bancoAtual || '',
      valorParcela: Number(simParams.valorParcela),
      saldoDevedor: Number(simParams.saldoDevedor),
      prazoTotal: Number(simParams.prazoTotal || 96),
      parcelasPagas: Number(simParams.parcelasPagas || 12),
      taxaJurosMensal: (simParams as any).taxaJurosMensal || 0.0180,
      isCliente60Mais: Number(simParams.idade) >= 60
    };

    const offers = calculateOffers(finalParams, banks, generalRules);

    // 5. Formatar Resposta
    let responseText = '';
    if (offers.length > 0) {
      const best = offers[0];
      responseText = `🎉 *Simulação Realizada com Sucesso!*

Encontrei a melhor oferta para você no *${best.name}*:

💰 *Troco Estimado:* ${formatCurrency(best.valorTroco)}
📑 *Tabela:* ${best.tabela}
🏦 *Novo Contrato:* ${formatCurrency(best.valorContrato)}
📉 *Taxa:* ${best.novaTaxaPortabilidade?.toFixed(2)}%

Você pode economizar portando seu contrato! 🚀
Para seguir com a proposta, acesse nosso portal ou responda aqui "QUERO ESSA".`;
    } else {
      responseText = `Infelizmente não encontramos ofertas disponíveis para o seu perfil no momento com base nos dados informados. 

Isso pode ocorrer por conta do banco atual, do saldo devedor ou da idade. Gostaria de tentar com outros valores?`;
    }

    await sendWhatsAppMessage(senderNumber, responseText);
    return NextResponse.json({ status: 'success' });

  } catch (error) {
    console.error("Erro no Webhook do WhatsApp:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Funções Auxiliares
async function sendWhatsAppMessage(to: string, text: string) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: { body: text }
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Erro ao enviar mensagem para WhatsApp:', errorData);
  }
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
