import { getAdminDb } from '../lib/firebase-admin';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });
dotenv.config({ path: '../.env' });

async function checkSession() {
  const db = getAdminDb();
  if (!db) {
      console.log("No DB connection");
      return;
  }
  const snap = await db.collection('whatsappSessions').orderBy('lastUpdate', 'desc').limit(2).get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log("------------------------");
    console.log("Phone:", doc.id);
    console.log("Status:", data.status);
    console.log("lastExtractedParams:", JSON.stringify(data.lastExtractedParams, null, 2));
    console.log("extractedParams:", JSON.stringify(data.extractedParams, null, 2));
  });
}
checkSession();
