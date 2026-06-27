import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

// Load .env content manually and clean any invalid escape sequences in FIREBASE_SERVICE_ACCOUNT
try {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT\s*=\s*(\{.+)/);
    if (match) {
      let rawJson = match[1].trim();
      
      // Clean typical .env unquoted escaping typos:
      // Replace backslash followed by a space with backslash-n to make the JSON string valid
      rawJson = rawJson.replace(/\\ /g, '\\n');
      
      const serviceAccount = JSON.parse(rawJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin inicializado com sucesso.");
    }
  }
} catch (e) {
  console.error("Erro ao inicializar Firebase Admin:", e);
}

async function main() {
  const db = admin.apps.length > 0 ? admin.firestore() : null;
  if (!db) {
    console.error("Não foi possível inicializar o Firestore.");
    return;
  }

  console.log("--- BUSCANDO REGRAS DE INVALIDEZ NO BANCO DE DADOS ---");
  const snap = await db.collection('bankRules').get();
  const rules = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

  // Filter only banks that have convenio === 'INSS'
  const inssBanks = rules.filter(b => (b.convenio || 'INSS').trim().toUpperCase() === 'INSS');

  if (inssBanks.length === 0) {
    console.log("Nenhum banco configurado para o convênio INSS.");
    return;
  }

  for (const b of inssBanks) {
    console.log(`\n🏦 Banco: ${b.name} (ID: ${b.id})`);
    console.log(`  * Convênio: ${b.convenio || 'INSS'}`);
    console.log(`  * Aceita Invalidez: ${b.acceptsInvalidez !== false ? "SIM" : "NÃO"}`);
    console.log(`  * Idade Mínima Invalidez: ${b.invalidezAgeYears ?? 0} anos`);
    console.log(`  * Aceita acima de 60 anos (Invalidez): ${b.acceptsOver60Invalidez ? "SIM" : "NÃO"}`);
    console.log(`  * Tempo de Benefício Mínimo: ${b.minBenefitTimeYears ?? 0} anos e ${b.minBenefitTimeMonths ?? 0} meses`);
    console.log(`  * Benefícios bloqueados/excluídos: ${JSON.stringify(b.excludedBenefits || [])}`);
    console.log(`  * Idade Geral do Banco: ${b.minAge ?? 0} a ${b.maxAge ?? 0} anos`);
    console.log(`  * Ativo: ${b.isActive !== false ? "SIM" : "NÃO"}`);
  }
}

main().catch(console.error);
