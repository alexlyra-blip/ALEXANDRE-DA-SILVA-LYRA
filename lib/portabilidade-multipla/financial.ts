import type { PortabilidadeMultiplaContrato } from './types';
import {
  validarEstruturaPortabilidadeMultipla,
  type PortabilidadeMultiplaBloqueio,
  type PortabilidadeMultiplaPreValidacaoEstrutural,
} from './rules';

export const PORTABILIDADE_MULTIPLA_ADICIONAL_VIABILIDADE = 20;

/**
 * Regra do REFINANCIAMENTO consolidado.
 * Nao e limite individual dos contratos portados.
 */
export const PORTABILIDADE_MULTIPLA_PARCELA_MINIMA_REFIN = 50;

/**
 * Regra do NOVO contrato de refinanciamento:
 * saldo portado + valor liberado da nova oferta >= R$ 3.000,00.
 *
 * Este limite NAO se aplica ao saldo individual dos contratos portados.
 */
export const PORTABILIDADE_MULTIPLA_VALOR_MINIMO_CONTRATO_REFIN = 3000;

export interface PortabilidadeMultiplaConfigFinanceira {
  adicional_viabilidade?: number;
  parcela_minima_refin?: number;
  valor_minimo_contrato_refin?: number;
}

export interface PortabilidadeMultiplaResumoFinanceiro {
  margem_livre: number;
  margem_negativa: number;
  adicional_viabilidade: number;
  minimo_viabilidade: number;
  regra_viabilidade_atendida: boolean;

  soma_parcelas: number;
  maior_parcela: number;
  parcela_refin: number;
  parcela_minima_refin: number;
  parcela_refin_minima_atendida: boolean;

  saldo_total: number;

  /**
   * O valor total do NOVO contrato depende da oferta:
   * saldo_total + valor_liberado_novo.
   * Portanto nao pode ser calculado nesta pre-validacao.
   */
  valor_minimo_contrato_refin: number;
  validacao_valor_contrato_pendente: true;

  elegivel_financeiro: boolean;
  bloqueios: PortabilidadeMultiplaBloqueio[];
}

export interface PortabilidadeMultiplaPreValidacaoCompleta
  extends PortabilidadeMultiplaPreValidacaoEstrutural,
    Omit<PortabilidadeMultiplaResumoFinanceiro, 'bloqueios'> {
  bloqueios: PortabilidadeMultiplaBloqueio[];
}

export interface PortabilidadeMultiplaOfertaRefinInput {
  saldo_total: number;
  valor_liberado: number;
  parcela_refin: number;
}

export interface PortabilidadeMultiplaValidacaoOfertaRefin {
  parcela_refin: number;
  parcela_minima_refin: number;
  parcela_refin_minima_atendida: boolean;

  saldo_total: number;
  valor_liberado: number;
  valor_total_contrato_refin: number;
  valor_minimo_contrato_refin: number;
  valor_total_minimo_atendido: boolean;

  elegivel: boolean;
  bloqueios: PortabilidadeMultiplaBloqueio[];
}

/**
 * Toda aritmetica monetaria desta camada e executada em centavos inteiros.
 */
function moneyToCents(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;

  let numeric: number;

  if (typeof value === 'number') {
    numeric = Number.isFinite(value) ? value : 0;
  } else {
    const raw = String(value).trim();
    if (!raw) return 0;

    const cleaned = raw
      .replace(/[R$\s%]/gi, '')
      .replace(/[^\d,.-]/g, '');

    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned;

    numeric = Number(normalized);
  }

  if (!Number.isFinite(numeric)) return 0;

  const sign = numeric < 0 ? -1 : 1;
  const absolute = Math.abs(numeric);

  return sign * Math.round((absolute + 1e-9) * 100);
}

function centsToMoney(value: number): number {
  return value / 100;
}

function positiveMoneyCents(value: unknown): number {
  const cents = moneyToCents(value);
  return cents > 0 ? cents : 0;
}

function pushUniqueBlock(
  blocks: PortabilidadeMultiplaBloqueio[],
  block: PortabilidadeMultiplaBloqueio,
): void {
  const duplicated = blocks.some(existing => (
    existing.codigo === block.codigo
    && (existing.contrato_id || '') === (block.contrato_id || '')
    && (existing.banco || '') === (block.banco || '')
  ));

  if (!duplicated) blocks.push(block);
}

function resolvedConfig(
  config: PortabilidadeMultiplaConfigFinanceira,
): Required<PortabilidadeMultiplaConfigFinanceira> {
  return {
    adicional_viabilidade: centsToMoney(
      positiveMoneyCents(
        config.adicional_viabilidade
          ?? PORTABILIDADE_MULTIPLA_ADICIONAL_VIABILIDADE,
      ),
    ),
    parcela_minima_refin: centsToMoney(
      positiveMoneyCents(
        config.parcela_minima_refin
          ?? PORTABILIDADE_MULTIPLA_PARCELA_MINIMA_REFIN,
      ),
    ),
    valor_minimo_contrato_refin: centsToMoney(
      positiveMoneyCents(
        config.valor_minimo_contrato_refin
          ?? PORTABILIDADE_MULTIPLA_VALOR_MINIMO_CONTRATO_REFIN,
      ),
    ),
  };
}

