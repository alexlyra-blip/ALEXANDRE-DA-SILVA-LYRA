import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

const MULTICORBAN_API_TOKEN = '4de9d226b243a2f8903742c8fee73f22';
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
        
        if (diffDays < CACHE_DAYS) {
          console.log(`[Cache Hit] Retornando CPF ${cleanCpf} do banco (idade: ${Math.round(diffDays)} dias)`);
          return NextResponse.json(cachedData.data);
        } else {
          console.log(`[Cache Expired] CPF ${cleanCpf} expirou. Buscando novo...`);
        }
      }
    }

    // Cache miss or expired, fetch from API
    let url = 'https://api.bancodatahub.com/cpf';
    if (searchType === 'siape') {
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

    let data = await response.json();
    
    // Normalize SIAPE data to match INSS structure
    if (searchType === 'siape' && Array.isArray(data)) {
      data = data.map(item => ({
        Beneficiario: {
          Nome: item.Cadastro?.Nome,
          CPF: item.Cadastro?.CPF,
          DataNascimento: item.Cadastro?.DataNascimento,
          NomeMae: item.Cadastro?.NomeMae,
          Beneficio: item.Cadastro?.Matricula,
          Situacao: "Ativo",
          Especie: item.Cadastro?.AmparoLegal || item.Cadastro?.RegimeJuridico,
        },
        DadosBancarios: {
          Banco: item.DadosBancarios?.Banco,
          Agencia: item.DadosBancarios?.Agencia,
          ContaPagto: item.DadosBancarios?.NumConta,
        },
        ResumoFinanceiro: {
          ValorBeneficio: parseFloat(item.ResumoFinanceiro?.Bruto || "0"),
          BaseCalculo: parseFloat(item.ResumoFinanceiro?.ValorLiquido || "0"),
          MargemDisponivelEmprestimo: parseFloat(item.ResumoFinanceiro?.Margem || "0"),
        },
        Telefone: item.Telefone || [],
        Rmc: item.RMC ? { ValorParcela: item.RMC.Margem } : {},
        RCC: item.RCC ? { ValorParcela: item.RCC.Margem } : {},
        Emprestimos: (item.Emprestimos || []).map((emp: any) => ({
          Banco: emp.IdBanco?.toString(),
          NomeBanco: emp.Rubrica,
          Contrato: emp.Contrato,
          ParcelasRestantes: emp.PrazoRestantes?.toString(),
          ValorParcela: emp.Parcela,
          Quitacao: emp.SaldoDevedor,
        }))
      }));
    }
    
    // Save to Cache
    try {
      await docRef.set({
        cpf: cleanCpf,
        type: searchType,
        createdAt: new Date().getTime(),
        data: data
      });
    } catch (dbError) {
      console.error("Erro ao salvar cache no Firestore:", dbError);
      // Não falhar a request se o cache falhar
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("MultiCorban CPF Route Error:", error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
