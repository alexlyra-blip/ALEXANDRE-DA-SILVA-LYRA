import { NextResponse } from 'next/server';
import { requireFirebaseUser } from '@/lib/server-auth';
import {
  executarPreValidacaoApiPortabilidadeMultipla,
  parsePortabilidadeMultiplaValidarPayload,
  PortabilidadeMultiplaPayloadError,
} from '@/lib/portabilidade-multipla';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const candidate = error as { status?: number; message?: string };

  const status =
    error instanceof PortabilidadeMultiplaPayloadError
      ? 400
      : Number(candidate?.status) || 500;

  return NextResponse.json(
    {
      error:
        candidate?.message
        || 'Erro ao pré-validar Portabilidade Múltipla.',
    },
    {
      status: status >= 400 && status <= 599 ? status : 500,
    },
  );
}

export async function POST(request: Request) {
  try {
    await requireFirebaseUser(request);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new PortabilidadeMultiplaPayloadError(
        'JSON da requisição inválido.',
      );
    }

    const payload = parsePortabilidadeMultiplaValidarPayload(body);
    const result = executarPreValidacaoApiPortabilidadeMultipla(payload);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
