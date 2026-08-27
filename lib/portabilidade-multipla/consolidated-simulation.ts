import type {
  PortabilidadeMultiplaBeneficio,
  PortabilidadeMultiplaConsulta,
  PortabilidadeMultiplaContrato,
} from './types';
import type {
  PortabilidadeMultiplaPreValidacaoCompleta,
} from './financial';
import {
  validarOfertaRefinPortabilidadeMultipla,
} from './financial';
import type {
  PortabilidadeMultiplaBloqueio,
} from './rules';
import type {
  PortabilidadeMultiplaMotorContext,
  PortabilidadeMultiplaCalculateOffers,
} from './origin-validation';
import {
  resumirTabelasFactaDoMotor,
} from './origin-validation';
import {
  criarChaveCompatibilidadeTabelaFacta,
  type PortabilidadeMultiplaIntersecaoFacta,
} from './intersection';

export interface PortabilidadeMultiplaOfertaConsolidada {
  id: string;
  banco: string;
  logo: string;
  tabela: string;
  prazo: number;
  taxa_portabilidade: number;
  taxa_base: number;
  taxa_ponderada: number;
  valor_contrato: number;
  valor_liberado: number;
  saldo_total: number;
  parcela_refin: number;
  regras: string[];
}

export interface PortabilidadeMultiplaSimulacaoConsolidada {
  executada: boolean;
  elegivel: boolean;
  chamadas_motor: number;
  quantidade_ofertas: number;
  quantidade_contratos: number;
  beneficio: string;
  soma_parcelas: number;
  margem_livre: number;
  margem_negativa: number;
  parcela_refin: number;
  saldo_total: number;
  ofertas: PortabilidadeMultiplaOfertaConsolidada[];
  bloqueios: PortabilidadeMultiplaBloqueio[];
}

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

function isFactaBankRule(bank: any): boolean {
  return [
    bank?.name,
    bank?.nome,
    bank?.bankName,
    bank?.id,
  ]
    .map(normalizeText)
    .some(value => value.includes('FACTA'));
}

function minPaidInstallments(
  contracts: PortabilidadeMultiplaContrato[],
): number {
  const values = contracts
    .map(contract => Math.max(0, Math.trunc(contract.parcelas_pagas || 0)))
    .filter(value => value >= 0);

  return values.length ? Math.min(...values) : 0;
}

/**
 * Parâmetros da ÚNICA chamada financeira da operação consolidada.
 *
 * Importante:
 * - valorParcela recebe a parcela do refin já abatida da margem negativa;
 * - saldoDevedor recebe a soma dos saldos reais selecionados;
 * - negativeCardValue é ZERO para impedir que o Motor abata a margem uma
 *   segunda vez;
 * - bancoAtual é sintético porque as regras de cada origem já foram
 *   validadas individualmente antes desta etapa;
 * - não é criada taxa média/prazo médio artificial.
 */
export function buildMotorParamsConsolidadosPortabilidadeMultipla(
  consulta: PortabilidadeMultiplaConsulta,
  benefit: PortabilidadeMultiplaBeneficio,
  contracts: PortabilidadeMultiplaContrato[],
  preValidation: PortabilidadeMultiplaPreValidacaoCompleta,
): any {
  const idade = Math.max(0, Math.trunc(consulta.cliente.idade || 0));

  return {
    idade,
    convenio: 'INSS',
    codigoBeneficio: benefit.especie,
    dataConcessao: benefit.data_concessao,
    bancoAtual: 'PORTABILIDADE MULTIPLA',
    valorParcela: preValidation.parcela_refin,
    saldoDevedor: preValidation.saldo_total,
    prazoTotal: 0,
    parcelasRestantes: 0,
    parcelasPagas: minPaidInstallments(contracts),
    taxaJurosMensal: 0,
    negativeCardValue: 0,
    isCliente60Mais: idade >= 60,
    isAnalfabeto: benefit.analfabeto,
    estado: consulta.cliente.uf,
    hasTwoCards: benefit.has_two_cards,
  };
}

function offerCompatibilityKey(offer: any): string {
  const summary = resumirTabelasFactaDoMotor([offer])[0];

  return summary
    ? criarChaveCompatibilidadeTabelaFacta(summary)
    : '';
}

function allowedCompatibilityKeys(
  intersecao: PortabilidadeMultiplaIntersecaoFacta,
): Set<string> {
  return new Set(
    intersecao.tabelas_comuns.map(
      criarChaveCompatibilidadeTabelaFacta,
    ),
  );
}

function mapOffer(
  offer: any,
  preValidation: PortabilidadeMultiplaPreValidacaoCompleta,
): PortabilidadeMultiplaOfertaConsolidada {
  return {
    id: String(offer?.id || ''),
    banco: String(offer?.name || offer?.banco || 'FACTA'),
    logo: String(offer?.logo || ''),
    tabela: String(offer?.tabela || 'FACTA'),
    prazo: Math.max(0, Math.trunc(toNumber(offer?.prazoRefinPort))),
    taxa_portabilidade: toNumber(
      offer?.novaTaxaPortabilidade ?? offer?.novaTaxaPortTarget,
    ),
    taxa_base: toNumber(offer?.taxaBase),
    taxa_ponderada: toNumber(offer?.taxaPonderada),
    valor_contrato: toNumber(offer?.valorContrato),
    valor_liberado: toNumber(offer?.valorTroco),
    saldo_total: preValidation.saldo_total,
    parcela_refin: preValidation.parcela_refin,
    regras: Array.isArray(offer?.rules)
      ? offer.rules.map((value: unknown) => String(value))
      : [],
  };
}

