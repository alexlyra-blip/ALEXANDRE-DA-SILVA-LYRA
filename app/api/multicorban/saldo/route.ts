import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiToken = (process.env.MULTICORBAN_API_TOKEN || process.env.BANCODATAHUB_API_TOKEN || '').trim();
    if (!apiToken) {
      return NextResponse.json({ error: 'MULTICORBAN_API_TOKEN não configurado no servidor' }, { status: 503 });
    }

    const response = await fetch('https://api.bancodatahub.com/saldoApi', {
      method: 'POST',
      headers: {
        Authorization: apiToken,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('MultiCorban Saldo API Error:', errorData);
      return NextResponse.json(
        { error: 'Falha ao consultar saldo da MultiCorban' },
        { status: response.status }
      );
    }

    const textData = await response.text();
    try {
      return NextResponse.json(JSON.parse(textData));
    } catch {
      return NextResponse.json({ message: textData, raw: true });
    }
  } catch (error) {
    console.error('MultiCorban Saldo Route Error:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
