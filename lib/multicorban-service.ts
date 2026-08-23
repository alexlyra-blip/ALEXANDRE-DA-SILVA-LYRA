import { getAdminDb } from '@/lib/firebase-admin';
import { calculateSaldoDevedor, getBancoName } from '@/lib/mappings';
import type { SimulationParams } from '@/lib/simulation-engine';

const CACHE_DAYS = 30;

type SearchType = 'inss' | 'siape';

export interface MulticorbanSimulationContract {
  cpf: string;
  nomeCliente: string;
  beneficio: string;
  contrato: string;
  bancoCodigo: string;
  bancoNome: string;
  dataNascimento: string;
  rendaMensal: number;
  params: SimulationParams & { estado?: string; hasTwoCards?: boolean };
  rawBenefit: any;
  rawContract: any;
}

function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  // Accept both pt-BR (1.234,56) and API/US (1234.56) formats.
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInteger(value: any): number {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function normalizeDate(value: any): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function calculateAge(dateValue: any): number {
  const iso = normalizeDate(dateValue);
  if (!iso) return 0;
  const birthDate = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return Math.max(0, age);
}

export function cleanCpf(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function isValidCpf(value: string): boolean {
  const cpf = cleanCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
}

export function extractCpfFromText(message: string): string | null {
  const candidates = (message || '').match(/(?:\d[.\s-]?){11}/g) || [];
  for (const candidate of candidates) {
    const cpf = cleanCpf(candidate);
    if (isValidCpf(cpf)) return cpf;
  }

  const onlyDigits = cleanCpf(message || '');
  if (onlyDigits.length === 11 && isValidCpf(onlyDigits)) return onlyDigits;
  return null;
}

function normalizeSiape(data: any): any {
  if (!Array.isArray(data)) return data;
  return data.map(item => ({
    isSiape: true,
    Beneficiario: {
      Nome: item.Cadastro?.Nome,
      CPF: item.Cadastro?.CPF,
      DataNascimento: item.Cadastro?.DataNascimento,
      NomeMae: item.Cadastro?.NomeMae,
      Beneficio: item.Cadastro?.Matricula,
      Situacao: 'Ativo',
      Especie: item.Cadastro?.AmparoLegal || item.Cadastro?.RegimeJuridico,
      isSiape: true,
      Endereco: item.Endereco?.Logradouro || '',
      Bairro: item.Endereco?.Bairro || '',
      Cidade: item.Endereco?.Municipio || item.Endereco?.Cidade || '',
      UF: item.Endereco?.Uf || item.Endereco?.UF || '',
      CEP: item.Endereco?.CEP || '',
    },
    DadosBancarios: {
      Banco: item.DadosBancarios?.Banco,
      Agencia: item.DadosBancarios?.Agencia,
      ContaPagto: item.DadosBancarios?.NumConta,
    },
    ResumoFinanceiro: {
      ValorBeneficio: toNumber(item.ResumoFinanceiro?.Bruto),
      BaseCalculo: toNumber(item.ResumoFinanceiro?.ValorLiquido),
      MargemDisponivelEmprestimo: toNumber(item.ResumoFinanceiro?.Margem),
    },
    Telefone: item.Telefone || [],
    Rmc: item.RMC ? { ValorParcela: item.RMC.Margem } : {},
    RCC: item.RCC ? { ValorParcela: item.RCC.Margem } : {},
    Emprestimos: (item.Emprestimos || []).map((emp: any) => ({
      Banco: emp.IdBanco?.toString(),
      NomeBanco: emp.Rubrica,
      Contrato: emp.Contrato,
      ParcelasRestantes: emp.PrazoRestantes?.toString(),
      ValorParcela: emp.Parcela,
      Quitacao: emp.SaldoDevedor,
      Taxa: '1.60',
    }))
  }));
}

export async function consultarCpfMulticorban(
  cpfInput: string,
  searchType: SearchType = 'inss',
  options: { forceRefresh?: boolean } = {},
): Promise<any> {
  const cpf = cleanCpf(cpfInput);
  if (!isValidCpf(cpf)) throw new Error('CPF inválido');

  const apiToken = (process.env.MULTICORBAN_API_TOKEN || process.env.BANCODATAHUB_API_TOKEN || '').trim();
  if (!apiToken) {
    const error: any = new Error('MULTICORBAN_API_TOKEN não configurado no servidor');
    error.status = 503;
    throw error;
  }

  const type: SearchType = searchType === 'siape' ? 'siape' : 'inss';
  const docId = `${cpf}_${type}`;
  const db = getAdminDb();
  const docRef = db ? db.collection('consultas_multicorban').doc(docId) : null;

  if (docRef && !options.forceRefresh) {
    try {
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const cachedData = docSnap.data();
        if (cachedData?.createdAt) {
          const diffDays = (Date.now() - Number(cachedData.createdAt)) / (1000 * 60 * 60 * 24);
          const isSiapeDataValid = type !== 'siape' || (
            Array.isArray(cachedData.data) &&
            cachedData.data.length > 0 &&
            cachedData.data[0].isSiape === true &&
            cachedData.data[0].Beneficiario?.Endereco !== undefined
          );
          if (diffDays < CACHE_DAYS && isSiapeDataValid) return cachedData.data;
        }
      }
    } catch (cacheError) {
      console.error('[Multicorban] Falha ao ler cache:', cacheError);
    }
  }

  if (options.forceRefresh) {
    console.log(`[Multicorban] Consulta forçada sem cache para CPF ${cpf.slice(0, 3)}***${cpf.slice(-2)}`);
  }

  const url = type === 'siape'
    ? 'https://api.bancodatahub.com/siape'
    : 'https://api.bancodatahub.com/cpf';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: apiToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cpf }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    console.error(`[Multicorban] HTTP ${response.status}:`, details.slice(0, 500));
    const error: any = new Error('Falha ao consultar a API da MultiCorban');
    error.status = response.status;
    throw error;
  }

  let data = await response.json();
  if (type === 'siape') data = normalizeSiape(data);

  if (docRef) {
    try {
      await docRef.set({ cpf, type, createdAt: Date.now(), data });
    } catch (cacheError) {
      console.error('[Multicorban] Falha ao salvar cache:', cacheError);
    }
  }

  return data;
}

