const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.resolve('simulador-pro-e374d-firebase-adminsdk-j6x03-ec541fce3f.json');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')))
    });
}

async function checkSession() {
    const db = admin.firestore();
    const doc = await db.collection('whatsappSessions').doc('558191283133').get();
    if (doc.exists) {
        const d = doc.data();
        console.log('lastExtractedParams:', JSON.stringify(d.lastExtractedParams));
        console.log('extractedParams:', JSON.stringify(d.extractedParams));
    } else {
        console.log('Session not found.');
    }
}
checkSession().catch(console.error);
