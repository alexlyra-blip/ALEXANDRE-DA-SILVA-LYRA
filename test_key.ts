
const { getAI } = require('./lib/ai-config');
const ai = getAI();
console.log("Debug Key:", (ai as any)._debugApiKey);
