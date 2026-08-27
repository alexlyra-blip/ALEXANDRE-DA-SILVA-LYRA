import type {
  PortabilidadeMultiplaResultadoContratoOrigem,
  PortabilidadeMultiplaTabelaFactaOrigem,
} from './origin-validation';

export interface PortabilidadeMultiplaIntersecaoFacta {
  possui_intersecao: boolean;
  quantidade_tabelas_comuns: number;
  tabelas_comuns: PortabilidadeMultiplaTabelaFactaOrigem[];
  prazos_disponiveis: number[];
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Para a unificação, a identidade de compatibilidade da tabela é
 * NOME + PRAZO.
 *
 * A taxa calculada pode variar na validação individual porque cada origem
 * possui taxa atual própria. Por isso a taxa NÃO deve eliminar uma tabela
 * que é a mesma tabela/prazo FACTA para todos os contratos.
 */
export function criarChaveCompatibilidadeTabelaFacta(
  tabela: Pick<PortabilidadeMultiplaTabelaFactaOrigem, 'nome' | 'prazo'>,
): string {
  return [
    normalizeText(tabela.nome),
    String(Math.max(0, Math.trunc(tabela.prazo || 0))),
  ].join('|');
}

/**
 * Descobre as tabelas/prazos FACTA que foram aceitos para TODAS as origens.
 *
 * A validação individual continua usando o Motor existente. Esta função não
 * calcula valores financeiros e não cria regra bancária paralela.
 */
export function interseccionarTabelasFacta(
  contratos: PortabilidadeMultiplaResultadoContratoOrigem[],
): PortabilidadeMultiplaIntersecaoFacta {
  if (!contratos.length) {
    return {
      possui_intersecao: false,
      quantidade_tabelas_comuns: 0,
      tabelas_comuns: [],
      prazos_disponiveis: [],
    };
  }

  if (
    contratos.some(
      contrato =>
        !contrato.elegivel_origem
        || contrato.tabelas_facta.length === 0,
    )
  ) {
    return {
      possui_intersecao: false,
      quantidade_tabelas_comuns: 0,
      tabelas_comuns: [],
      prazos_disponiveis: [],
    };
  }

  const otherKeySets = contratos
    .slice(1)
    .map(
      contrato =>
        new Set(
          contrato.tabelas_facta.map(
            criarChaveCompatibilidadeTabelaFacta,
          ),
        ),
    );

  const seen = new Set<string>();
  const comuns: PortabilidadeMultiplaTabelaFactaOrigem[] = [];

  for (const tabela of contratos[0].tabelas_facta) {
    const compatibilityKey =
      criarChaveCompatibilidadeTabelaFacta(tabela);

    if (seen.has(compatibilityKey)) continue;

    const existsInAll = otherKeySets.every(
      keys => keys.has(compatibilityKey),
    );

    if (!existsInAll) continue;

    seen.add(compatibilityKey);
    comuns.push({ ...tabela });
  }

  const prazos = Array.from(
    new Set(
      comuns
        .map(tabela => tabela.prazo)
        .filter(prazo => prazo > 0),
    ),
  ).sort((a, b) => b - a);

  return {
    possui_intersecao: comuns.length > 0,
    quantidade_tabelas_comuns: comuns.length,
    tabelas_comuns: comuns,
    prazos_disponiveis: prazos,
  };
}
