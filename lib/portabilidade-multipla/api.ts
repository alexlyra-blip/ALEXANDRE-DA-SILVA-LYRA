import type { PortabilidadeMultiplaContrato } from './types';
import {
  PORTABILIDADE_MULTIPLA_GRUPOS,
  PORTABILIDADE_MULTIPLA_MIN_CONTRATOS,
  PORTABILIDADE_MULTIPLA_MAX_CONTRATOS,
  type PortabilidadeMultiplaBloqueio,
} from './rules';
import {
  PORTABILIDADE_MULTIPLA_ADICIONAL_VIABILIDADE,
  PORTABILIDADE_MULTIPLA_PARCELA_MINIMA_REFIN,
  PORTABILIDADE_MULTIPLA_VALOR_MINIMO_CONTRATO_REFIN,
  validarPreviamentePortabilidadeMultipla,
  type PortabilidadeMultiplaPreValidacaoCompleta,
} from './financial';

export const PORTABILIDADE_MULTIPLA_API_CONFIG = {
  banco_destino: 'FACTA',
  convenio: 'INSS',
  min_contratos: PORTABILIDADE_MULTIPLA_MIN_CONTRATOS,
  max_contratos: PORTABILIDADE_MULTIPLA_MAX_CONTRATOS,
  adicional_viabilidade: PORTABILIDADE_MULTIPLA_ADICIONAL_VIABILIDADE,
  parcela_minima_refin: PORTABILIDADE_MULTIPLA_PARCELA_MINIMA_REFIN,
  valor_minimo_contrato_refin:
    PORTABILIDADE_MULTIPLA_VALOR_MINIMO_CONTRATO_REFIN,
  regra_valor_minimo_contrato_refin:
    'saldo_total_portado + valor_liberado_nova_oferta',
  validacao_valor_minimo_contrato_refin: 'na_oferta',
  grupos: {
    A: [...PORTABILIDADE_MULTIPLA_GRUPOS.A],
    B: [...PORTABILIDADE_MULTIPLA_GRUPOS.B],
  },
  regra_outros_bancos: 'GRUPO_C_BLOQUEADO',
} as const;

export interface PortabilidadeMultiplaValidarPayload {
  cpf: string;
  beneficio?: string;
  margem_livre: number;
  contratos: PortabilidadeMultiplaContrato[];
}

export interface PortabilidadeMultiplaValidarResponse
  extends PortabilidadeMultiplaPreValidacaoCompleta {
  cpf_valido: boolean;
  beneficio_solicitado: string | null;
}

export class PortabilidadeMultiplaPayloadError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'PortabilidadeMultiplaPayloadError';
  }
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function finiteNumber(value: unknown, fieldName: string): number {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    throw new PortabilidadeMultiplaPayloadError(
      `${fieldName} precisa ser numérico.`,
    );
  }

  const raw = text(value);

  if (!raw) {
    throw new PortabilidadeMultiplaPayloadError(
      `${fieldName} é obrigatório.`,
    );
  }

  const cleaned = raw
    .replace(/[R$\s%]/gi, '')
    .replace(/[^\d,.-]/g, '');

  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new PortabilidadeMultiplaPayloadError(
      `${fieldName} precisa ser numérico.`,
    );
  }

  return parsed;
}

function optionalFiniteNumber(value: unknown): number {
  if (value === null || value === undefined || text(value) === '') return 0;

  try {
    return finiteNumber(value, 'valor');
  } catch {
    return 0;
  }
}

function nullablePositiveMoney(value: unknown): number | null {
  if (value === null || value === undefined || text(value) === '') return null;

  const parsed = optionalFiniteNumber(value);
  return parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Math.trunc(optionalFiniteNumber(value));
  return parsed > 0 ? parsed : 0;
}

export function normalizeCpfPortabilidadeMultipla(value: unknown): string {
  return text(value).replace(/\D/g, '').slice(0, 11);
}

export function isValidCpfPortabilidadeMultipla(value: unknown): boolean {
  const cpf = normalizeCpfPortabilidadeMultipla(value);

  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number): number => {
    let sum = 0;

    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }

    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return (
    calculateDigit(9) === Number(cpf[9])
    && calculateDigit(10) === Number(cpf[10])
  );
}

/**
 * A API aceita somente o contrato JA NORMALIZADO.
 * Nomes de campos de provider (QUITACAOATUAL, ValorLiberado etc.)
 * ficam restritos ao normalizador da Fase 1A.
 */
