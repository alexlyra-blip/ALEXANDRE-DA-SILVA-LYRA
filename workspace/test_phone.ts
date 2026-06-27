import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

const serviceAccountPath = path.resolve('simulador-pro-e374d-firebase-adminsdk-j6x03-ec541fce3f.json');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')))
    });
}

async function checkPhone() {
    const db = admin.firestore();
    const snap = await db.collection('users').get();
    snap.forEach(doc => {
        const d = doc.data();
        if (d.phone && d.phone.includes('81') && d.phone.includes('3133')) {
            console.log('Found user:', doc.id, 'phone:', d.phone);
        }
    });
}
checkPhone().catch(console.error);
