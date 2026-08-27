import { getAdminDb } from '@/lib/firebase-admin';
import {
  calculateOffers,
  calculateRate,
} from '@/lib/simulation-engine';
import { consultarCpfMulticorban } from '@/lib/multicorban-service';
import {
  isValidCpfPortabilidadeMultipla,
  normalizeCpfPortabilidadeMultipla,
} from './api';
import { normalizePortabilidadeMultiplaConsulta } from './normalizer';
import { validarPreviamentePortabilidadeMultipla } from './financial';
import {
  validarContratosIndividualmenteNoMotor,
  type PortabilidadeMultiplaResultadoOrigens,
} from './origin-validation';
import {
  interseccionarTabelasFacta,
  type PortabilidadeMultiplaIntersecaoFacta,
} from './intersection';
import {
  PORTABILIDADE_MULTIPLA_MIN_CONTRATOS,
  PORTABILIDADE_MULTIPLA_MAX_CONTRATOS,
  type PortabilidadeMultiplaBloqueio,
} from './rules';
import {
  emptySimulacaoConsolidadaPortabilidadeMultipla,
  executarSimulacaoConsolidadaPortabilidadeMultipla,
  type PortabilidadeMultiplaSimulacaoConsolidada,
} from './consolidated-simulation';

export interface PortabilidadeMultiplaValidarOrigensInput {
  cpf: string;
  beneficio: string;
  contrato_ids: string[];
}

export interface PortabilidadeMultiplaValidarOrigensResponse {
  /**
   * Compatibilidade retroativa da 1F:
   * indica que todas as origens passaram individualmente.
   */
  elegivel: boolean;

  facta_configurada: boolean;
  beneficio: string;
  quantidade_contratos: number;
  pre_validacao: ReturnType<typeof validarPreviamentePortabilidadeMultipla>;
  contratos: PortabilidadeMultiplaResultadoOrigens['contratos'];
  bloqueios_contratos: PortabilidadeMultiplaBloqueio[];

  /**
   * Compatibilidade técnica das origens. A taxa individual não é usada como
   * identidade; a compatibilidade considera a mesma tabela + mesmo prazo.
   */
  intersecao_facta: PortabilidadeMultiplaIntersecaoFacta;
  bloqueios_intersecao: PortabilidadeMultiplaBloqueio[];

  /** Resultado financeiro FINAL: uma única operação FACTA consolidada. */
  simulacao_consolidada: PortabilidadeMultiplaSimulacaoConsolidada;
  pronta_para_consolidar: boolean;
}


function emptyIntersection(): PortabilidadeMultiplaIntersecaoFacta {
  return {
    possui_intersecao: false,
    quantidade_tabelas_comuns: 0,
    tabelas_comuns: [],
    prazos_disponiveis: [],
  };
}

export class PortabilidadeMultiplaOrigemError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PortabilidadeMultiplaOrigemError';
    this.status = status;
  }
}

function normalizeBenefitKey(value: unknown): string {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');

  return digits || raw.toUpperCase();
}

function isFactaBankRule(bank: any): boolean {
  const value = [
    bank?.name,
    bank?.nome,
    bank?.bankName,
    bank?.id,
  ]
    .map(item => String(item ?? '').toUpperCase())
    .join(' ');

  return value.includes('FACTA');
}

function deduplicateBanks(banks: any[]): any[] {
  const unique = new Map<string, any>();

  for (const bank of banks) {
    const key = String(
      bank?.id
      || `${bank?.name || bank?.nome || ''}|${bank?.convenio || ''}`,
    ).trim();

    if (!key) continue;
    if (!unique.has(key)) unique.set(key, bank);
  }

  return Array.from(unique.values());
}

async function loadUserProfile(uid: string, email?: string): Promise<any> {
  const db = getAdminDb();

  if (!db) {
    throw new PortabilidadeMultiplaOrigemError(
      'Firebase Admin indisponível.',
      503,
    );
  }

  const snap = await db.collection('users').doc(uid).get();

  if (!snap.exists) {
    throw new PortabilidadeMultiplaOrigemError(
      'Perfil de usuário não localizado.',
      403,
    );
  }

  const profileData =
    (snap.data() || {}) as Record<string, unknown>;

  const profile: Record<string, unknown> & {
    uid: string;
    email: string;
    status?: string;
    role?: string;
    createdBy?: string;
  } = {
    ...profileData,

    // A identidade autenticada sempre prevalece sobre qualquer
    // campo eventualmente armazenado no documento Firestore.
    uid,
    email: email || '',
  };

  const status = String(
    profile.status || ''
  ).toLowerCase();

  if (status && status !== 'active' && status !== 'ativo') {
    throw new PortabilidadeMultiplaOrigemError(
      'Usuário sem permissão ativa para executar a validação.',
      403,
    );
  }

  return profile;
}

