import { getAdminAuth } from '@/lib/firebase-admin';

export async function requireFirebaseUser(request: Request): Promise<{ uid: string; email?: string }> {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error: any = new Error('Autenticação obrigatória');
    error.status = 401;
    throw error;
  }

  const auth = getAdminAuth();
  if (!auth) {
    const error: any = new Error('Firebase Auth indisponível');
    error.status = 503;
    throw error;
  }

  try {
    const decoded = await auth.verifyIdToken(match[1]);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    const error: any = new Error('Sessão inválida ou expirada');
    error.status = 401;
    throw error;
  }
}
