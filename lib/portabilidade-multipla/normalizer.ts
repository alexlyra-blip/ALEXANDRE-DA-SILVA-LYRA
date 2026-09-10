import type {
  PortabilidadeMultiplaBeneficio,
  PortabilidadeMultiplaConsulta,
  PortabilidadeMultiplaContrato,
} from './types';

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === undefined || value === null) return 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  let normalized = raw.replace(/[R$\s%]/gi, '');

  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(/[^0-9.-]/g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullablePositiveMoney(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed > 0) return parsed;
  }
  return null;
}

function nonNegativeInt(value: unknown): number {
  const parsed = Math.trunc(numberValue(value));
  return parsed > 0 ? parsed : 0;
}

function cleanCpf(value: unknown): string {
  return text(value).replace(/\D/g, '').slice(0, 11);
}

function normalizeDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return raw;
}

function calculateAge(dateValue: unknown): number {
  const normalized = normalizeDate(dateValue);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return 0;

  const birthDate = new Date(`${normalized}T12:00:00`);

  if (Number.isNaN(birthDate.getTime())) return 0;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0
    || (
      monthDifference === 0
      && today.getDate() < birthDate.getDate()
    )
  ) {
    age -= 1;
  }

  return Math.max(0, age);
}

function booleanFromValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;

  const normalized = text(value).toLowerCase();

  if (!normalized) return null;

  if (['sim', 's', '1', 'true'].includes(normalized)) return true;
  if (['nao', 'não', 'n', '0', 'false'].includes(normalized)) return false;

  return null;
}

function inferIlliterate(benefit: any): boolean {
  const person = benefitPerson(benefit);

  const direct = booleanFromValue(
    firstDefined(
      person?.Analfabeto,
      person?.analfabeto,
      benefit?.Analfabeto,
      benefit?.analfabeto,
    ),
  );

  if (direct !== null) return direct;

  const literate = booleanFromValue(
    firstDefined(
      person?.Alfabetizado,
      person?.alfabetizado,
      benefit?.Alfabetizado,
      benefit?.alfabetizado,
    ),
  );

  if (literate !== null) return !literate;

  // Mantém o comportamento histórico quando o provider não informa alfabetização.
  return false;
}

function extractCardArray(benefit: any, keys: string[]): any[] {
  for (const key of keys) {
    const value = benefit?.[key];

    if (value !== undefined && value !== null) {
      return asArray(value);
    }
  }

  return [];
}

function getBenefitCardContext(benefit: any): {
  hasTwoCards: boolean;
  negativeCardValue: number;
} {
  const rmc = extractCardArray(benefit, ['Rmc', 'RMC', 'rmc']);
  const rcc = extractCardArray(benefit, ['RCC', 'Rcc', 'rcc']);
  const hasTwoCards = rmc.length > 0 && rcc.length > 0;

  if (!hasTwoCards) {
    return {
      hasTwoCards: false,
      negativeCardValue: 0,
    };
  }

  const values = [...rmc, ...rcc].map(item =>
    numberValue(
      firstDefined(
        item?.ValorParcela,
        item?.valorParcela,
        item?.valor_parcela,
        item?.Desconto,
        item?.desconto,
      ),
    ),
  );

  return {
    hasTwoCards: true,
    negativeCardValue: Math.max(0, ...values),
  };
}

