import type {
  PortabilidadeMultiplaBeneficio,
  PortabilidadeMultiplaConsulta,
  PortabilidadeMultiplaContrato,
} from './types';
import type {
  PortabilidadeMultiplaPreValidacaoCompleta,
} from './financial';
import {
  configFinanceiraPortabilidadeMultiplaPorDestino,
  validarOfertaRefinPortabilidadeMultipla,
} from './financial';
import type {
  PortabilidadeMultiplaBancoDestino,
  PortabilidadeMultiplaBloqueio,
} from './rules';
import type {
  PortabilidadeMultiplaMotorContext,
  PortabilidadeMultiplaCalculateOffers,
} from './origin-validation';
import type {
  PortabilidadeMultiplaIntersecaoFacta,
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

export interface PortabilidadeMultiplaDiagnosticoTabela {
  tabela: string;
  prazo: number;
  coeficiente: number;
  valor_financiado: number;
  saldo_devedor: number;
  troco_calculado: number;
  troco_minimo_exigido: number;
  motivo_recusa: string;
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
  diagnostico_recusa?: PortabilidadeMultiplaDiagnosticoTabela[];
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

function isTargetBankRule(
  bank: any,
  bancoDestino: PortabilidadeMultiplaBancoDestino,
): boolean {
  const values = [
    bank?.name,
    bank?.nome,
    bank?.bankName,
    bank?.id,
  ].map(normalizeText);

  if (bancoDestino === 'DAYCOVAL') {
    return values.some(value => (
      value.includes('DAYCOVAL')
      || value === '707'
      || value.startsWith('707 ')
    ));
  }

  return values.some(value => value.includes('FACTA'));
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
  bancoDestino: PortabilidadeMultiplaBancoDestino = 'FACTA',
): any {
  const idade = Math.max(0, Math.trunc(consulta.cliente.idade || 0));

  return {
    idade,
    convenio: 'INSS',
    codigoBeneficio: benefit.especie,
    dataConcessao: benefit.data_concessao,
    bancoAtual: 'MULTIPLA_ORIGENS_CONSOLIDADAS',
    // FACTA recebe a parcela já ajustada pela regra própria da Múltipla.
    // DAYCOVAL recebe a soma bruta e a margem negativa separadamente para
    // que o Motor aplique o mesmo tratamento usado na simulação comum.
    valorParcela: bancoDestino === 'DAYCOVAL'
      ? preValidation.soma_parcelas
      : preValidation.parcela_refin,
    saldoDevedor: preValidation.saldo_total,
    prazoTotal: 0,
    parcelasRestantes: 0,
    parcelasPagas: minPaidInstallments(contracts),
    taxaJurosMensal: 0,
    negativeCardValue: bancoDestino === 'DAYCOVAL'
      ? preValidation.margem_negativa
      : 0,
    isCliente60Mais: idade >= 60,
    isAnalfabeto: benefit.analfabeto,
    estado: consulta.cliente.uf,
    hasTwoCards: benefit.has_two_cards,
  };
}

function mapOffer(
  offer: any,
  preValidation: PortabilidadeMultiplaPreValidacaoCompleta,
  bancoDestino: PortabilidadeMultiplaBancoDestino,
): PortabilidadeMultiplaOfertaConsolidada {
  return {
    id: String(offer?.id || ''),
    banco: String(offer?.name || offer?.banco || bancoDestino),
    logo: String(offer?.logo || ''),
    tabela: String(offer?.tabela || bancoDestino),
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
 * 2. o grupo/mesma instituição já foi validado;
 * 3. cada origem já passou somente pelas regras prévias de banco/parcelas pagas;
 * 4. troco mínimo e demais regras do refin são avaliados nesta chamada consolidada.
 */
export function executarSimulacaoConsolidadaPortabilidadeMultipla(
  consulta: PortabilidadeMultiplaConsulta,
  benefit: PortabilidadeMultiplaBeneficio,
  contracts: PortabilidadeMultiplaContrato[],
  preValidation: PortabilidadeMultiplaPreValidacaoCompleta,
  _intersecao: PortabilidadeMultiplaIntersecaoFacta,
  bancoDestino: PortabilidadeMultiplaBancoDestino,
  context: PortabilidadeMultiplaMotorContext,
  calculateOffers: PortabilidadeMultiplaCalculateOffers,
): PortabilidadeMultiplaSimulacaoConsolidada {
  const bloqueios: PortabilidadeMultiplaBloqueio[] = [];

  const targetBanks = context.banks.filter(bank => isTargetBankRule(bank, bancoDestino));

  if (!targetBanks.length) {
    bloqueios.push({
      codigo: bancoDestino === 'DAYCOVAL' ? 'SEM_TABELA_DAYCOVAL' : 'SEM_TABELA_FACTA',
      mensagem:
        `Nenhuma regra/tabela ${bancoDestino} ativa foi localizada para executar a operação unificada.`,
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
    bancoDestino,
  );

  // ÚNICA chamada financeira consolidada ao Motor.
  const offers = calculateOffers(
    params,
    targetBanks,
    context.generalRules,
    context.promotoraPriorities,
    context.promotoraInstallments,
    context.userProfile,
    [],
    context.blockedBanks,
  );

  const finalOffers: PortabilidadeMultiplaOfertaConsolidada[] = [];

  for (const offer of offers || []) {
    const valorLiberado = toNumber(offer?.valorTroco);
    const offerValidation = validarOfertaRefinPortabilidadeMultipla(
      {
        saldo_total: preValidation.saldo_total,
        valor_liberado: valorLiberado,
        parcela_refin: preValidation.parcela_refin,
      },
      configFinanceiraPortabilidadeMultiplaPorDestino(bancoDestino),
    );

    if (!offerValidation.elegivel) {
      for (const block of offerValidation.bloqueios) {
        if (!bloqueios.some(existing => existing.codigo === block.codigo)) {
          bloqueios.push(block);
        }
      }
      continue;
    }

    finalOffers.push(mapOffer(offer, preValidation, bancoDestino));
  }

  // IMPORTANTE: preserva exatamente a ordem das tabelas devolvida pelo Motor.
  // A interface agrupa por prazo e considera a primeira tabela de cada prazo
  // como a Melhor Oferta. Não reordena por troco, taxa ou valor liberado.

  let diagnosticoRecusa: PortabilidadeMultiplaDiagnosticoTabela[] | undefined;

  if (!finalOffers.length) {
    const diag = gerarDiagnosticoRecusaConsolidada(
      targetBanks,
      params,
      preValidation,
      bancoDestino,
    );
    diagnosticoRecusa = diag.diagnostico;

    if (bloqueios.length === 0) {
      if (diag.bloqueiosSugeridos.length > 0) {
        for (const block of diag.bloqueiosSugeridos) {
          bloqueios.push(block);
        }
      } else {
        bloqueios.push({
          codigo: bancoDestino === 'DAYCOVAL' ? 'SEM_TABELA_DAYCOVAL' : 'SEM_TABELA_FACTA',
          mensagem:
            `O Motor ${bancoDestino} avaliou as tabelas ativas, mas nenhuma gerou oferta válida para a parcela consolidada de R$ ${preValidation.soma_parcelas.toFixed(2).replace('.', ',')} e saldo de R$ ${preValidation.saldo_total.toFixed(2).replace('.', ',')}.`,
        });
      }
    }
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
    diagnostico_recusa: diagnosticoRecusa,
  };
}

function gerarDiagnosticoRecusaConsolidada(
  targetBanks: any[],
  params: any,
  preValidation: PortabilidadeMultiplaPreValidacaoCompleta,
  bancoDestino: PortabilidadeMultiplaBancoDestino,
): { diagnostico: PortabilidadeMultiplaDiagnosticoTabela[]; bloqueiosSugeridos: PortabilidadeMultiplaBloqueio[] } {
  const diagnostico: PortabilidadeMultiplaDiagnosticoTabela[] = [];
  const bloqueiosSugeridos: PortabilidadeMultiplaBloqueio[] = [];

  const saldoDevedor = preValidation.saldo_total;
  const parcelaParaContrato = bancoDestino === 'DAYCOVAL'
    ? preValidation.soma_parcelas
    : preValidation.parcela_refin;
  const parcelaParaRegras = parcelaParaContrato;
  const idade = params.idade || 0;

  for (const bank of targetBanks) {
    const tabelas = Array.isArray(bank?.tabelas) ? bank.tabelas : [];
    const bankMinTroco = toNumber(bank?.minTroco);
    const bankMinInst = toNumber(bank?.minInstallmentValue) || (bancoDestino === 'DAYCOVAL' ? 20 : 0);

    if (bankMinInst > 0 && parcelaParaRegras < bankMinInst) {
      bloqueiosSugeridos.push({
        codigo: 'PARCELA_ABAIXO_MINIMO',
        mensagem: `A parcela consolidada de R$ ${parcelaParaRegras.toFixed(2).replace('.', ',')} é inferior à parcela mínima de R$ ${bankMinInst.toFixed(2).replace('.', ',')} exigida pelo ${bancoDestino}.`,
      });
    }

    for (const tabela of tabelas) {
      const nomeTabela = String(tabela?.nome || 'Tabela');
      const prazo = Math.max(0, Math.trunc(toNumber(tabela?.prazoRefinPort || tabela?.prazo)));
      const coef = toNumber(tabela?.coeficiente);
      const minTrocoTabela = toNumber(tabela?.minTroco);
      const effectiveMinTroco = minTrocoTabela > 0 ? minTrocoTabela : bankMinTroco;

      if (coef <= 0) {
        diagnostico.push({
          tabela: nomeTabela,
          prazo,
          coeficiente: coef,
          valor_financiado: 0,
          saldo_devedor: saldoDevedor,
          troco_calculado: 0,
          troco_minimo_exigido: effectiveMinTroco,
          motivo_recusa: 'Coeficiente não configurado ou zerado.',
        });
        continue;
      }

      const valorFinanciado = parcelaParaContrato / coef;
      const trocoCalculado = valorFinanciado - saldoDevedor;

      let motivo = '';

      const tableMinAge = toNumber(tabela?.minAge || tabela?.idadeMinima);
      const tableMaxAge = toNumber(tabela?.maxAge || tabela?.idadeMaxima);
      if (tableMinAge > 0 && idade < tableMinAge) {
        motivo = `Idade do cliente (${idade} anos) é inferior ao mínimo da tabela (${tableMinAge} anos).`;
      } else if (tableMaxAge > 0 && idade > tableMaxAge) {
        motivo = `Idade do cliente (${idade} anos) ultrapassa o máximo da tabela (${tableMaxAge} anos).`;
      } else if (trocoCalculado <= 0) {
        motivo = `Troco não gerado: valor financiado (R$ ${valorFinanciado.toFixed(2).replace('.', ',')}) é inferior ou igual ao saldo devedor (R$ ${saldoDevedor.toFixed(2).replace('.', ',')}).`;
      } else if (effectiveMinTroco > 0 && trocoCalculado < effectiveMinTroco) {
        motivo = `Troco gerado de R$ ${trocoCalculado.toFixed(2).replace('.', ',')} é inferior ao troco mínimo exigido de R$ ${effectiveMinTroco.toFixed(2).replace('.', ',')}.`;
      } else {
        motivo = 'Descartada por taxa ponderada ou ticket mínimo da mesa.';
      }

      diagnostico.push({
        tabela: nomeTabela,
        prazo,
        coeficiente: coef,
        valor_financiado: Number(valorFinanciado.toFixed(2)),
        saldo_devedor: Number(saldoDevedor.toFixed(2)),
        troco_calculado: Number(trocoCalculado.toFixed(2)),
        troco_minimo_exigido: effectiveMinTroco,
        motivo_recusa: motivo,
      });
    }
  }

  const trocoInsuficiente = diagnostico.find(d => d.troco_calculado > 0 && d.troco_calculado < d.troco_minimo_exigido);
  const trocoNegativo = diagnostico.find(d => d.troco_calculado <= 0 && d.coeficiente > 0);

  if (trocoInsuficiente && !bloqueiosSugeridos.length) {
    bloqueiosSugeridos.push({
      codigo: 'TROCO_INSUFICIENTE',
      mensagem: `Troco de R$ ${trocoInsuficiente.troco_calculado.toFixed(2).replace('.', ',')} na ${trocoInsuficiente.tabela} (${trocoInsuficiente.prazo}X) não atingiu o mínimo exigido pelo ${bancoDestino} (R$ ${trocoInsuficiente.troco_minimo_exigido.toFixed(2).replace('.', ',')}).`,
    });
  } else if (trocoNegativo && !bloqueiosSugeridos.length) {
    bloqueiosSugeridos.push({
      codigo: 'TROCO_ZERADO',
      mensagem: `A parcela unificada de R$ ${parcelaParaContrato.toFixed(2).replace('.', ',')} não foi suficiente para superar o saldo total de R$ ${saldoDevedor.toFixed(2).replace('.', ',')}, gerando troco zero.`,
    });
  }

  return { diagnostico, bloqueiosSugeridos };
}
