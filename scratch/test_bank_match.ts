import { getAdminDb } from './lib/firebase-admin';

// Replicate checkBankMatch
const BANK_ALIASES: Record<string, string[]> = {
    "121": ["agibank"],
    "079": ["picpay"],
    "336": ["c6"],
    "003": ["amazonia", "bas"],
    "004": ["nordeste", "bnb"],
    "070": ["brb"],
};

function checkBankMatch(ruleBank: string, currentBank: string): boolean {
    if (!ruleBank || !currentBank) return false;
    const rule = ruleBank.trim().toLowerCase();
    const current = currentBank.trim().toLowerCase();
    if (current === rule) return true;

    const ruleCodeMatch = rule.match(/^\d{1,4}/);
    const currentCodeMatch = current.match(/^\d{1,4}/);
    const ruleCode = ruleCodeMatch ? ruleCodeMatch[0].padStart(3, '0') : null;
    const currentCode = currentCodeMatch ? currentCodeMatch[0].padStart(3, '0') : null;

    if (ruleCode && currentCode && ruleCode === currentCode) return true;

    for (const [code, aliases] of Object.entries(BANK_ALIASES)) {
        const ruleHasCode = ruleCode === code || aliases.some(a => rule.includes(a));
        const currentHasCode = currentCode === code || aliases.some(a => current.includes(a));
        if (ruleHasCode && currentHasCode) return true;
    }

    const parts = current.split('-');
    if (parts.length >= 2) {
        const name = parts.slice(1).join('-').trim();
        if (rule.length >= 2 && name.includes(rule)) return true;
    }
    const ruleParts = rule.split('-');
    if (ruleParts.length >= 2) {
        const name = ruleParts.slice(1).join('-').trim();
        if (name.length >= 2 && (current.includes(name) || name.includes(current))) return true;
    }
    return rule.length >= 2 && (current.includes(rule) || rule.includes(current));
}

async function run() {
    const db = getAdminDb();
    if (!db) { console.log("NO DB"); return; }
    
    const snap = await db.collection('bancosPortabilidade').where('active', '==', true).get();
    const cachedBankRules = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log("Total active banks:", cachedBankRules.length);
    const cleanMsg = "facta";
    const matchedBank = cachedBankRules.find((b: any) => checkBankMatch(b.name, cleanMsg));
    
    console.log("Matched bank for 'facta':", matchedBank ? matchedBank.name : "NONE");
    
    console.log("\nTrying 'pan'...");
    const matchedPan = cachedBankRules.find((b: any) => checkBankMatch(b.name, "pan"));
    console.log("Matched bank for 'pan':", matchedPan ? matchedPan.name : "NONE");
}

run().catch(console.error);
