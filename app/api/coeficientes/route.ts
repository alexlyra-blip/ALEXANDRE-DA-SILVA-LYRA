import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'latest';
    const convenio = (searchParams.get('convenio') || 'INSS') as 'INSS' | 'SIAPE';
    const bancoCode = searchParams.get('bancoCode') || '';
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const targetDateStr = searchParams.get('targetDateStr');

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const colRef = adminDb.collection('coeficientes_diarios');

    // Single field query to eliminate ALL index requirement errors
    const snapshot = await colRef.where('convenio', '==', convenio).get();

    const allDocs: any[] = [];
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      allDocs.push({
        id: docSnap.id,
        ...d,
        coeficiente: parseFloat(d.coeficiente) || 0
      });
    });

    if (action === 'monthly' && year && month) {
      const y = parseInt(year);
      const m = parseInt(month);
      const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const endStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const filtered = allDocs.filter(d => {
        if (bancoCode && d.bancoCode !== bancoCode) return false;
        return d.date >= startStr && d.date <= endStr;
      });

      const result: Record<string, number> = {};
      filtered.forEach(d => {
        if (!isNaN(d.coeficiente)) {
          result[d.date] = d.coeficiente;
        }
      });

      return NextResponse.json({ success: true, data: result });
    }

    if (action === 'allActive') {
      const todayStr = targetDateStr || new Date().toISOString().split('T')[0];
      const filtered = allDocs.filter(d => d.date <= todayStr);
      filtered.sort((a, b) => b.date.localeCompare(a.date));

      const result: Record<string, number> = {};
      filtered.forEach(d => {
        const banco = d.bancoCode;
        if (banco && !result[banco] && !isNaN(d.coeficiente) && d.coeficiente > 0) {
          result[banco] = d.coeficiente;
        }
      });

      return NextResponse.json({ success: true, data: result });
    }

    // Default: latest
    const todayStr = targetDateStr || new Date().toISOString().split('T')[0];
    const filtered = allDocs.filter(d => d.date <= todayStr && (!bancoCode || d.bancoCode === bancoCode));
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    if (filtered.length > 0) {
      const top = filtered[0];
      if (top.coeficiente > 0) {
        return NextResponse.json({ success: true, date: top.date, coeficiente: top.coeficiente });
      }
    }

    return NextResponse.json({ success: true, date: todayStr, coeficiente: 0.02270 });
  } catch (err: any) {
    console.error('Error in GET /api/coeficientes:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const { convenio, bancoCode, dateStr, coeficiente, userId } = await request.json();

    if (!convenio || !bancoCode || !dateStr || coeficiente === undefined) {
      return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 });
    }

    const safeBancoCode = String(bancoCode).replace(/[\/\\]/g, '-').replace(/\s+/g, '_');
    const docId = `${convenio}_${safeBancoCode}_${dateStr}`;

    await adminDb.collection('coeficientes_diarios').doc(docId).set({
      convenio,
      bancoCode,
      date: dateStr,
      coeficiente: Number(coeficiente),
      updatedAt: new Date(),
      updatedBy: userId || 'admin'
    }, { merge: true });

    return NextResponse.json({ success: true, docId });
  } catch (err: any) {
    console.error('Error in POST /api/coeficientes:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
