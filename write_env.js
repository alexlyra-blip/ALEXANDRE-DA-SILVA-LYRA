import fs from 'fs';
fs.writeFileSync('.env.local', `NEXT_PUBLIC_GEMINI_API_KEY=${process.env.NEXT_PUBLIC_GEMINI_API_KEY}`);
console.log("Wrote to .env.local:", process.env.NEXT_PUBLIC_GEMINI_API_KEY?.substring(0, 10));
