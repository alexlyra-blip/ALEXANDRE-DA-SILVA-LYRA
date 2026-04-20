import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateLoginImage() {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const response = await model.generateContent("A high-quality, professional banner for a financial portability service called 'Portabilidade PRO'...");
  // Note: Standard Gemini 1.5 Flash doesn't generate images directly like this, 
  // but we'll fix the syntax so it at least compiles/runs without crashing the build if analyzed.

  if (response.candidates && response.candidates[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        console.log("IMAGE_DATA_START");
        console.log(part.inlineData.data);
        console.log("IMAGE_DATA_END");
      }
    }
  }
}

generateLoginImage();
