import crypto from 'crypto';

export interface C6RefinCredentials {
  username: string;
  password: string;
}

export interface C6RefinRequest {
  cpf: string;
  beneficio: string;
  contrato: string;
  bancoCodigo: string;
  bancoNome?: string;
  dataNascimento?: string;
  rendaMensal?: number;
  valorParcela?: number;
  prazo?: number;
  promoterCode?: string;
  publicAgency?: string;
  credentials: C6RefinCredentials;
}

export interface C6AuthResult {
  accessToken: string;
  expiresInSeconds: number;
}

export interface C6RefinSummary {
  tabela: string;
  codigoTabela?: string;
  produto?: string;
  codigoProduto?: string;
  prazo?: number | null;
  taxa?: number | null;
  parcela?: number | null;
  valorSolicitado?: number | null;
  valorContrato?: number | null;
  valorLiberado?: number | null;
  valorLiquido?: number | null;
  troco?: number | null;
  iof?: number | null;
  cetMensal?: number | null;
  cetAnual?: number | null;
}

type TokenCacheEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenCacheEntry>();

const DEFAULT_BASE_URL = 'https://marketplace-proposal-service-api-p.c6bank.info';
const DEFAULT_ACCEPT = 'application/vnd.c6bank_simulation_v1+json';

function getBaseUrl(): string {
  return String(process.env.C6_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function getTimeoutMs(): number {
  const configured = Number(process.env.C6_API_TIMEOUT_MS || 25000);
  return Number.isFinite(configured) && configured >= 1000 ? configured : 25000;
}

function createC6Error(message: string, status = 500, code?: string, details?: any): any {
  const error: any = new Error(message);
  error.status = status;
  if (code) error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function getByPath(value: any, path: string): any {
  if (!path) return value;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), value);
}

function readCandidate(obj: any, paths: string[]): any {
  for (const path of paths) {
    const value = getByPath(obj, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function toFiniteNumber(value: any): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
    : raw.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: any): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function formatCpf(cpf: string): string {
  const digits = String(cpf || '').replace(/\D/g, '');
  return digits.length === 11
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : digits;
}


function normalizeInssEnrollment(value: any): string {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  // O NB do INSS pode chegar do Multicorban sem o zero inicial (9 dígitos).
  // O portal C6 exibe a matrícula com 10 dígitos, então normalizamos apenas esse caso.
  return digits.length === 9 ? digits.padStart(10, '0') : digits;
}

function derivePromoterCode(username: string, explicit?: string): string {
  const explicitCode = String(explicit || '').replace(/\D/g, '');
  if (explicitCode) return explicitCode.padStart(6, '0').slice(-6);
  const fromEnv = String(process.env.C6_PROMOTER_CODE || '').replace(/\D/g, '');
  if (fromEnv) return fromEnv.padStart(6, '0').slice(-6);
  // Exemplo do manual: 99999999999_000001.
  const match = String(username || '').trim().match(/_(\d{6})$/);
  if (match) return match[1];
  return '000001';
}

function tokenCacheKey(credentials: C6RefinCredentials): string {
  return crypto.createHash('sha256')
    .update(`${credentials.username}\u0000${credentials.password}`)
    .digest('hex');
}

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function c6MessageFromPayload(payload: any): string {
  const candidate = readCandidate(payload, [
    'message', 'mensagem', 'error.message', 'error_message', 'errorMessage',
    'description', 'detail', 'details.0', 'title', 'errors.0.message',
  ]);
  return candidate ? String(candidate) : '';
}

function isCredentialFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function isC6Consignado(bankCode: string, bankName = ''): boolean {
  const code = String(bankCode || '').replace(/\D/g, '').padStart(3, '0');
  const name = String(bankName || '').toUpperCase();
  return code === '626' || name.includes('C6 CONSIGNADO') || name.includes('C6 CONSIG');
}

export async function autenticarC6(
  credentials: C6RefinCredentials,
  options: { forceRefresh?: boolean } = {},
): Promise<C6AuthResult> {
  const username = String(credentials?.username || '').trim();
  const password = String(credentials?.password || '');
  if (!username || !password) {
    throw createC6Error('Informe usuário e senha do C6', 400, 'C6_CREDENTIAL_MISSING');
  }

  const cacheKey = tokenCacheKey({ username, password });
  const cached = tokenCache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now() + 30000) {
    return {
      accessToken: cached.token,
      expiresInSeconds: Math.max(1, Math.floor((cached.expiresAt - Date.now()) / 1000)),
    };
  }

  const form = new URLSearchParams();
  form.set('username', username);
  form.set('password', password);

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch (error: any) {
    throw createC6Error(
      `Não foi possível conectar à autenticação do C6: ${error?.message || 'falha de conexão'}`,
      502,
      'C6_AUTH_CONNECTION_ERROR',
    );
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    const credentialFailure = isCredentialFailureStatus(response.status) || response.status === 400;
    const bankMessage = c6MessageFromPayload(data);
    throw createC6Error(
      credentialFailure
        ? 'Credencial C6 recusada. Atualize o usuário/senha conforme a orientação do banco.'
        : `Falha na autenticação C6${bankMessage ? `: ${bankMessage}` : ''}`,
      response.status,
      credentialFailure ? 'C6_CREDENTIAL_INVALID' : 'C6_AUTH_ERROR',
      data,
    );
  }

  const accessToken = String(data?.access_token || '').trim();
  const expiresInSeconds = Math.max(60, Number(data?.expires_in_seconds || 1199));
  if (!accessToken) {
    throw createC6Error('Autenticação C6 respondeu sem access_token', 502, 'C6_AUTH_TOKEN_MISSING', data);
  }

  tokenCache.set(cacheKey, {
    token: accessToken,
    expiresAt: Date.now() + Math.max(60, expiresInSeconds - 45) * 1000,
  });
  return { accessToken, expiresInSeconds };
}

export async function testarCredencialC6(credentials: C6RefinCredentials): Promise<{ valid: true; expiresInSeconds: number }> {
  const auth = await autenticarC6(credentials, { forceRefresh: true });
  return { valid: true, expiresInSeconds: auth.expiresInSeconds };
}

function validateRefinInput(input: C6RefinRequest): {
  cpf: string;
  birthDate: string;
  incomeAmount: number;
  installmentAmount: number;
  installmentQuantity: number;
} {
  const cpf = String(input.cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11) throw createC6Error('CPF inválido para consulta C6', 400, 'C6_INVALID_CPF');
  if (!String(input.contrato || '').trim()) throw createC6Error('Contrato C6 é obrigatório', 400, 'C6_CONTRACT_MISSING');
  if (!String(input.beneficio || '').trim()) throw createC6Error('Número do benefício INSS é obrigatório para o refin C6', 422, 'C6_ENROLLMENT_MISSING');
  if (!isC6Consignado(input.bancoCodigo, input.bancoNome || '')) {
    throw createC6Error('Consulta de refin permitida apenas para contratos C6 Consignado (626)', 400, 'C6_NOT_CONSIGNADO');
  }

  const birthDate = normalizeDate(input.dataNascimento);
  const incomeAmount = toFiniteNumber(input.rendaMensal) || 0;
  const installmentAmount = toFiniteNumber(input.valorParcela) || 0;
  // Regra operacional C6 Consignado: REFIN INSS sempre simulado no prazo máximo de 108x.
  // Não aceitar override por request/env para evitar divergência entre Gutto e Consulta CPF.
  const installmentQuantity = 108;

  if (!birthDate) throw createC6Error('Multicorban não retornou a data de nascimento necessária para simular o refin C6', 422, 'C6_BIRTH_DATE_MISSING');
  if (incomeAmount <= 0) throw createC6Error('Multicorban não retornou a renda/valor do benefício necessária para simular o refin C6', 422, 'C6_INCOME_MISSING');
  if (installmentAmount <= 0) throw createC6Error('Multicorban não retornou o valor da parcela necessária para simular o refin C6', 422, 'C6_INSTALLMENT_MISSING');

  return { cpf, birthDate, incomeAmount, installmentAmount, installmentQuantity };
}

function buildRefinPayload(input: C6RefinRequest): any {
  const validated = validateRefinInput(input);
  const username = String(input.credentials?.username || '').trim();
  return {
    operation_type: 'REFINANCIAMENTO',
    product_type_code: '0002',
    simulation_type: 'POR_VALOR_PARCELA',
    formalization_subtype: String(process.env.C6_REFIN_FORMALIZATION_SUBTYPE || 'DIGITAL_WEB'),
    promoter_code: derivePromoterCode(username, input.promoterCode),
    covenant_group: 'INSS',
    public_agency: String(input.publicAgency || process.env.C6_INSS_PUBLIC_AGENCY || '000001'),
    installment_quantity: validated.installmentQuantity,
    installment_amount: validated.installmentAmount,
    client: {
      tax_identifier: formatCpf(validated.cpf),
      enrollment: normalizeInssEnrollment(input.beneficio),
      birth_date: validated.birthDate,
      income_amount: validated.incomeAmount,
    },
    refinancing_contracts: [String(input.contrato || '').trim()],
  };
}

async function performSimulation(input: C6RefinRequest, token: string): Promise<{ response: Response; data: any }> {
  const payload = buildRefinPayload(input);
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}/marketplace/proposal/simulation`, {
      method: 'POST',
      headers: {
        Accept: String(process.env.C6_REFIN_ACCEPT || DEFAULT_ACCEPT),
        'Content-Type': 'application/json',
        // Manual C6: token cru no Authorization, sem prefixo Bearer.
        Authorization: token,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch (error: any) {
    throw createC6Error(
      `Não foi possível conectar à simulação de refin do C6: ${error?.message || 'falha de conexão'}`,
      502,
      'C6_REFIN_CONNECTION_ERROR',
    );
  }
  return { response, data: await parseResponse(response) };
}

export async function consultarRefinC6(input: C6RefinRequest): Promise<any> {
  validateRefinInput(input);
  let auth = await autenticarC6(input.credentials);
  let result = await performSimulation(input, auth.accessToken);

  // Token expirou/foi invalidado: renova e tenta somente uma vez.
  if (isCredentialFailureStatus(result.response.status)) {
    auth = await autenticarC6(input.credentials, { forceRefresh: true });
    result = await performSimulation(input, auth.accessToken);
  }

  if (!result.response.ok) {
    const bankMessage = c6MessageFromPayload(result.data);
    const credentialFailure = isCredentialFailureStatus(result.response.status);
    throw createC6Error(
      credentialFailure
        ? 'Credencial C6 não autorizada. Atualize a credencial cadastrada.'
        : `C6 não aprovou a simulação deste refin${bankMessage ? `: ${bankMessage}` : ''}`,
      result.response.status,
      credentialFailure ? 'C6_CREDENTIAL_INVALID' : 'C6_REFIN_ERROR',
      result.data,
    );
  }
  return result.data;
}

function looksUnavailable(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  const direct = readCandidate(item, ['disponivel', 'available', 'habilitada', 'habilitado', 'elegivel', 'eligible']);
  if (direct === false || direct === 0 || String(direct).toLowerCase() === 'false') return true;
  const status = String(readCandidate(item, ['status', 'situacao', 'situação']) || '').trim().toLowerCase();
  return ['indisponivel', 'indisponível', 'bloqueada', 'bloqueado', 'inativa', 'inativo', 'negada', 'negado'].includes(status);
}

function isC6SimulationResponse(payload: any): boolean {
  return !!(
    payload && typeof payload === 'object' && !Array.isArray(payload) &&
    (payload.covenant || payload.product) &&
    (payload.installment_amount !== undefined || payload.principal_amount !== undefined || payload.client_amount !== undefined)
  );
}

/**
 * A integração real do C6 pode retornar `credit_conditions` com várias condições/tabelas.
 * Também aceitamos resposta direta e wrappers para compatibilidade com outras versões do endpoint.
 */
export function extractC6RefinTables(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (isC6SimulationResponse(payload)) return [payload];

  const preferredKeys = [
    'credit_conditions', 'creditConditions',
    'tabelas', 'Tabelas', 'tables', 'Tables', 'ofertas', 'Ofertas', 'offers', 'Offers',
    'simulacoes', 'Simulacoes', 'simulações', 'simulations', 'opcoes', 'Opcoes', 'opções', 'options',
  ];
  for (const key of preferredKeys) if (Array.isArray(payload[key])) return payload[key];

  const wrapperKeys = ['data', 'Data', 'result', 'Result', 'resultado', 'Resultado', 'response', 'Response'];
  for (const key of wrapperKeys) {
    const nested = payload[key];
    if (nested && nested !== payload) {
      const found = extractC6RefinTables(nested);
      if (found.length) return found;
    }
  }
  return [];
}

export function getFirstAvailableC6Table(payload: any): any | null {
  const tables = extractC6RefinTables(payload);
  const available = tables.filter((table: any) => !looksUnavailable(table));
  if (available.length === 0) return null;

  // Regra operacional do Portabilidade PRO/Gutto:
  // preservar exatamente a ordem devolvida pelo C6 e usar a primeira
  // tabela disponível. A disponibilidade comercial é decidida depois
  // exclusivamente por client_amount > 0; se a primeira vier zerada,
  // o contrato segue para Portabilidade mesmo que existam tabelas posteriores.
  return available[0];
}

export function summarizeC6RefinTable(table: any): C6RefinSummary | null {
  if (!table || typeof table !== 'object') return null;
  const covenantDescription = readCandidate(table, ['covenant.description', 'agreement.description']);
  const productDescription = readCandidate(table, ['product.description']);
  const tabela = String(
    covenantDescription || readCandidate(table, [
      'nomeTabela', 'NomeTabela', 'tabela', 'Tabela', 'descricaoTabela', 'DescricaoTabela',
      'descricao', 'Descricao', 'description', 'Description', 'nome', 'Nome', 'name', 'Name',
    ]) || productDescription || 'Primeira condição disponível',
  ).trim();

  const clientAmount = toFiniteNumber(readCandidate(table, ['client_amount', 'clientAmount', 'valorCliente', 'ValorCliente']));
  const netAmount = toFiniteNumber(readCandidate(table, ['net_amount', 'netAmount', 'valorLiquido', 'ValorLiquido']));

  return {
    tabela,
    codigoTabela: String(readCandidate(table, ['covenant.code', 'codigoTabela', 'CodigoTabela', 'idTabela', 'IdTabela', 'tableId', 'codigo', 'Codigo']) || '').trim() || undefined,
    produto: String(productDescription || '').trim() || undefined,
    codigoProduto: String(readCandidate(table, ['product.code', 'product_code', 'productCode']) || '').trim() || undefined,
    prazo: toFiniteNumber(readCandidate(table, ['installment_quantity', 'prazo', 'Prazo', 'quantidadeParcelas', 'QuantidadeParcelas'])),
    taxa: toFiniteNumber(readCandidate(table, ['monthly_customer_rate', 'taxa', 'Taxa', 'taxaJuros', 'TaxaJuros', 'taxaMensal', 'TaxaMensal'])),
    parcela: toFiniteNumber(readCandidate(table, ['installment_amount', 'parcela', 'Parcela', 'valorParcela', 'ValorParcela'])),
    valorSolicitado: toFiniteNumber(readCandidate(table, ['requested_amount', 'requestedAmount', 'valorSolicitado', 'ValorSolicitado'])),
    valorContrato: toFiniteNumber(readCandidate(table, ['principal_amount', 'principalAmount', 'valorContrato', 'ValorContrato', 'valorFinanciado', 'ValorFinanciado'])),
    // Regra validada no portal C6: Vlr Cli / client_amount é o valor efetivamente liberado ao cliente.
    valorLiberado: clientAmount,
    valorLiquido: netAmount,
    // Mantido por compatibilidade com os consumidores antigos que chamavam client_amount de troco.
    troco: clientAmount,
    iof: toFiniteNumber(readCandidate(table, ['iof_amount', 'iofAmount', 'iof', 'IOF'])),
    cetMensal: toFiniteNumber(readCandidate(table, ['monthly_effective_total_cost_rate', 'monthlyEffectiveTotalCostRate'])),
    cetAnual: toFiniteNumber(readCandidate(table, ['annual_effective_total_cost_rate', 'annualEffectiveTotalCostRate'])),
  };
}
