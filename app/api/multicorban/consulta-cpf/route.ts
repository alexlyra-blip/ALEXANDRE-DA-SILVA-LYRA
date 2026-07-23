import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { parseConsultaResponse } from '@/lib/multicorban';

const MULTICORBAN_API_TOKEN = '1a2286296a40abf27929209193a85155';
const CACHE_DAYS = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cpf, type } = body;

    if (!cpf) {
      return NextResponse.json({ error: 'CPF é obrigatório' }, { status: 400 });
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    const searchType = type === 'siape' ? 'siape' : 'inss';
    const isSiape = searchType === 'siape';
    const docId = `${cleanCpf}_${searchType}`;

    const db = getAdminDb();
    const docRef = db.collection('consultas_multicorban').doc(docId);
    
    // Check Cache
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const cachedData = docSnap.data();
      if (cachedData && cachedData.createdAt) {
        const now = new Date().getTime();
        const diffMs = now - cachedData.createdAt;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays < CACHE_DAYS && cachedData.data) {
          // Verifica se o cache é do formato antigo (já normalizado)
          const isOldCache = Array.isArray(cachedData.data) && cachedData.data.length > 0 && cachedData.data[0].Beneficiario !== undefined;
          
          if (!isOldCache) {
            console.log(`[Cache Hit] Retornando CPF ${cleanCpf} do banco (idade: ${Math.round(diffDays)} dias)`);
            const normalizedCache = parseConsultaResponse(cachedData.data, isSiape);
            if (normalizedCache.length > 0) {
              return NextResponse.json(normalizedCache);
            }
          } else {
            console.log(`[Cache Ignorado] Formato de cache antigo detectado para o CPF ${cleanCpf}. Buscando novo...`);
          }
        } else {
          console.log(`[Cache Expired or Outdated] CPF ${cleanCpf} expirou ou precisa ser re-normalizado. Buscando novo...`);
        }
      }
    }

    // Cache miss or expired, fetch from API
    let url = 'https://api.bancodatahub.com/cpf';
    if (isSiape) {
      url = 'https://api.bancodatahub.com/siape';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': MULTICORBAN_API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cpf: cleanCpf })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("MultiCorban API Error:", errorData);
      return NextResponse.json({ error: 'Falha ao consultar a API da MultiCorban' }, { status: response.status });
    }

    let rawData = await response.json();
    const normalizedData = parseConsultaResponse(rawData, isSiape);

    if (normalizedData.length === 0 && rawData && (rawData.message || rawData.error)) {
      return NextResponse.json({ error: rawData.message || rawData.error || 'Nenhum benefício encontrado' }, { status: 404 });
    }
    
    // Save to Cache
    try {
      await docRef.set({
        cpf: cleanCpf,
        type: searchType,
        createdAt: new Date().getTime(),
        data: rawData
      });
    } catch (dbError) {
      console.error("Erro ao salvar cache no Firestore:", dbError);
    }

    return NextResponse.json(normalizedData);
  } catch (error: any) {
    console.error("MultiCorban CPF Route Error:", error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
