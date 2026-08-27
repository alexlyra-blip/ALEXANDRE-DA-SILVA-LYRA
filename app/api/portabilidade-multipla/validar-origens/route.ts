import { NextResponse } from 'next/server';
import { requireFirebaseUser } from '@/lib/server-auth';
import {
  PortabilidadeMultiplaOrigemError,
  validarOrigensPortabilidadeMultiplaServer,
} from '@/lib/portabilidade-multipla/origin-validation-server';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const candidate = error as {
    status?: number;
    message?: string;
  };

  const status =
    error instanceof PortabilidadeMultiplaOrigemError
      ? error.status
      : Number(candidate?.status) || 500;

  return NextResponse.json(
    {
      error:
        candidate?.message
        || 'Erro ao validar contratos de origem.',
    },
    {
      status:
        status >= 400 && status <= 599
          ? status
          : 500,
    },
  );
}

export async function POST(request: Request) {
  try {
    const authUser = await requireFirebaseUser(request);

    let body: any;

    try {
      body = await request.json();
    } catch {
      throw new PortabilidadeMultiplaOrigemError(
        'JSON da requisição inválido.',
        400,
      );
    }

    const result = await validarOrigensPortabilidadeMultiplaServer(
      {
        cpf: body?.cpf,
        beneficio: body?.beneficio,
        contrato_ids: body?.contrato_ids,
      },
      authUser,
    );

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
