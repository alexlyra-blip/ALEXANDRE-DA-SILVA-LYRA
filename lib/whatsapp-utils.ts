import { getAdminDb } from './firebase-admin';

/**
 * Normaliza um número de telefone para o formato E.164 sem o sinal de +
 * Ex: "whatsapp:+55 (11) 99999-9999" -> "5511999999999"
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  
  // Remove o prefixo "whatsapp:" se existir
  let cleaned = phone.replace(/^whatsapp:/i, '');
  
  // Remove todos os caracteres não numéricos
  cleaned = cleaned.replace(/\D/g, '');
  
  // Se o número começar com 0, remove o zero inicial
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  return cleaned;
}

export interface AuthResult {
  authorized: boolean;
  user?: any;
  reason?: string;
  error?: string;
}

/**
 * Valida se um telefone pertence a um usuário ativo
 */
export async function validateWhatsAppUser(normalizedPhone: string): Promise<AuthResult> {
  const adminDb = getAdminDb();
  if (!normalizedPhone || normalizedPhone.length < 10) {
    return { authorized: false, reason: 'Telefone inválido ou curto demais' };
  }

  if (!adminDb) {
    return { authorized: false, reason: 'Erro interno: Banco de dados não inicializado' };
  }

  try {
    // Busca na coleção de usuários
    const usersRef = adminDb.collection('users');
    let snapshot = await usersRef.where('phone', '==', normalizedPhone).get();
    
    // Tentativa 2: Variações de formato
    if (snapshot.empty && !normalizedPhone.startsWith('55')) {
      snapshot = await usersRef.where('phone', '==', '55' + normalizedPhone).get();
    }
    
    if (snapshot.empty && normalizedPhone.startsWith('55')) {
      snapshot = await usersRef.where('phone', '==', normalizedPhone.substring(2)).get();
    }

    if (snapshot.empty) {
      console.log(`Usuário não encontrado para o telefone: ${normalizedPhone}`);
      return { authorized: false, reason: 'Número não encontrado' };
    }

    const userData = snapshot.docs[0].data();
    const userId = snapshot.docs[0].id;
    const user = { ...userData, id: userId };

    const isActive = user.status === 'ATIVO' || user.status === 'active' || user.active === true || user.isActive === true || user.status === undefined;
    
    if (!isActive || user.status === 'INATIVO' || user.inactive === true) {
      return { authorized: false, user, reason: 'Usuário inativo' };
    }

    return { authorized: true, user };
  } catch (error: any) {
    console.error('Erro na validação de usuário:', error);
    return { authorized: false, error: error.message, reason: 'Erro interno de validação' };
  }
}

/**
 * Registra log de tentativa de acesso via WhatsApp
 */
export async function logWhatsAppAttempt(params: {
  rawPhone: string;
  normalizedPhone: string;
  message: string;
  authorized: boolean;
  reason?: string;
  userId?: string;
}) {
  const adminDb = getAdminDb();
  if (!adminDb) return;
  
  try {
    await adminDb.collection('whatsappLogs').add({
      ...params,
      timestamp: new Date(),
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao registrar log:', error);
  }
}
