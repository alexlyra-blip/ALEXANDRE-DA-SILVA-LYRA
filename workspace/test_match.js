const BANK_ALIASES = {
    "237": ["bradesco"],
    "341": ["itau", "itaú"],
    "033": ["santander"],
    "001": ["bb", "banco do brasil"],
    "104": ["caixa"],
    "623": ["pan", "banco pan"],
};

function checkBankMatch(ruleName, currentBankName) {
    if (!ruleName || !currentBankName) return false;
    const rule = ruleName.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const current = currentBankName.toLowerCase().replace(/[^\w\s]/g, '').trim();

    if (rule === current) return true;

    const ruleCodeMatch = ruleName.match(/^\d{3}/);
    const currentCodeMatch = currentBankName.match(/^\d{3}/);
    const ruleCode = ruleCodeMatch ? ruleCodeMatch[0] : '';
    const currentCode = currentCodeMatch ? currentCodeMatch[0] : '';

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

console.log('Match?', checkBankMatch('Banco Pan', 'pan'));
