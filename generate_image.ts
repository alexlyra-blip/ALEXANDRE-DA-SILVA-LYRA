import { GoogleGenAI } from "@google/genai";

async function generateLoginImage() {
  const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: "A high-quality, professional banner for a financial portability service called 'Portabilidade PRO'. The image features a modern, professional woman in a business suit using a futuristic, glowing transparent digital tablet. The background is a vibrant, high-contrast night cityscape with glowing lights and data network lines connecting points in the sky. The overall color palette should be rich and vibrant, with deep blues, bright oranges, and crisp whites. The text 'Portabilidade PRO' should be prominent in a modern, bold font, with a sleek orange arrow pointing upwards. The slogan 'Seu Processo sem barreiras.' should be visible. The image should feel high-tech, secure, and efficient. High resolution, 16:9 aspect ratio. The colors should be very visible and vibrant.",
        },
      ],
    },
    config: {
      imageConfig: {
            aspectRatio: "16:9",
            imageSize: "1K"
        },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      console.log("IMAGE_DATA_START");
      console.log(part.inlineData.data);
      console.log("IMAGE_DATA_END");
    }
  }
}

generateLoginImage();
