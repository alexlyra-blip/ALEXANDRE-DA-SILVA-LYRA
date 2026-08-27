import type { PortabilidadeMultiplaContrato } from './types';

export type PortabilidadeMultiplaGrupo =
  | 'A'
  | 'B'
  | 'C'
  | 'SEM_BANCO';

export type PortabilidadeMultiplaBloqueioCodigo =
  | 'CPF_INVALIDO'
  | 'MIN_CONTRATOS'
  | 'MAX_CONTRATOS'
  | 'NB_AUSENTE'
  | 'NB_DIFERENTE'
  | 'BANCO_AUSENTE'
  | 'BANCOS_DIFERENTES'
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
  identidade_banco: string;
  grupo: PortabilidadeMultiplaGrupo;
  selecionavel: boolean;
}

export interface PortabilidadeMultiplaPreValidacaoEstrutural {
  elegivel_previo: boolean;
  grupo: 'A' | 'B' | 'AB' | null;
  quantidade_contratos: number;
  beneficio: string | null;
  classificacoes: PortabilidadeMultiplaClassificacaoContrato[];
  bloqueios: PortabilidadeMultiplaBloqueio[];
}

export const PORTABILIDADE_MULTIPLA_MIN_CONTRATOS = 2;
export const PORTABILIDADE_MULTIPLA_MAX_CONTRATOS = 6;

/**
 * Grupos oficiais de unificação do projeto FACTA de referência.
 *
 * Regra:
 * - Grupo A e Grupo B podem ser combinados entre si;
 * - bancos fora de A/B são classificados como Grupo C e NÃO participam
 *   da Portabilidade Múltipla;
 * - a portabilidade individual continua sendo validada pelo Motor FACTA.
 */
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
      withoutLeadingCode === normalizedAlias
      || withoutLeadingCode.startsWith(`${normalizedAlias} `)
    ) {
      return canonical;
    }
  }

  return withoutLeadingCode;
}

export function identidadeBancoPortabilidadeMultipla(
  banco: unknown,
  codigoBanco?: unknown,
): string {
  const normalized = normalizarBancoPortabilidadeMultipla(
    banco,
    codigoBanco,
  );

  // A identidade canônica vem primeiro para que códigos alternativos da
  // mesma instituição (quando conhecidos) não criem bancos artificiais.
  if (normalized) return `NOME:${normalized}`;

  const code = normalizeBankCode(codigoBanco);
  return code ? `COD:${code}` : '';
}

export function classificarGrupoFacta(
  banco: unknown,
  codigoBanco?: unknown,
): PortabilidadeMultiplaGrupo {
  const normalized = normalizarBancoPortabilidadeMultipla(
    banco,
    codigoBanco,
  );

  if (!normalized && !normalizeBankCode(codigoBanco)) {
    return 'SEM_BANCO';
  }

  if (
    (PORTABILIDADE_MULTIPLA_GRUPOS.A as readonly string[])
      .includes(normalized)
  ) {
    return 'A';
  }

  if (
    (PORTABILIDADE_MULTIPLA_GRUPOS.B as readonly string[])
      .includes(normalized)
  ) {
    return 'B';
  }

  return 'C';
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
  const identidadeBanco = identidadeBancoPortabilidadeMultipla(
    contrato.banco,
    contrato.codigo_banco,
  );

  return {
    contrato_id: contrato.id,
    banco_original: contrato.banco,
    banco_normalizado: bancoNormalizado,
    codigo_banco: contrato.codigo_banco,
    identidade_banco: identidadeBanco,
    grupo,
    selecionavel: grupo === 'A' || grupo === 'B',
  };
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(
    new Set(values.map(value => value.trim()).filter(Boolean)),
  );
}

function structuralGroup(
  classificacoes: PortabilidadeMultiplaClassificacaoContrato[],
): 'A' | 'B' | 'AB' | null {
  const groups = uniqueNonEmpty(
    classificacoes
      .filter(item => item.grupo === 'A' || item.grupo === 'B')
      .map(item => item.grupo),
  );

  if (!groups.length) return null;
  if (groups.length === 1) return groups[0] as 'A' | 'B';
  return 'AB';
}

/**
 * Pré-validação estrutural da seleção.
 *
 * Não chama o Motor. Ela só garante:
 * - 2 a 6 contratos;
 * - mesmo benefício/NB;
 * - Grupo A pode combinar com Grupo A ou B;
 * - Grupo B pode combinar com Grupo A ou B;
 * - Grupo C não pode ser selecionado;
 * - a portabilidade de cada banco é validada posteriormente pelo Motor FACTA.
 */
