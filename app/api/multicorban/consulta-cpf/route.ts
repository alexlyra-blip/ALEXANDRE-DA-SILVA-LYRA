import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { parseConsultaResponse } from '@/lib/multicorban';
import {
  cleanCpf,
  consultarCpfMulticorban,
  isValidCpf,
} from '@/lib/multicorban-service';

export const dynamic = 'force-dynamic';

const CACHE_DAYS = 30;

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { error: 'Firebase Admin não inicializado' },
        { status: 500 },
      );
    }

    const snapshot = await db.collection('consultas_multicorban').get();
    const history: any[] = [];
    const now = Date.now();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data?.cpf) return;

      const createdAt = Number(data.createdAt || 0);
      const diffMs = Math.max(0, now - createdAt);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const cacheDaysLeft = Math.max(0, CACHE_DAYS - diffDays);
      const isExpired = diffDays >= CACHE_DAYS;

      let nome = data.nome || 'Cliente';
      let beneficio = data.beneficio || '';

      if (data.data) {
        const normalized = parseConsultaResponse(
          data.data,
          data.type === 'siape',
        );
        if (normalized.length > 0 && normalized[0]?.Beneficiario) {
          nome = normalized[0].Beneficiario.Nome || nome;
          beneficio = normalized[0].Beneficiario.Beneficio || beneficio;
        }
      }

      history.push({
        id: doc.id,
        cpf: data.cpf,
        formattedCpf: data.formattedCpf || data.cpf,
        type: data.type || 'inss',
        nome,
        beneficio,
        createdAt,
        diffDays,
        cacheDaysLeft,
        isExpired,
      });
    });

    history.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({
      success: true,
      history: history.slice(0, 30),
    });
  } catch (error: any) {
    console.error(
      'GET /api/multicorban/consulta-cpf Error:',
      error,
    );
    return NextResponse.json(
      { error: 'Erro ao buscar histórico de consultas' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cpf = cleanCpf(body?.cpf || '');
    const type = body?.type === 'siape' ? 'siape' : 'inss';
    const forceRefresh = body?.forceRefresh === true;

    if (!cpf) {
      return NextResponse.json(
        { error: 'CPF é obrigatório' },
        { status: 400 },
      );
    }

    if (!isValidCpf(cpf)) {
      return NextResponse.json(
        { error: 'CPF inválido' },
        { status: 400 },
      );
    }

    const rawData = await consultarCpfMulticorban(
      cpf,
      type,
      { forceRefresh },
    );
    const normalizedData = parseConsultaResponse(
      rawData,
      type === 'siape',
    );

    if (
      normalizedData.length === 0
      && rawData
      && (rawData.message || rawData.error)
    ) {
      return NextResponse.json(
        {
          error:
            rawData.message
            || rawData.error
            || 'Nenhum benefício encontrado',
        },
        { status: 404 },
      );
    }

    // Mantém os metadados usados pelo histórico atual da main.
    try {
      const db = getAdminDb();
      if (db) {
        const firstBenefit = normalizedData[0]?.Beneficiario;
        await db
          .collection('consultas_multicorban')
          .doc(`${cpf}_${type}`)
          .set(
            {
              cpf,
              formattedCpf: body?.cpf || cpf,
              type,
              nome: firstBenefit?.Nome || 'Cliente',
              beneficio: firstBenefit?.Beneficio || '',
              updatedAtIso: new Date().toISOString(),
            },
            { merge: true },
          );
      }
    } catch (cacheMetadataError) {
      console.error(
        '[Multicorban] Falha ao atualizar metadados do histórico:',
        cacheMetadataError,
      );
    }

    return NextResponse.json(normalizedData);
  } catch (error: any) {
    console.error('MultiCorban CPF Route Error:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno no servidor' },
      {
        status:
          status >= 400 && status <= 599
            ? status
            : 500,
      },
    );
  }
}
