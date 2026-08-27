import { NextResponse } from 'next/server';
import { requireFirebaseUser } from '@/lib/server-auth';
import { PORTABILIDADE_MULTIPLA_API_CONFIG } from '@/lib/portabilidade-multipla';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const candidate = error as { status?: number; message?: string };
  const status = Number(candidate?.status) || 500;

  return NextResponse.json(
    {
      error:
        candidate?.message
        || 'Erro ao carregar configuração da Portabilidade Múltipla.',
    },
    {
      status: status >= 400 && status <= 599 ? status : 500,
    },
  );
}

export async function GET(request: Request) {
  try {
    await requireFirebaseUser(request);

    return NextResponse.json(PORTABILIDADE_MULTIPLA_API_CONFIG, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
