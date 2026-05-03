import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizePhone, validateWhatsAppUser, logWhatsAppAttempt } from '@/lib/whatsapp-utils';

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

    if (!adminDb) {
      const { getInitializationError } = await import('@/lib/firebase-admin');
      const initErr = getInitializationError() || 'Unknown initialization error';
      console.error(`WhatsApp Webhook: Admin DB not initialized: ${initErr}`);
      return NextResponse.json({ error: 'Internal database error', details: initErr }, { status: 500 });
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

    const sessionId = senderNumber.replace(/[^a-zA-Z0-9]/g, '_');
    const sessionRef = adminDb.collection('whatsappSessions').doc(sessionId);
    let sessionSnap = await sessionRef.get();
    let sessionData = sessionSnap.exists ? sessionSnap.data() : { history: [] };
    if (!sessionData?.history) sessionData = { ...sessionData, history: [] };

    // 1. Usar o Agente de IA consolidado
    const { processWhatsAppMessage } = await import('@/lib/whatsapp-agent');
    const responseText = await processWhatsAppMessage(messageText, sessionData.history || []);

    // 2. Atualizar histórico
    const updatedHistory = [
      ...(sessionData.history || []).slice(-10),
      { role: 'user', content: messageText },
      { role: 'model', content: responseText }
    ];

    try {
      await sessionRef.set({ ...sessionData, history: updatedHistory, lastUpdate: new Date() });
    } catch (e: any) {
      console.error("Erro ao salvar sessão:", e.message);
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
