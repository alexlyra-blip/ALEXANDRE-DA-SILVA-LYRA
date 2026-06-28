import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizePhone, validateWhatsAppUser, logWhatsAppAttempt } from '@/lib/whatsapp-utils';

// Handler para POST (Recebe mensagens do n8n)
export async function POST(req: NextRequest) {
  try {
    const adminDb = getAdminDb();

    if (!adminDb) {
      return NextResponse.json({ error: 'Internal database error' }, { status: 500 });
    }

    const body = await req.json();
    
    const senderNumber = body.senderNumber;
    const messageText = body.messageText;
    const pushName = body.pushName || body.pushname || '';

    if (!senderNumber || !messageText) {
      return NextResponse.json({ error: 'Faltam parametros obrigatorios: senderNumber e messageText' }, { status: 400 });
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

    if (!auth.authorized) {
      let blockMessage = "Este número não está autorizado para utilizar este atendimento. Solicite o cadastro ou a atualização do número na plataforma.";
      
      if (auth.reason === 'Usuário inativo') {
        blockMessage = "Seu cadastro está inativo no momento. Procure o administrador do sistema.";
      } else if (auth.reason === 'Erro interno de validação') {
        blockMessage = "Não foi possível validar seu acesso neste momento. Tente novamente mais tarde.";
      }

      console.log(`[n8n] WhatsApp Blocked (${auth.reason}) for ${senderNumber}`);
      return NextResponse.json({ status: 'blocked', reason: auth.reason, responseText: blockMessage });
    }

    console.log(`[n8n] WhatsApp message from ${senderNumber} (Authorized as ${auth.user?.name || 'User'}): ${messageText}`);
    // --- FIM DA CAMADA DE AUTORIZAÇÃO ---

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
          // Salva o histórico no arquivo permanente antes de resetar (timeout)
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
          sessionData.history = []; // Reset session
          sessionData.extractedParams = {}; // Wipe parameters so we start completely fresh
          sessionData.status = 'finished';
          console.log(`[n8n] WhatsApp Session for ${senderNumber} timed out after 20 minutes.`);
        }
      }

    if (!sessionData?.history) sessionData = { ...sessionData, history: [], extractedParams: {}, pushName };

    // Generate Protocol Number if not exists or if session was finished
    if (!sessionData.protocolNumber || sessionData.status === 'finished') {
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const randomHex = Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0').toUpperCase();
      sessionData.protocolNumber = `GUTTO-${dateStr}-${randomHex}`;
      sessionData.status = 'active';
      sessionData.history = [];
      sessionData.extractedParams = {};
      sessionData.lastExtractedParams = null;
      sessionData.allOffers = [];
      sessionData.pushName = pushName;
    }

    // 1. Usar o Agente de IA consolidado
    const { processWhatsAppMessage } = await import('@/lib/whatsapp-agent');
    let responseText = await processWhatsAppMessage(messageText, sessionData.history || [], senderNumber, sessionData, auth.user);

    // 2. Atualizar histórico
    const updatedHistory = [
      ...(sessionData.history || []),
      { role: 'user', content: messageText },
      { role: 'model', content: responseText }
    ];

    try {
      if (responseText.includes('[END_SESSION]')) {
        // Salva o histórico no arquivo permanente antes de resetar (end session explicit)
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
        responseText = responseText.replace('[END_SESSION]', '').trim();
      } else {
        await sessionRef.set({ ...sessionData, history: updatedHistory, lastUpdate: now });
      }
    } catch (e: any) {
      console.error("Erro ao salvar sessão (n8n):", e.message);
    }

    // Retorna APENAS o texto processado de volta para o n8n
    // O n8n ficará responsável por conectar na Evolution API e despachar a mensagem.
    return NextResponse.json({ 
      status: 'success',
      responseText: responseText
    });

  } catch (error) {
    console.error("Erro no Webhook do n8n:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
