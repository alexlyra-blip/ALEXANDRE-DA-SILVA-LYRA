import { NextResponse } from 'next/server';
import { consultarRefinC6, extractC6RefinTables, getFirstAvailableC6Table, isC6Consignado, summarizeC6RefinTable } from '@/lib/c6-refin-service';
import { getUserC6Credentials, markUserC6CredentialValidation } from '@/lib/c6-credentials';
import { requireFirebaseUser } from '@/lib/server-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const body = await request.json();
    const cpf = String(body?.cpf || '').replace(/\D/g, '');
    const bancoCodigo = String(body?.bancoCodigo || '').trim();
    const contrato = String(body?.contrato || '').trim();
    const beneficio = String(body?.beneficio || '').trim();

    if (!isC6Consignado(bancoCodigo, body?.bancoNome || '')) {
      return NextResponse.json({ error: 'Refinanciamento disponível somente para contratos C6 Consignado (626)' }, { status: 400 });
    }

    const credentials = await getUserC6Credentials(user.uid);
    if (!credentials) {
      return NextResponse.json({ error: 'Configure sua credencial C6 na página Consulta CPF antes de consultar o refin.' }, { status: 409 });
    }

    try {
      const data = await consultarRefinC6({
        cpf,
        beneficio,
        contrato,
        bancoCodigo,
        bancoNome: String(body?.bancoNome || ''),
        dataNascimento: String(body?.dataNascimento || ''),
        rendaMensal: Number(body?.rendaMensal || 0),
        valorParcela: Number(body?.valorParcela || 0),
        prazo: body?.prazo ? Number(body.prazo) : undefined,
        credentials,
      });
      await markUserC6CredentialValidation(user.uid, 'valid');
      const allTables = extractC6RefinTables(data)
        .map(table => summarizeC6RefinTable(table))
        .filter(Boolean);
      const firstTable = getFirstAvailableC6Table(data);
      const summary = summarizeC6RefinTable(firstTable);
      const releasedAmount = Number(summary?.valorLiberado || summary?.troco || 0);
      return NextResponse.json({
        success: true,
        hasAvailableTable: !!summary && releasedAmount > 0,
        releasedAmount: releasedAmount > 0 ? releasedAmount : 0,
        summary,
        tables: allTables,
      });
    } catch (error: any) {
      if (error?.code === 'C6_CREDENTIAL_INVALID') {
        await markUserC6CredentialValidation(user.uid, 'invalid', error?.message);
      }
      throw error;
    }
  } catch (error: any) {
    console.error('[C6 Refin] Consulta falhou:', error?.message || error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      {
        error: error?.message || 'Erro interno ao consultar refinanciamento C6',
        code: error?.code,
        details: process.env.NODE_ENV === 'development' ? error?.details : undefined,
      },
      { status: status >= 400 && status <= 599 ? status : 500 },
    );
  }
}
