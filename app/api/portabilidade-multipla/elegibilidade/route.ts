import { NextResponse } from 'next/server';
import { requireFirebaseUser } from '@/lib/server-auth';
import {
  avaliarElegibilidadeBeneficioPortabilidadeMultiplaServer,
  PortabilidadeMultiplaOrigemError,
} from '@/lib/portabilidade-multipla/origin-validation-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const authUser = await requireFirebaseUser(request);
    const body = await request.json().catch(() => null);

    if (!body) {
      throw new PortabilidadeMultiplaOrigemError(
        'JSON da requisição inválido.',
        400,
      );
    }

    const result = await avaliarElegibilidadeBeneficioPortabilidadeMultiplaServer(
      {
        cpf: body?.cpf,
        beneficio: body?.beneficio,
      },
      authUser,
    );

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    const candidate = error as { status?: number; message?: string };
    const status = error instanceof PortabilidadeMultiplaOrigemError
      ? error.status
      : Number(candidate?.status) || 500;

    return NextResponse.json(
      {
        error: candidate?.message || 'Erro ao avaliar elegibilidade FACTA.',
      },
      { status: status >= 400 && status <= 599 ? status : 500 },
    );
  }
}
