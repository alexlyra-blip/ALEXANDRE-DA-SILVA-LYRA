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
      where('convenio', '==', convenio)
    );

    const snapshot = await getDocs(q);
    const docs: any[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!bancoCode || data.bancoCode === bancoCode) {
        if (data.date <= todayStr) {
          const val = parseFloat(data.coeficiente);
          if (!isNaN(val) && val > 0) {
            docs.push({ date: data.date, coeficiente: val });
          }
        }
      }
    });

    if (docs.length > 0) {
      docs.sort((a, b) => b.date.localeCompare(a.date));
      const top = docs[0];
      inMemoryCache[`${convenio}_${bancoCode}_current`] = top.coeficiente;
      return top;
    }
  } catch (err) {
    console.warn(`[getLatestCoefficient] Aviso no SDK cliente, tentando API route:`, err);
  }

  try {
    const res = await fetch(`/api/coeficientes?action=latest&convenio=${convenio}&bancoCode=${encodeURIComponent(bancoCode)}&targetDateStr=${todayStr}`);
    const json = await res.json();
    if (res.ok && json.coeficiente) {
      inMemoryCache[`${convenio}_${bancoCode}_current`] = json.coeficiente;
      return { date: json.date || todayStr, coeficiente: json.coeficiente };
    }
  } catch (apiErr) {
    console.error(`[getLatestCoefficient] API route também falhou:`, apiErr);
  }

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
      where('convenio', '==', convenio)
    );

    const snapshot = await getDocs(q);
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!bancoCode || data.bancoCode === bancoCode) {
        if (data.date >= startStr && data.date <= endStr) {
          const val = parseFloat(data.coeficiente);
          if (!isNaN(val)) {
            result[data.date] = val;
          }
        }
      }
    });
    return result;
  } catch (err) {
    console.warn(`[getMonthlyCoefficients] Aviso no SDK cliente, tentando API route:`, err);
  }

  try {
    const res = await fetch(`/api/coeficientes?action=monthly&convenio=${convenio}&bancoCode=${encodeURIComponent(bancoCode)}&year=${year}&month=${month}`);
    const json = await res.json();
    if (res.ok && json.data) {
      return json.data;
    }
  } catch (apiErr) {
    console.error(`[getMonthlyCoefficients] API route também falhou:`, apiErr);
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
  // Tentar via API route primeiro (Admin SDK - ignora regras de segurança do cliente)
  try {
    const res = await fetch('/api/coeficientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ convenio, bancoCode, dateStr, coeficiente, userId })
    });
    const json = await res.json();
    if (res.ok && json.success) {
      inMemoryCache[`${convenio}_${bancoCode}_current`] = coeficiente;
      return;
    }
  } catch (apiErr) {
    console.warn('[saveDailyCoefficient] API route falhou, tentando SDK cliente:', apiErr);
  }

  // Fallback: SDK cliente
  const safeBancoCode = bancoCode.replace(/[\/\\]/g, '-').replace(/\s+/g, '_');
  const docId = `${convenio}_${safeBancoCode}_${dateStr}`;
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
    const q = query(
      collection(db, 'coeficientes_diarios'),
      where('convenio', '==', convenio)
    );
    
    const snapshot = await getDocs(q);
    const docs: any[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.date <= todayStr && data.bancoCode) {
        docs.push({
          banco: data.bancoCode,
          date: data.date,
          coeficiente: parseFloat(data.coeficiente)
        });
      }
    });

    docs.sort((a, b) => b.date.localeCompare(a.date));
    docs.forEach(item => {
      if (item.banco && !result[item.banco] && !isNaN(item.coeficiente) && item.coeficiente > 0) {
        result[item.banco] = item.coeficiente;
      }
    });
    return result;
  } catch (err) {
    console.warn(`[getAllActiveCoefficients] Aviso no SDK cliente, tentando API route:`, err);
  }

  try {
    const res = await fetch(`/api/coeficientes?action=allActive&convenio=${convenio}&targetDateStr=${todayStr}`);
    const json = await res.json();
    if (res.ok && json.data) {
      return json.data;
    }
  } catch (apiErr) {
    console.error(`[getAllActiveCoefficients] API route também falhou:`, apiErr);
  }
  return result;
}
