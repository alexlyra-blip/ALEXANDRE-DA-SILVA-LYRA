import type { PortabilidadeMultiplaContrato } from './types';

export type PortabilidadeMultiplaGrupo = 'A' | 'B' | 'C' | 'NAO_CLASSIFICADO';

export type PortabilidadeMultiplaBloqueioCodigo =
  | 'CPF_INVALIDO'
  | 'MAX_CONTRATOS'
  | 'NB_AUSENTE'
  | 'NB_DIFERENTE'
  | 'BANCO_NAO_UNIFICAVEL'
  | 'BANCO_NAO_CLASSIFICADO'
  | 'GRUPOS_INCOMPATIVEIS'
  | 'SALDO_AUSENTE'
  | 'PARCELA_INVALIDA'
  | 'MARGEM_INSUFICIENTE'
  | 'PARCELA_REFIN_MINIMA'
  | 'VALOR_CONTRATO_REFIN_MINIMO'
  | 'REGRA_BANCO_ORIGEM'
  | 'SEM_TABELA_FACTA';

export interface PortabilidadeMultiplaBloqueio {
  codigo: PortabilidadeMultiplaBloqueioCodigo;
  mensagem: string;
  contrato_id?: string;
  banco?: string;
  beneficio?: string;
}

export interface PortabilidadeMultiplaClassificacaoContrato {
  contrato_id: string;
  banco_original: string;
  banco_normalizado: string;
  codigo_banco: string;
  grupo: PortabilidadeMultiplaGrupo;
  selecionavel: boolean;
}

export interface PortabilidadeMultiplaPreValidacaoEstrutural {
  elegivel_previo: boolean;
  grupo: 'A' | 'B' | null;
  quantidade_contratos: number;
  beneficio: string | null;
  classificacoes: PortabilidadeMultiplaClassificacaoContrato[];
  bloqueios: PortabilidadeMultiplaBloqueio[];
}

export const PORTABILIDADE_MULTIPLA_MAX_CONTRATOS = 6;

export const PORTABILIDADE_MULTIPLA_GRUPOS = {
  A: [
    'BANRISUL',
    'BMG',
    'COMPE',
    'DAYCOVAL',
    'ITAU',
    'CAIXA',
    'BRADESCO',
    'SANTANDER',
    'AGIBANK',
    'PAN',
    'C6',
    'SAFRA',
  ],
  B: [
    'BANCO SEGURO',
    'MERCANTIL',
    'BANCO DO BRASIL',
    'PICPAY',
  ],
  C: [
    'QI SOCIEDADE',
    'BANCO ORIGINAL',
    'BANCO INTER',
    'BANCO MULTIPLO',
    'BRB',
    'DIGIO',
  ],
} as const;

const BANK_CODE_TO_CANONICAL: Record<string, string> = {
  '001': 'BANCO DO BRASIL',
  '033': 'SANTANDER',
  '041': 'BANRISUL',
  '070': 'BRB',
  '077': 'BANCO INTER',
  '104': 'CAIXA',
  '121': 'AGIBANK',
  '212': 'BANCO ORIGINAL',
  '237': 'BRADESCO',
  '318': 'BMG',
  '329': 'QI SOCIEDADE',
  '335': 'DIGIO',
  '341': 'ITAU',
  '380': 'PICPAY',
  '389': 'MERCANTIL',
  '422': 'SAFRA',
  '623': 'PAN',
  '626': 'C6',
  '707': 'DAYCOVAL',
  // Alguns providers do ecossistema historicamente retornam BRB como 925.
  '925': 'BRB',
};