function extractBenefits(data: any): any[] {
  if (Array.isArray(data)) return data;

  const candidates = [
    data?.beneficios,
    data?.Beneficios,
    data?.data,
    data?.resultado,
    data?.resultados,
    data?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  if (
    data &&
    typeof data === 'object' &&
    (data.Beneficiario || data.beneficiario || data.Emprestimos || data.emprestimos)
  ) {
    return [data];
  }

  return [];
}

function extractLoans(benefit: any): any[] {
  return asArray(
    firstDefined(
      benefit?.Emprestimos,
      benefit?.emprestimos,
      benefit?.Contratos,
      benefit?.contratos,
      benefit?.Beneficiario?.Emprestimos,
      benefit?.beneficiario?.emprestimos,
    ),
  );
}

function benefitPerson(benefit: any): any {
  return benefit?.Beneficiario || benefit?.beneficiario || benefit?.Cliente || benefit?.cliente || {};
}

function financialSummary(benefit: any): any {
  return (
    benefit?.ResumoFinanceiro ||
    benefit?.resumoFinanceiro ||
    benefit?.resumo_financeiro ||
    benefit?.Resumo ||
    benefit?.resumo ||
    {}
  );
}

/**
 * Normaliza um contrato sem criar valores financeiros artificiais.
 *
 * Regra critica:
 * - saldo_devedor/quitacao NUNCA usam valor_liberado ou valor_contrato;
 * - valor_contrato NUNCA usa valor_liberado ou saldo_devedor;
 * - valor_liberado NUNCA usa saldo_devedor ou valor_contrato.
 */
export function normalizePortabilidadeMultiplaContract(
  rawLoan: any,
  beneficio: string,
  index: number,
): PortabilidadeMultiplaContrato {
  const prazo = nonNegativeInt(
    firstDefined(
      rawLoan?.Prazo,
      rawLoan?.PrazoTotal,
      rawLoan?.prazo,
      rawLoan?.prazo_total,
      rawLoan?.parcelas,
    ),
  );

  const prazoRestante = nonNegativeInt(
    firstDefined(
      rawLoan?.ParcelasRestantes,
      rawLoan?.PrazoRestantes,
      rawLoan?.prazoRestante,
      rawLoan?.prazo_restante,
    ),
  );

  const parcelasPagasExplicit = nonNegativeInt(
    firstDefined(
      rawLoan?.ParcelasPagas,
      rawLoan?.parcelasPagas,
      rawLoan?.parcelas_pagas,
    ),
  );

  const parcelasPagas =
    parcelasPagasExplicit > 0
      ? parcelasPagasExplicit
      : prazo > 0 && prazoRestante >= 0
        ? Math.max(0, prazo - prazoRestante)
        : 0;

  const saldoDevedor = nullablePositiveMoney(
    rawLoan?.SaldoDevedor,
    rawLoan?.saldo_devedor,
    rawLoan?.Quitacao,
    rawLoan?.QUITACAOATUAL,
    rawLoan?.quitacao,
    rawLoan?.valor_quitacao,
    rawLoan?.saldo,
  );

  const quitacao = nullablePositiveMoney(
    rawLoan?.Quitacao,
    rawLoan?.QUITACAOATUAL,
    rawLoan?.quitacao,
    rawLoan?.valor_quitacao,
    rawLoan?.SaldoDevedor,
    rawLoan?.saldo_devedor,
    rawLoan?.saldo,
  );

  const valorContrato = nullablePositiveMoney(
    rawLoan?.ValorContrato,
    rawLoan?.valor_contrato,
    rawLoan?.ValorEmprestado,
    rawLoan?.valorEmprestado,
    rawLoan?.valor_emprestado,
    rawLoan?.ValorFinanciado,
    rawLoan?.valor_financiado,
    rawLoan?.ValorOriginal,
    rawLoan?.valor_original,
    rawLoan?.Vl_Emprestimo,
  );

  const valorLiberado = nullablePositiveMoney(
    rawLoan?.ValorLiberado,
    rawLoan?.valorLiberado,
    rawLoan?.valor_liberado,
  );

  const banco = text(
    firstDefined(
      rawLoan?.NomeBanco,
      rawLoan?.banco_nome,
      rawLoan?.BancoNome,
      rawLoan?.Rubrica,
      rawLoan?.banco,
    ),
  );

  const codigoBanco = text(
    firstDefined(
      rawLoan?.Banco,
      rawLoan?.IdBanco,
      rawLoan?.CodigoBanco,
      rawLoan?.codigo_banco,
      rawLoan?.bank_code,
    ),
  );

  const contrato = text(
    firstDefined(
      rawLoan?.Contrato,
      rawLoan?.contrato,
      rawLoan?.NumeroContrato,
      rawLoan?.numero_contrato,
    ),
  );

  return {
    id: `${beneficio || 'SEM-NB'}:${contrato || index + 1}`,
    beneficio,
    banco,
    codigo_banco: codigoBanco,
    contrato,
    parcela: numberValue(
      firstDefined(
        rawLoan?.ValorParcela,
        rawLoan?.Parcela,
        rawLoan?.parcela,
        rawLoan?.valor_parcela,
      ),
    ),
    saldo_devedor: saldoDevedor,
    quitacao,
    taxa: numberValue(
      firstDefined(
        rawLoan?.Taxa,
        rawLoan?.TaxaJuros,
        rawLoan?.taxa,
        rawLoan?.taxa_atual,
      ),
    ),
    prazo,
    prazo_restante: prazoRestante,
    parcelas_pagas: parcelasPagas,
    valor_contrato: valorContrato,
    valor_liberado: valorLiberado,
    data_averbacao: normalizeDate(
      firstDefined(
        rawLoan?.DataAverbacao,
        rawLoan?.dataAverbacao,
        rawLoan?.data_averbacao,
      ),
    ),
    situacao: text(
      firstDefined(
        rawLoan?.Situacao,
        rawLoan?.situacao,
        rawLoan?.Status,
        rawLoan?.status,
        'ATIVO',
      ),
    ),
  };
}

function normalizeBenefit(benefit: any): PortabilidadeMultiplaBeneficio {
  const person = benefitPerson(benefit);
  const summary = financialSummary(benefit);
  const cardContext = getBenefitCardContext(benefit);

  const numero = text(
    firstDefined(
      person?.Beneficio,
      person?.beneficio,
      benefit?.Beneficio,
      benefit?.beneficio,
      benefit?.numeroBeneficio,
      benefit?.numero_beneficio,
    ),
  );

  const loans = extractLoans(benefit).map((loan, index) =>
    normalizePortabilidadeMultiplaContract(loan, numero, index),
  );

  return {
    numero,
    especie: text(
      firstDefined(
        person?.Especie,
        person?.especie,
        benefit?.Especie,
        benefit?.especie,
      ),
    ),
    situacao: text(
      firstDefined(
        person?.Situacao,
        person?.situacao,
        benefit?.Situacao,
        benefit?.situacao,
        'ATIVO',
      ),
    ),
    salario: numberValue(
      firstDefined(
        summary?.ValorBeneficio,
        summary?.BaseCalculo,
        summary?.Bruto,
        benefit?.ValorBeneficio,
        person?.ValorBeneficio,
      ),
    ),
    data_concessao: normalizeDate(
      firstDefined(
        person?.DDB,
        person?.DIB,
        person?.DataConcessao,
        person?.dataConcessao,
        benefit?.DDB,
        benefit?.DIB,
        benefit?.DataConcessao,
        benefit?.data_concessao,
      ),
    ),
    uf: text(
      firstDefined(
        person?.UF,
        person?.UFBeneficio,
        person?.uf,
        benefit?.UF,
        benefit?.UFBeneficio,
        benefit?.uf,
      ),
    ).toUpperCase(),
    bloqueado_emprestimo: (
      person?.BloqueadoEmprestimo === '1'
      || person?.BloqueadoEmprestimo === true
      || benefit?.BloqueadoEmprestimo === '1'
      || benefit?.BloqueadoEmprestimo === true
      || benefit?.BloqueioEmprestimo === '1'
      || benefit?.BloqueioEmprestimo === true
      || false
    ),
    dados_bancarios: (() => {
      const rawDados = benefit?.DadosBancarios
        || benefit?.dadosBancarios
        || person?.DadosBancarios
        || person?.dadosBancarios
        || {};
      const bancoCod = text(firstDefined(rawDados?.Banco, rawDados?.banco, rawDados?.CodigoBanco, rawDados?.codigoBanco, benefit?.Banco, benefit?.banco));
      const bancoNome = text(firstDefined(rawDados?.NomeBanco, rawDados?.nomeBanco, rawDados?.BancoNome, benefit?.NomeBanco));
      const agencia = text(firstDefined(rawDados?.Agencia, rawDados?.agencia, benefit?.Agencia, benefit?.agencia));
      const conta = text(firstDefined(rawDados?.NumConta, rawDados?.numConta, rawDados?.ContaPagto, rawDados?.contaPagto, rawDados?.Conta, rawDados?.conta, benefit?.ContaPagto, benefit?.NumConta));
      const meio = text(firstDefined(rawDados?.MeioPagamento, rawDados?.meioPagamento, benefit?.MeioPagamento, benefit?.meioPagamento));

      let tipoRecebimento = '—';
      const meioNorm = meio.toUpperCase();
      if (meioNorm === '2' || meioNorm.includes('CORRENTE')) {
        tipoRecebimento = 'Conta Corrente';
      } else if (meioNorm === '1' || meioNorm.includes('MAGNETICO') || meioNorm.includes('MAGNÉTICO') || meioNorm.includes('CARTAO') || meioNorm.includes('CARTÃO')) {
        tipoRecebimento = 'Cartão Magnético';
      } else if (conta) {
        tipoRecebimento = 'Conta Corrente';
      } else if (bancoCod) {
        tipoRecebimento = 'Cartão Magnético';
      }

      return {
        banco: bancoCod,
        codigo_banco: bancoCod,
        nome_banco: bancoNome,
        agencia,
        conta,
        meio_pagamento: meio,
        tipo_recebimento: tipoRecebimento,
      };
    })(),
    analfabeto: inferIlliterate(benefit),
    has_two_cards: cardContext.hasTwoCards,
    negative_card_value: cardContext.negativeCardValue,
    margens: {
      margem_livre: numberValue(
        firstDefined(
          summary?.MargemDisponivelEmprestimo,
          summary?.Margem,
          benefit?.MargemDisponivelEmprestimo,
          benefit?.margem_livre,
          person?.MargemDisponivelEmprestimo,
        ),
      ),
    },
    contratos: loans,
  };
}

/**
 * Converte a resposta da consulta CPF para o modelo interno da Portabilidade Multipla.
 * A saida nao depende da tela Consulta CPF nem do Motor de simulacao.
 */
export function normalizePortabilidadeMultiplaConsulta(
  data: any,
  requestedCpf = '',
): PortabilidadeMultiplaConsulta {
  const rawBenefits = extractBenefits(data);
  const beneficios = rawBenefits.map(normalizeBenefit);

  const firstBenefit = rawBenefits[0] || {};
  const firstPerson = benefitPerson(firstBenefit);

  return {
    cliente: {
      cpf: cleanCpf(
        firstDefined(
          firstPerson?.CPF,
          firstPerson?.Cpf,
          firstPerson?.cpf,
          data?.CPF,
          data?.cpf,
          requestedCpf,
        ),
      ),
      nome: text(
        firstDefined(
          firstPerson?.Nome,
          firstPerson?.nome,
          data?.Nome,
          data?.nome,
        ),
      ),
      data_nascimento: normalizeDate(
        firstDefined(
          firstPerson?.DataNascimento,
          firstPerson?.dataNascimento,
          firstPerson?.data_nascimento,
          data?.Cadastro?.DataNascimento,
          data?.cadastro?.DataNascimento,
          data?.Cadastro?.dataNascimento,
          data?.cadastro?.dataNascimento,
          data?.Beneficiario?.DataNascimento,
          data?.beneficiario?.DataNascimento,
          data?.DataNascimento,
          data?.data_nascimento,
        ),
      ),
      idade:
        nonNegativeInt(
          firstDefined(
            firstPerson?.Idade,
            firstPerson?.idade,
            data?.Cadastro?.Idade,
            data?.cadastro?.Idade,
            data?.Cadastro?.idade,
            data?.cadastro?.idade,
            data?.Beneficiario?.Idade,
            data?.beneficiario?.Idade,
            data?.Idade,
            data?.idade,
          ),
        )
        || calculateAge(
          firstDefined(
            firstPerson?.DataNascimento,
            firstPerson?.dataNascimento,
            firstPerson?.data_nascimento,
            data?.Cadastro?.DataNascimento,
            data?.cadastro?.DataNascimento,
            data?.Cadastro?.dataNascimento,
            data?.cadastro?.dataNascimento,
            data?.Beneficiario?.DataNascimento,
            data?.beneficiario?.DataNascimento,
            data?.DataNascimento,
            data?.data_nascimento,
          ),
        ),
      uf: text(
        firstDefined(
          firstPerson?.UF,
          firstPerson?.UFBeneficio,
          firstPerson?.uf,
          data?.UF,
          data?.uf,
        ),
      ).toUpperCase(),
      filiacao: text(
        firstDefined(
          firstPerson?.NomeMae,
          firstPerson?.nomeMae,
          data?.Cadastro?.NomeMae,
          data?.cadastro?.NomeMae,
          data?.NomeMae,
          data?.nomeMae,
          firstPerson?.Mae,
          firstPerson?.mae,
        ),
      ),
      nome_mae: text(
        firstDefined(
          firstPerson?.NomeMae,
          firstPerson?.nomeMae,
          data?.Cadastro?.NomeMae,
          data?.cadastro?.NomeMae,
          data?.NomeMae,
          data?.nomeMae,
          firstPerson?.Mae,
          firstPerson?.mae,
        ),
      ),
      nome_pai: text(
        firstDefined(
          firstPerson?.NomePai,
          firstPerson?.nomePai,
          data?.Cadastro?.NomePai,
          data?.cadastro?.NomePai,
          data?.NomePai,
          data?.nomePai,
        ),
      ),
      endereco: (() => {
        const logr = text(firstDefined(
          firstPerson?.Endereco,
          firstPerson?.endereco,
          data?.Cadastro?.Endereco,
          data?.cadastro?.Endereco,
          data?.Endereco?.Logradouro,
          data?.Endereco?.Endereco,
          data?.endereco?.logradouro,
          data?.endereco?.endereco,
          data?.Endereco,
          data?.endereco,
        ));
        const num = text(firstDefined(
          firstPerson?.Numero,
          firstPerson?.numero,
          data?.Cadastro?.Numero,
          data?.cadastro?.Numero,
          data?.Endereco?.Numero,
          data?.endereco?.numero,
        ));
        const b = text(firstDefined(
          firstPerson?.Bairro,
          firstPerson?.bairro,
          data?.Cadastro?.Bairro,
          data?.cadastro?.Bairro,
          data?.Endereco?.Bairro,
          data?.endereco?.bairro,
        ));
        const c = text(firstDefined(
          firstPerson?.Cidade,
          firstPerson?.cidade,
          firstPerson?.Municipio,
          firstPerson?.municipio,
          data?.Cadastro?.Cidade,
          data?.cadastro?.Cidade,
          data?.Endereco?.Cidade,
          data?.Endereco?.Municipio,
          data?.endereco?.cidade,
        ));
        const u = text(firstDefined(
          firstPerson?.UF,
          firstPerson?.uf,
          firstPerson?.UFBeneficio,
          data?.Cadastro?.UF,
          data?.cadastro?.UF,
          data?.Endereco?.UF,
          data?.Endereco?.Uf,
          data?.endereco?.uf,
        )).toUpperCase();
        const cp = text(firstDefined(
          firstPerson?.CEP,
          firstPerson?.cep,
          data?.Cadastro?.CEP,
          data?.cadastro?.CEP,
          data?.Endereco?.CEP,
          data?.endereco?.cep,
        ));

        const parts: string[] = [];
        if (logr) parts.push(num ? `${logr}, ${num}` : logr);
        if (b) parts.push(b);
        if (c || u) parts.push([c, u].filter(Boolean).join(' - '));
        if (cp) parts.push(`CEP ${cp}`);

        return {
          logradouro: logr,
          numero: num,
          bairro: b,
          cidade: c,
          uf: u,
          cep: cp,
          texto_completo: parts.join(' • ') || '—',
        };
      })(),
      telefones: (() => {
        const rawPhones = [
          ...(asArray(data?.Telefones || data?.telefones)),
          ...(asArray(data?.Telefone || data?.telefone)),
          ...(asArray(firstPerson?.Telefones || firstPerson?.telefones)),
          ...(asArray(firstPerson?.Telefone || firstPerson?.telefone)),
          ...(asArray(firstPerson?.Celular || firstPerson?.celular)),
          ...(asArray(data?.Cadastro?.Telefone || data?.cadastro?.telefone)),
          ...(asArray(data?.Cadastro?.Celular || data?.cadastro?.celular)),
        ];
        const set = new Set<string>();
        for (const item of rawPhones) {
          const raw = typeof item === 'object' && item !== null
            ? (item?.Numero || item?.numero || item?.telefone || '')
            : item;
          const cleaned = String(raw || '').replace(/\D/g, '');
          if (cleaned.length >= 8) {
            if (cleaned.length === 11) {
              set.add(`(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`);
            } else if (cleaned.length === 10) {
              set.add(`(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`);
            } else {
              set.add(cleaned);
            }
          }
        }
        return Array.from(set);
      })(),
      telefone_principal: (() => {
        const rawPhones = [
          ...(asArray(data?.Telefones || data?.telefones)),
          ...(asArray(data?.Telefone || data?.telefone)),
          ...(asArray(firstPerson?.Telefones || firstPerson?.telefones)),
          ...(asArray(firstPerson?.Telefone || firstPerson?.telefone)),
          ...(asArray(firstPerson?.Celular || firstPerson?.celular)),
        ];
        for (const item of rawPhones) {
          const raw = typeof item === 'object' && item !== null
            ? (item?.Numero || item?.numero || item?.telefone || '')
            : item;
          const cleaned = String(raw || '').replace(/\D/g, '');
          if (cleaned.length === 11) {
            return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
          }
          if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
          }
        }
        return undefined;
      })(),
    },
    beneficios,
  };
}
