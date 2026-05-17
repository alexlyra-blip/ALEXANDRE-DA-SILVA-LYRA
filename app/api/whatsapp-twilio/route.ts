import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET() {
  let recentLogs = "No logs yet.";
  try {
    const fs = await import('fs');
    if (fs.existsSync('/tmp/webhook_log.txt')) {
      recentLogs = fs.readFileSync('/tmp/webhook_log.txt', 'utf8');
    }
  } catch (e) {}

  return NextResponse.json({ 
    status: 'online', 
    endpoint: 'WhatsApp Webhook (Gutto AI)', 
    action_required: 'Configure Twilio Sandbox with the URL below',
    webhookUrl: 'https://ais-dev-qbeutu5byj7nd5uan6dxkv-261666379945.us-west2.run.app/api/whatsapp-twilio',
    check_your_number: 'If you sent messages and they dont appear in "logs" below, Twilio is NOT calling this URL.',
    timestamp: new Date().toISOString(),
    logs: recentLogs.split('\n').filter(l => l.trim()).slice(-25)
  });
}

export async function POST(req: Request) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] --- WHATSAPP WEBHOOK START ---`);
  
  try {
    let from = '';
    let bodyText = '';

    // Tenta ler como FormData primeiro (padrão Twilio)
    try {
      const formData = await req.formData();
      from = formData.get('From') as string;
      bodyText = (formData.get('Body') as string)?.trim() || '';
    } catch (e) {
      // Fallback para raw text se formData falhar
      const rawBody = await req.text();
      const params = new URLSearchParams(rawBody);
      from = params.get('From') || '';
      bodyText = params.get('Body')?.trim() || '';
    }

    console.log(`[${timestamp}] PARSED: From=${from}, Text=${bodyText}`);

    // Salvando log inicial para debug
    try {
      const fs = await import('fs');
      fs.appendFileSync('/tmp/webhook_log.txt', `\n[${timestamp}] RECEIVED: From=${from} | Body=${bodyText}`);
    } catch (e) {}

    if (!from) {
      console.error(`[${timestamp}] ERROR: Missing From in both FormData and Text`);
      return NextResponse.json({ error: 'Missing From' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      const { getInitializationError } = await import('@/lib/firebase-admin');
      const initErr = getInitializationError() || 'Unknown initialization error';
      console.error(`[${timestamp}] ERROR: Firestore Admin DB not initialized: ${initErr}`);
      
      // Log for persistent debugging
      try {
        const fs = await import('fs');
        fs.appendFileSync('/tmp/webhook_log.txt', `\n[${timestamp}] FATAL ERROR: Firebase initialization failed: ${initErr}`);
      } catch (e) {}

      // Retornar TwiML amigável mesmo em erro, avisando o usuário se possível
      const MessagingResponse = twilio.twiml.MessagingResponse;
      const twiml = new MessagingResponse();
      twiml.message("⚠️ O robô está com problemas técnicos (Erro de Configuração do Firebase). Verifique os logs da aplicação.");
      
      return new NextResponse(twiml.toString(), {
        status: 200,
        headers: { 'Content-Type': 'application/xml' }
      });
    }

    const sessionId = from.replace(/[^a-zA-Z0-9]/g, '_');
    console.log(`[${timestamp}] Session ID: ${sessionId}`);

    const sessionRef = adminDb.collection('whatsappSessions').doc(sessionId);
    let sessionSnap = await sessionRef.get();
    let sessionData = sessionSnap.exists ? sessionSnap.data() : { history: [] };

    // Time out sessions after 5 minutes of inactivity
    const now = new Date();
    if (sessionData?.lastUpdate) {
      const lastUpdateDate = sessionData.lastUpdate.toDate ? sessionData.lastUpdate.toDate() : new Date(sessionData.lastUpdate);
      const diffMinutes = (now.getTime() - lastUpdateDate.getTime()) / (1000 * 60);
      if (diffMinutes > 30) {
        sessionData.history = []; // Reset session
        console.log(`[${timestamp}] WhatsApp Session for ${from} timed out after 5 minutes.`);
      }
    }

    if (!sessionData?.history) sessionData = { ...sessionData, history: [] };

    // New AI Agent Logic
    const { processWhatsAppMessage } = await import('@/lib/whatsapp-agent');
    const reply = await processWhatsAppMessage(bodyText, sessionData.history || [], from, sessionData);
    console.log(`[${timestamp}] AI Reply: ${reply.substring(0, 100)}...`);

    // Update history
    let updatedHistory = [
      ...(sessionData.history || []).slice(-20),
      { role: 'user', content: bodyText },
      { role: 'model', content: reply }
    ];

    const MessagingResponse = twilio.twiml.MessagingResponse;
    const twiml = new MessagingResponse();
    let finalReply = reply;
    let pdfSimId = null;

    // Intercept END_SESSION tag
    if (finalReply.includes('[END_SESSION]')) {
      finalReply = finalReply.replace(/\[END_SESSION\]/g, '').trim();
      updatedHistory = []; // Wipe history on the server
      console.log(`[${timestamp}] [END_SESSION] trigger detected. History wiped.`);
    }

    // Intercept PDF tag
    const pdfMatch = finalReply.match(/\[SEND_PDF:([^\]]+)\]/);
    if (pdfMatch) {
      pdfSimId = pdfMatch[1].trim();
      finalReply = finalReply.replace(/\[SEND_PDF:[^\]]+\]/g, '').trim();
    }

    // Save state
    try {
      await sessionRef.set({ ...sessionData, history: updatedHistory, lastUpdate: now });
      console.log(`[${timestamp}] State saved to Firestore.`);
    } catch (e: any) {
      console.error(`[${timestamp}] Error saving session:`, e.message);
    }

    const msg = twiml.message(finalReply);
    
    if (pdfSimId) {
      const origin = new URL(req.url).origin;
      const pdfUrl = `${origin}/api/pdf?simId=${pdfSimId}`;
      msg.media(pdfUrl);
    }

    const xml = twiml.toString();
    console.log(`[${timestamp}] Returning TwiML XML (length: ${xml.length})`);

    // Log para depuração persistente (opcional, ajuda a ver se o webhook foi chamado)
    try {
      const fs = await import('fs');
      const logMsg = `\n[${timestamp}] FROM: ${from} | MSG: ${bodyText} | REPLY: ${reply.substring(0,20)}...`;
      fs.appendFileSync('/tmp/webhook_log.txt', logMsg);
    } catch (e) {}

    return new NextResponse(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' }
    });

  } catch (error: any) {
    console.error(`[${timestamp}] FATAL WEBHOOK ERROR:`, error);
    try {
      const fs = await import('fs');
      fs.appendFileSync('/tmp/webhook_log.txt', `\n[${timestamp}] FATAL ERROR: ${error.message}`);
    } catch (e) {}
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
