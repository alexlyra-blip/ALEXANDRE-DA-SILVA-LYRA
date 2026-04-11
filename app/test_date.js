const { differenceInBusinessDays, addBusinessDays, startOfDay } = require('date-fns');

const today = new Date(2026, 3, 10); // April 10, 2026 (Friday)
const returnDate = new Date(2026, 3, 17); // April 17, 2026 (Friday)

console.log(differenceInBusinessDays(returnDate, today));