export function parseContratoNormalizadoDaApi(
  raw: unknown,
  index: number,
): PortabilidadeMultiplaContrato {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PortabilidadeMultiplaPayloadError(
      `Contrato ${index + 1} inválido.`,
    );
  }

  const item = raw as Record<string, unknown>;
  const beneficio = text(item.beneficio);
  const contrato = text(item.contrato);

  return {
    id: text(item.id) || `${beneficio || 'SEM-NB'}:${contrato || index + 1}`,
    beneficio,
    banco: text(item.banco),
    codigo_banco: text(item.codigo_banco),
    contrato,
    parcela: optionalFiniteNumber(item.parcela),
    saldo_devedor: nullablePositiveMoney(item.saldo_devedor),
    quitacao: nullablePositiveMoney(item.quitacao),
    taxa: optionalFiniteNumber(item.taxa),
    prazo: nonNegativeInteger(item.prazo),
    prazo_restante: nonNegativeInteger(item.prazo_restante),
    parcelas_pagas: nonNegativeInteger(item.parcelas_pagas),
    valor_contrato: nullablePositiveMoney(item.valor_contrato),
    valor_liberado: nullablePositiveMoney(item.valor_liberado),
    data_averbacao: text(item.data_averbacao),
    situacao: text(item.situacao) || 'ATIVO',
  };
}

export function parsePortabilidadeMultiplaValidarPayload(
  body: unknown,
): PortabilidadeMultiplaValidarPayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new PortabilidadeMultiplaPayloadError(
      'Corpo da requisição inválido.',
    );
  }

  const payload = body as Record<string, unknown>;

  if (!Array.isArray(payload.contratos)) {
    throw new PortabilidadeMultiplaPayloadError(
      'contratos precisa ser uma lista.',
    );
  }

  return {
    cpf: normalizeCpfPortabilidadeMultipla(payload.cpf),
    beneficio: text(payload.beneficio) || undefined,
    margem_livre: finiteNumber(payload.margem_livre, 'margem_livre'),
    contratos: payload.contratos.map(
      (contrato, index) => parseContratoNormalizadoDaApi(contrato, index),
    ),
  };
}

function appendUniqueBlock(
  bloqueios: PortabilidadeMultiplaBloqueio[],
  block: PortabilidadeMultiplaBloqueio,
): void {
  const exists = bloqueios.some(existing => (
    existing.codigo === block.codigo
    && (existing.contrato_id || '') === (block.contrato_id || '')
    && (existing.beneficio || '') === (block.beneficio || '')
  ));

  if (!exists) bloqueios.push(block);
}

/**
 * Fonte de verdade da pre-validacao exposta pela API.
 *
 * Totais enviados pelo navegador nao participam do calculo.
 * soma_parcelas, saldo_total, margem_negativa e parcela_refin
 * sao sempre recalculados a partir dos contratos + margem_livre.
 */
export function executarPreValidacaoApiPortabilidadeMultipla(
  payload: PortabilidadeMultiplaValidarPayload,
): PortabilidadeMultiplaValidarResponse {
  const result = validarPreviamentePortabilidadeMultipla(
    payload.contratos,
    payload.margem_livre,
  );

  const bloqueios = [...result.bloqueios];
  const cpfValido = isValidCpfPortabilidadeMultipla(payload.cpf);

  if (!cpfValido) {
    appendUniqueBlock(bloqueios, {
      codigo: 'CPF_INVALIDO',
      mensagem: 'CPF inválido.',
    });
  }

  const beneficioSolicitado = text(payload.beneficio) || null;

  if (beneficioSolicitado) {
    const contratoDivergente = payload.contratos.find(
      contrato => text(contrato.beneficio) !== beneficioSolicitado,
    );

    if (contratoDivergente) {
      appendUniqueBlock(bloqueios, {
        codigo: 'NB_DIFERENTE',
        mensagem:
          'Os contratos selecionados precisam pertencer ao benefício/NB informado para a operação.',
        contrato_id: contratoDivergente.id,
        banco: contratoDivergente.banco,
        beneficio: contratoDivergente.beneficio,
      });
    }
  }

  return {
    ...result,
    cpf_valido: cpfValido,
    beneficio_solicitado: beneficioSolicitado,
    bloqueios,
    elegivel_previo:
      payload.contratos.length >= PORTABILIDADE_MULTIPLA_MIN_CONTRATOS
      && bloqueios.length === 0,
  };
}