/**
 * Pre-validacao financeira ANTES da oferta FACTA.
 *
 * Regras importantes:
 * - contrato portado individual pode ter parcela menor que R$ 50,00;
 * - contrato portado individual pode ter saldo menor que R$ 3.000,00;
 * - a parcela unificada do REFIN deve ser >= R$ 50,00;
 * - o minimo de R$ 3.000,00 so sera validado quando existir a nova oferta,
 *   usando saldo_total + valor_liberado_novo.
 */
export function calcularResumoFinanceiroPortabilidadeMultipla(
  contratos: PortabilidadeMultiplaContrato[],
  margemLivre: number,
  config: PortabilidadeMultiplaConfigFinanceira = {},
): PortabilidadeMultiplaResumoFinanceiro {
  const bloqueios: PortabilidadeMultiplaBloqueio[] = [];
  const cfg = resolvedConfig(config);

  const margemLivreCents = moneyToCents(margemLivre);
  const margemNegativaCents = Math.max(0, -margemLivreCents);
  const adicionalCents = moneyToCents(cfg.adicional_viabilidade);
  const minimoViabilidadeCents = margemNegativaCents + adicionalCents;

  let somaParcelasCents = 0;
  let maiorParcelaCents = 0;
  let saldoTotalCents = 0;

  for (const contrato of contratos) {
    const parcelaCents = moneyToCents(contrato.parcela);

    // Sem valor positivo nao ha dado suficiente.
    // Nao existe aqui minimo individual de R$ 50,00.
    if (parcelaCents <= 0) {
      pushUniqueBlock(bloqueios, {
        codigo: 'PARCELA_INVALIDA',
        mensagem: 'O contrato precisa possuir valor de parcela maior que zero.',
        contrato_id: contrato.id,
        banco: contrato.banco,
        beneficio: contrato.beneficio,
      });
    } else {
      somaParcelasCents += parcelaCents;
      maiorParcelaCents = Math.max(maiorParcelaCents, parcelaCents);
    }

    const saldoCents = moneyToCents(contrato.saldo_devedor);

    // Sem saldo positivo nao ha dado para portar.
    // Nao existe aqui minimo individual de R$ 3.000,00.
    if (contrato.saldo_devedor === null || saldoCents <= 0) {
      pushUniqueBlock(bloqueios, {
        codigo: 'SALDO_AUSENTE',
        mensagem: 'O contrato não possui saldo devedor/quitacao suficiente para a simulação.',
        contrato_id: contrato.id,
        banco: contrato.banco,
        beneficio: contrato.beneficio,
      });
    } else {
      saldoTotalCents += saldoCents;
    }
  }

  const regraViabilidadeAtendida =
    margemNegativaCents === 0
    || maiorParcelaCents >= minimoViabilidadeCents;

  if (
    contratos.length > 0
    && margemNegativaCents > 0
    && !regraViabilidadeAtendida
  ) {
    pushUniqueBlock(bloqueios, {
      codigo: 'MARGEM_INSUFICIENTE',
      mensagem:
        'Margem negativa não compensada: pelo menos uma parcela selecionada deve ser igual ou superior à margem negativa mais R$ 20,00.',
    });
  }

  // Na margem negativa, a nova parcela precisa permanecer R$ 20,00
  // acima do valor necessário para absorver o negativo.
  // Ex.: 598,08 - 175,07 + 20,00 = 443,01.
  const parcelaRefinCents = margemNegativaCents > 0
    ? somaParcelasCents - margemNegativaCents + adicionalCents
    : somaParcelasCents;
  const parcelaMinimaRefinCents = moneyToCents(cfg.parcela_minima_refin);

  const parcelaRefinMinimaAtendida =
    parcelaRefinCents >= parcelaMinimaRefinCents;

  if (
    contratos.length > 0
    && !parcelaRefinMinimaAtendida
  ) {
    pushUniqueBlock(bloqueios, {
      codigo: 'PARCELA_REFIN_MINIMA',
      mensagem:
        'A parcela unificada do refinanciamento deve ser de pelo menos R$ 50,00.',
    });
  }

  return {
    margem_livre: centsToMoney(margemLivreCents),
    margem_negativa: centsToMoney(margemNegativaCents),
    adicional_viabilidade: centsToMoney(adicionalCents),
    minimo_viabilidade: centsToMoney(minimoViabilidadeCents),
    regra_viabilidade_atendida: regraViabilidadeAtendida,

    soma_parcelas: centsToMoney(somaParcelasCents),
    maior_parcela: centsToMoney(maiorParcelaCents),
    parcela_refin: centsToMoney(parcelaRefinCents),
    parcela_minima_refin: centsToMoney(parcelaMinimaRefinCents),
    parcela_refin_minima_atendida: parcelaRefinMinimaAtendida,

    saldo_total: centsToMoney(saldoTotalCents),

    valor_minimo_contrato_refin: cfg.valor_minimo_contrato_refin,
    validacao_valor_contrato_pendente: true,

    elegivel_financeiro:
      contratos.length > 0
      && bloqueios.length === 0,
    bloqueios,
  };
}

