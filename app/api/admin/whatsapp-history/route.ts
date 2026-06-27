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
    const limitParam = searchParams.get('limit');
    
    let limit = 50;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 200) {
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
      
      // Filtrar por data na memória se fornecido (pois query de data + igualdade em outros campos pode pedir index composto)
      if (dateStr && data.createdAt) {
        const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        const docDateStr = createdAt.toISOString().split('T')[0];
        if (docDateStr !== dateStr) {
          return;
        }
      }
      
      history.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
      });
    });

    return NextResponse.json({ success: true, data: history });
  } catch (error: any) {
    console.error("Erro ao buscar histórico do whatsapp:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
