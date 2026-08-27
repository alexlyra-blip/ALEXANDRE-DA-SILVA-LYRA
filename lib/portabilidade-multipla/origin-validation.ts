import type {
  PortabilidadeMultiplaBeneficio,
  PortabilidadeMultiplaConsulta,
  PortabilidadeMultiplaContrato,
} from './types';
import type { PortabilidadeMultiplaBloqueio } from './rules';

export interface PortabilidadeMultiplaTabelaFactaOrigem {
  chave: string;
  nome: string;
  prazo: number;
  taxa: number;
}

export interface PortabilidadeMultiplaResultadoContratoOrigem {
  contrato_id: string;
  contrato: string;
  banco: string;
  codigo_banco: string;
  beneficio: string;
  elegivel_origem: boolean;
  ofertas_facta_count: number;
  tabelas_facta: PortabilidadeMultiplaTabelaFactaOrigem[];
}

export interface PortabilidadeMultiplaResultadoOrigens {
  elegivel_origens: boolean;
  contratos: PortabilidadeMultiplaResultadoContratoOrigem[];
  bloqueios_contratos: PortabilidadeMultiplaBloqueio[];
}

export interface PortabilidadeMultiplaMotorContext {
  banks: any[];
  generalRules: any[];
  promotoraPriorities: Record<string, number>;
  promotoraInstallments: Record<string, number>;
  userProfile: any;
  nonPortableBanks: string[];
  blockedBanks: string[];
}

export type PortabilidadeMultiplaCalculateOffers = (
  params: any,
  banks: any[],
  rules: any[],
  promotoraPriorities: Record<string, number>,
  promotoraInstallments: Record<string, number>,
  userProfile: any,
  nonPortableBanks: string[],
  blockedBanks: string[],
) => any[];

export type PortabilidadeMultiplaCalculateRate = (
  saldoDevedor: number,
  valorParcela: number,
  parcelasRestantes: number,
) => number;

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const cleaned = raw
    .replace(/[R$\s%]/gi, '')
    .replace(/[^\d,.-]/g, '');

  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBankDisplay(
  contract: PortabilidadeMultiplaContrato,
): string {
  const code = String(contract.codigo_banco || '').trim();
  const bank = String(contract.banco || '').trim();

  if (code && bank && !bank.startsWith(code)) {
    return `${code} - ${bank}`;
  }

  return bank || code;
}

function isFactaOffer(offer: any): boolean {
  const candidates = [
    offer?.name,
    offer?.banco,
    offer?.bankName,
    offer?.nomeBanco,
    offer?.bank,
    offer?.id,
  ];

  return candidates.some(value => normalizeText(value).includes('FACTA'));
}

function tableNameFromOffer(offer: any): string {
  return String(
    offer?.tabela
    || offer?.tableName
    || offer?.nomeTabela
    || offer?.tabelaNome
    || offer?.codigoTabela
    || 'FACTA',
  ).trim();
}

function termFromOffer(offer: any): number {
  return Math.max(
    0,
    Math.trunc(
      toNumber(
        offer?.prazoRefinPort
        ?? offer?.prazo
        ?? offer?.term
        ?? offer?.parcelas,
      ),
    ),
  );
}

function rateFromOffer(offer: any): number {
  return toNumber(
    offer?.novaTaxaPortabilidade
    ?? offer?.taxaBase
    ?? offer?.taxaTabela
    ?? offer?.taxa
    ?? 0,
  );
}


function normalizeRateKey(value: number): string {
  if (!Number.isFinite(value)) return '0';

  return value
    .toFixed(6)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
    || '0';
}

/**
 * Chave estável da oferta/tabela FACTA usada na interseção.
 *
 * A especificação da Múltipla exige identidade por:
 * banco + tabela + prazo + taxa.
 *
 * Como esta camada já filtra apenas FACTA, o banco fica explicitamente
 * fixado como FACTA na chave.
 */
export function criarChaveTabelaFacta(
  nome: string,
  prazo: number,
  taxa: number,
): string {
  return [
    'FACTA',
    normalizeText(nome),
    String(Math.max(0, Math.trunc(prazo || 0))),
    normalizeRateKey(taxa || 0),
  ].join('|');
}

export function resumirTabelasFactaDoMotor(
  offers: any[],
): PortabilidadeMultiplaTabelaFactaOrigem[] {
  const unique = new Map<string, PortabilidadeMultiplaTabelaFactaOrigem>();

  for (const offer of offers || []) {
    if (!isFactaOffer(offer)) continue;

    const nome = tableNameFromOffer(offer);
    const prazo = termFromOffer(offer);
    const taxa = rateFromOffer(offer);
    const key = criarChaveTabelaFacta(nome, prazo, taxa);

    if (!unique.has(key)) {
      unique.set(key, {
        chave: key,
        nome,
        prazo,
        taxa,
      });
    }
  }

  return Array.from(unique.values());
}

