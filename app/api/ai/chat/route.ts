import { NextResponse } from 'next/server';
import { processWhatsAppMessage } from '@/lib/whatsapp-agent';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { message, history, userId } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let phoneFlag = '';
    let sessionData: any = { history: [] };
    let sessionRef: any = null;
    const db = getAdminDb();

    if (db && userId) {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          phoneFlag = userDoc.data()?.phone || '';
        }
        
        // Load persistent session parameters using userId
        const sessionId = `web_${userId}`;
        sessionRef = db.collection('whatsappSessions').doc(sessionId);
        const sessionSnap = await sessionRef.get();
        if (sessionSnap.exists) {
          sessionData = sessionSnap.data();
        }
      } catch (e) {
        console.error('Error loading session in chat route:', e);
      }
    }

    const reply = await processWhatsAppMessage(message, history || [], phoneFlag, sessionData);

    // Save session back to database to persist extractedParams
    if (sessionRef) {
      try {
        await sessionRef.set({
          ...sessionData,
          lastUpdate: new Date()
        });
      } catch (e) {
        console.error('Error saving session in chat route:', e);
      }
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    try {
      const fs = await import('fs');
      fs.writeFileSync('c:\\Users\\alexa\\SIMULADOR\\chat_error.txt', `[${new Date().toISOString()}] ${error.message}\n${error.stack}`);
    } catch (e) {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
