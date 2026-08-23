import { NextResponse } from 'next/server';
import { requireFirebaseUser } from '@/lib/server-auth';
import { getUserC6Credentials, markUserC6CredentialValidation } from '@/lib/c6-credentials';
import { buildInssSimulationContracts, cleanCpf, consultarCpfMulticorban, isValidCpf } from '@/lib/multicorban-service';
import {
  consultarRefinC6,
  getFirstAvailableC6Table,
  isC6Consignado,
  summarizeC6RefinTable,
} from '@/lib/c6-refin-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const body = await request.json();
    const cpf = cleanCpf(body?.cpf || '');
    if (!isValidCpf(cpf)) return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });

    const credentials = await getUserC6Credentials(user.uid);
    if (!credentials) {
      return NextResponse.json({
        success: true,
        configured: false,
        credentialNeedsUpdate: false,
        results: [],
        message: 'Credencial C6 ainda não configurada para este usuário.',
      });
    }

    // A página já consultou o CPF; em geral esta chamada reaproveita o cache do Multicorban.
    const multicorbanData = await consultarCpfMulticorban(cpf, 'inss');
    const contracts = buildInssSimulationContracts(multicorbanData, cpf, 50)
      .filter(item => isC6Consignado(item.bancoCodigo, item.bancoNome));

    const results: any[] = [];
    let credentialNeedsUpdate = false;
    let c6AuthenticationSucceeded = false;

    for (const item of contracts) {
      const key = `${item.beneficio || ''}-${item.contrato || ''}`;
      try {
        const raw = await consultarRefinC6({
          cpf: item.cpf,
          beneficio: item.beneficio,
          contrato: item.contrato,
          bancoCodigo: item.bancoCodigo,
          bancoNome: item.bancoNome,
          dataNascimento: item.dataNascimento,
          rendaMensal: item.rendaMensal,
          valorParcela: item.params.valorParcela,
          credentials,
        });
        c6AuthenticationSucceeded = true;
        const firstTable = getFirstAvailableC6Table(raw);
        const summary = summarizeC6RefinTable(firstTable);
        const releasedAmount = Number(summary?.valorLiberado || summary?.troco || 0);
        results.push({
          key,
          beneficio: item.beneficio,
          contrato: item.contrato,
          bancoCodigo: item.bancoCodigo,
          bancoNome: item.bancoNome,
          success: true,
          // Só considera Refin disponível quando o C6 realmente libera valor ao cliente.
          hasAvailableTable: !!summary && releasedAmount > 0,
          releasedAmount: releasedAmount > 0 ? releasedAmount : 0,
          summary,
        });
      } catch (error: any) {
        console.error(`[C6 Refin Auto] ${key}:`, error?.message || error);
        if (error?.code === 'C6_CREDENTIAL_INVALID') credentialNeedsUpdate = true;
        results.push({
          key,
          beneficio: item.beneficio,
          contrato: item.contrato,
          bancoCodigo: item.bancoCodigo,
          bancoNome: item.bancoNome,
          success: false,
          code: error?.code,
          credentialNeedsUpdate: error?.code === 'C6_CREDENTIAL_INVALID',
          error: error?.message || 'Falha na consulta automática do refin C6',
        });
        if (credentialNeedsUpdate) break;
      }
    }

    if (credentialNeedsUpdate) {
      await markUserC6CredentialValidation(user.uid, 'invalid', 'C6 recusou a credencial durante consulta de refin.');
    } else if (c6AuthenticationSucceeded) {
      await markUserC6CredentialValidation(user.uid, 'valid');
    }

    return NextResponse.json({
      success: true,
      configured: true,
      credentialNeedsUpdate,
      c6Contracts: contracts.length,
      results,
    });
  } catch (error: any) {
    console.error('[C6 Refin Auto] Falha:', error?.message || error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno na consulta automática do refin C6', code: error?.code },
      { status: status >= 400 && status <= 599 ? status : 500 },
    );
  }
}
