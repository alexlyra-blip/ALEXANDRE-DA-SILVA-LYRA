import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: 'Internal database error' }, { status: 500 });
    }

    const searchParams = req.nextUrl.searchParams;
    const protocol = searchParams.get('protocol');
    const phone = searchParams.get('phone');
    const dateStr = searchParams.get('date'); // YYYY-MM-DD
    const startDateStr = searchParams.get('startDate'); // YYYY-MM-DD
    const endDateStr = searchParams.get('endDate'); // YYYY-MM-DD
    const isExport = searchParams.get('export') === 'true';
    const limitParam = searchParams.get('limit');
    
    let limit = isExport ? 2000 : 50;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = parsedLimit;
      }
    }

    let query: any = adminDb.collection('whatsappHistory');
    
    // Filtros
    if (protocol) {
      query = query.where('protocolNumber', '==', protocol);
    }
    
    if (phone) {
      // Remover não números
      const cleaned = phone.replace(/\D/g, '');
      query = query.where('phone', '==', cleaned);
    }

    // Ordenação e Limite
    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await query.get();
    
    let history: any[] = [];
    snapshot.forEach((doc: any) => {
      const data = doc.data();
      
      try {
        if (data.createdAt) {
          let createdAt: Date;
          if (data.createdAt.toDate && typeof data.createdAt.toDate === 'function') {
            createdAt = data.createdAt.toDate();
          } else if (data.createdAt._seconds) {
            createdAt = new Date(data.createdAt._seconds * 1000);
          } else {
            createdAt = new Date(data.createdAt);
          }
          
          if (!isNaN(createdAt.getTime())) {
            // Formata a data em pt-BR usando o timezone do Brasil para a filtragem local
            const ptBrFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
            const parts = ptBrFormatter.formatToParts(createdAt);
            const docDateStr = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
            
            // Single date filter
            if (dateStr && docDateStr !== dateStr) {
              return;
            }
            
            // Period filter
            if (startDateStr && docDateStr < startDateStr) return;
            if (endDateStr && docDateStr > endDateStr) return;
            
            history.push({
              id: doc.id,
              ...data,
              createdAt: createdAt.toISOString()
            });
          } else {
            // Invalid date, try to fallback to document creation fallback
            history.push({ id: doc.id, ...data, createdAt: new Date().toISOString() });
          }
        } else {
          // No createdAt field, fallback to now to avoid frontend crash
          history.push({ id: doc.id, ...data, createdAt: new Date().toISOString() });
        }
      } catch (err) {
        console.error(`Erro ao processar doc ${doc.id}:`, err);
        history.push({ id: doc.id, ...data });
      }
    });

    return NextResponse.json({ success: true, data: history });
  } catch (error: any) {
    console.error("Erro ao buscar histórico do whatsapp:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
