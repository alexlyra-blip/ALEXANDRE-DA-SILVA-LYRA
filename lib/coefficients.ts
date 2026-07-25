import { db } from '@/firebase';
import { doc, setDoc, collection, query, where, orderBy, getDocs, limit, serverTimestamp } from 'firebase/firestore';

export interface CoeficienteDiario {
  convenio: 'INSS' | 'SIAPE';
  bancoCode: string;
  date: string; // YYYY-MM-DD
  coeficiente: number;
  updatedAt?: any;
  updatedBy?: string;
}

export function formatDateStr(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function isWeekend(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const dayOfWeek = d.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Domingo (0) ou Sábado (6)
}

// Memory cache for sync lookups across components
const inMemoryCache: Record<string, number> = {};

/**
 * Busca o coeficiente ativo para o dia informado (ou hoje).
 * Caso não haja coeficiente cadastrado na data atual, busca o do dia anterior mais recente cadastrado.
 */
export async function getLatestCoefficient(convenio: 'INSS' | 'SIAPE', bancoCode: string, targetDateStr?: string): Promise<{ date: string; coeficiente: number }> {
  const todayStr = targetDateStr || formatDateStr();

  try {
    const q = query(
      collection(db, 'coeficientes_diarios'),
      where('convenio', '==', convenio),
      where('bancoCode', '==', bancoCode),
      where('date', '<=', todayStr),
      orderBy('date', 'desc'),
      limit(1)
    );

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      const val = parseFloat(data.coeficiente);
      if (!isNaN(val) && val > 0) {
        inMemoryCache[`${convenio}_${bancoCode}_current`] = val;
        return { date: data.date, coeficiente: val };
      }
    }
  } catch (err) {
    console.warn(`[getLatestCoefficient] Aviso ao buscar coeficiente para ${convenio} - ${bancoCode}:`, err);
  }

  // Coeficiente padrão caso nenhum esteja cadastrado no banco ainda para este banco específico
  const defaultVal = 0.02270;
  inMemoryCache[`${convenio}_${bancoCode}_current`] = defaultVal;
  return { date: todayStr, coeficiente: defaultVal };
}

export function getCachedCoefficientSync(convenio: 'INSS' | 'SIAPE', bancoCode: string): number {
  return inMemoryCache[`${convenio}_${bancoCode}_current`] || 0.02270;
}

export async function getMonthlyCoefficients(convenio: 'INSS' | 'SIAPE', bancoCode: string, year: number, month: number): Promise<Record<string, number>> {
  const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const result: Record<string, number> = {};

  try {
    const q = query(
      collection(db, 'coeficientes_diarios'),
      where('convenio', '==', convenio),
      where('bancoCode', '==', bancoCode),
      where('date', '>=', startStr),
      where('date', '<=', endStr),
      orderBy('date', 'asc')
    );

    const snapshot = await getDocs(q);
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const val = parseFloat(data.coeficiente);
      if (!isNaN(val)) {
        result[data.date] = val;
      }
    });
  } catch (err) {
    console.error(`[getMonthlyCoefficients] Erro ao carregar coeficientes do mês:`, err);
  }

  return result;
}

export async function saveDailyCoefficient(
  convenio: 'INSS' | 'SIAPE',
  bancoCode: string,
  dateStr: string,
  coeficiente: number,
  userId?: string
): Promise<void> {
  const docId = `${convenio}_${bancoCode}_${dateStr}`;
  const docRef = doc(db, 'coeficientes_diarios', docId);

  await setDoc(docRef, {
    convenio,
    bancoCode,
    date: dateStr,
    coeficiente,
    updatedAt: serverTimestamp(),
    updatedBy: userId || 'admin'
  }, { merge: true });

  inMemoryCache[`${convenio}_${bancoCode}_current`] = coeficiente;
}

/**
 * Retorna os coeficientes atuais para todos os bancos cadastrados para um dado convênio.
 * Útil para o assistente Gutto e para popular a tela inicial.
 */
export async function getAllActiveCoefficients(convenio: 'INSS' | 'SIAPE', targetDateStr?: string): Promise<Record<string, number>> {
  const todayStr = targetDateStr || formatDateStr();
  const result: Record<string, number> = {};

  try {
    // Busca todos os coeficientes recentes
    const q = query(
      collection(db, 'coeficientes_diarios'),
      where('convenio', '==', convenio),
      where('date', '<=', todayStr),
      orderBy('date', 'desc')
    );
    
    const snapshot = await getDocs(q);
    // Como pegamos os descendentes, o primeiro que aparecer para cada banco é o mais atual
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const banco = data.bancoCode;
      if (banco && !result[banco]) {
        result[banco] = parseFloat(data.coeficiente);
      }
    });
  } catch (err) {
    console.warn(`[getAllActiveCoefficients] Erro:`, err);
  }
  return result;
}