/**
 * Monta os parâmetros do Motor usando somente o modelo interno normalizado.
 *
 * Os campos financeiros vêm do contrato normalizado da Múltipla.
 * Não existe fallback de saldo para valor liberado/valor contrato.
 */
export function buildMotorParamsPortabilidadeMultipla(
  consulta: PortabilidadeMultiplaConsulta,
  benefit: PortabilidadeMultiplaBeneficio,
  contract: PortabilidadeMultiplaContrato,
  calculateRate: PortabilidadeMultiplaCalculateRate,
): any {
  const saldoDevedor = contract.saldo_devedor ?? 0;
  const parcelasRestantes = contract.prazo_restante;
  const taxaInformada =
    contract.taxa > 0
      ? contract.taxa / 100
      : 0;

  const taxaCalculada =
    taxaInformada <= 0
    && saldoDevedor > 0
    && contract.parcela > 0
    && parcelasRestantes > 0
      ? calculateRate(
          saldoDevedor,
          contract.parcela,
          parcelasRestantes,
        )
      : 0;

  const idade = Math.max(0, Math.trunc(consulta.cliente.idade || 0));

  return {
    idade,
    convenio: 'INSS',
    codigoBeneficio: benefit.especie,
    dataConcessao: benefit.data_concessao,
    bancoAtual: normalizeBankDisplay(contract),
    valorParcela: contract.parcela,
    saldoDevedor,
    prazoTotal: contract.prazo || parcelasRestantes,
    parcelasRestantes,
    parcelasPagas: contract.parcelas_pagas,
    taxaJurosMensal: taxaInformada || taxaCalculada,
    negativeCardValue: benefit.negative_card_value,
    isCliente60Mais: idade >= 60,
    isAnalfabeto: benefit.analfabeto,
    estado: consulta.cliente.uf,
    hasTwoCards: benefit.has_two_cards,
  };
}

/**
 * Executa o Motor UMA VEZ POR CONTRATO.
 *
 * Esta função não soma parcelas, não soma saldos e não consolida a operação.
 * O objetivo é descobrir quais tabelas FACTA o Motor considera válidas para
 * cada contrato de origem de forma independente.
 */
export function validarContratosIndividualmenteNoMotor(
  consulta: PortabilidadeMultiplaConsulta,
  benefit: PortabilidadeMultiplaBeneficio,
  contracts: PortabilidadeMultiplaContrato[],
  context: PortabilidadeMultiplaMotorContext,
  calculateOffers: PortabilidadeMultiplaCalculateOffers,
  calculateRate: PortabilidadeMultiplaCalculateRate,
): PortabilidadeMultiplaResultadoOrigens {
  const resultados: PortabilidadeMultiplaResultadoContratoOrigem[] = [];
  const bloqueios: PortabilidadeMultiplaBloqueio[] = [];

  for (const contract of contracts) {
    const params = buildMotorParamsPortabilidadeMultipla(
      consulta,
      benefit,
      contract,
      calculateRate,
    );

    const offers = calculateOffers(
      params,
      context.banks,
      context.generalRules,
      context.promotoraPriorities,
      context.promotoraInstallments,
      context.userProfile,
      context.nonPortableBanks,
      context.blockedBanks,
    );

    const tabelasFacta = resumirTabelasFactaDoMotor(offers);
    const elegivelOrigem = tabelasFacta.length > 0;

    resultados.push({
      contrato_id: contract.id,
      contrato: contract.contrato,
      banco: contract.banco,
      codigo_banco: contract.codigo_banco,
      beneficio: contract.beneficio,
      elegivel_origem: elegivelOrigem,
      ofertas_facta_count: tabelasFacta.length,
      tabelas_facta: tabelasFacta,
    });

    if (!elegivelOrigem) {
      bloqueios.push({
        codigo: 'REGRA_BANCO_ORIGEM',
        mensagem:
          'O contrato não produziu tabela FACTA elegível quando validado individualmente no Motor.',
        contrato_id: contract.id,
        banco: contract.banco,
        beneficio: contract.beneficio,
      });
    }
  }

  return {
    elegivel_origens:
      contracts.length > 0
      && bloqueios.length === 0,
    contratos: resultados,
    bloqueios_contratos: bloqueios,
  };
}
