import { NextResponse } from 'next/server';
import { requireFirebaseUser } from '@/lib/server-auth';
import {
  deleteUserC6Credentials,
  getUserC6Credentials,
  getUserC6CredentialStatus,
  markUserC6CredentialValidation,
  saveUserC6Credentials,
} from '@/lib/c6-credentials';
import { testarCredencialC6 } from '@/lib/c6-refin-service';

function errorResponse(error: any) {
  const status = Number(error?.status) || 500;
  return NextResponse.json(
    { error: error?.message || 'Erro ao processar credencial C6', code: error?.code },
    { status: status >= 400 && status <= 599 ? status : 500 },
  );
}

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    return NextResponse.json(await getUserC6CredentialStatus(user.uid));
  } catch (error: any) { return errorResponse(error); }
}

/** Valida a nova credencial no C6 antes de substituir a anterior. */
export async function PUT(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const body = await request.json();
    const credentials = {
      username: String(body?.username || '').trim(),
      password: String(body?.password || ''),
    };
    await testarCredencialC6(credentials);
    await saveUserC6Credentials(user.uid, credentials);
    const status = await getUserC6CredentialStatus(user.uid);
    return NextResponse.json({ success: true, validated: true, ...status });
  } catch (error: any) { return errorResponse(error); }
}

/** Revalida a credencial armazenada sem devolver senha ao navegador. */
export async function POST(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const credentials = await getUserC6Credentials(user.uid);
    if (!credentials) return NextResponse.json({ error: 'Credencial C6 ainda não configurada.' }, { status: 404 });
    try {
      const test = await testarCredencialC6(credentials);
      await markUserC6CredentialValidation(user.uid, 'valid');
      const status = await getUserC6CredentialStatus(user.uid);
      return NextResponse.json({ success: true, ...test, ...status });
    } catch (error: any) {
      if (error?.code === 'C6_CREDENTIAL_INVALID') {
        await markUserC6CredentialValidation(user.uid, 'invalid', error?.message);
      }
      throw error;
    }
  } catch (error: any) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    await deleteUserC6Credentials(user.uid);
    return NextResponse.json({ success: true, configured: false });
  } catch (error: any) { return errorResponse(error); }
}
