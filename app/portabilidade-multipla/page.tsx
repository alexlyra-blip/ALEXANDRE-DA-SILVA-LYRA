'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Landmark,
  Layers3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import {
  classificarContratoPortabilidadeMultipla,
  normalizePortabilidadeMultiplaConsulta,
  validarInclusaoContratoPortabilidadeMultipla,
  type PortabilidadeMultiplaBeneficio,
  type PortabilidadeMultiplaConsulta,
  type PortabilidadeMultiplaContrato,
} from '@/lib/portabilidade-multipla';

type ConfigMultipla = {
  banco_destino: string;
  convenio: string;
  min_contratos: number;
  max_contratos: number;
  adicional_viabilidade: number;
  parcela_minima_refin: number;
  valor_minimo_contrato_refin: number;
  regra_valor_minimo_contrato_refin: string;
  validacao_valor_minimo_contrato_refin: string;
  grupos: {
    A: string[];
    B: string[];
  };
  regra_outros_bancos: 'GRUPO_C_BLOQUEADO';
};

type Bloqueio = {
  codigo: string;
  mensagem: string;
  contrato_id?: string;
  banco?: string;
  beneficio?: string;
};

type PreValidacao = {
  elegivel_previo: boolean;
  grupo: 'A' | 'B' | 'AB' | null;
  quantidade_contratos: number;
  beneficio: string | null;
  cpf_valido: boolean;
  beneficio_solicitado: string | null;
  margem_livre: number;
  margem_negativa: number;
  minimo_viabilidade: number;
  regra_viabilidade_atendida: boolean;
  soma_parcelas: number;
  maior_parcela: number;
  parcela_refin: number;
  parcela_minima_refin: number;
  parcela_refin_minima_atendida: boolean;
  saldo_total: number;
  valor_minimo_contrato_refin: number;
  validacao_valor_contrato_pendente: true;
  bloqueios: Bloqueio[];
};

type TabelaFactaOrigem = {
  chave: string;
  nome: string;
  prazo: number;
  taxa: number;
};

type ContratoOrigemValidado = {
  contrato_id: string;
  contrato: string;
  banco: string;
  codigo_banco: string;
  beneficio: string;
  elegivel_origem: boolean;
  ofertas_facta_count: number;
  tabelas_facta: TabelaFactaOrigem[];
};

type ElegibilidadeContrato = {
  contrato_id: string;
  contrato: string;
  banco: string;
  codigo_banco: string;
  beneficio: string;
  grupo: 'A' | 'B' | 'C' | 'SEM_BANCO';
  selecionavel: boolean;
  motivo: string;
  parcelas_pagas: number;
  parcelas_minimas: number;
};

type IntersecaoFacta = {
  possui_intersecao: boolean;
  quantidade_tabelas_comuns: number;
  tabelas_comuns: TabelaFactaOrigem[];
  prazos_disponiveis: number[];
};

type OfertaConsolidada = {
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
};

type SimulacaoConsolidada = {
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
  ofertas: OfertaConsolidada[];
  bloqueios: Bloqueio[];
};