function resolvePromotoraId(profile: any): string {
  if (profile?.role === 'admin') return 'admin';
  if (profile?.role === 'promotora') return String(profile?.uid || 'admin');

  return String(profile?.createdBy || 'admin');
}

async function loadMotorContext(profile: any) {
  const db = getAdminDb();

  if (!db) {
    throw new PortabilidadeMultiplaOrigemError(
      'Firebase Admin indisponível.',
      503,
    );
  }

  const promotoraId = resolvePromotoraId(profile);

  const [banksSnapshot, rulesSnapshot, settingsSnapshot] =
    await Promise.all([
      db.collection('bankRules').get(),
      db.collection('generalRules').get(),
      db.collection('settings').doc(promotoraId).get(),
    ]);

  const banks = deduplicateBanks(
    banksSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })),
  );

  const generalRules = rulesSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));

  const settings = settingsSnapshot.exists
    ? settingsSnapshot.data() || {}
    : {};

  return {
    banks,
    generalRules,
    promotoraPriorities: settings?.bankPriorities || {},
    promotoraInstallments: settings?.bankInstallments || {},
    userProfile: profile,
    nonPortableBanks: settings?.nonPortableBanks || [],
    blockedBanks: settings?.blockedBanks || [],
  };
}

/**
 * Fonte de verdade da Portabilidade Múltipla:
 * - recebe apenas CPF, NB e IDs selecionados;
 * - consulta novamente o MultiCorban no servidor;
 * - reconstrói exclusivamente contratos daquele mesmo benefício/NB;
 * - valida cada origem no Motor apenas como filtro de elegibilidade;
 * - soma parcelas e saldos reais;
 * - executa UMA única simulação FACTA para a operação consolidada.
 */
