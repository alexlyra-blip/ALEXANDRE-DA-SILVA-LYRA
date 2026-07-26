import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { parseConsultaResponse } from '@/lib/multicorban';

export const dynamic = 'force-dynamic';

const MULTICORBAN_API_TOKEN = '1a2286296a40abf27929209193a85155';
const CACHE_DAYS = 30; // 30 dias de validade para economizar créditos do MultiCorban

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Firebase Admin não inicializado' }, { status: 500 });
    }

    const snapshot = await db.collection('consultas_multicorban').get();
    const history: any[] = [];
    const now = new Date().getTime();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data && data.cpf) {
        const createdAt = data.createdAt || 0;
        const diffMs = now - createdAt;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const cacheDaysLeft = Math.max(0, CACHE_DAYS - diffDays);
        const isExpired = diffDays >= CACHE_DAYS;

        // Tenta extrair o nome do beneficiário dos dados gravados
        let nome = data.nome || 'Cliente';
        let beneficio = data.beneficio || '';
        if (data.data) {
          const norm = parseConsultaResponse(data.data, data.type === 'siape');
          if (norm.length > 0 && norm[0]?.Beneficiario) {
            nome = norm[0].Beneficiario.Nome || nome;
            beneficio = norm[0].Beneficiario.Beneficio || beneficio;
          }
        }

        history.push({
          id: doc.id,
          cpf: data.cpf,
          formattedCpf: data.formattedCpf || data.cpf,
          type: data.type || 'inss',
          nome,
          beneficio,
          createdAt,
          diffDays,
          cacheDaysLeft,
          isExpired
        });
      }
    });

    // Ordena do mais recente para o mais antigo
    history.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ success: true, history: history.slice(0, 30) });
  } catch (error: any) {
    console.error("GET /api/multicorban/consulta-cpf Error:", error);
    return NextResponse.json({ error: 'Erro ao buscar histórico de consultas' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cpf, type, forceRefresh } = body;

    if (!cpf) {
      return NextResponse.json({ error: 'CPF é obrigatório' }, { status: 400 });
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    const searchType = type === 'siape' ? 'siape' : 'inss';
    const isSiape = searchType === 'siape';
    const docId = `${cleanCpf}_${searchType}`;

    const db = getAdminDb();
    const docRef = db.collection('consultas_multicorban').doc(docId);
    
    // Check Cache (somente se forceRefresh não for explicitamente true)
    if (!forceRefresh) {
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const cachedData = docSnap.data();
        if (cachedData && cachedData.createdAt) {
          const now = new Date().getTime();
          const diffMs = now - cachedData.createdAt;
          const diffDays = diffMs / (1000 * 60 * 60 * 24);

          if (diffDays < CACHE_DAYS && cachedData.data) {
            console.log(`[Cache Hit - Economia de Créditos] Retornando CPF ${cleanCpf} do banco (idade: ${Math.round(diffDays)} dias)`);
            const normalizedCache = parseConsultaResponse(cachedData.data, isSiape);
            if (normalizedCache.length > 0) {
              return NextResponse.json(normalizedCache);
            }
          } else {
            console.log(`[Cache Expirado (>30 dias)] CPF ${cleanCpf} expirou. Realizando nova consulta na API...`);
          }
        }
      }
    } else {
      console.log(`[Consulta Forçada] Ignorando cache para o CPF ${cleanCpf}`);
    }

    // Cache miss or expired or forced, fetch from API
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
    
    // Save to Cache for 30 days
    try {
      const firstBen = normalizedData[0]?.Beneficiario;
      await docRef.set({
        cpf: cleanCpf,
        formattedCpf: cpf,
        type: searchType,
        nome: firstBen?.Nome || 'Cliente',
        beneficio: firstBen?.Beneficio || '',
        createdAt: new Date().getTime(),
        updatedAtIso: new Date().toISOString(),
        data: rawData
      });
    } catch (dbError) {
      console.error("Erro ao salvar cache de 30 dias no Firestore:", dbError);
    }

    return NextResponse.json(normalizedData);
  } catch (error: any) {
    console.error("MultiCorban CPF Route Error:", error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