const BANK_NAME_ALIASES: Array<[string, string]> = [
  ['CAIXA ECONOMICA FEDERAL', 'CAIXA'],
  ['CAIXA ECONOMICA', 'CAIXA'],
  ['BANCO DO BRASIL', 'BANCO DO BRASIL'],
  ['BB', 'BANCO DO BRASIL'],
  ['BANCO MERCANTIL DO BRASIL', 'MERCANTIL'],
  ['BANCO MERCANTIL', 'MERCANTIL'],
  ['MERCANTIL DO BRASIL', 'MERCANTIL'],
  ['BANCO PAN', 'PAN'],
  ['PANAMERICANO', 'PAN'],
  ['BANCO C6 CONSIGNADO', 'C6'],
  ['C6 CONSIGNADO', 'C6'],
  ['C6 CONSIG', 'C6'],
  ['C6 BANK', 'C6'],
  ['BANCO C6', 'C6'],
  ['BANCO FICSA', 'C6'],
  ['BANCO DAYCOVAL', 'DAYCOVAL'],
  ['BANCO SAFRA', 'SAFRA'],
  ['BANCO BMG', 'BMG'],
  ['BANCO SANTANDER', 'SANTANDER'],
  ['ITAU UNIBANCO', 'ITAU'],
  ['ITAU CONSIGNADO', 'ITAU'],
  ['BANCO ITAU', 'ITAU'],
  ['BANCO BRADESCO', 'BRADESCO'],
  ['BANCO AGIBANK', 'AGIBANK'],
  ['BANCO DO ESTADO DO RIO GRANDE DO SUL', 'BANRISUL'],
  ['BANCO BANRISUL', 'BANRISUL'],
  ['BANCO INTER', 'BANCO INTER'],
  ['BANCO ORIGINAL', 'BANCO ORIGINAL'],
  ['BANCO MULTIPLO', 'BANCO MULTIPLO'],
  ['QI SOCIEDADE DE CREDITO', 'QI SOCIEDADE'],
  ['QI SOCIEDADE', 'QI SOCIEDADE'],
  ['BANCO DE BRASILIA', 'BRB'],
  ['BRB CREDITO', 'BRB'],
  ['BANCO DIGIO', 'DIGIO'],
  ['BANCO SEGURO', 'BANCO SEGURO'],
  ['PICPAY BANK', 'PICPAY'],
  ['BANCO PICPAY', 'PICPAY'],
  ['COMPE', 'COMPE'],
  ['BANRISUL', 'BANRISUL'],
  ['BMG', 'BMG'],
  ['DAYCOVAL', 'DAYCOVAL'],
  ['ITAU', 'ITAU'],
  ['CAIXA', 'CAIXA'],
  ['BRADESCO', 'BRADESCO'],
  ['SANTANDER', 'SANTANDER'],
  ['AGIBANK', 'AGIBANK'],
  ['PAN', 'PAN'],
  ['C6', 'C6'],
  ['SAFRA', 'SAFRA'],
  ['MERCANTIL', 'MERCANTIL'],
  ['PICPAY', 'PICPAY'],
  ['BRB', 'BRB'],
  ['DIGIO', 'DIGIO'],
];

