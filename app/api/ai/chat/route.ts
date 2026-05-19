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
          const data = sessionSnap.data();
          const lastUpdate = data.lastUpdate?.toDate ? data.lastUpdate.toDate() : (data.lastUpdate ? new Date(data.lastUpdate) : null);
          const now = new Date();
          if (lastUpdate && (now.getTime() - lastUpdate.getTime() > 3 * 60 * 1000)) {
            // EXPIRED after 3 minutes! Start fresh
            sessionData = { history: [], extractedParams: {} };
          } else {
            sessionData = data;
          }
        }
      } catch (e) {
        console.error('Error loading session in chat route:', e);
      }
    }

    const reply = await processWhatsAppMessage(message, history || [], phoneFlag, sessionData, userId);

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
