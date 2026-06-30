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
          } else {
            createdAt = new Date(data.createdAt);
          }
          
          if (!isNaN(createdAt.getTime())) {
            const docDateStr = createdAt.toISOString().split('T')[0];
            
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
            // Invalid date, just push without filtering
            history.push({ id: doc.id, ...data });
          }
        } else {
          // No createdAt field, just push
          history.push({ id: doc.id, ...data });
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
