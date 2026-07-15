import { NextResponse } from 'next/server';

const MULTICORBAN_API_TOKEN = '4de9d226b243a2f8903742c8fee73f22';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cpf, type } = body;

    if (!cpf) {
      return NextResponse.json({ error: 'CPF é obrigatório' }, { status: 400 });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    let url = 'https://api.bancodatahub.com/cpf';
    if (type === 'siape') {
      url = 'https://api.bancodatahub.com/siape';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': MULTICORBAN_API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cpf: cleanCpf })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("MultiCorban API Error:", errorData);
      return NextResponse.json({ error: 'Falha ao consultar a API da MultiCorban' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("MultiCorban CPF Route Error:", error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