type ValidacaoOrigens = {
  elegivel: boolean;
  facta_configurada: boolean;
  beneficio: string;
  quantidade_contratos: number;
  contratos: ContratoOrigemValidado[];
  bloqueios_contratos: Bloqueio[];
  intersecao_facta: IntersecaoFacta;
  bloqueios_intersecao: Bloqueio[];
  simulacao_consolidada: SimulacaoConsolidada;
  pronta_para_consolidar: boolean;
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

function maskCpf(value: string): string {
  const digits = onlyDigits(value);

  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'Não informado';
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatRate(value: number): string {
  if (!value || !Number.isFinite(value)) return 'Não informada';
  return `${value.toFixed(2).replace('.', ',')}% a.m.`;
}

async function readResponse(response: Response): Promise<any> {
  const payload = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error
      || payload?.message
      || `Falha na requisição (${response.status}).`;

    throw new Error(message);
  }

  return payload;
}

function benefitLabel(benefit: PortabilidadeMultiplaBeneficio): string {
  const especie = benefit.especie ? `Espécie ${benefit.especie}` : 'Espécie não informada';
  return `NB ${benefit.numero || 'não informado'} • ${especie}`;
}

function contractSelectionReason(
  selected: PortabilidadeMultiplaContrato[],
  contract: PortabilidadeMultiplaContrato,
  eligibility?: ElegibilidadeContrato,
): { allowed: boolean; reason: string } {
  if (eligibility && !eligibility.selecionavel) {
    return {
      allowed: false,
      reason: eligibility.motivo || 'Contrato bloqueado pelas regras FACTA.',
    };
  }

  if (contract.parcela <= 0) {
    return {
      allowed: false,
      reason: 'Parcela não informada',
    };
  }

  if (contract.saldo_devedor === null || contract.saldo_devedor <= 0) {
    return {
      allowed: false,
      reason: 'Saldo devedor não informado',
    };
  }

  const validation = validarInclusaoContratoPortabilidadeMultipla(
    selected,
    contract,
  );

  return {
    allowed: validation.permitido,
    reason: validation.bloqueio?.mensagem || '',
  };
}

export default function PortabilidadeMultiplaPage() {
  const { user } = useAuth();

  const getAuthHeaders = async (
    json = false,
  ): Promise<HeadersInit> => {
    if (!user) {
      throw new Error('Usuário não autenticado.');
    }

    const token = await user.getIdToken();

    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
    };
  };

  const [cpf, setCpf] = useState('');
  const [config, setConfig] = useState<ConfigMultipla | null>(null);
  const [consulta, setConsulta] = useState<PortabilidadeMultiplaConsulta | null>(null);
  const [selectedBenefitNumber, setSelectedBenefitNumber] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [validation, setValidation] = useState<PreValidacao | null>(null);
  const [originValidation, setOriginValidation] =
    useState<ValidacaoOrigens | null>(null);

  const [eligibilidadeContratos, setElegibilidadeContratos] =
    useState<Record<string, ElegibilidadeContrato> | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingConsulta, setLoadingConsulta] = useState(false);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [loadingOrigins, setLoadingOrigins] = useState(false);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    if (!user) {
      setLoadingConfig(false);

      return () => {
        active = false;
      };
    }

    async function loadConfig() {
      setLoadingConfig(true);

      try {
        const response = await fetch(
          '/api/portabilidade-multipla/config',
          {
            method: 'GET',
            headers: await getAuthHeaders(),
            cache: 'no-store',
          },
        );

        const payload = await readResponse(response);

        if (active) {
          setConfig(payload);
        }
      } catch (configError) {
        if (active) {
          setError(
            configError instanceof Error
              ? configError.message
              : 'Falha ao carregar configuração.',
          );
        }
      } finally {
        if (active) {
          setLoadingConfig(false);
        }
      }
    }

    void loadConfig();

    return () => {
      active = false;
    };
  }, [user?.uid]);

  const selectedBenefit = useMemo(() => {
    if (!consulta || !selectedBenefitNumber) return null;

    return (
      consulta.beneficios.find(
        benefit => benefit.numero === selectedBenefitNumber,
      )
      || null
    );
  }, [consulta, selectedBenefitNumber]);

  const selectedContracts = useMemo(() => {
    if (!selectedBenefit) return [];

    const selectedSet = new Set(selectedIds);

    return selectedBenefit.contratos.filter(
      contract => selectedSet.has(contract.id),
    );
  }, [selectedBenefit, selectedIds]);

  const orderedContracts = useMemo(() => {
    if (!selectedBenefit) return [];

    const order: Record<string, number> = { A: 0, B: 1, C: 2, SEM_BANCO: 3 };

    return [...selectedBenefit.contratos].sort((a, b) => {
      const groupA = classificarContratoPortabilidadeMultipla(a).grupo;
      const groupB = classificarContratoPortabilidadeMultipla(b).grupo;
      return (order[groupA] ?? 9) - (order[groupB] ?? 9);
    });
  }, [selectedBenefit]);

  const selectedGroup = useMemo(() => {
    if (!selectedContracts.length) return null;

    const group = classificarContratoPortabilidadeMultipla(
      selectedContracts[0],
    ).grupo;

    const groups = new Set(
      selectedContracts.map(contract =>
        classificarContratoPortabilidadeMultipla(contract).grupo,
      ),
    );

    if (groups.has('A') && groups.has('B')) return 'Grupos A + B';
    if (group === 'A' || group === 'B') return `Grupo ${group}`;
    return null;
  }, [selectedContracts]);

  const resetOperation = () => {
    setConsulta(null);
    setSelectedBenefitNumber(null);
    setSelectedIds([]);
    setValidation(null);
    setOriginValidation(null);
    setElegibilidadeContratos(null);
    setError('');
  };

  const handleCpfChange = (value: string) => {
    setCpf(maskCpf(value));

    if (consulta) {
      resetOperation();
    }
  };

  const loadBenefitEligibility = async (
    benefitNumber: string,
    cpfValue: string,
  ) => {
    setLoadingEligibility(true);
    setElegibilidadeContratos(null);

    try {
      const response = await fetch(
        '/api/portabilidade-multipla/elegibilidade',
        {
          method: 'POST',
          headers: await getAuthHeaders(true),
          body: JSON.stringify({
            cpf: onlyDigits(cpfValue),
            beneficio: benefitNumber,
          }),
          cache: 'no-store',
        },
      );

      const payload = await readResponse(response);
      const map: Record<string, ElegibilidadeContrato> = {};

      for (const contract of payload?.contratos || []) {
        map[contract.contrato_id] = contract;
      }

      setElegibilidadeContratos(map);
    } catch (eligibilityError) {
      setError(
        eligibilityError instanceof Error
          ? eligibilityError.message
          : 'Falha ao validar elegibilidade FACTA dos contratos.',
      );
    } finally {
      setLoadingEligibility(false);
    }
  };

  const handleConsult = async (event: FormEvent) => {
    event.preventDefault();

    const cpfDigits = onlyDigits(cpf);

    if (cpfDigits.length !== 11) {
      setError('Informe um CPF com 11 dígitos.');
      return;
    }

    setLoadingConsulta(true);
    setError('');
    setConsulta(null);
    setSelectedBenefitNumber(null);
    setSelectedIds([]);
    setValidation(null);
    setOriginValidation(null);
    setElegibilidadeContratos(null);

    try {
      const response = await fetch(
        '/api/multicorban/consulta-cpf',
        {
          method: 'POST',
          headers: await getAuthHeaders(true),
          body: JSON.stringify({
            cpf: cpfDigits,
            type: 'inss',
          }),
          cache: 'no-store',
        },
      );

      const raw = await readResponse(response);
      const normalized = normalizePortabilidadeMultiplaConsulta(
        raw,
        cpfDigits,
      );

      if (!normalized.beneficios.length) {
        throw new Error('Nenhum benefício INSS foi localizado para este CPF.');
      }

      setConsulta(normalized);

      if (normalized.beneficios.length === 1) {
        const singleBenefit = normalized.beneficios[0].numero;
        setSelectedBenefitNumber(singleBenefit);
        void loadBenefitEligibility(singleBenefit, cpfDigits);
      }
    } catch (consultaError) {
      setError(
        consultaError instanceof Error
          ? consultaError.message
          : 'Falha ao consultar CPF.',
      );
    } finally {
      setLoadingConsulta(false);
    }
  };

  const handleBenefitChange = (benefitNumber: string) => {
    setSelectedBenefitNumber(benefitNumber);
    setSelectedIds([]);
    setValidation(null);
    setOriginValidation(null);
    setElegibilidadeContratos(null);
    setError('');
    void loadBenefitEligibility(benefitNumber, cpf);
  };

  const toggleContract = (contract: PortabilidadeMultiplaContrato) => {
    const isSelected = selectedIds.includes(contract.id);

    if (isSelected) {
      setSelectedIds(current => current.filter(id => id !== contract.id));
      setValidation(null);
      setOriginValidation(null);
      return;
    }

    const check = contractSelectionReason(
      selectedContracts,
      contract,
      eligibilidadeContratos?.[contract.id],
    );

    if (!check.allowed) {
      setError(check.reason || 'Este contrato não pode ser selecionado.');
      return;
    }

    setError('');
    setValidation(null);
    setOriginValidation(null);
    setSelectedIds(current => [...current, contract.id]);
  };

  const handlePreValidate = async () => {
    if (!selectedBenefit) {
      setError('Selecione um benefício/NB.');
      return;
    }

    const minContracts = config?.min_contratos || 2;

    if (selectedContracts.length < minContracts) {
      setError(
        `Selecione pelo menos ${minContracts} contratos do mesmo benefício/NB.`,
      );
      return;
    }

    setLoadingValidation(true);
    setLoadingOrigins(false);
    setValidation(null);
    setOriginValidation(null);
    setError('');

    try {
      const response = await fetch(
        '/api/portabilidade-multipla/validar',
        {
          method: 'POST',
          headers: await getAuthHeaders(true),
          body: JSON.stringify({
            cpf: onlyDigits(cpf),
            beneficio: selectedBenefit.numero,
            margem_livre: selectedBenefit.margens.margem_livre,
            contratos: selectedContracts,
          }),
          cache: 'no-store',
        },
      );

      const payload: PreValidacao = await readResponse(response);
      setValidation(payload);

      if (!payload.elegivel_previo) {
        return;
      }

      setLoadingOrigins(true);

      const originResponse = await fetch(
        '/api/portabilidade-multipla/validar-origens',
        {
          method: 'POST',
          headers: await getAuthHeaders(true),
          body: JSON.stringify({
            cpf: onlyDigits(cpf),
            beneficio: selectedBenefit.numero,
            contrato_ids: selectedContracts.map(
              contract => contract.id,
            ),
          }),
          cache: 'no-store',
        },
      );

      const originPayload: ValidacaoOrigens =
        await readResponse(originResponse);

      setOriginValidation(originPayload);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : 'Falha ao validar seleção.',
      );
    } finally {
      setLoadingValidation(false);
      setLoadingOrigins(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 md:flex">
      <Sidebar />

      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 lg:p-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-6 py-6 dark:border-white/10 md:px-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:ring-rose-500/20">
                    <Layers3 size={28} />
                  </div>

                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-rose-600 dark:bg-rose-500/10">
                        FACTA • INSS
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:bg-white/5 dark:text-slate-300">
                        Até {config?.max_contratos || 6} contratos
                      </span>
                    </div>

                    <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white md:text-3xl">
                      Portabilidade Múltipla
                    </h1>

                    <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500 dark:text-slate-400">
                      Consulte o CPF, escolha um único benefício/NB, selecione os contratos compatíveis e simule a portabilidade + refinanciamento unificados na FACTA.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Grupo
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-800 dark:text-white">
                      {selectedGroup || '—'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Selecionados
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-800 dark:text-white">
                      {selectedContracts.length}/{config?.max_contratos || 6}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Refin mín.
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-800 dark:text-white">
                      {formatMoney(config?.parcela_minima_refin || 50)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 md:px-8">
              <form
                onSubmit={handleConsult}
                className="flex flex-col gap-3 md:flex-row md:items-end"
              >
                <div className="flex-1">
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    CPF do cliente
                  </label>

                  <div className="relative">
                    <Search
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={cpf}
                      onChange={event => handleCpfChange(event.target.value)}
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-bold text-slate-800 outline-none transition focus:border-primary/60 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loadingConsulta || loadingConfig}
                  className="flex h-12 min-w-44 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingConsulta ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Search size={18} />
                  )}
                  Consultar INSS
                </button>

                {consulta && (
                  <button
                    type="button"
                    onClick={() => {
                      setCpf('');
                      resetOperation();
                    }}
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-wider text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    <RefreshCw size={16} />
                    Nova consulta
                  </button>
                )}
              </form>
            </div>
          </header>

          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide">
                  Atenção
                </p>
                <p className="mt-1 text-sm font-semibold">{error}</p>
              </div>
            </div>
          )}

          {loadingConfig && (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-8 text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-slate-900">
              <Loader2 size={20} className="animate-spin" />
              Carregando regras da Portabilidade Múltipla...
            </div>
          )}

          {consulta && (
            <>
              <section className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">
                      <UserRound size={20} />
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Cliente
                      </p>
                      <h2 className="text-base font-black text-slate-800 dark:text-white">
                        {consulta.cliente.nome || 'Nome não informado'}
                      </h2>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <InfoTile label="CPF" value={maskCpf(consulta.cliente.cpf || cpf)} />
                    <InfoTile label="UF" value={consulta.cliente.uf || '—'} />
                    <InfoTile
                      label="Benefícios"
                      value={String(consulta.beneficios.length)}
                    />
                    <InfoTile
                      label="Operação"
                      value="FACTA"
                    />
                  </div>
                </div>

                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10">
                      <FileText size={20} />
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Benefício da operação
                      </p>
                      <h2 className="text-base font-black text-slate-800 dark:text-white">
                        {consulta.beneficios.length > 1
                          ? 'Selecione o NB'
                          : benefitLabel(consulta.beneficios[0])}
                      </h2>
                    </div>
                  </div>

                  {consulta.beneficios.length > 1 ? (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {consulta.beneficios.map(benefit => {
                        const active = benefit.numero === selectedBenefitNumber;

                        return (
                          <button
                            key={benefit.numero || benefitLabel(benefit)}
                            type="button"
                            onClick={() => handleBenefitChange(benefit.numero)}
                            className={`rounded-2xl border p-4 text-left transition ${
                              active
                                ? 'border-rose-400 bg-rose-50 ring-4 ring-rose-500/10 dark:bg-rose-500/10'
                                : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-white/10 dark:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-slate-800 dark:text-white">
                                NB {benefit.numero || 'não informado'}
                              </span>
                              {active && (
                                <CheckCircle2 size={17} className="text-rose-600" />
                              )}
                            </div>

                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Espécie {benefit.especie || '—'} • {benefit.situacao || '—'}
                            </p>

                            <p className="mt-2 text-xs font-black text-slate-600 dark:text-slate-300">
                              Margem: {formatMoney(benefit.margens.margem_livre)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <InfoTile
                        label="NB"
                        value={consulta.beneficios[0].numero || '—'}
                      />
                      <InfoTile
                        label="Espécie"
                        value={consulta.beneficios[0].especie || '—'}
                      />
                      <InfoTile
                        label="Margem livre"
                        value={formatMoney(
                          consulta.beneficios[0].margens.margem_livre,
                        )}
                      />
                    </div>
                  )}
                </div>
              </section>

              {selectedBenefit ? (
                <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6">
                  <div className="mb-5 flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-white/10 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Landmark size={20} className="text-rose-600" />
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">
                          Contratos do benefício
                        </h2>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        Selecione de 2 a 6 contratos do mesmo NB. Grupo A e Grupo B podem ser combinados. Grupo C fica bloqueado.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge text={`NB ${selectedBenefit.numero || '—'}`} />
                      <Badge text={`Margem ${formatMoney(selectedBenefit.margens.margem_livre)}`} />
                      <Badge
                        text={`${selectedContracts.length}/${config?.max_contratos || 6} selecionados`}
                      />
                    </div>
                  </div>

                  {selectedBenefit.contratos.length ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {orderedContracts.map(contract => {
                        const classified =
                          classificarContratoPortabilidadeMultipla(contract);
                        const selected = selectedIds.includes(contract.id);
                        const eligibility = eligibilidadeContratos?.[contract.id];
                        const selection = selected
                          ? { allowed: true, reason: '' }
                          : loadingEligibility
                            ? { allowed: false, reason: 'Validando regras FACTA...' }
                            : contractSelectionReason(
                                selectedContracts,
                                contract,
                                eligibility,
                              );
                        const disabled = !selected && !selection.allowed;

                        return (
                          <button
                            key={contract.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleContract(contract)}
                            title={disabled ? selection.reason : undefined}
                            className={`relative overflow-hidden rounded-[1.5rem] border p-5 text-left transition ${
                              selected
                                ? 'border-emerald-400 bg-emerald-50/70 ring-4 ring-emerald-500/10 dark:bg-emerald-500/10'
                                : disabled
                                  ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-55 dark:border-white/10 dark:bg-white/[0.03]'
                                  : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg dark:border-white/10 dark:bg-white/[0.03]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-black uppercase text-slate-900 dark:text-white">
                                    {classified.banco_normalizado
                                      || contract.banco
                                      || 'Banco não identificado'}
                                  </span>

                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
                                      classified.grupo === 'A'
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                        : classified.grupo === 'B'
                                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                                          : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                                    }`}
                                  >
                                    {classified.grupo === 'SEM_BANCO'
                                      ? 'Banco não identificado'
                                      : `Grupo ${classified.grupo}`}
                                  </span>
                                </div>

                                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Contrato {contract.contrato || 'não informado'}
                                </p>
                              </div>

                              <div
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                                  selected
                                    ? 'border-emerald-500 bg-emerald-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-300 dark:border-white/10 dark:bg-white/5'
                                }`}
                              >
                                {selected ? (
                                  <CheckCircle2 size={18} />
                                ) : (
                                  <ChevronRight size={16} />
                                )}
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                              <ContractField
                                label="Parcela"
                                value={formatMoney(contract.parcela)}
                                highlight
                              />
                              <ContractField
                                label="Saldo devedor"
                                value={formatMoney(contract.saldo_devedor)}
                                highlight
                              />
                              <ContractField
                                label="Taxa atual"
                                value={formatRate(contract.taxa)}
                              />
                              <ContractField
                                label="Prazo original"
                                value={contract.prazo ? `${contract.prazo}x` : '—'}
                              />
                              <ContractField
                                label="Prazo restante"
                                value={contract.prazo_restante ? `${contract.prazo_restante}x` : '—'}
                              />
                              <ContractField
                                label="Parcelas pagas"
                                value={String(contract.parcelas_pagas || 0)}
                              />
                              <ContractField
                                label="Valor original"
                                value={formatMoney(contract.valor_contrato)}
                              />
                              <ContractField
                                label="NB"
                                value={contract.beneficio || '—'}
                              />
                              <ContractField
                                label="Banco cód."
                                value={contract.codigo_banco || '—'}
                              />
                            </div>

                            {eligibility && (
                              <div
                                className={`mt-4 rounded-xl px-3 py-2.5 text-[10px] font-bold leading-relaxed ${
                                  eligibility.selecionavel
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
                                    : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200'
                                }`}
                              >
                                {eligibility.motivo}
                              </div>
                            )}

                            {disabled && selection.reason && !eligibility && (
                              <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[10px] font-bold leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                {selection.reason}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-white/10">
                      <FileText size={30} className="mx-auto text-slate-300" />
                      <p className="mt-3 text-sm font-bold text-slate-500">
                        Nenhum empréstimo ativo foi localizado neste benefício.
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-white/5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                        Seleção atual
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        {selectedContracts.length < (config?.min_contratos || 2)
                          ? `Selecione pelo menos ${config?.min_contratos || 2} contratos do mesmo benefício/NB.`
                          : `${selectedContracts.length} contratos prontos para a simulação unificada.`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handlePreValidate}
                      disabled={selectedContracts.length < (config?.min_contratos || 2) || loadingValidation || loadingOrigins}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-[11px] font-black uppercase tracking-wider text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950"
                    >
                      {loadingValidation || loadingOrigins ? (
                        <Loader2 size={17} className="animate-spin" />
                      ) : (
                        <ShieldCheck size={17} />
                      )}
                      Simular Portabilidade Múltipla
                    </button>
                  </div>
                </section>
              ) : (
                consulta.beneficios.length > 1 && (
                  <div className="rounded-[2rem] border border-dashed border-rose-200 bg-rose-50/50 px-6 py-10 text-center dark:border-rose-500/20 dark:bg-rose-500/5">
                    <FileText size={32} className="mx-auto text-rose-400" />
                    <h3 className="mt-3 text-sm font-black text-slate-800 dark:text-white">
                      Selecione o benefício que será trabalhado
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      A operação não mistura contratos de benefícios/NBs diferentes.
                    </p>
                  </div>
                )
              )}
            </>
          )}

          {validation && (
            <section
              className={`rounded-[2rem] border p-6 shadow-sm ${
                validation.elegivel_previo
                  ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/20 dark:bg-emerald-500/5'
                  : 'border-amber-200 bg-amber-50/40 dark:border-amber-500/20 dark:bg-amber-500/5'
              }`}
            >
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      validation.elegivel_previo
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                    }`}
                  >
                    {validation.elegivel_previo ? (
                      <CheckCircle2 size={22} />
                    ) : (
                      <AlertTriangle size={22} />
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Resultado da pré-validação
                    </p>
                    <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                      {validation.elegivel_previo
                        ? 'Seleção estruturalmente elegível'
                        : 'Seleção possui bloqueios'}
                    </h2>
                    <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
                      O servidor confirma o mesmo NB, aceita combinações entre os Grupos A e B, bloqueia Grupo C e valida cada origem nas regras FACTA antes da simulação consolidada.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Badge text={validation.grupo === 'AB' ? 'Grupos A + B' : `Grupo ${validation.grupo || '—'}`} />
                  <Badge text={`${validation.quantidade_contratos} contratos`} />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                <SummaryCard
                  icon={<CircleDollarSign size={18} />}
                  label="Margem livre"
                  value={formatMoney(validation.margem_livre)}
                  tone={validation.margem_livre < 0 ? 'danger' : 'success'}
                />
                <SummaryCard
                  icon={<AlertTriangle size={18} />}
                  label="Margem negativa"
                  value={formatMoney(validation.margem_negativa)}
                  tone={validation.margem_negativa > 0 ? 'danger' : 'success'}
                />
                <SummaryCard
                  icon={<Banknote size={18} />}
                  label="Soma parcelas"
                  value={formatMoney(validation.soma_parcelas)}
                />
                <SummaryCard
                  icon={<Layers3 size={18} />}
                  label="Parcela refin"
                  value={formatMoney(validation.parcela_refin)}
                />
                <SummaryCard
                  icon={<Landmark size={18} />}
                  label="Saldo total"
                  value={formatMoney(validation.saldo_total)}
                />
                <SummaryCard
                  label="Maior parcela"
                  value={formatMoney(validation.maior_parcela)}
                />
                <SummaryCard
                  label="Mínimo viabilidade"
                  value={formatMoney(validation.minimo_viabilidade)}
                />
                <SummaryCard
                  label="Parcela mín. refin"
                  value={formatMoney(validation.parcela_minima_refin)}
                />
                <SummaryCard
                  label="Novo contrato mín."
                  value={formatMoney(validation.valor_minimo_contrato_refin)}
                />
                <SummaryCard
                  label="NB"
                  value={validation.beneficio || '—'}
                />
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Regra dos R$ 3.000,00
                </p>
                <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                  O mínimo do novo refinanciamento será validado somente quando a oferta FACTA existir:
                  {' '}
                  <strong>saldo total portado + valor liberado da nova oferta ≥ R$ 3.000,00</strong>.
                </p>
              </div>

              {!!validation.bloqueios.length && (
                <div className="mt-5 space-y-2">
                  {validation.bloqueios.map((block, index) => (
                    <div
                      key={`${block.codigo}-${block.contrato_id || index}`}
                      className="flex gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 dark:border-amber-500/20 dark:bg-white/5"
                    >
                      <AlertTriangle
                        size={17}
                        className="mt-0.5 shrink-0 text-amber-600"
                      />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          {block.codigo}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {block.mensagem}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {loadingOrigins && (
            <section className="flex items-center justify-center gap-3 rounded-[2rem] border border-slate-200 bg-white py-8 text-sm font-bold text-slate-500 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <Loader2 size={20} className="animate-spin" />
              Validando origens e simulando a operação unificada na FACTA...
            </section>
          )}

          {originValidation && (
            <section
              className={`rounded-[2rem] border p-6 shadow-sm ${
                originValidation.simulacao_consolidada.elegivel
                  ? 'border-emerald-200 bg-white dark:border-emerald-500/20 dark:bg-slate-900'
                  : 'border-amber-200 bg-white dark:border-amber-500/20 dark:bg-slate-900'
              }`}
            >
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-white/10 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      originValidation.simulacao_consolidada.elegivel
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                    }`}
                  >
                    {originValidation.simulacao_consolidada.elegivel ? (
                      <CheckCircle2 size={22} />
                    ) : (
                      <AlertTriangle size={22} />
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Portabilidade + Refin • FACTA
                    </p>
                    <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                      {originValidation.simulacao_consolidada.elegivel
                        ? 'Simulação unificada concluída'
                        : originValidation.elegivel
                          ? 'Seleção sem oferta consolidada válida'
                          : 'Existe contrato bloqueado pela regra FACTA'}
                    </h2>
                    <p className="mt-1 max-w-3xl text-xs font-semibold text-slate-500">
                      As origens são verificadas individualmente apenas para respeitar as regras FACTA. Depois disso, o sistema usa o mesmo NB, soma as parcelas e os saldos selecionados e executa uma única simulação financeira consolidada.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge text={`NB ${originValidation.beneficio}`} />
                  <Badge text={`${originValidation.quantidade_contratos} contratos`} />
                  <Badge
                    text={
                      originValidation.simulacao_consolidada.chamadas_motor === 1
                        ? '1 simulação consolidada'
                        : 'Sem simulação final'
                    }
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryCard
                  icon={<Banknote size={18} />}
                  label="Soma das parcelas"
                  value={formatMoney(originValidation.simulacao_consolidada.soma_parcelas)}
                />
                <SummaryCard
                  icon={<AlertTriangle size={18} />}
                  label="Margem negativa"
                  value={formatMoney(originValidation.simulacao_consolidada.margem_negativa)}
                  tone={originValidation.simulacao_consolidada.margem_negativa > 0 ? 'danger' : 'success'}
                />
                <SummaryCard
                  icon={<Layers3 size={18} />}
                  label="Parcela unificada"
                  value={formatMoney(originValidation.simulacao_consolidada.parcela_refin)}
                />
                <SummaryCard
                  icon={<Landmark size={18} />}
                  label="Saldo total portado"
                  value={formatMoney(originValidation.simulacao_consolidada.saldo_total)}
                />
                <SummaryCard
                  icon={<CircleDollarSign size={18} />}
                  label="Ofertas FACTA"
                  value={String(originValidation.simulacao_consolidada.quantidade_ofertas)}
                />
              </div>

              {originValidation.simulacao_consolidada.ofertas.length > 0 && (
                <div className="mt-6">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                        Resultado da operação unificada
                      </p>
                      <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">
                        Melhor oferta FACTA
                      </h3>
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-primary">
                      108X como referência
                    </span>
                  </div>

                  {(() => {
                    const offers = originValidation.simulacao_consolidada.ofertas;
                    const primaryOffer = offers[0];
                    const otherOffers = offers.slice(1);

                    return (
                      <>
                        <div className="relative overflow-hidden rounded-[1.75rem] border border-primary/20 bg-white p-5 shadow-lg shadow-primary/5 dark:border-primary/20 dark:bg-slate-900 md:p-6">
                          <div className="absolute right-0 top-0 rounded-bl-2xl bg-primary px-4 py-2 text-[9px] font-black uppercase tracking-wider text-white">
                            Oferta principal
                          </div>

                          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                                {primaryOffer.banco || 'FACTA'} • Portabilidade + Refin
                              </p>
                              <h4 className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                                {primaryOffer.tabela || 'Tabela FACTA'}
                              </h4>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {primaryOffer.prazo === 108
                                  ? 'Prazo de 108 meses priorizado como referência.'
                                  : '108x não disponível nesta seleção; exibindo a primeira tabela válida do Motor.'}
                              </p>
                            </div>

                            <Badge text={primaryOffer.prazo > 0 ? `${primaryOffer.prazo}X` : 'Prazo tabela'} />
                          </div>

                          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <InfoTile label="Parcela refin" value={formatMoney(primaryOffer.parcela_refin)} />
                            <InfoTile label="Novo contrato" value={formatMoney(primaryOffer.valor_contrato)} />
                            <InfoTile label="Saldo portado" value={formatMoney(primaryOffer.saldo_total)} />
                            <InfoTile label="Valor liberado" value={formatMoney(primaryOffer.valor_liberado)} />
                            <InfoTile
                              label="Taxa"
                              value={formatRate(
                                primaryOffer.taxa_portabilidade
                                || primaryOffer.taxa_base
                                || primaryOffer.taxa_ponderada
                              )}
                            />
                            <InfoTile label="Tabela" value={primaryOffer.tabela || 'FACTA'} />
                          </div>
                        </div>

                        {otherOffers.length > 0 && (
                          <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                            <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-primary">
                              Ver outros prazos e tabelas disponíveis ({otherOffers.length})
                            </summary>
                            <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                              {otherOffers.map(offer => (
                                <div
                                  key={offer.id}
                                  className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-[9px] font-black uppercase tracking-widest text-primary">
                                        {offer.banco || 'FACTA'}
                                      </p>
                                      <h4 className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                                        {offer.tabela || 'Tabela FACTA'}
                                      </h4>
                                    </div>
                                    {offer.prazo > 0 && <Badge text={`${offer.prazo}X`} />}
                                  </div>

                                  <div className="mt-3 grid grid-cols-2 gap-2">
                                    <InfoTile label="Novo contrato" value={formatMoney(offer.valor_contrato)} />
                                    <InfoTile label="Valor liberado" value={formatMoney(offer.valor_liberado)} />
                                    <InfoTile label="Parcela refin" value={formatMoney(offer.parcela_refin)} />
                                    <InfoTile
                                      label="Taxa"
                                      value={formatRate(
                                        offer.taxa_portabilidade
                                        || offer.taxa_base
                                        || offer.taxa_ponderada
                                      )}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {(originValidation.bloqueios_contratos.length > 0
                || originValidation.bloqueios_intersecao.length > 0
                || originValidation.simulacao_consolidada.bloqueios.length > 0) && (
                <div className="mt-5 space-y-2">
                  {[
                    ...originValidation.bloqueios_contratos,
                    ...originValidation.bloqueios_intersecao,
                    ...originValidation.simulacao_consolidada.bloqueios,
                  ].map((block, index) => (
                    <div
                      key={`${block.codigo}-${block.contrato_id || index}`}
                      className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10"
                    >
                      <AlertTriangle
                        size={17}
                        className="mt-0.5 shrink-0 text-amber-600"
                      />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          {block.codigo}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {block.mensagem}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!!originValidation.contratos.length && (
                <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/5">
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Ver validação das {originValidation.contratos.length} origens
                  </summary>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {originValidation.contratos.map(contract => (
                      <div
                        key={contract.contrato_id}
                        className={`rounded-xl border p-3 ${
                          contract.elegivel_origem
                            ? 'border-emerald-200 bg-white dark:border-emerald-500/20 dark:bg-white/5'
                            : 'border-amber-200 bg-white dark:border-amber-500/20 dark:bg-white/5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-slate-800 dark:text-white">
                              {contract.banco || 'Banco não informado'}
                            </p>
                            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wider text-slate-400">
                              Contrato {contract.contrato || '—'} • NB {contract.beneficio || '—'}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-wider ${
                              contract.elegivel_origem
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                            }`}
                          >
                            {contract.elegivel_origem ? 'Elegível' : 'Bloqueado'}
                          </span>
                        </div>
                        <p className="mt-2 text-[10px] font-bold text-slate-500">
                          {contract.ofertas_facta_count} tabela(s)/prazo(s) FACTA elegíveis para esta origem.
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          {!consulta && !loadingConsulta && !loadingConfig && (
            <section className="grid gap-4 md:grid-cols-3">
              <FeatureCard
                icon={<Search size={21} />}
                title="1. Consultar"
                text="Informe o CPF para carregar os benefícios e contratos INSS."
              />
              <FeatureCard
                icon={<Layers3 size={21} />}
                title="2. Selecionar"
                text="Escolha um único NB e de 2 a 6 contratos. Grupos A e B podem ser combinados; Grupo C não participa."
              />
              <FeatureCard
                icon={<ShieldCheck size={21} />}
                title="3. Simular"
                text="O servidor valida as origens, soma parcelas e saldos e executa uma única simulação consolidada na FACTA."
              />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function InfoTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3 dark:bg-white/5">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-slate-700 dark:text-slate-200">
        {value}
      </p>
    </div>
  );
}

function ContractField({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-xs font-black ${
          highlight
            ? 'text-slate-900 dark:text-white'
            : 'text-slate-600 dark:text-slate-300'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
      {text}
    </span>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'danger' | 'success';
}) {
  const toneClass = tone === 'danger'
    ? 'text-rose-600 dark:text-rose-300'
    : tone === 'success'
      ? 'text-emerald-600 dark:text-emerald-300'
      : 'text-slate-800 dark:text-white';

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <div className={`flex items-center gap-2 ${tone === 'danger' ? 'text-rose-400' : tone === 'success' ? 'text-emerald-400' : 'text-slate-400'}`}>
        {icon}
        <p className="text-[9px] font-black uppercase tracking-widest">
          {label}
        </p>
      </div>
      <p className={`mt-2 text-sm font-black ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-black text-slate-800 dark:text-white">
        {title}
      </h3>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-400">
        {text}
      </p>
    </div>
  );
}
