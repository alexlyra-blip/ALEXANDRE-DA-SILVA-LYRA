import { NextResponse } from 'next/server';

const MULTICORBAN_API_TOKEN = '4de9d226b243a2f8903742c8fee73f22';

export async function GET() {
  try {
    const response = await fetch('https://api.bancodatahub.com/saldoApi', {
      method: 'POST',
      headers: {
        'Authorization': MULTICORBAN_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("MultiCorban Saldo API Error:", errorData);
      return NextResponse.json({ error: 'Falha ao consultar saldo da MultiCorban', details: errorData }, { status: response.status });
    }

    const textData = await response.text();
    let data;
    try {
      data = JSON.parse(textData);
    } catch (e) {
      // If the response is not JSON (e.g. "Licença da empresa expirou")
      return NextResponse.json({ message: textData, raw: true });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("MultiCorban Saldo Route Error:", error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
