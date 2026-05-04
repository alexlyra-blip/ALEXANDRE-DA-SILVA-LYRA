import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    next_public: process.env.NEXT_PUBLIC_GEMINI_API_KEY?.substring(0, 10),
    gemini: process.env.GEMINI_API_KEY?.substring(0, 10),
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('GEMINI'))
  });
}
