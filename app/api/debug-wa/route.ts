import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const adminDb = getAdminDb();
  const diagnostics = {
    env: {
      WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN ? 'DEFINIDO (OK)' : 'NÃO DEFINIDO (FALTA)',
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'DEFINIDO (OK)' : 'NÃO DEFINIDO (FALTA)',
      FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT ? 'DEFINIDO (OK)' : 'NÃO DEFINIDO (FALTA)',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'DEFINIDO (OK)' : 'NÃO DEFINIDO (FALTA)',
    },
    firebase: {
      initialized: !!adminDb,
      databaseUrl: process.env.FIREBASE_DATABASE_URL || 'Padrão',
    }
  };

  let status = 200;
  if (!adminDb || !process.env.WHATSAPP_API_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    status = 500;
  }

  return NextResponse.json(diagnostics, { status });
}