export async function validarOrigensPortabilidadeMultiplaServer(
  input: PortabilidadeMultiplaValidarOrigensInput,
  authUser: { uid: string; email?: string },
): Promise<PortabilidadeMultiplaValidarOrigensResponse> {
  const cpf = normalizeCpfPortabilidadeMultipla(input.cpf);

  if (!isValidCpfPortabilidadeMultipla(cpf)) {
    throw new PortabilidadeMultiplaOrigemError('CPF inválido.', 400);
  }

  const beneficioKey = normalizeBenefitKey(input.beneficio);

  if (!beneficioKey) {
    throw new PortabilidadeMultiplaOrigemError(
      'Benefício/NB é obrigatório.',
      400,
    );
  }

  if (!Array.isArray(input.contrato_ids)) {
    throw new PortabilidadeMultiplaOrigemError(
      'contrato_ids precisa ser uma lista.',
      400,
    );
  }

  const ids = Array.from(
    new Set(
      input.contrato_ids
        .map(value => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  if (ids.length < PORTABILIDADE_MULTIPLA_MIN_CONTRATOS) {
    throw new PortabilidadeMultiplaOrigemError(
      `Selecione pelo menos ${PORTABILIDADE_MULTIPLA_MIN_CONTRATOS} contratos do mesmo benefício/NB.`,
      400,
    );
  }

  if (ids.length > PORTABILIDADE_MULTIPLA_MAX_CONTRATOS) {
    throw new PortabilidadeMultiplaOrigemError(
      `A Portabilidade Múltipla permite no máximo ${PORTABILIDADE_MULTIPLA_MAX_CONTRATOS} contratos.`,
      400,
    );
  }

  const [rawData, profile] = await Promise.all([
    consultarCpfMulticorban(cpf, 'inss'),
    loadUserProfile(authUser.uid, authUser.email),
  ]);

  const consulta = normalizePortabilidadeMultiplaConsulta(rawData, cpf);

  const benefit = consulta.beneficios.find(
    item => normalizeBenefitKey(item.numero) === beneficioKey,
  );

  if (!benefit) {
    throw new PortabilidadeMultiplaOrigemError(
      'Benefício/NB não localizado na consulta INSS atual.',
      404,
    );
  }

  const selectedIdSet = new Set(ids);
  const selectedContracts = benefit.contratos.filter(
    contract => selectedIdSet.has(contract.id),
  );

  if (selectedContracts.length !== ids.length) {
    throw new PortabilidadeMultiplaOrigemError(
      'Um ou mais contratos selecionados não foram encontrados no benefício consultado.',
      409,
    );
  }

  const preValidation = validarPreviamentePortabilidadeMultipla(
    selectedContracts,
    benefit.margens.margem_livre,
  );

  if (!preValidation.elegivel_previo) {
    return {
      elegivel: false,
      facta_configurada: false,
      beneficio: benefit.numero,
      quantidade_contratos: selectedContracts.length,
      pre_validacao: preValidation,
      contratos: [],
      bloqueios_contratos: preValidation.bloqueios,
      intersecao_facta: emptyIntersection(),
      bloqueios_intersecao: [],
      simulacao_consolidada:
        emptySimulacaoConsolidadaPortabilidadeMultipla(
          benefit.numero,
          selectedContracts.length,
          preValidation,
        ),
      pronta_para_consolidar: false,
    };
  }

  const motorContext = await loadMotorContext(profile);
  const factaConfigured = motorContext.banks.some(isFactaBankRule);

  if (!factaConfigured) {
    const block: PortabilidadeMultiplaBloqueio = {
      codigo: 'SEM_TABELA_FACTA',
      mensagem:
        'Nenhuma regra/tabela FACTA ativa foi encontrada no Motor para o convênio INSS.',
    };

    return {
      elegivel: false,
      facta_configurada: false,
      beneficio: benefit.numero,
      quantidade_contratos: selectedContracts.length,
      pre_validacao: preValidation,
      contratos: [],
      bloqueios_contratos: [],
      intersecao_facta: emptyIntersection(),
      bloqueios_intersecao: [block],
      simulacao_consolidada:
        emptySimulacaoConsolidadaPortabilidadeMultipla(
          benefit.numero,
          selectedContracts.length,
          preValidation,
        ),
      pronta_para_consolidar: false,
    };
  }

  const originValidation = validarContratosIndividualmenteNoMotor(
    consulta,
    benefit,
    selectedContracts,
    motorContext,
    calculateOffers,
    calculateRate,
  );

  if (!originValidation.elegivel_origens) {
    return {
      elegivel: false,
      facta_configurada: true,
      beneficio: benefit.numero,
      quantidade_contratos: selectedContracts.length,
      pre_validacao: preValidation,
      contratos: originValidation.contratos,
      bloqueios_contratos: originValidation.bloqueios_contratos,
      intersecao_facta: emptyIntersection(),
      bloqueios_intersecao: [],
      simulacao_consolidada:
        emptySimulacaoConsolidadaPortabilidadeMultipla(
          benefit.numero,
          selectedContracts.length,
          preValidation,
        ),
      pronta_para_consolidar: false,
    };
  }

  const intersecao = interseccionarTabelasFacta(
    originValidation.contratos,
  );

  const bloqueiosIntersecao: PortabilidadeMultiplaBloqueio[] = [];

  if (!intersecao.possui_intersecao) {
    bloqueiosIntersecao.push({
      codigo: 'SEM_TABELA_FACTA',
      mensagem:
        'Não existe tabela/prazo FACTA compatível simultaneamente com todos os contratos selecionados.',
    });
  }

  const simulacaoConsolidada = intersecao.possui_intersecao
    ? executarSimulacaoConsolidadaPortabilidadeMultipla(
        consulta,
        benefit,
        selectedContracts,
        preValidation,
        intersecao,
        motorContext,
        calculateOffers,
      )
    : emptySimulacaoConsolidadaPortabilidadeMultipla(
        benefit.numero,
        selectedContracts.length,
        preValidation,
      );

  return {
    // Compatibilidade: todas as origens foram aprovadas individualmente.
    elegivel: true,
    facta_configurada: true,
    beneficio: benefit.numero,
    quantidade_contratos: selectedContracts.length,
    pre_validacao: preValidation,
    contratos: originValidation.contratos,
    bloqueios_contratos: [],
    intersecao_facta: intersecao,
    bloqueios_intersecao: bloqueiosIntersecao,
    simulacao_consolidada: simulacaoConsolidada,
    pronta_para_consolidar:
      simulacaoConsolidada.executada
      && simulacaoConsolidada.elegivel,
  };
}
