'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Loader2,
  CreditCard,
  Check,
  AlertCircle,
  Crown,
  Clock,
  Eye,
  EyeOff,
  RefreshCw,
  User,
  Database,
  KeyRound,
  Save,
  ShieldCheck,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import { useToast } from '@/contexts/ToastContext';
import ConsultaCPFModal from '@/components/ConsultaCPFModal';
import { useAuth } from '@/contexts/AuthContext';

interface CpfHistoryItem {
  id: string;
  cpf: string;
  formattedCpf: string;
  type: 'inss' | 'siape';
  nome: string;
  beneficio: string;
  createdAt: number;
  diffDays: number;
  cacheDaysLeft: number;
  isExpired: boolean;
}

export default function ConsultaCPFPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [cpfCliente, setCpfCliente] = useState('');
  const [tipoConsulta, setTipoConsulta] = useState<'inss' | 'siape'>('inss');
  const [isConsulting, setIsConsulting] = useState(false);
  const [consultaData, setConsultaData] = useState<any>(null);
  const [isConsultaModalOpen, setIsConsultaModalOpen] = useState(false);

  const [c6AutoRefin, setC6AutoRefin] = useState<any>({
    loading: false,
    configured: false,
    results: [],
  });
  const [c6CredentialStatus, setC6CredentialStatus] = useState<any>({
    loading: true,
    configured: false,
  });
  const [c6Username, setC6Username] = useState('');
  const [c6Password, setC6Password] = useState('');
  const [showC6Password, setShowC6Password] = useState(false);
  const [savingC6Credential, setSavingC6Credential] = useState(false);
  const [testingC6Credential, setTestingC6Credential] = useState(false);
  const [isBankCredentialsOpen, setIsBankCredentialsOpen] = useState(false);

  const [history, setHistory] = useState<CpfHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const getAuthHeaders = async () => {
    if (!user) throw new Error('Usuário não autenticado');
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  };

  const loadC6CredentialStatus = async () => {
    if (!user) {
      setC6CredentialStatus({
        loading: false,
        configured: false,
      });
      return;
    }

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        '/api/c6/credentials',
        { headers: authHeaders },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error
          || 'Falha ao consultar credencial C6',
        );
      }
      setC6CredentialStatus({
        loading: false,
        ...payload,
      });
    } catch (error: any) {
      console.error('C6 credential status:', error);
      setC6CredentialStatus({
        loading: false,
        configured: false,
        error: error?.message,
      });
    }
  };

  const saveC6Credential = async () => {
    if (!c6Username.trim() || !c6Password) {
      showToast('Informe usuário e senha do C6', 'error');
      return;
    }

    setSavingC6Credential(true);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/c6/credentials', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          username: c6Username.trim(),
          password: c6Password,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw Object.assign(
          new Error(
            payload?.error
            || 'Falha ao salvar credencial C6',
          ),
          { code: payload?.code },
        );
      }

      setC6CredentialStatus({
        loading: false,
        ...payload,
      });
      setC6Password('');
      setShowC6Password(false);
      setIsBankCredentialsOpen(false);
      showToast(
        'Credencial C6 validada e salva com segurança',
        'success',
      );
    } catch (error: any) {
      if (error?.code === 'C6_CREDENTIAL_INVALID') {
        setC6CredentialStatus((prev: any) => ({
          ...prev,
          loading: false,
          validationStatus: 'invalid',
          needsUpdate: true,
        }));
      }
      showToast(
        error?.message || 'Erro ao salvar credencial C6',
        'error',
      );
    } finally {
      setSavingC6Credential(false);
    }
  };

  const testC6Credential = async () => {
    if (!c6CredentialStatus.configured) {
      showToast(
        'Configure a credencial C6 primeiro',
        'error',
      );
      return;
    }

    setTestingC6Credential(true);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        '/api/c6/credentials',
        {
          method: 'POST',
          headers: authHeaders,
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw Object.assign(
          new Error(
            payload?.error
            || 'Falha ao testar credencial C6',
          ),
          { code: payload?.code },
        );
      }

      setC6CredentialStatus({
        loading: false,
        ...payload,
      });
      showToast(
        'Credencial C6 validada com sucesso no banco',
        'success',
      );
    } catch (error: any) {
      if (error?.code === 'C6_CREDENTIAL_INVALID') {
        setC6CredentialStatus((prev: any) => ({
          ...prev,
          loading: false,
          validationStatus: 'invalid',
          needsUpdate: true,
        }));
      }
      showToast(
        error?.message || 'Erro ao testar credencial C6',
        'error',
      );
    } finally {
      setTestingC6Credential(false);
    }
  };

  const deleteC6Credential = async () => {
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        '/api/c6/credentials',
        {
          method: 'DELETE',
          headers: authHeaders,
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error
          || 'Falha ao remover credencial C6',
        );
      }

      setC6CredentialStatus({
        loading: false,
        configured: false,
      });
      setC6Username('');
      setC6Password('');
      setIsBankCredentialsOpen(true);
      showToast('Credencial C6 removida', 'success');
    } catch (error: any) {
      showToast(
        error?.message || 'Erro ao remover credencial C6',
        'error',
      );
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/multicorban/consulta-cpf');
      const data = await res.json();
      if (data.success && data.history) {
        setHistory(data.history);
      }
    } catch (err) {
      console.warn("Erro ao buscar histórico:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    loadC6CredentialStatus();
  }, [user?.uid]);

  useEffect(() => {
    if (c6CredentialStatus.needsUpdate) {
      setIsBankCredentialsOpen(true);
    }
  }, [c6CredentialStatus.needsUpdate]);

  const formatCPF = (value: any) => {
    if (!value) return '';
    return String(value)
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const validateCPF = (cpf: any) => {
    if (!cpf) return false;
    const cleanCpf = String(cpf).replace(/\D/g, '');
    if (cleanCpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cleanCpf)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cleanCpf.charAt(i)) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cleanCpf.charAt(9))) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cleanCpf.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cleanCpf.charAt(10))) return false;

    return true;
  };

  const isCpfValid = validateCPF(cpfCliente);

  const handleConsultaCPF = async (e?: React.FormEvent, forceRefresh = false, targetCpf?: string, targetType?: 'inss' | 'siape') => {
    if (e) e.preventDefault();
    const queryCpf = targetCpf || cpfCliente;
    const queryType = targetType || tipoConsulta;

    const cleanCpf = queryCpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      showToast("Digite um CPF válido primeiro", "error");
      return;
    }

    setIsConsulting(true);
    try {
      const response = await fetch('/api/multicorban/consulta-cpf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cpf: cleanCpf, type: queryType, forceRefresh })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha na consulta');
      }

      setConsultaData(data);
      setIsConsultaModalOpen(true);
      fetchHistory();

      // INSS: consulta automaticamente o Refin C6 nos contratos 626.
      // Se a credencial não estiver configurada ou o C6 não liberar valor,
      // a consulta normal permanece disponível sem bloquear a tela.
      if (queryType === 'inss') {
        setC6AutoRefin({
          loading: true,
          configured: c6CredentialStatus.configured,
          results: [],
        });

        try {
          const authHeaders = await getAuthHeaders();
          const refinResponse = await fetch(
            '/api/c6/refin/automatico',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
              },
              body: JSON.stringify({
                cpf: cleanCpf,
              }),
            },
          );
          const refinPayload = await refinResponse
            .json()
            .catch(() => ({}));

          if (!refinResponse.ok) {
            throw new Error(
              refinPayload?.error
              || 'Falha na consulta automática do refin C6',
            );
          }

          setC6AutoRefin({
            loading: false,
            ...refinPayload,
          });

          if (refinPayload?.credentialNeedsUpdate) {
            setC6CredentialStatus((prev: any) => ({
              ...prev,
              validationStatus: 'invalid',
              needsUpdate: true,
            }));
            showToast(
              'O C6 recusou a credencial salva. Atualização necessária.',
              'error',
            );
          }
        } catch (refinError: any) {
          console.error(
            'Refin C6 automático:',
            refinError,
          );
          setC6AutoRefin({
            loading: false,
            configured: c6CredentialStatus.configured,
            results: [],
            error: refinError?.message,
          });
        }
      } else {
        setC6AutoRefin({
          loading: false,
          configured: false,
          results: [],
        });
      }

    } catch (error: any) {
      console.error("Consulta CPF Error:", error);
      showToast(error.message || "Erro ao consultar CPF. Verifique sua conexão.", "error");
    } finally {
      setIsConsulting(false);
    }
  };

  const handleToggleContract = (contractData: any, action: 'add' | 'remove') => {
    setIsConsultaModalOpen(false);
    showToast("Redirecionando para simulação...", "success");
    router.push(`/simulacao/nova?cpf=${cpfCliente}&type=${tipoConsulta}`);
  };

  return (
    <div className="flex min-h-screen bg-background-light dark:bg-background-dark">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden relative pb-20 md:pb-0">
        <div className="p-4 md:p-8 max-w-4xl mx-auto w-full space-y-6">

          {/* Form Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800 dark:text-white">Consulta de Cliente</h1>
                <p className="text-slate-500 text-sm">Pesquise os dados do benefício direto na base nacional.</p>
              </div>
            </div>

            <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => setIsBankCredentialsOpen(value => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-950 text-[11px] font-black tracking-tight text-white shadow-sm dark:bg-white dark:text-slate-950">
                    C6
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-800 dark:text-white">
                      Credenciais bancárias
                    </p>
                    <p className={`mt-0.5 text-[11px] font-semibold ${
                      c6CredentialStatus.needsUpdate
                        ? 'text-rose-600 dark:text-rose-300'
                        : c6CredentialStatus.configured
                          ? 'text-emerald-600 dark:text-emerald-300'
                          : 'text-slate-500'
                    }`}>
                      {c6CredentialStatus.loading
                        ? 'Verificando credencial C6...'
                        : c6CredentialStatus.needsUpdate
                          ? 'C6 Consignado • atualização necessária'
                          : c6CredentialStatus.configured
                            ? 'C6 Consignado • credencial salva'
                            : 'C6 Consignado • adicionar credencial'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {c6CredentialStatus.configured && !c6CredentialStatus.needsUpdate && (
                    <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 sm:inline-flex dark:bg-emerald-500/10 dark:text-emerald-300">
                      Credencial salva
                    </span>
                  )}
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isBankCredentialsOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isBankCredentialsOpen && (
                <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="mb-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-amber-500" />
                      <p className="text-xs font-black text-slate-800 dark:text-white">C6 Consignado</p>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      A credencial é individual, validada no C6 antes de ser salva e usada automaticamente no refinanciamento INSS.
                    </p>
                  </div>

                  {c6CredentialStatus.needsUpdate && (
                    <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                      O C6 recusou a credencial cadastrada. Informe usuário e senha atualizados. A credencial anterior só será substituída depois de uma autenticação válida.
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    <input
                      value={c6Username}
                      onChange={(e) => setC6Username(e.target.value)}
                      autoComplete="off"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900"
                      placeholder={c6CredentialStatus.configured ? 'Novo usuário C6 para substituir' : 'Usuário C6'}
                    />

                    <div className="relative">
                      <input
                        type={showC6Password ? 'text' : 'password'}
                        value={c6Password}
                        onChange={(e) => setC6Password(e.target.value)}
                        autoComplete="new-password"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pr-11 text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900"
                        placeholder={c6CredentialStatus.configured ? 'Nova senha para substituir' : 'Senha C6'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowC6Password(value => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      >
                        {showC6Password
                          ? <EyeOff className="h-4 w-4" />
                          : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={saveC6Credential}
                      disabled={savingC6Credential}
                      className="flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-3.5 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                    >
                      {savingC6Credential
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Save className="h-4 w-4" />}
                      {c6CredentialStatus.configured ? 'Atualizar credencial' : 'Salvar credencial'}
                    </button>

                    {c6CredentialStatus.configured && (
                      <button
                        type="button"
                        onClick={testC6Credential}
                        disabled={testingC6Credential}
                        className="flex h-9 items-center gap-2 rounded-xl border border-emerald-200 px-3.5 text-xs font-black text-emerald-700 disabled:opacity-50 dark:text-emerald-300"
                      >
                        {testingC6Credential
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <ShieldCheck className="h-4 w-4" />}
                        Testar
                      </button>
                    )}

                    {c6CredentialStatus.configured && (
                      <button
                        type="button"
                        onClick={deleteC6Credential}
                        className="flex h-9 items-center gap-2 rounded-xl border border-rose-200 px-3.5 text-xs font-black text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </button>
                    )}

                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      Senha protegida com AES-256-GCM.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={(e) => handleConsultaCPF(e, false)} className="space-y-6">
              <div className="flex flex-col gap-2 max-w-md">
                <label className="text-sm font-semibold text-slate-600 dark:text-white uppercase tracking-wider text-[10px]">CPF do Cliente</label>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                  <input
                    className={`w-full rounded-xl border ${cpfCliente && !isCpfValid ? 'border-rose-300 bg-rose-50/10' : 'border-primary/20'} bg-white dark:bg-slate-950 h-14 pl-12 pr-12 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm`}
                    type="text"
                    value={cpfCliente}
                    onChange={(e) => setCpfCliente(formatCPF(e.target.value))}
                    placeholder="000.000.000-00"
                  />
                  {cpfCliente && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      {isCpfValid ? (
                        <Check className="text-emerald-500 w-5 h-5 anim-bounce-in" />
                      ) : (
                        <AlertCircle className="text-rose-500 w-5 h-5 anim-shake" />
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 max-w-md">
                <label className="text-sm font-semibold text-slate-600 dark:text-white uppercase tracking-wider text-[10px]">Tipo de Consulta</label>
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setTipoConsulta('inss')}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${tipoConsulta === 'inss' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
                  >
                    INSS
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoConsulta('siape')}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${tipoConsulta === 'siape' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
                  >
                    SIAPE
                  </button>
                </div>
              </div>

              <div className="pt-4 max-w-md">
                <button
                  type="submit"
                  disabled={isConsulting || !isCpfValid}
                  className="w-full h-14 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-light hover:to-primary text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConsulting ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Search className="w-6 h-6" />
                  )}
                  {isConsulting ? 'Consultando...' : 'Consultar Base Nacional'}
                </button>
                <p className="text-xs text-slate-500 text-center mt-3 flex items-center justify-center gap-1">
                  <Crown className="w-3 h-3 text-amber-500" /> Cache de 30 Dias Ativo (Economia de Créditos)
                </p>
              </div>
            </form>
          </div>

          {/* Histórico de Consultas */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                    Histórico de CPFs Consultados
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Consultas anteriores salvas por até 30 dias (não consomem novos créditos ao consultar novamente).
                  </p>
                </div>
              </div>

              <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 uppercase flex items-center gap-1">
                <Database className="w-3 h-3" />
                {history.length} {history.length === 1 ? 'Salvo' : 'Salvos'}
              </span>
            </div>

            {isLoadingHistory ? (
              <div className="flex py-10 items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-xs font-semibold">Carregando histórico...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs font-medium">
                Nenhum CPF consultado recentemente no banco.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[500px] overflow-y-auto custom-scrollbar">
                {history.map(item => (
                  <div key={item.id} className="py-3.5 px-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-950/40 rounded-xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-xs">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                            {item.nome}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                            item.type === 'siape' ? 'bg-sky-500/10 text-sky-600 border border-sky-500/20' : 'bg-primary/10 text-primary border border-primary/20'
                          }`}>
                            {item.type.toUpperCase()}
                          </span>
                          {!item.isExpired ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Cache {item.cacheDaysLeft}d
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              Expirado
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                          CPF: <span className="font-bold text-slate-700 dark:text-slate-300">{item.formattedCpf}</span>
                          {item.beneficio ? ` • Ben: ${item.beneficio}` : ''}
                          {` • Consultado há ${item.diffDays} dia(s)`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button
                        onClick={() => {
                          setCpfCliente(item.formattedCpf);
                          setTipoConsulta(item.type);
                          handleConsultaCPF(undefined, false, item.formattedCpf, item.type);
                        }}
                        disabled={isConsulting}
                        className="px-3 py-1.5 bg-primary text-white hover:bg-primary/90 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                        title="Ver Dados sem gastar créditos"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver Dados</span>
                      </button>

                      <button
                        onClick={() => {
                          setCpfCliente(item.formattedCpf);
                          setTipoConsulta(item.type);
                          handleConsultaCPF(undefined, true, item.formattedCpf, item.type);
                        }}
                        disabled={isConsulting}
                        className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1 border border-slate-200 dark:border-slate-700"
                        title="Forçar Nova Consulta na API"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Reconsultar API</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
      <BottomNav />

      <ConsultaCPFModal
        isOpen={isConsultaModalOpen}
        onClose={() => setIsConsultaModalOpen(false)}
        data={consultaData}
        c6RefinData={c6AutoRefin}
        onToggleContract={handleToggleContract}
      />
    </div>
  );
}
