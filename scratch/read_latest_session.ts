import { getAdminDb } from '../lib/firebase-admin.ts';

async function checkSession() {
  const db = getAdminDb();
  // Get all active sessions, sorted by lastUpdate
  const snap = await db.collection('whatsappSessions').orderBy('lastUpdate', 'desc').limit(2).get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log("------------------------");
    console.log("Phone:", doc.id);
    console.log("lastExtractedParams:", JSON.stringify(data.lastExtractedParams, null, 2));
    console.log("extractedParams:", JSON.stringify(data.extractedParams, null, 2));
  });
}
checkSession();