/**
 * Validacao da NOVA oferta de refinanciamento.
 *
 * Somente aqui existe valor_liberado novo; portanto somente aqui e correto
 * validar:
 *
 * valor_total_contrato_refin = saldo_total + valor_liberado
 *
 * Regras obrigatorias (AND):
 * - parcela_refin >= R$ 50,00
 * - valor_total_contrato_refin >= R$ 3.000,00
 */
export function validarOfertaRefinPortabilidadeMultipla(
  input: PortabilidadeMultiplaOfertaRefinInput,
  config: PortabilidadeMultiplaConfigFinanceira = {},
): PortabilidadeMultiplaValidacaoOfertaRefin {
  const bloqueios: PortabilidadeMultiplaBloqueio[] = [];
  const cfg = resolvedConfig(config);

  const saldoTotalCents = moneyToCents(input.saldo_total);
  const valorLiberadoCents = Math.max(0, moneyToCents(input.valor_liberado));
  const parcelaRefinCents = moneyToCents(input.parcela_refin);

  const parcelaMinimaRefinCents = moneyToCents(cfg.parcela_minima_refin);
  const valorMinimoContratoCents = moneyToCents(
    cfg.valor_minimo_contrato_refin,
  );

  const valorTotalContratoCents =
    saldoTotalCents + valorLiberadoCents;

  const parcelaRefinMinimaAtendida =
    parcelaRefinCents >= parcelaMinimaRefinCents;

  const valorTotalMinimoAtendido =
    valorTotalContratoCents >= valorMinimoContratoCents;

  if (!parcelaRefinMinimaAtendida) {
    pushUniqueBlock(bloqueios, {
      codigo: 'PARCELA_REFIN_MINIMA',
      mensagem:
        'A parcela unificada do refinanciamento deve ser de pelo menos R$ 50,00.',
    });
  }

  if (!valorTotalMinimoAtendido) {
    pushUniqueBlock(bloqueios, {
      codigo: 'VALOR_CONTRATO_REFIN_MINIMO',
      mensagem:
        'O valor total do novo contrato de refinanciamento (saldo + valor liberado) deve ser de pelo menos R$ 3.000,00.',
    });
  }

  return {
    parcela_refin: centsToMoney(parcelaRefinCents),
    parcela_minima_refin: centsToMoney(parcelaMinimaRefinCents),
    parcela_refin_minima_atendida: parcelaRefinMinimaAtendida,

    saldo_total: centsToMoney(saldoTotalCents),
    valor_liberado: centsToMoney(valorLiberadoCents),
    valor_total_contrato_refin: centsToMoney(valorTotalContratoCents),
    valor_minimo_contrato_refin: centsToMoney(valorMinimoContratoCents),
    valor_total_minimo_atendido: valorTotalMinimoAtendido,

    elegivel:
      parcelaRefinMinimaAtendida
      && valorTotalMinimoAtendido,
    bloqueios,
  };
}

export function validarPreviamentePortabilidadeMultipla(
  contratos: PortabilidadeMultiplaContrato[],
  margemLivre: number,
  config: PortabilidadeMultiplaConfigFinanceira = {},
): PortabilidadeMultiplaPreValidacaoCompleta {
  const estrutural = validarEstruturaPortabilidadeMultipla(contratos);
  const financeiro = calcularResumoFinanceiroPortabilidadeMultipla(
    contratos,
    margemLivre,
    config,
  );

  const bloqueios: PortabilidadeMultiplaBloqueio[] = [];

  for (const block of [...estrutural.bloqueios, ...financeiro.bloqueios]) {
    pushUniqueBlock(bloqueios, block);
  }

  return {
    ...estrutural,
    margem_livre: financeiro.margem_livre,
    margem_negativa: financeiro.margem_negativa,
    adicional_viabilidade: financeiro.adicional_viabilidade,
    minimo_viabilidade: financeiro.minimo_viabilidade,
    regra_viabilidade_atendida: financeiro.regra_viabilidade_atendida,

    soma_parcelas: financeiro.soma_parcelas,
    maior_parcela: financeiro.maior_parcela,
    parcela_refin: financeiro.parcela_refin,
    parcela_minima_refin: financeiro.parcela_minima_refin,
    parcela_refin_minima_atendida:
      financeiro.parcela_refin_minima_atendida,

    saldo_total: financeiro.saldo_total,

    valor_minimo_contrato_refin:
      financeiro.valor_minimo_contrato_refin,
    validacao_valor_contrato_pendente: true,

    elegivel_financeiro: financeiro.elegivel_financeiro,
    bloqueios,
    elegivel_previo:
      contratos.length > 0
      && bloqueios.length === 0,
  };
}
