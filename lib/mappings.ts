export const INSS_ESPECIES: Record<string, string> = {
  '01': 'PENSÃO POR MORTE DO TRABALHADOR RURAL',
  '02': 'PENSÃO POR MORTE POR ACIDENTE DO TRABALHO RURAL',
  '03': 'PENSÃO POR MORTE DE EMPREGADOR RURAL',
  '04': 'APOSENTADORIA POR INVALIDEZ DO TRABALHADOR RURAL',
  '05': 'APOSENTADORIA POR INVALIDEZ POR ACIDENTE DO TRABALHO RURAL',
  '06': 'APOSENTADORIA POR INVALIDEZ DE EMPREGADOR RURAL',
  '07': 'APOSENTADORIA POR IDADE DO TRABALHADOR RURAL',
  '08': 'APOSENTADORIA POR IDADE DE EMPREGADOR RURAL',
  '11': 'AMPARO PREVIDENCIÁRIO POR INVALIDEZ TRABALHADOR RURAL',
  '12': 'AMPARO PREVIDENCIÁRIO POR IDADE TRABALHADOR RURAL',
  '21': 'PENSÃO POR MORTE PREVIDENCIÁRIA',
  '22': 'PENSÃO POR MORTE ESTATUTÁRIA',
  '23': 'PENSÃO POR MORTE DE EX-COMBATENTE',
  '24': 'PENSÃO ESPECIAL (ATO INSTITUCIONAL)',
  '26': 'PENSÃO ESPECIAL (LEI 593/48)',
  '27': 'PENSÃO POR MORTE DE SERVIDOR PÚBLICO FEDERAL',
  '28': 'PENSÃO POR MORTE (LEI 1756/52)',
  '29': 'PENSÃO POR MORTE (LEI 8955/94)',
  '32': 'APOSENTADORIA POR INVALIDEZ PREVIDENCIÁRIA',
  '33': 'APOSENTADORIA POR INVALIDEZ DE AERONAUTA',
  '34': 'APOSENTADORIA POR INVALIDEZ DE EX-COMBATENTE',
  '41': 'APOSENTADORIA POR IDADE',
  '42': 'APOSENTADORIA POR TEMPO DE CONTRIBUIÇÃO',
  '43': 'APOSENTADORIA POR TEMPO DE CONTRIBUIÇÃO EX-COMBATENTE',
  '44': 'APOSENTADORIA POR TEMPO DE CONTRIBUIÇÃO AERONAUTA',
  '45': 'APOSENTADORIA POR TEMPO DE CONTRIBUIÇÃO JORNALISTA',
  '46': 'APOSENTADORIA ESPECIAL',
  '49': 'APOSENTADORIA POR IDADE ORDINÁRIA',
  '51': 'APOSENTADORIA POR INVALIDEZ (EXTINTO PLANO BÁSICO)',
  '52': 'APOSENTADORIA POR IDADE (EXTINTO PLANO BÁSICO)',
  '54': 'PENSÃO ESPECIAL VITALÍCIA (SÍNDROME DA TALIDOMIDA)',
  '55': 'PENSÃO POR MORTE (EXTINTO PLANO BÁSICO)',
  '56': 'PENSÃO VITALÍCIA (HANSENÍASE)',
  '57': 'APOSENTADORIA POR TEMPO DE CONTRIBUIÇÃO DE PROFESSOR',
  '58': 'APOSENTADORIA EXCEPCIONAL DO ANISTIADO',
  '59': 'PENSÃO POR MORTE EXCEPCIONAL DO ANISTIADO',
  '87': 'AMPARO SOCIAL A PESSOA PORTADORA DE DEFICIÊNCIA (LOAS)',
  '88': 'AMPARO SOCIAL AO IDOSO (LOAS)',
  '92': 'APOSENTADORIA POR INVALIDEZ POR ACIDENTE DO TRABALHO',
  '93': 'PENSÃO POR MORTE POR ACIDENTE DO TRABALHO',
};