function normalizeComparableBankName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[./_-]+/g, ' ')
    .replace(/\b(S\/?A|SA)\b/g, ' ')
    .replace(/\bFINANCEIRA\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBankCode(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.slice(-3).padStart(3, '0');
}

/**
 * Retorna o nome canonico usado exclusivamente pelas regras da Multipla.
 * Banco desconhecido permanece desconhecido: nao ha classificacao automatica por semelhanca.
 */
export function normalizarBancoPortabilidadeMultipla(
  banco: unknown,
  codigoBanco?: unknown,
): string {
  const code = normalizeBankCode(codigoBanco);
  if (code && BANK_CODE_TO_CANONICAL[code]) {
    return BANK_CODE_TO_CANONICAL[code];
  }

  const normalized = normalizeComparableBankName(banco);
  if (!normalized) return '';

  // Se o provider inclui o codigo no proprio nome, aproveitamos apenas codigos explicitamente cadastrados.
  const inlineCode = normalized.match(/^(\d{1,3})\b/)?.[1];
  if (inlineCode) {
    const canonicalByCode =
      BANK_CODE_TO_CANONICAL[inlineCode.padStart(3, '0')];

    if (canonicalByCode) return canonicalByCode;
  }

  const withoutLeadingCode = normalized.replace(/^\d{1,3}\s+/, '').trim();

  for (const [alias, canonical] of BANK_NAME_ALIASES) {
    const normalizedAlias = normalizeComparableBankName(alias);

    if (
      withoutLeadingCode === normalizedAlias ||
      withoutLeadingCode.startsWith(`${normalizedAlias} `)
    ) {
      return canonical;
    }
  }

  return withoutLeadingCode;
}

export function classificarGrupoFacta(
  banco: unknown,
  codigoBanco?: unknown,
): PortabilidadeMultiplaGrupo {
  const normalized = normalizarBancoPortabilidadeMultipla(banco, codigoBanco);

  if ((PORTABILIDADE_MULTIPLA_GRUPOS.A as readonly string[]).includes(normalized)) {
    return 'A';
  }

  if ((PORTABILIDADE_MULTIPLA_GRUPOS.B as readonly string[]).includes(normalized)) {
    return 'B';
  }

  if ((PORTABILIDADE_MULTIPLA_GRUPOS.C as readonly string[]).includes(normalized)) {
    return 'C';
  }

  return 'NAO_CLASSIFICADO';
}

export function classificarContratoPortabilidadeMultipla(
  contrato: PortabilidadeMultiplaContrato,
): PortabilidadeMultiplaClassificacaoContrato {
  const bancoNormalizado = normalizarBancoPortabilidadeMultipla(
    contrato.banco,
    contrato.codigo_banco,
  );
  const grupo = classificarGrupoFacta(
    contrato.banco,
    contrato.codigo_banco,
  );

  return {
    contrato_id: contrato.id,
    banco_original: contrato.banco,
    banco_normalizado: bancoNormalizado,
    codigo_banco: contrato.codigo_banco,
    grupo,
    selecionavel: grupo === 'A' || grupo === 'B',
  };
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(
    new Set(values.map(value => value.trim()).filter(Boolean)),
  );
}

/**
 * Pre-validacao estrutural barata.
 *
 * Esta fase NAO calcula margem, NAO chama o Motor e NAO valida tabelas FACTA.
 * Ela somente garante as regras de composicao da operacao:
 * - maximo de 6 contratos;
 * - mesmo beneficio/NB;
 * - grupos A e B nao podem ser misturados;
 * - grupo C bloqueado;
 * - banco desconhecido bloqueado.
 */
export function validarEstruturaPortabilidadeMultipla(
  contratos: PortabilidadeMultiplaContrato[],
): PortabilidadeMultiplaPreValidacaoEstrutural {
  const bloqueios: PortabilidadeMultiplaBloqueio[] = [];
  const classificacoes = contratos.map(classificarContratoPortabilidadeMultipla);

  if (contratos.length > PORTABILIDADE_MULTIPLA_MAX_CONTRATOS) {
    bloqueios.push({
      codigo: 'MAX_CONTRATOS',
      mensagem:
        `A Portabilidade Múltipla permite no máximo ${PORTABILIDADE_MULTIPLA_MAX_CONTRATOS} contratos.`,
    });
  }

  const beneficios = uniqueNonEmpty(
    contratos.map(contrato => String(contrato.beneficio ?? '')),
  );

  const missingBenefit = contratos.find(
    contrato => !String(contrato.beneficio ?? '').trim(),
  );

  if (missingBenefit) {
    bloqueios.push({
      codigo: 'NB_AUSENTE',
      mensagem: 'Todos os contratos precisam possuir benefício/NB identificado.',
      contrato_id: missingBenefit.id,
      banco: missingBenefit.banco,
    });
  }

  if (beneficios.length > 1) {
    bloqueios.push({
      codigo: 'NB_DIFERENTE',
      mensagem: 'Todos os contratos selecionados devem pertencer ao mesmo benefício/NB.',
    });
  }

  for (const item of classificacoes) {
    if (item.grupo === 'C') {
      bloqueios.push({
        codigo: 'BANCO_NAO_UNIFICAVEL',
        mensagem: `${item.banco_normalizado || item.banco_original || 'Banco'} pertence ao Grupo C e não pode ser unificado.`,
        contrato_id: item.contrato_id,
        banco: item.banco_normalizado || item.banco_original,
      });
    }

    if (item.grupo === 'NAO_CLASSIFICADO') {
      bloqueios.push({
        codigo: 'BANCO_NAO_CLASSIFICADO',
        mensagem: `${item.banco_original || 'Banco'} não está classificado nos grupos FACTA e não pode ser selecionado.`,
        contrato_id: item.contrato_id,
        banco: item.banco_original,
      });
    }
  }

  const gruposSelecionaveis = uniqueNonEmpty(
    classificacoes
      .map(item => item.grupo)
      .filter((grupo): grupo is 'A' | 'B' => grupo === 'A' || grupo === 'B'),
  );

  if (gruposSelecionaveis.length > 1) {
    bloqueios.push({
      codigo: 'GRUPOS_INCOMPATIVEIS',
      mensagem: 'Contratos dos grupos A e B não podem ser unificados.',
    });
  }

  const grupo =
    gruposSelecionaveis.length === 1
      ? gruposSelecionaveis[0] as 'A' | 'B'
      : null;

  return {
    elegivel_previo: contratos.length > 0 && bloqueios.length === 0,
    grupo,
    quantidade_contratos: contratos.length,
    beneficio: beneficios.length === 1 ? beneficios[0] : null,
    classificacoes,
    bloqueios,
  };
}

export interface PortabilidadeMultiplaSelecaoResult {
  permitido: boolean;
  grupo: PortabilidadeMultiplaGrupo;
  bloqueio?: PortabilidadeMultiplaBloqueio;
}

/**
 * Regra para o frontend bloquear a selecao antes de montar uma operacao invalida.
 */
export function validarInclusaoContratoPortabilidadeMultipla(
  selecionados: PortabilidadeMultiplaContrato[],
  candidato: PortabilidadeMultiplaContrato,
): PortabilidadeMultiplaSelecaoResult {
  const candidatoClassificado = classificarContratoPortabilidadeMultipla(candidato);

  if (candidatoClassificado.grupo === 'C') {
    return {
      permitido: false,
      grupo: 'C',
      bloqueio: {
        codigo: 'BANCO_NAO_UNIFICAVEL',
        mensagem: `${candidatoClassificado.banco_normalizado || candidato.banco || 'Banco'} pertence ao Grupo C e não pode ser unificado.`,
        contrato_id: candidato.id,
        banco: candidatoClassificado.banco_normalizado || candidato.banco,
      },
    };
  }

  if (candidatoClassificado.grupo === 'NAO_CLASSIFICADO') {
    return {
      permitido: false,
      grupo: 'NAO_CLASSIFICADO',
      bloqueio: {
        codigo: 'BANCO_NAO_CLASSIFICADO',
        mensagem: `${candidato.banco || 'Banco'} não está classificado nos grupos FACTA e não pode ser selecionado.`,
        contrato_id: candidato.id,
        banco: candidato.banco,
      },
    };
  }

  if (selecionados.length >= PORTABILIDADE_MULTIPLA_MAX_CONTRATOS) {
    return {
      permitido: false,
      grupo: candidatoClassificado.grupo,
      bloqueio: {
        codigo: 'MAX_CONTRATOS',
        mensagem:
          `A Portabilidade Múltipla permite no máximo ${PORTABILIDADE_MULTIPLA_MAX_CONTRATOS} contratos.`,
      },
    };
  }

  const beneficioCandidato = String(candidato.beneficio ?? '').trim();

  if (!beneficioCandidato) {
    return {
      permitido: false,
      grupo: candidatoClassificado.grupo,
      bloqueio: {
        codigo: 'NB_AUSENTE',
        mensagem: 'O contrato precisa possuir benefício/NB identificado.',
        contrato_id: candidato.id,
        banco: candidato.banco,
      },
    };
  }

  const beneficioSelecionado = selecionados
    .map(item => String(item.beneficio ?? '').trim())
    .find(Boolean);

  if (
    beneficioSelecionado &&
    beneficioSelecionado !== beneficioCandidato
  ) {
    return {
      permitido: false,
      grupo: candidatoClassificado.grupo,
      bloqueio: {
        codigo: 'NB_DIFERENTE',
        mensagem: 'Todos os contratos selecionados devem pertencer ao mesmo benefício/NB.',
        contrato_id: candidato.id,
        banco: candidato.banco,
        beneficio: beneficioCandidato,
      },
    };
  }

  const gruposSelecionados = uniqueNonEmpty(
    selecionados
      .map(classificarContratoPortabilidadeMultipla)
      .map(item => item.grupo)
      .filter((grupo): grupo is 'A' | 'B' => grupo === 'A' || grupo === 'B'),
  );

  if (
    gruposSelecionados.length > 0 &&
    !gruposSelecionados.includes(candidatoClassificado.grupo)
  ) {
    return {
      permitido: false,
      grupo: candidatoClassificado.grupo,
      bloqueio: {
        codigo: 'GRUPOS_INCOMPATIVEIS',
        mensagem: 'Contratos dos grupos A e B não podem ser unificados.',
        contrato_id: candidato.id,
        banco: candidato.banco,
      },
    };
  }

  return {
    permitido: true,
    grupo: candidatoClassificado.grupo,
  };
}
