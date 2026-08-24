import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizePhone, validateWhatsAppUser, logWhatsAppAttempt } from '@/lib/whatsapp-utils';

export const dynamic = 'force-dynamic';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'simulador_token_123';
const WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.object !== 'whatsapp_business_account') {
      return new NextResponse('Not Found', { status: 404 });
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') {
      return new NextResponse('OK', { status: 200 });
    }

    const senderNumber = message.from;
    const messageText = message.text.body;

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: 'Internal database error' }, { status: 500 });
    }

    // --- CAMADA DE AUTORIZAÇÃO ---
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

    let replyText = "";

    if (!auth.authorized) {
      let blockMessage = "Este número não está autorizado para utilizar este atendimento. Solicite o cadastro ou a atualização do número na plataforma.";
      
      if (auth.reason === 'Usuário inativo') {
        blockMessage = "Seu cadastro está inativo no momento. Procure o administrador do sistema.";
      } else if (auth.reason === 'Erro interno de validação') {
        blockMessage = "Não foi possível validar seu acesso neste momento. Tente novamente mais tarde.";
      }

      console.log(`[Meta API] WhatsApp Blocked (${auth.reason}) for ${senderNumber}`);
      replyText = blockMessage;
    } else {
      console.log(`[Meta API] WhatsApp message from ${senderNumber} (Authorized as ${auth.user?.name || 'User'}): ${messageText}`);

      const sessionId = senderNumber.replace(/[^a-zA-Z0-9]/g, '_');
      const sessionRef = adminDb.collection('whatsappSessions').doc(sessionId);
      let sessionSnap = await sessionRef.get();
      let sessionData = sessionSnap.exists ? sessionSnap.data() : { history: [] };
      
      // Time out sessions after 20 minutes of inactivity
      const now = new Date();
      if (sessionData?.lastUpdate) {
        const lastUpdateDate = sessionData.lastUpdate.toDate ? sessionData.lastUpdate.toDate() : new Date(sessionData.lastUpdate);
        const diffMinutes = (now.getTime() - lastUpdateDate.getTime()) / (1000 * 60);
        if (diffMinutes > 20 && sessionData.status !== 'finished') {
          if (sessionData.history && sessionData.history.length > 0) {
            await adminDb.collection('whatsappHistory').add({
              phone: senderNumber,
              userId: auth.user?.id || null,
              userName: auth.user?.name || 'User',
              userPhotoURL: auth.user?.avatarUrl || auth.user?.photoUrl || auth.user?.photoURL || null,
              protocolNumber: sessionData.protocolNumber,
              history: sessionData.history,
              createdAt: now,
              status: 'timeout'
            });
          }
          sessionData.history = []; 
          sessionData.extractedParams = {}; 
          sessionData.status = 'finished';
          console.log(`[Meta API] WhatsApp Session for ${senderNumber} timed out after 20 minutes.`);
        }
      }

      if (!sessionData?.history) sessionData = { ...sessionData, history: [], extractedParams: {} };

      if (!sessionData.protocolNumber || sessionData.status === 'finished') {
        const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const randomHex = Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0').toUpperCase();
        sessionData.protocolNumber = `GUTTO-${dateStr}-${randomHex}`;
        sessionData.status = 'active';
        sessionData.history = [];
        sessionData.extractedParams = {};
        sessionData.lastExtractedParams = null;
        sessionData.allOffers = [];
      }

      // 1. Usar o Agente de IA consolidado
      const { processWhatsAppMessage } = await import('@/lib/whatsapp-agent');
      replyText = await processWhatsAppMessage(messageText, sessionData.history || [], senderNumber, sessionData, auth.user);

      // 2. Atualizar histórico
      const updatedHistory = [
        ...(sessionData.history || []),
        { role: 'user', content: messageText },
        { role: 'model', content: replyText }
      ];

      try {
        if (replyText.includes('[END_SESSION]') || replyText.includes('(Atendimento Finalizado)')) {
          await adminDb.collection('whatsappHistory').add({
            phone: senderNumber,
            userId: auth.user?.id || null,
            userName: auth.user?.name || 'User',
            userPhotoURL: auth.user?.avatarUrl || auth.user?.photoUrl || auth.user?.photoURL || null,
            protocolNumber: sessionData.protocolNumber,
            history: updatedHistory,
            createdAt: now,
            status: 'finished'
          });
          await sessionRef.set({ ...sessionData, history: [], lastUpdate: now, status: 'finished' });
          replyText = replyText.replace(/\[END_SESSION\]/g, '(Atendimento Finalizado)').trim();
        } else {
          await sessionRef.set({ ...sessionData, history: updatedHistory, lastUpdate: now });
        }
      } catch (e: any) {
        console.error("Erro ao salvar sessão (Meta API):", e.message);
      }
    }

    // 4. Enviar a resposta via WhatsApp Meta API
    if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
      await fetch(`https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: senderNumber,
          type: 'text',
          text: { body: replyText },
        }),
      });
    } else {
      console.error("[Meta API] WHATSAPP_TOKEN or PHONE_NUMBER_ID is missing!");
    }

    return new NextResponse('OK', { status: 200 });

  } catch (error) {
    console.error("Erro no Webhook da Meta API:", error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
