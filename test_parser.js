const { parseConsultaResponse } = require('./lib/multicorban');
const payload = require('./payload_utf8.json');
const res = parseConsultaResponse(payload, true);
console.log('CardLoansList:', JSON.stringify(res[0].CardLoansList, null, 2));