export function getBenefitArray(data: any): any[] {
  const dataArray = Array.isArray(data)
    ? data
    : (Array.isArray(data?.beneficios) ? data.beneficios : (Array.isArray(data?.value) ? data.value : (data ? [data] : [])));
  return dataArray.filter((item: any) => item?.Beneficiario);
}

function formatBank(codeValue: any, explicitName: any): { code: string; name: string; display: string } {
  const rawCode = String(codeValue ?? '').trim();
  const code = rawCode ? rawCode.padStart(3, '0') : '';
  const mapped = code ? getBancoName(code) : '';
  const mappedName = mapped && mapped !== code ? mapped.replace(/^\d+\s*-\s*/, '') : '';
  const name = String(explicitName || mappedName || code || 'Banco não informado').trim();
  const display = code && !name.startsWith(code) ? `${code} - ${name}` : name;
  return { code, name, display };
}

export function buildInssSimulationContracts(data: any, requestedCpf: string, maxContracts = 5): MulticorbanSimulationContract[] {
  const benefits = getBenefitArray(data);
  const result: MulticorbanSimulationContract[] = [];

  for (const benefit of benefits) {
    if (result.length >= maxContracts) break;
    const b = benefit?.Beneficiario || {};
    const loans = Array.isArray(benefit?.Emprestimos)
      ? benefit.Emprestimos
      : (benefit?.Emprestimos ? [benefit.Emprestimos] : []);
    const rmc = Array.isArray(benefit?.Rmc) ? benefit.Rmc : (benefit?.Rmc ? [benefit.Rmc] : []);
    const rcc = Array.isArray(benefit?.RCC) ? benefit.RCC : (benefit?.RCC ? [benefit.RCC] : []);
    const hasTwoCards = rmc.length > 0 && rcc.length > 0;
    const negativeCardValue = hasTwoCards
      ? Math.max(
          ...rmc.map((item: any) => toNumber(item?.ValorParcela || item?.Desconto)),
          ...rcc.map((item: any) => toNumber(item?.ValorParcela || item?.Desconto)),
          0,
        )
      : 0;

    const idade = toInteger(b.Idade) || calculateAge(b.DataNascimento);
    const codigoBeneficio = String(b.Especie || '').trim();
    const dataConcessao = normalizeDate(b.DDB || b.DIB || b.DataConcessao);
    const estado = String(b.UF || b.UFBeneficio || '').trim().toUpperCase();
    const beneficioNumero = String(b.Beneficio || '').trim();
    const cpf = cleanCpf(b.CPF || requestedCpf);
    const dataNascimento = normalizeDate(b.DataNascimento);
    const rendaMensal = toNumber(
      benefit?.ResumoFinanceiro?.ValorBeneficio ||
      benefit?.ResumoFinanceiro?.BaseCalculo ||
      benefit?.ResumoFinanceiro?.Bruto ||
      benefit?.ResumoFinanceiro?.ValorLiquido
    );

    for (const loan of loans) {
      if (result.length >= maxContracts) break;

      const valorParcela = toNumber(loan?.ValorParcela || loan?.Parcela);
      const prazoTotal = toInteger(loan?.Prazo || loan?.PrazoTotal || loan?.parcelas);
      const parcelasRestantes = toInteger(loan?.ParcelasRestantes || loan?.PrazoRestantes || loan?.prazo_restante);
      if (valorParcela <= 0 || parcelasRestantes <= 0) continue;

      const taxaPercent = toNumber(loan?.Taxa || loan?.taxa || loan?.TaxaJuros);
      const saldoApi = toNumber(loan?.Quitacao || loan?.SaldoDevedor || loan?.saldo);
      const saldoCalculado = calculateSaldoDevedor(valorParcela, parcelasRestantes, taxaPercent);
      const saldoDevedor = saldoApi > 0 ? saldoApi : saldoCalculado;
      if (saldoDevedor <= 0) continue;

      const total = prazoTotal > 0 ? prazoTotal : parcelasRestantes;
      const bank = formatBank(loan?.Banco || loan?.IdBanco, loan?.NomeBanco || loan?.Rubrica);
      const taxaJurosMensal = taxaPercent > 0 ? taxaPercent / 100 : 0;

      result.push({
        cpf,
        nomeCliente: String(b.Nome || '').trim(),
        beneficio: beneficioNumero,
        contrato: String(loan?.Contrato || '').trim(),
        bancoCodigo: bank.code,
        bancoNome: bank.name,
        dataNascimento,
        rendaMensal,
        params: {
          idade,
          convenio: 'INSS',
          codigoBeneficio,
          dataConcessao,
          bancoAtual: bank.display,
          valorParcela,
          saldoDevedor,
          prazoTotal: total,
          parcelasRestantes,
          parcelasPagas: Math.max(0, total - parcelasRestantes),
          taxaJurosMensal,
          negativeCardValue,
          isCliente60Mais: idade >= 60,
          isAnalfabeto: false,
          estado,
          hasTwoCards,
        },
        rawBenefit: benefit,
        rawContract: loan,
      });
    }
  }

  return result;
}
