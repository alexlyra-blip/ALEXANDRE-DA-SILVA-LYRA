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

    // Attempt to get phone from userId if provided
    let phoneFlag = '';
    if (userId) {
      const db = getAdminDb();
      if (db) {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          phoneFlag = userDoc.data()?.phone || '';
        }
      }
    }

    const reply = await processWhatsAppMessage(message, history || [], phoneFlag);

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