export function emptySimulacaoConsolidadaPortabilidadeMultipla(
  benefit = '',
  contractsCount = 0,
  preValidation?: PortabilidadeMultiplaPreValidacaoCompleta,
): PortabilidadeMultiplaSimulacaoConsolidada {
  return {
    executada: false,
    elegivel: false,
    chamadas_motor: 0,
    quantidade_ofertas: 0,
    quantidade_contratos: contractsCount,
    beneficio: benefit,
    soma_parcelas: preValidation?.soma_parcelas || 0,
    margem_livre: preValidation?.margem_livre || 0,
    margem_negativa: preValidation?.margem_negativa || 0,
    parcela_refin: preValidation?.parcela_refin || 0,
    saldo_total: preValidation?.saldo_total || 0,
    ofertas: [],
    bloqueios: [],
  };
}

/**
 * Executa UMA ÚNICA chamada do Motor para a operação unificada.
 *
 * Antes desta função:
 * 1. o NB já foi validado;
 * 2. o grupo/misma instituição já foi validado;
 * 3. cada origem já passou individualmente pelas regras FACTA;
 * 4. existe ao menos uma tabela/prazo FACTA compatível com todas as origens.
 */
export function executarSimulacaoConsolidadaPortabilidadeMultipla(
  consulta: PortabilidadeMultiplaConsulta,
  benefit: PortabilidadeMultiplaBeneficio,
  contracts: PortabilidadeMultiplaContrato[],
  preValidation: PortabilidadeMultiplaPreValidacaoCompleta,
  intersecao: PortabilidadeMultiplaIntersecaoFacta,
  context: PortabilidadeMultiplaMotorContext,
  calculateOffers: PortabilidadeMultiplaCalculateOffers,
): PortabilidadeMultiplaSimulacaoConsolidada {
  const bloqueios: PortabilidadeMultiplaBloqueio[] = [];

  const factaBanks = context.banks.filter(isFactaBankRule);

  if (!factaBanks.length) {
    bloqueios.push({
      codigo: 'SEM_TABELA_FACTA',
      mensagem:
        'Nenhuma regra/tabela FACTA ativa foi localizada para executar a operação unificada.',
    });

    return {
      ...emptySimulacaoConsolidadaPortabilidadeMultipla(
        benefit.numero,
        contracts.length,
        preValidation,
      ),
      bloqueios,
    };
  }

  const commonKeys = allowedCompatibilityKeys(intersecao);

  if (!commonKeys.size) {
    bloqueios.push({
      codigo: 'SEM_TABELA_FACTA',
      mensagem:
        'Não existe tabela/prazo FACTA compatível com todas as origens selecionadas.',
    });

    return {
      ...emptySimulacaoConsolidadaPortabilidadeMultipla(
        benefit.numero,
        contracts.length,
        preValidation,
      ),
      bloqueios,
    };
  }

  const params = buildMotorParamsConsolidadosPortabilidadeMultipla(
    consulta,
    benefit,
    contracts,
    preValidation,
  );

  // ÚNICA chamada financeira consolidada ao Motor.
  const offers = calculateOffers(
    params,
    factaBanks,
    context.generalRules,
    context.promotoraPriorities,
    context.promotoraInstallments,
    context.userProfile,
    [],
    context.blockedBanks,
  );

  const finalOffers: PortabilidadeMultiplaOfertaConsolidada[] = [];

  for (const offer of offers || []) {
    const compatibilityKey = offerCompatibilityKey(offer);

    if (!compatibilityKey || !commonKeys.has(compatibilityKey)) {
      continue;
    }

    const valorLiberado = toNumber(offer?.valorTroco);
    const offerValidation = validarOfertaRefinPortabilidadeMultipla({
      saldo_total: preValidation.saldo_total,
      valor_liberado: valorLiberado,
      parcela_refin: preValidation.parcela_refin,
    });

    if (!offerValidation.elegivel) {
      for (const block of offerValidation.bloqueios) {
        if (!bloqueios.some(existing => existing.codigo === block.codigo)) {
          bloqueios.push(block);
        }
      }
      continue;
    }

    finalOffers.push(mapOffer(offer, preValidation));
  }

  if (!finalOffers.length && bloqueios.length === 0) {
    bloqueios.push({
      codigo: 'SEM_TABELA_FACTA',
      mensagem:
        'O Motor FACTA não retornou oferta válida para a parcela e o saldo consolidados desta seleção.',
    });
  }

  return {
    executada: true,
    elegivel: finalOffers.length > 0,
    chamadas_motor: 1,
    quantidade_ofertas: finalOffers.length,
    quantidade_contratos: contracts.length,
    beneficio: benefit.numero,
    soma_parcelas: preValidation.soma_parcelas,
    margem_livre: preValidation.margem_livre,
    margem_negativa: preValidation.margem_negativa,
    parcela_refin: preValidation.parcela_refin,
    saldo_total: preValidation.saldo_total,
    ofertas: finalOffers,
    bloqueios,
  };
}
