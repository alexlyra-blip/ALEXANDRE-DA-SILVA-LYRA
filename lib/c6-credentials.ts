import crypto from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { C6RefinCredentials } from '@/lib/c6-refin-service';

const COLLECTION = 'bankCredentials';
const PROVIDER = 'c6-consignado';
type CredentialValidationStatus = 'valid' | 'invalid' | 'unknown';

function getEncryptionKey(): Buffer {
  const secret = String(process.env.C6_CREDENTIALS_ENCRYPTION_KEY || '').trim();
  if (secret.length < 24) {
    const error: any = new Error('C6_CREDENTIALS_ENCRYPTION_KEY não configurada ou muito curta no ambiente Firebase');
    error.status = 503;
    throw error;
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function credentialDocId(uid: string): string {
  return `${uid}_${PROVIDER}`;
}

function timestampToIso(value: any): string | undefined {
  if (!value) return undefined;
  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  } catch { return undefined; }
}

export function encryptC6Credentials(credentials: C6RefinCredentials) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const plaintext = JSON.stringify({
    username: String(credentials.username || '').trim(),
    password: String(credentials.password || ''),
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

export function decryptC6Credentials(payload: any): C6RefinCredentials {
  if (!payload?.iv || !payload?.authTag || !payload?.ciphertext) {
    const error: any = new Error('Credencial C6 armazenada em formato inválido');
    error.status = 500;
    throw error;
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', getEncryptionKey(), Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(decrypted);
  return {
    username: String(parsed?.username || '').trim(),
    password: String(parsed?.password || ''),
  };
}

export async function saveUserC6Credentials(uid: string, credentials: C6RefinCredentials): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('Firebase Admin indisponível');
  const username = String(credentials.username || '').trim();
  const password = String(credentials.password || '');
  if (!username || !password) {
    const error: any = new Error('Informe usuário e senha do C6');
    error.status = 400;
    throw error;
  }

  const encrypted = encryptC6Credentials({ username, password });
  await db.collection(COLLECTION).doc(credentialDocId(uid)).set({
    uid,
    provider: PROVIDER,
    usernameHint: username.length <= 4 ? username : `${username.slice(0, 2)}***${username.slice(-2)}`,
    ...encrypted,
    validationStatus: 'valid',
    lastValidationError: null,
    lastValidatedAt: new Date(),
    updatedAt: new Date(),
  }, { merge: true });
}

export async function getUserC6Credentials(uid: string): Promise<C6RefinCredentials | null> {
  const db = getAdminDb();
  if (!db) throw new Error('Firebase Admin indisponível');
  const snap = await db.collection(COLLECTION).doc(credentialDocId(uid)).get();
  if (!snap.exists) return null;
  return decryptC6Credentials(snap.data());
}

export async function markUserC6CredentialValidation(
  uid: string,
  status: CredentialValidationStatus,
  errorMessage?: string,
): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection(COLLECTION).doc(credentialDocId(uid)).set({
    validationStatus: status,
    lastValidationError: errorMessage ? String(errorMessage).slice(0, 500) : null,
    lastValidatedAt: new Date(),
  }, { merge: true });
}

export async function getUserC6CredentialStatus(uid: string): Promise<{
  configured: boolean;
  usernameHint?: string;
  updatedAt?: string;
  lastValidatedAt?: string;
  validationStatus?: CredentialValidationStatus;
  needsUpdate?: boolean;
}> {
  const db = getAdminDb();
  if (!db) throw new Error('Firebase Admin indisponível');
  const snap = await db.collection(COLLECTION).doc(credentialDocId(uid)).get();
  if (!snap.exists) return { configured: false };
  const data = snap.data() || {};
  const validationStatus: CredentialValidationStatus = ['valid', 'invalid'].includes(data.validationStatus)
    ? data.validationStatus : 'unknown';
  return {
    configured: true,
    usernameHint: data.usernameHint || '',
    updatedAt: timestampToIso(data.updatedAt),
    lastValidatedAt: timestampToIso(data.lastValidatedAt),
    validationStatus,
    needsUpdate: validationStatus === 'invalid',
  };
}

export async function deleteUserC6Credentials(uid: string): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('Firebase Admin indisponível');
  await db.collection(COLLECTION).doc(credentialDocId(uid)).delete();
}
