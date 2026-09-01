import { getBancoName } from './mappings';

function parseStreetAndNumber(rawAddressStr: string): { street: string; number: string } {
  if (!rawAddressStr) return { street: '', number: 'S/N' };

  const str = String(rawAddressStr).trim();
  const match = str.match(/(?:Nº|NR|N°|N|\bNUMERO\b|\bNÚMERO\b|,)\s*[:.]?\s*(\d+[A-Z]?|\d+)/i);
  if (match) {
    const num = match[1];
    const street = str.replace(match[0], '').replace(/,\s*$/, '').trim();
    return { street: street || str, number: num };
  }

  const endMatch = str.match(/^(.*?)\s+(\d+[A-Z]?)$/i);
  if (endMatch && endMatch[1].length > 3) {
    return { street: endMatch[1].trim(), number: endMatch[2] };
  }

  return { street: str, number: 'S/N' };
}

function parseCardList(rawInput: any, cardType: 'RMC' | 'RCC'): any[] {
  if (!rawInput) return [];
  const rawList = Array.isArray(rawInput) ? rawInput : [rawInput];
  if (rawList.length === 0) return [];

  let mainCard = rawList.find(c => c && (c.Margem !== undefined || c.ValorMargem !== undefined || c.MargemTotal !== undefined || c.ValorDesconto !== undefined || c.Desconto !== undefined));
  if (!mainCard) mainCard = rawList[0];

  const margemTotal = parseFloat(
    mainCard.Margem || mainCard.ValorMargem || mainCard.MargemTotal || mainCard.ValorParcela || mainCard.Desconto || mainCard.ValorDesconto || mainCard.Parcela || mainCard.margem || 0
  );

  let limiteCredito = parseFloat(
    mainCard.Limite || mainCard.LimiteCartao || mainCard.ValorLimite || mainCard.Valor || mainCard.Valor_emprestimo || mainCard.limite || 0
  );

  if ((isNaN(limiteCredito) || limiteCredito <= 0) && margemTotal > 0) {
    limiteCredito = margemTotal / 0.05; // Estimar limite padrão (20x o valor da parcela)
  }

  let totalUtilizado = 0;
  const contratos: string[] = [];

  rawList.forEach((c: any) => {
    if (!c || typeof c !== 'object') return;
    const contrato = String(c.Contrato || c.contrato || '').trim();
    if (contrato && !contratos.includes(contrato)) {
      contratos.push(contrato);
    }

    const p = parseFloat(c.Parcela || c.ValorParcela || c.Desconto || c.desconto || c.parcela || 0);
    if (!isNaN(p) && p > 0 && (c !== mainCard || (contrato && contrato !== String(mainCard.Contrato || '')))) {
      totalUtilizado += p;
    }
  });

  const margemDisponivel = Math.max(0, Math.round((margemTotal - totalUtilizado) * 100) / 100);

  const bancoCode = mainCard.Banco !== undefined && mainCard.Banco !== null ? String(mainCard.Banco).trim() : (mainCard.IdBanco !== undefined && mainCard.IdBanco !== null ? String(mainCard.IdBanco).trim() : '');
  const nomeBanco = String(mainCard.NomeBanco || mainCard.Rubrica || mainCard.nomeBanco || mainCard.rubrica || '').trim();

  if (margemTotal <= 0 && limiteCredito <= 0 && totalUtilizado <= 0 && !bancoCode && !nomeBanco) {
    return [];
  }

  return [{
    Tipo: cardType,
    Banco: bancoCode,
    NomeBanco: nomeBanco,
    ValorParcela: margemTotal,
    MargemTotal: margemTotal,
    TotalUtilizado: totalUtilizado,
    MargemDisponivel: margemDisponivel,
    Limite: limiteCredito,
    Contrato: contratos.join(', '),
  }];
}

