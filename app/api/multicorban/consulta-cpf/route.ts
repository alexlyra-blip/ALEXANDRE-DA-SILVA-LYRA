import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { parseConsultaResponse } from '@/lib/multicorban';
import {
  cleanCpf,
  consultarCpfMulticorban,
  consultarBeneficioMulticorban,
  isValidCpf,
} from '@/lib/multicorban-service';

export const dynamic = 'force-dynamic';

const CACHE_DAYS = 30;


function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function getRawBenefitArray(rawData: any): any[] {
  if (Array.isArray(rawData)) return rawData;
  if (Array.isArray(rawData?.beneficios)) return rawData.beneficios;
  if (Array.isArray(rawData?.value)) return rawData.value;
  return rawData ? [rawData] : [];
}


function toPositiveInt(value: any): number {
  const parsed = Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseApiDate(value: any): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  match = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (match) {
    return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  }

  match = raw.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  }

  match = raw.match(/^(\d{2})[\/-](\d{4})$/);
  if (match) {
    return new Date(Date.UTC(Number(match[2]), Number(match[1]) - 1, 1));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addUtcMonths(base: Date, months: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1));
}

function getFirstValue(...values: any[]): any {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return '';
}

function getFirstPositiveNumber(...values: any[]): number {
  for (const value of values) {
    if (value === null || value === undefined || String(value).trim() === '') continue;
    const parsed = Number(String(value).replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function preserveMulticorbanContractDates(rawData: any, normalizedData: any[]): any[] {
  const rawBenefits = getRawBenefitArray(rawData);

  return normalizedData.map((normalizedBenefit: any, benefitIndex: number) => {
    const normalizedNb = String(normalizedBenefit?.Beneficiario?.Beneficio || '').replace(/\D/g, '');
    const rawBenefit = rawBenefits.find((candidate: any) => {
      const rawNb = String(candidate?.Beneficiario?.Beneficio || '').replace(/\D/g, '');
      return normalizedNb && rawNb && normalizedNb === rawNb;
    }) || rawBenefits[benefitIndex];

    if (!rawBenefit) return normalizedBenefit;

    const rawLoans = asArray(rawBenefit?.Emprestimos);
    const normalizedLoans = asArray(normalizedBenefit?.Emprestimos);

    const enrichedLoans = normalizedLoans.map((loan: any, loanIndex: number) => {
      const contract = String(loan?.Contrato || loan?.contrato || '').trim();
      const rawLoan = rawLoans.find((candidate: any) =>
        String(candidate?.Contrato || candidate?.contrato || '').trim() === contract,
      ) || rawLoans[loanIndex];

      if (!rawLoan) return loan;

      const dataAverbacao = getFirstValue(
        loan?.DataAverbacao,
        rawLoan?.DataAverbacao,
        rawLoan?.data_averbacao,
        rawLoan?.DtAverbacao,
        rawLoan?.DataAverbacaoContrato,
        rawLoan?.DataAverbacaoEmprestimo,
      );

      const inicioApi = getFirstValue(
        loan?.InicioDesconto,
        rawLoan?.InicioDesconto,
        rawLoan?.inicio_desconto,
        rawLoan?.DataInicioDesconto,
        rawLoan?.data_inicio_desconto,
        rawLoan?.DataPrimeiroDesconto,
        rawLoan?.PrimeiroDesconto,
      );

      const finalApi = getFirstValue(
        loan?.FinalDesconto,
        rawLoan?.FinalDesconto,
        rawLoan?.FimDesconto,
        rawLoan?.final_desconto,
        rawLoan?.DataFinalDesconto,
        rawLoan?.DataFimDesconto,
        rawLoan?.data_fim_desconto,
        rawLoan?.DataUltimoDesconto,
        rawLoan?.UltimoDesconto,
      );

      const prazoTotal = toPositiveInt(
        rawLoan?.Prazo || rawLoan?.PrazoTotal || loan?.Prazo || loan?.PrazoTotal,
      );
      const parcelasRestantes = toPositiveInt(
        rawLoan?.ParcelasRestantes
          || rawLoan?.PrazoRestantes
          || rawLoan?.prazo_restante
          || loan?.ParcelasRestantes
          || loan?.prazo_restante,
      );
      const saldoDevedor = getFirstPositiveNumber(
        rawLoan?.SaldoDevedor,
        rawLoan?.saldo,
        loan?.SaldoDevedor,
        loan?.saldo,
      );
      // Valor do contrato deve vir dos campos de valor original da MultiCorban.
      const valorContrato = getFirstPositiveNumber(
        rawLoan?.ValorContrato,
        rawLoan?.valor_contrato,
        rawLoan?.ValorEmprestado,
        rawLoan?.valorEmprestado,
        rawLoan?.ValorFinanciado,
        rawLoan?.ValorOriginal,
        rawLoan?.ValorLiberado,
        rawLoan?.Vl_Emprestimo,
        loan?.ValorEmprestado,
        loan?.ValorFinanciado,
        loan?.ValorLiberado,
      );

      let inicioDesconto = String(inicioApi || '').trim();
      let finalDesconto = String(finalApi || '').trim();
      let inicioCalculado = false;
      let finalCalculado = false;

      if (!inicioDesconto && dataAverbacao) {
        const averbacao = parseApiDate(dataAverbacao);
        if (averbacao) {
          inicioDesconto = formatIsoDate(addUtcMonths(averbacao, 1));
          inicioCalculado = true;
        }
      }

      if (!finalDesconto && inicioDesconto && prazoTotal > 0) {
        const inicio = parseApiDate(inicioDesconto);
        if (inicio) {
          finalDesconto = formatIsoDate(addUtcMonths(inicio, prazoTotal - 1));
          finalCalculado = true;
        }
      }

      if (!inicioDesconto && finalDesconto && prazoTotal > 0) {
        const final = parseApiDate(finalDesconto);
        if (final) {
          inicioDesconto = formatIsoDate(addUtcMonths(final, -(prazoTotal - 1)));
          inicioCalculado = true;
        }
      }

      return {
        ...loan,
        Prazo: prazoTotal || loan?.Prazo || rawLoan?.Prazo || 0,
        ParcelasRestantes: parcelasRestantes || loan?.ParcelasRestantes || rawLoan?.ParcelasRestantes || 0,
        SaldoDevedor: saldoDevedor || loan?.SaldoDevedor || rawLoan?.SaldoDevedor || 0,
        ValorContrato: valorContrato,
        DataAverbacao: dataAverbacao || '',
        InicioDesconto: inicioDesconto,
        FinalDesconto: finalDesconto,
        InicioDescontoCalculado: inicioCalculado,
        FinalDescontoCalculado: finalCalculado,
      };
    });

    return {
      ...normalizedBenefit,
      Emprestimos: enrichedLoans,
    };
  });
}

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { error: 'Firebase Admin não inicializado' },
        { status: 500 },
      );
    }

    const snapshot = await db.collection('consultas_multicorban').get();
    const history: any[] = [];
    const now = Date.now();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data?.cpf && !data?.beneficio) return;

      const createdAt = Number(data.createdAt || 0);
      const diffMs = Math.max(0, now - createdAt);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const cacheDaysLeft = Math.max(0, CACHE_DAYS - diffDays);
      const isExpired = diffDays >= CACHE_DAYS;

      let nome = data.nome || 'Cliente';
      let beneficio = data.beneficio || '';
      let cpf = data.cpf || '';
      let searchMode: 'cpf' | 'beneficio' = data.searchMode || (doc.id.startsWith('ben_') ? 'beneficio' : 'cpf');

      if (data.data) {
        const normalized = parseConsultaResponse(
          data.data,
          data.type === 'siape',
        );
        if (normalized.length > 0 && normalized[0]?.Beneficiario) {
          nome = normalized[0].Beneficiario.Nome || nome;
          beneficio = normalized[0].Beneficiario.Beneficio || beneficio;
          if (!cpf) cpf = normalized[0].Beneficiario.CPF || '';
        }
      }

      history.push({
        id: doc.id,
        cpf,
        formattedCpf: data.formattedCpf || cpf,
        searchMode,
        type: data.type || 'inss',
        nome,
        beneficio,
        createdAt,
        diffDays,
        cacheDaysLeft,
        isExpired,
      });
    });

    history.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({
      success: true,
      history: history.slice(0, 30),
    });
  } catch (error: any) {
    console.error(
      'GET /api/multicorban/consulta-cpf Error:',
      error,
    );
    return NextResponse.json(
      { error: 'Erro ao buscar histórico de consultas' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const searchMode: 'cpf' | 'beneficio' = body?.searchMode === 'beneficio' ? 'beneficio' : 'cpf';
    const type = body?.type === 'siape' ? 'siape' : 'inss';
    const forceRefresh = body?.forceRefresh === true;

    let rawData: any;
    const rawCpf = cleanCpf(body?.cpf || '');
    const rawBeneficio = String(body?.beneficio || '').replace(/\D/g, '');

    // Consulta por Benefício
    if (searchMode === 'beneficio' || (!rawCpf && rawBeneficio) || (rawCpf.length === 10 && !isValidCpf(rawCpf))) {
      const ben = rawBeneficio || rawCpf;
      if (!ben || ben.length < 5) {
        return NextResponse.json(
          { error: 'Número de benefício é obrigatório e deve ter 10 dígitos' },
          { status: 400 },
        );
      }
      rawData = await consultarBeneficioMulticorban(ben, type, { forceRefresh });
    } else {
      // Consulta por CPF
      if (!rawCpf) {
        return NextResponse.json(
          { error: 'CPF é obrigatório' },
          { status: 400 },
        );
      }

      if (!isValidCpf(rawCpf)) {
        return NextResponse.json(
          { error: 'CPF inválido' },
          { status: 400 },
        );
      }

      rawData = await consultarCpfMulticorban(
        rawCpf,
        type,
        { forceRefresh },
      );
    }

    let normalizedData = parseConsultaResponse(
      rawData,
      type === 'siape',
    );

    if (type === 'inss' && Array.isArray(normalizedData)) {
      normalizedData = preserveMulticorbanContractDates(
        rawData,
        normalizedData,
      );
    }

    if (
      normalizedData.length === 0
      && rawData
      && (rawData.message || rawData.error)
    ) {
      return NextResponse.json(
        {
          error:
            rawData.message
            || rawData.error
            || 'Nenhum benefício encontrado',
        },
        { status: 404 },
      );
    }

    // Salva metadados do histórico
    try {
      const db = getAdminDb();
      if (db) {
        const firstBenefit = normalizedData[0]?.Beneficiario;
        const resolvedCpf = firstBenefit?.CPF ? cleanCpf(firstBenefit.CPF) : rawCpf;
        const resolvedBeneficio = firstBenefit?.Beneficio ? String(firstBenefit.Beneficio).replace(/\D/g, '') : rawBeneficio;
        const docKey = searchMode === 'beneficio'
          ? `ben_${rawBeneficio || resolvedBeneficio}_${type}`
          : `${resolvedCpf || rawCpf}_${type}`;

        await db
          .collection('consultas_multicorban')
          .doc(docKey)
          .set(
            {
              cpf: resolvedCpf || rawCpf,
              formattedCpf: firstBenefit?.CPF || body?.cpf || rawCpf,
              beneficio: resolvedBeneficio || firstBenefit?.Beneficio || '',
              searchMode,
              type,
              nome: firstBenefit?.Nome || 'Cliente',
              updatedAtIso: new Date().toISOString(),
            },
            { merge: true },
          );
      }
    } catch (cacheMetadataError) {
      console.error(
        '[Multicorban] Falha ao atualizar metadados do histórico:',
        cacheMetadataError,
      );
    }

    return NextResponse.json(normalizedData);
  } catch (error: any) {
    console.error('MultiCorban CPF/Beneficio Route Error:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno no servidor' },
      {
        status:
          status >= 400 && status <= 599
            ? status
            : 500,
      },
    );
  }
}
