const BANK_ALIASES = {
    "121": ["agibank"],
    "079": ["picpay"],
    "336": ["c6"],
    "003": ["amazonia", "bas"],
    "004": ["nordeste", "bnb"],
    "070": ["brb"],
};

function checkBankMatch(ruleBank, currentBank) {
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

console.log("Facta S.A vs facta:", checkBankMatch("Facta S.A.", "facta"));
console.log("Banco Facta vs facta:", checkBankMatch("Banco Facta", "facta"));
console.log("FACTA vs facta:", checkBankMatch("FACTA", "facta"));
