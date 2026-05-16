import { GoogleGenAI } from "@google/genai";

export const getAI = () => {
  // Debug log to see available env vars
  if (typeof window !== 'undefined') {
      console.log("AI-CONFIG: Keys in process.env:", Object.keys(process.env).filter(k => k.includes('GEMINI')));
  }

  const apiKey = (process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();

  // Validate the key: must start with AIza
  if (!apiKey || !apiKey.startsWith('AIza') || apiKey.length < 20) {
    console.error(`AI CONFIG: Invalid Gemini API key. Prefix: ${apiKey ? apiKey.substring(0, 10) : 'null'}`);
    return { 
        models: { 
            generateContent: () => Promise.reject(new Error("Invalid API Key")) 
        },
        error: "Invalid API Key"
    } as any;
  }

  const ai = new GoogleGenAI({ apiKey });
  (ai as any)._debugApiKey = apiKey;
  return ai;
};