export const BANCOS_BRASIL: Record<string, string> = {
  '001': 'BANCO DO BRASIL S.A.',
  '033': 'BANCO SANTANDER (BRASIL) S.A.',
  '104': 'CAIXA ECONOMICA FEDERAL',
  '237': 'BANCO BRADESCO S.A.',
  '341': 'ITAÚ UNIBANCO S.A.',
  '041': 'BANCO DO ESTADO DO RIO GRANDE DO SUL S.A.',
  '077': 'BANCO INTER S.A.',
  '079': 'BANCO PICPAY / ORIGINAL',
  '212': 'BANCO ORIGINAL S.A.',
  '389': 'BANCO MERCANTIL DO BRASIL S.A.',
  '422': 'BANCO SAFRA S.A.',
  '623': 'BANCO PAN S.A.',
  '626': 'BANCO C6 CONSIGNADO S.A.',
  '029': 'BANCO ITAÚ CONSIGNADO S.A.',
  '707': 'BANCO DAYCOVAL S.A.',
  '318': 'BANCO BMG S.A.',
  '069': 'BANCO CREFISA S.A.',
  '121': 'BANCO AGIBANK S.A.',
  '012': 'BANCO INBURSA S.A.',
  '935': 'FACTA FINANCEIRA S.A.',
  '010': 'CREDICOAMO',
  '074': 'BANCO J. SAFRA S.A.',
  '208': 'BANCO BTG PACTUAL S.A.',
  '243': 'BANCO MASTER S.A.',
  '254': 'PARANA BANCO S.A.',
  '336': 'BANCO C6 S.A.',
  '925': 'BRB FINANCEIRA',
};

export function getEspecieName(codigo: any): string {
  if (codigo === undefined || codigo === null || codigo === '') return 'N/A';
  const strCod = String(codigo).trim();
  if (!strCod) return 'N/A';
  const cleanCode = strCod.padStart(2, '0');
  return INSS_ESPECIES[cleanCode] ? `${cleanCode} - ${INSS_ESPECIES[cleanCode]}` : strCod;
}

export function getBancoName(codigo: any): string {
  if (codigo === undefined || codigo === null || codigo === '') return 'N/A';
  const strCod = String(codigo).trim();
  if (!strCod) return 'N/A';
  const cleanCode = strCod.padStart(3, '0');
  return BANCOS_BRASIL[cleanCode] ? `${cleanCode} - ${BANCOS_BRASIL[cleanCode]}` : strCod;
}

export function calculateSaldoDevedor(valorParcela: number, parcelasRestantes: number, taxaMensalStr: string | number): number {
  if (!valorParcela || !parcelasRestantes || !taxaMensalStr) return 0;
  
  // Taxa pode vir como "1.98" ou "1,98" ou "1.98%"
  let taxaFormatada = String(taxaMensalStr).replace('%', '').replace(',', '.').trim();
  let taxaMensal = parseFloat(taxaFormatada) / 100;

  if (isNaN(taxaMensal) || taxaMensal <= 0) return valorParcela * parcelasRestantes;

  // PV = PMT * ((1 - (1 + i)^-n) / i)
  const pv = valorParcela * ((1 - Math.pow(1 + taxaMensal, -parcelasRestantes)) / taxaMensal);
  return Math.floor(pv * 100) / 100; // Truncate 2 decimals
}

export function findBankCode(bankName: string): string {
  if (!bankName) return '';
  const match = bankName.match(/^(\d{3})/);
  if (match) return match[1];

  const norm = bankName.toLowerCase().trim();

  if (norm.includes('digio')) return '335';
  if (norm.includes('c6')) return '626';
  if (norm.includes('pan')) return '623';
  if (norm.includes('daycoval')) return '707';
  if (norm.includes('bmg')) return '318';
  if (norm.includes('safra')) return '422';
  if (norm.includes('santander')) return '033';
  if (norm.includes('bradesco')) return '237';
  if (norm.includes('itau') || norm.includes('itaú')) return '341';
  if (norm.includes('caixa')) return '104';
  if (norm.includes('brasil')) return '001';
  if (norm.includes('banrisul')) return '041';
  if (norm.includes('inter')) return '077';
  if (norm.includes('facta')) return '935';
  if (norm.includes('agibank')) return '121';
  if (norm.includes('inbursa')) return '012';
  if (norm.includes('crefisa')) return '069';

  for (const [code, name] of Object.entries(BANCOS_BRASIL)) {
    const nameNorm = name.toLowerCase();
    if (nameNorm.includes(norm) || norm.includes(nameNorm)) {
      return code;
    }
  }
  return bankName;
}