export function validarEstruturaPortabilidadeMultipla(
  contratos: PortabilidadeMultiplaContrato[],
): PortabilidadeMultiplaPreValidacaoEstrutural {
  const bloqueios: PortabilidadeMultiplaBloqueio[] = [];
  const classificacoes = contratos.map(
    classificarContratoPortabilidadeMultipla,
  );

  if (contratos.length < PORTABILIDADE_MULTIPLA_MIN_CONTRATOS) {
    bloqueios.push({
      codigo: 'MIN_CONTRATOS',
      mensagem:
        `Selecione pelo menos ${PORTABILIDADE_MULTIPLA_MIN_CONTRATOS} contratos para uma Portabilidade Múltipla.`,
    });
  }

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
      mensagem:
        'Todos os contratos precisam possuir benefício/NB identificado.',
      contrato_id: missingBenefit.id,
      banco: missingBenefit.banco,
    });
  }

  if (beneficios.length > 1) {
    bloqueios.push({
      codigo: 'NB_DIFERENTE',
      mensagem:
        'Todos os contratos selecionados devem pertencer ao mesmo benefício/NB.',
    });
  }

  const missingBank = classificacoes.find(
    item => item.grupo === 'SEM_BANCO' || !item.identidade_banco,
  );

  if (missingBank) {
    bloqueios.push({
      codigo: 'BANCO_AUSENTE',
      mensagem:
        'Todos os contratos precisam possuir banco de origem identificado.',
      contrato_id: missingBank.contrato_id,
      banco: missingBank.banco_original,
    });
  }

  const grupoC = classificacoes.find(item => item.grupo === 'C');

  if (grupoC) {
    bloqueios.push({
      codigo: 'GRUPOS_INCOMPATIVEIS',
      mensagem:
        'Contratos do Grupo C não participam da Portabilidade Múltipla FACTA.',
      contrato_id: grupoC.contrato_id,
      banco: grupoC.banco_original,
    });
  }

  const grupo = structuralGroup(classificacoes);

  return {
    elegivel_previo:
      contratos.length >= PORTABILIDADE_MULTIPLA_MIN_CONTRATOS
      && bloqueios.length === 0,
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
 * Regra de UI para impedir combinações inválidas enquanto o usuário marca
 * os contratos. A validação definitiva continua existindo no servidor.
 */
export function validarInclusaoContratoPortabilidadeMultipla(
  selecionados: PortabilidadeMultiplaContrato[],
  candidato: PortabilidadeMultiplaContrato,
): PortabilidadeMultiplaSelecaoResult {
  const candidate = classificarContratoPortabilidadeMultipla(candidato);

  if (candidate.grupo === 'SEM_BANCO' || !candidate.identidade_banco) {
    return {
      permitido: false,
      grupo: 'SEM_BANCO',
      bloqueio: {
        codigo: 'BANCO_AUSENTE',
        mensagem:
          'O contrato precisa possuir banco de origem identificado.',
        contrato_id: candidato.id,
        banco: candidato.banco,
      },
    };
  }

  if (selecionados.length >= PORTABILIDADE_MULTIPLA_MAX_CONTRATOS) {
    return {
      permitido: false,
      grupo: candidate.grupo,
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
      grupo: candidate.grupo,
      bloqueio: {
        codigo: 'NB_AUSENTE',
        mensagem:
          'O contrato precisa possuir benefício/NB identificado.',
        contrato_id: candidato.id,
        banco: candidato.banco,
      },
    };
  }

  const beneficioSelecionado = selecionados
    .map(item => String(item.beneficio ?? '').trim())
    .find(Boolean);

  if (
    beneficioSelecionado
    && beneficioSelecionado !== beneficioCandidato
  ) {
    return {
      permitido: false,
      grupo: candidate.grupo,
      bloqueio: {
        codigo: 'NB_DIFERENTE',
        mensagem:
          'Todos os contratos selecionados devem pertencer ao mesmo benefício/NB.',
        contrato_id: candidato.id,
        banco: candidato.banco,
        beneficio: beneficioCandidato,
      },
    };
  }

  if (candidate.grupo === 'C') {
    return {
      permitido: false,
      grupo: candidate.grupo,
      bloqueio: {
        codigo: 'GRUPOS_INCOMPATIVEIS',
        mensagem:
          'Este contrato pertence ao Grupo C e não pode ser usado na Portabilidade Múltipla FACTA.',
        contrato_id: candidato.id,
        banco: candidato.banco,
      },
    };
  }

  // Grupos A e B são compatíveis entre si.
  return {
    permitido: true,
    grupo: candidate.grupo,
  };
}
