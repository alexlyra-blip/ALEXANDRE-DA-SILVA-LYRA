import { getBancoName } from './mappings';

function parseCardList(raw: any, cardType: 'RMC' | 'RCC'): any[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  
  return list.map((c: any) => {
    if (!c || typeof c !== 'object') return null;
    
    const valorParcela = parseFloat(
      c.ValorParcela || c.ValorDesconto || c.Desconto || c.Margem || c.ValorMargem || c.Parcela || c.desconto || c.margem || c.valorParcela || c.valorDesconto || c.Valor || 0
    );
    let limite = parseFloat(
      c.Limite || c.LimiteCartao || c.ValorLimite || c.limite || c.limiteCartao || c.valorLimite || 0
    );
    
    if ((isNaN(limite) || limite <= 0) && valorParcela > 0) {
      limite = valorParcela / 0.05; // Estimar limite padrão (20x o valor da parcela/margem)
    }
    
    const bancoCode = c.Banco !== undefined && c.Banco !== null ? String(c.Banco).trim() : (c.IdBanco !== undefined && c.IdBanco !== null ? String(c.IdBanco).trim() : '');
    const nomeBanco = String(c.NomeBanco || c.Rubrica || c.nomeBanco || c.rubrica || '').trim();

    if (isNaN(valorParcela) || valorParcela <= 0) {
      if (limite <= 0 && !bancoCode && !nomeBanco) return null;
    }

    return {
      Tipo: cardType,
      Banco: bancoCode,
      NomeBanco: nomeBanco,
      ValorParcela: isNaN(valorParcela) ? 0 : valorParcela,
      Limite: isNaN(limite) ? 0 : limite,
    };
  }).filter(Boolean);
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

  const logradouro = rawBeneficiario.Endereco || rawEndereco.Logradouro || rawEndereco.Endereco || item.Endereco || item.logradouro || '';
  const bairro = rawBeneficiario.Bairro || rawEndereco.Bairro || item.Bairro || item.bairro || '';
  const cidade = rawBeneficiario.Cidade || rawBeneficiario.Municipio || rawEndereco.Municipio || rawEndereco.Cidade || item.Cidade || item.cidade || '';
  const uf = rawBeneficiario.UF || rawBeneficiario.UFBeneficio || rawEndereco.Uf || rawEndereco.UF || item.UF || item.uf || '';
  const cep = rawBeneficiario.CEP || rawEndereco.CEP || item.CEP || item.cep || '';

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
    Endereco: String(logradouro || '').trim(),
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
  const bruto = parseFloat(rawResumo.ValorBeneficio || rawResumo.Bruto || item.ValorBeneficio || 0);
  const liquido = parseFloat(rawResumo.BaseCalculo || rawResumo.ValorLiquido || item.BaseCalculo || 0);
  const margemResumo = parseFloat(rawResumo.MargemDisponivelEmprestimo || rawResumo.Margem || item.MargemDisponivelEmprestimo || 0);

  const resumoFinanceiroNormalized = {
    ValorBeneficio: isNaN(bruto) ? 0 : bruto,
    BaseCalculo: isNaN(liquido) ? 0 : liquido,
    MargemDisponivelEmprestimo: isNaN(margemResumo) ? 0 : margemResumo,
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

  // Filtrar empréstimos e identificar cartões que por ventura venham na lista de empréstimos
  const rawEmprestimos = Array.isArray(item.Emprestimos) ? item.Emprestimos : (item.Emprestimos ? [item.Emprestimos] : []);
  const extraRmcFromEmp: any[] = [];
  const extraRccFromEmp: any[] = [];
  const cleanEmprestimosList: any[] = [];

  rawEmprestimos.forEach((emp: any) => {
    if (!emp || typeof emp !== 'object') return;
    const rubricaUpper = String(emp.Rubrica || emp.NomeBanco || emp.bancoNome || emp.rubrica || '').toUpperCase();
    const tipoUpper = String(emp.Tipo || emp.tipo || emp.TipoEmprestimo || '').toUpperCase();
    const combinedStr = `${rubricaUpper} ${tipoUpper}`;

    if (combinedStr.includes('RMC') || combinedStr.includes('RESERVA DE MARGEM') || combinedStr.includes('CARTAO CONSIGNADO') || combinedStr.includes('CARTÃO CONSIGNADO')) {
      extraRmcFromEmp.push(emp);
    } else if (combinedStr.includes('RCC') || combinedStr.includes('CARTAO BENEFICIO') || combinedStr.includes('CARTÃO BENEFÍCIO') || combinedStr.includes('CARTAO BENEF')) {
      extraRccFromEmp.push(emp);
    } else {
      cleanEmprestimosList.push(emp);
    }
  });

  const mergedRmc = rawRmc ? (Array.isArray(rawRmc) ? [...rawRmc, ...extraRmcFromEmp] : [rawRmc, ...extraRmcFromEmp]) : extraRmcFromEmp;
  const mergedRcc = rawRcc ? (Array.isArray(rawRcc) ? [...rawRcc, ...extraRccFromEmp] : [rawRcc, ...extraRccFromEmp]) : extraRccFromEmp;

  const rmcNormalized = parseCardList(mergedRmc, 'RMC');
  const rccNormalized = parseCardList(mergedRcc, 'RCC');

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