export function normalizeCPFConsultaItem(item: any, isSiapeParam = false): any {
  if (!item || typeof item !== 'object') return null;

  const rawBeneficiario = item.Beneficiario || {};
  const rawCadastro = item.Cadastro || {};
  const rawEndereco = item.Endereco || {};

  const isSiape = isSiapeParam || !!item.isSiape || !!rawCadastro.Matricula || !!rawBeneficiario.isSiape;

  const nome = rawBeneficiario.Nome || rawCadastro.Nome || item.Nome || item.nome || '';
  const cpf = rawBeneficiario.CPF || rawCadastro.CPF || item.CPF || item.cpf || '';
  const dataNascimento = rawBeneficiario.DataNascimento || rawCadastro.DataNascimento || item.DataNascimento || item.dataNascimento || '';
  const nomeMae = rawBeneficiario.NomeMae || rawCadastro.NomeMae || item.NomeMae || item.nomeMae || '';
  const beneficioNum = rawBeneficiario.Beneficio || rawCadastro.Matricula || rawCadastro.Beneficio || item.Beneficio || item.beneficio || item.Matricula || '';
  const situacao = rawBeneficiario.Situacao || (rawCadastro.Nome ? 'Ativo' : '') || item.Situacao || 'Ativo';
  const especie = rawBeneficiario.Especie || rawCadastro.AmparoLegal || rawCadastro.RegimeJuridico || item.Especie || item.especie || '';
  const dib = rawBeneficiario.DIB || item.DIB || item.dib || '';
  const bloqueado = rawBeneficiario.BloqueadoEmprestimo === '1' || rawBeneficiario.BloqueadoEmprestimo === true || item.BloqueadoEmprestimo === '1' || item.BloqueadoEmprestimo === true;

  const orgao = rawCadastro.Orgao || item.Orgao || item.orgao || '';
  const instituto = rawCadastro.Instituto || item.Instituto || item.instituto || '';

  const rawLogradouro = rawBeneficiario.Endereco || rawEndereco.Logradouro || rawEndereco.Endereco || item.Endereco || item.logradouro || '';
  const bairro = rawBeneficiario.Bairro || rawEndereco.Bairro || item.Bairro || item.bairro || '';
  const cidade = rawBeneficiario.Cidade || rawBeneficiario.Municipio || rawEndereco.Municipio || rawEndereco.Cidade || item.Cidade || item.cidade || '';
  const uf = rawBeneficiario.UF || rawBeneficiario.UFBeneficio || rawEndereco.Uf || rawEndereco.UF || item.UF || item.uf || '';
  const cep = rawBeneficiario.CEP || rawEndereco.CEP || item.CEP || item.cep || '';

  const { street, number } = parseStreetAndNumber(rawLogradouro);

  const beneficiarioNormalized = {
    Nome: String(nome || '').trim(),
    CPF: String(cpf || '').trim(),
    DataNascimento: String(dataNascimento || '').trim(),
    NomeMae: String(nomeMae || '').trim(),
    Beneficio: String(beneficioNum || '').trim(),
    Situacao: String(situacao || 'Ativo').trim(),
    Especie: String(especie || '').trim(),
    DIB: String(dib || '').trim(),
    BloqueadoEmprestimo: bloqueado,
    isSiape,
    Orgao: String(orgao || '').trim(),
    Instituto: String(instituto || '').trim(),
    Endereco: street,
    Numero: number,
    Bairro: String(bairro || '').trim(),
    Cidade: String(cidade || '').trim(),
    UF: String(uf || '').trim(),
    CEP: String(cep || '').trim(),
  };

  // Dados Bancários
  const rawDadosBancarios = item.DadosBancarios || {};
  const dadosBancariosNormalized = {
    Banco: rawDadosBancarios.Banco !== undefined && rawDadosBancarios.Banco !== null ? String(rawDadosBancarios.Banco).trim() : (item.Banco ? String(item.Banco).trim() : ''),
    Agencia: rawDadosBancarios.Agencia !== undefined && rawDadosBancarios.Agencia !== null ? String(rawDadosBancarios.Agencia).trim() : (item.Agencia ? String(item.Agencia).trim() : ''),
    ContaPagto: rawDadosBancarios.NumConta || rawDadosBancarios.ContaPagto || item.ContaPagto || item.numConta || '',
    MeioPagamento: rawDadosBancarios.MeioPagamento || item.MeioPagamento || '',
  };

  // Resumo Financeiro
  const rawResumo = item.ResumoFinanceiro || {};
  const bruto = parseFloat(rawResumo.ValorBeneficio || rawResumo.Bruto || item.ValorBeneficio || item.Bruto || 0);
  const liquido = parseFloat(rawResumo.BaseCalculo || rawResumo.ValorLiquido || item.BaseCalculo || item.ValorLiquido || 0);
  const margemResumo = parseFloat(rawResumo.MargemDisponivelEmprestimo || rawResumo.Margem || item.MargemDisponivelEmprestimo || 0);
  const descontoTotal = parseFloat(rawResumo.Desconto || item.Desconto || 0);

  const resumoFinanceiroNormalized = {
    ValorBeneficio: isNaN(bruto) ? 0 : bruto,
    BaseCalculo: isNaN(liquido) ? 0 : liquido,
    MargemDisponivelEmprestimo: isNaN(margemResumo) ? 0 : margemResumo,
    DescontoTotal: isNaN(descontoTotal) ? 0 : descontoTotal,
  };

  // Telefones
  let rawTelefones = item.Telefone || item.telefones || item.Telefones || [];
  if (!Array.isArray(rawTelefones)) {
    rawTelefones = rawTelefones ? [rawTelefones] : [];
  }
  const telefonesNormalized = rawTelefones.map((t: any) => {
    if (!t) return '';
    if (typeof t === 'string' || typeof t === 'number') return String(t).trim();
    return String(t.Numero || t.numero || t.telefone || '').trim();
  }).filter((t: string) => t.length > 0);

  // Extração Inteligente de Cartões RMC e RCC
  let rawRmc = item.Rmc || item.RMC || item.rmc || item.ReservaMargemConsignavel || item.rmcBeneficio;
  let rawRcc = item.RCC || item.Rcc || item.rcc || item.ReservaCartaoConsignado || item.rccBeneficio;

  if (Array.isArray(item.Cartoes) || Array.isArray(item.cartoes)) {
    const arr = item.Cartoes || item.cartoes;
    arr.forEach((c: any) => {
      const tipo = String(c.Tipo || c.tipo || c.Especie || c.especie || c.Rubrica || c.rubrica || '').toUpperCase();
      if (tipo.includes('RCC') || tipo.includes('BENEFICIO') || tipo.includes('BENEFÍCIO')) {
        rawRcc = rawRcc ? (Array.isArray(rawRcc) ? [...rawRcc, c] : [rawRcc, c]) : [c];
      } else {
        rawRmc = rawRmc ? (Array.isArray(rawRmc) ? [...rawRmc, c] : [rawRmc, c]) : [c];
      }
    });
  }

  // Filtrar empréstimos e separar contratos que pertencem a cartões/reservas
  const rawEmprestimos = Array.isArray(item.Emprestimos) ? item.Emprestimos : (item.Emprestimos ? [item.Emprestimos] : []);
  const extraRmcFromEmp: any[] = [];
  const extraRccFromEmp: any[] = [];
  const cleanEmprestimosList: any[] = [];

  rawEmprestimos.forEach((emp: any) => {
    if (!emp || typeof emp !== 'object') return;
    const cleanBancoCode = String(emp.Banco !== undefined && emp.Banco !== null ? emp.Banco : (emp.IdBanco !== undefined && emp.IdBanco !== null ? emp.IdBanco : '')).replace(/\D/g, '').padStart(3, '0');
    const rubricaUpper = String(emp.Rubrica || emp.NomeBanco || emp.bancoNome || emp.rubrica || '').toUpperCase();
    const tipoUpper = String(emp.Tipo || emp.tipo || emp.TipoEmprestimo || emp.TipoCartao || '').toUpperCase();
    const combinedStr = `${rubricaUpper} ${tipoUpper}`;

    // Contratos do PicPay (079) ou Original são empréstimos consignados normais
    const isPicPay = cleanBancoCode === '079' || rubricaUpper.includes('PICPAY');

    if (!isPicPay && (tipoUpper === 'RMC' || combinedStr.includes('RESERVA DE MARGEM') || combinedStr.includes('RMC') || combinedStr.includes('CARTAO CONSIGNADO') || combinedStr.includes('CARTÃO CONSIGNADO'))) {
      extraRmcFromEmp.push({ ...emp, TipoCartao: 'RMC' });
    } else if (!isPicPay && (tipoUpper === 'RCC' || combinedStr.includes('RCC') || combinedStr.includes('CARTAO BENEFICIO') || combinedStr.includes('CARTÃO BENEFÍCIO') || combinedStr.includes('CARTAO BENEF'))) {
      extraRccFromEmp.push({ ...emp, TipoCartao: 'RCC' });
    } else {
      cleanEmprestimosList.push(emp);
    }
  });

  const mergedRmc = rawRmc ? (Array.isArray(rawRmc) ? [...rawRmc, ...extraRmcFromEmp] : [rawRmc, ...extraRmcFromEmp]) : extraRmcFromEmp;
  const mergedRcc = rawRcc ? (Array.isArray(rawRcc) ? [...rawRcc, ...extraRccFromEmp] : [rawRcc, ...extraRccFromEmp]) : extraRccFromEmp;

  const rmcNormalized = parseCardList(mergedRmc, 'RMC');
  const rccNormalized = parseCardList(mergedRcc, 'RCC');

  // Lista detalhada de todos os contratos averbados nos cartões para exibição linha a linha
  const cardLoansNormalized = [...extraRmcFromEmp, ...extraRccFromEmp].map((emp: any) => {
    let bancoCode = emp.Banco !== undefined && emp.Banco !== null ? String(emp.Banco).trim() : (emp.IdBanco !== undefined && emp.IdBanco !== null ? String(emp.IdBanco).trim() : '0');
    const rubrica = emp.NomeBanco || emp.Rubrica || emp.rubrica || emp.bancoNome || '';
    const contrato = emp.Contrato || emp.contrato || '';
    const prazoRestantes = parseInt(emp.ParcelasRestantes || emp.PrazoRestantes || emp.prazoRestante || 0);
    const prazoTotal = parseInt(emp.Prazo || emp.prazo || emp.parcelas || (prazoRestantes > 0 ? prazoRestantes : 0));
    const valorParcela = parseFloat(emp.ValorParcela || emp.Parcela || emp.parcela || 0);
    const valorLiberado = parseFloat(emp.ValorEmprestado || emp.ValorContrato || emp.ValorFinanciado || emp.ValorLiberado || emp.SaldoDevedor || emp.saldo || 0);

    return {
      Banco: bancoCode,
      NomeBanco: String(rubrica || '').trim(),
      Contrato: String(contrato || '').trim(),
      ParcelasRestantes: String(prazoRestantes || 0),
      Prazo: String(prazoTotal || prazoRestantes || 0),
      ValorParcela: isNaN(valorParcela) ? 0 : valorParcela,
      ValorLiberado: isNaN(valorLiberado) ? 0 : valorLiberado,
      TipoCartao: emp.TipoCartao || 'RCC',
    };
  });

  const emprestimosNormalized = cleanEmprestimosList.map((emp: any) => {
    if (!emp || typeof emp !== 'object') return null;
    
    let bancoCode = emp.Banco !== undefined && emp.Banco !== null ? String(emp.Banco).trim() : (emp.IdBanco !== undefined && emp.IdBanco !== null ? String(emp.IdBanco).trim() : '');
    const rubrica = emp.NomeBanco || emp.Rubrica || emp.rubrica || emp.bancoNome || '';
    const contrato = emp.Contrato || emp.contrato || '';
    const prazoRestantes = parseInt(emp.ParcelasRestantes || emp.PrazoRestantes || emp.prazoRestante || emp.prazo_restante || 0);
    const prazoTotal = parseInt(emp.Prazo || emp.prazo || emp.parcelas || (prazoRestantes > 0 ? prazoRestantes : 0));
    const valorParcela = parseFloat(emp.ValorParcela || emp.Parcela || emp.parcela || 0);
    const saldoDevedor = parseFloat(emp.Quitacao || emp.SaldoDevedor || emp.saldoDevedor || emp.saldo || 0);
    const valorEmprestado = parseFloat(emp.ValorEmprestado || emp.ValorContrato || emp.ValorFinanciado || emp.ValorLiberado || 0);
    const taxa = String(emp.Taxa || emp.taxa || '1.60');

    return {
      Banco: bancoCode,
      NomeBanco: String(rubrica || '').trim(),
      Contrato: String(contrato || '').trim(),
      ParcelasRestantes: String(prazoRestantes || 0),
      Prazo: String(prazoTotal || prazoRestantes || 0),
      ValorParcela: isNaN(valorParcela) ? 0 : valorParcela,
      SaldoDevedor: isNaN(saldoDevedor) ? 0 : saldoDevedor,
      ValorEmprestado: isNaN(valorEmprestado) ? 0 : valorEmprestado,
      Taxa: taxa,
    };
  }).filter(Boolean);

  return {
    isSiape,
    Beneficiario: beneficiarioNormalized,
    DadosBancarios: dadosBancariosNormalized,
    ResumoFinanceiro: resumoFinanceiroNormalized,
    Telefone: telefonesNormalized,
    Rmc: rmcNormalized,
    RCC: rccNormalized,
    CardLoansList: cardLoansNormalized,
    Emprestimos: emprestimosNormalized,
  };
}

export function parseConsultaResponse(data: any, isSiape = false): any[] {
  if (!data) return [];
  if (data.error) return [];
  
  let rawList: any[] = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (data.beneficios && Array.isArray(data.beneficios)) {
    rawList = data.beneficios;
  } else if (data.value && Array.isArray(data.value)) {
    rawList = data.value;
  } else if (typeof data === 'object') {
    rawList = [data];
  }

  return rawList
    .map(item => normalizeCPFConsultaItem(item, isSiape))
    .filter(Boolean);
}
