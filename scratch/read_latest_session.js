const { getAdminDb } = require('./lib/firebase-admin');

async function checkSession() {
  const db = getAdminDb();
  // Get all active sessions, sorted by lastUpdate
  const snap = await db.collection('whatsappSessions').orderBy('lastUpdate', 'desc').limit(5).get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log("------------------------");
    console.log("Phone:", doc.id);
    console.log("lastExtractedParams:", data.lastExtractedParams);
    console.log("extractedParams:", data.extractedParams);
  });
}
checkSession();
