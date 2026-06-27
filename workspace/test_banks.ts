import { calculateOffers } from '../lib/simulation-engine.ts';
import * as fs from 'fs';
const banks = JSON.parse(fs.readFileSync('.backup_banks.json', 'utf8') || '[]');
console.log(calculateOffers({ convenio: 'GOVERNO', estado: 'PB', subConvenio: 'PB', idade: 50, isAnalfabeto: false, bancoAtual: '033', prazoTotal: 84, parcelasRestantes: 60, valorParcela: 420, saldoDevedor: 15000 }, banks, []));

import { getAdminDb } from '../lib/firebase-admin.ts';

async function run() {
  const db = getAdminDb();
  if (!db) {
      console.error("No DB");
      return;
  }
  const snap = await db.collection('bankRules').get();
  const cachedBankRules = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((b: any) => b.isActive !== false);
  console.log("Cached banks:", cachedBankRules.map((b: any) => b.name));

  const cleanMsg = "pan";
  const BANK_ALIASES: Record<string, string[]> = {
    "237": ["bradesco"],
    "341": ["itau", "itaú"],
    "033": ["santander"],
    "001": ["bb", "banco do brasil"],
    "104": ["caixa"],
    "623": ["pan", "banco pan"],
    "041": ["banrisul"],
    "707": ["daycoval"],
    "012": ["inbursa"],
    "069": ["bmg"],
    "935": ["facta"],
    "626": ["c6"],
    "318": ["bmg"],
    "121": ["agibank"],
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

    return rule.length >= 2 && (current.includes(rule) || rule.includes(current));
  }

  const matchedCachedBank = cachedBankRules.find((b: any) => checkBankMatch(b.name, cleanMsg));
  console.log("Matched bank:", matchedCachedBank ? matchedCachedBank.name : "None");
}

run().catch(console.error);
