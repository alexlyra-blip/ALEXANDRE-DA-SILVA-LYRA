export interface PortabilidadeMultiplaCliente {
  cpf: string;
  nome: string;
  data_nascimento: string;
  idade: number;
  uf: string;
}

export interface PortabilidadeMultiplaMargens {
  margem_livre: number;
}

export interface PortabilidadeMultiplaContrato {
  id: string;
  beneficio: string;
  banco: string;
  codigo_banco: string;
  contrato: string;
  parcela: number;

  /**
   * Saldo/quitacao atual da operacao.
   * null significa que o provider nao entregou informacao suficiente.
   */
  saldo_devedor: number | null;
  quitacao: number | null;

  taxa: number;
  prazo: number;
  prazo_restante: number;
  parcelas_pagas: number;

  /**
   * Valor original/financiado do contrato.
   * NUNCA deve receber saldo_devedor ou valor_liberado como fallback.
   */
  valor_contrato: number | null;

  /**
   * Valor efetivamente liberado ao cliente na contratacao original,
   * quando o provider o disponibilizar.
   */
  valor_liberado: number | null;

  data_averbacao: string;
  situacao: string;
}

export interface PortabilidadeMultiplaBeneficio {
  numero: string;
  especie: string;
  situacao: string;
  salario: number;

  /**
   * Contexto necessário para executar as regras INSS do Motor por contrato.
   * São campos internos normalizados; nomes crus do provider não saem daqui.
   */
  data_concessao: string;
  analfabeto: boolean;
  has_two_cards: boolean;
  negative_card_value: number;

  margens: PortabilidadeMultiplaMargens;
  contratos: PortabilidadeMultiplaContrato[];
}

export interface PortabilidadeMultiplaConsulta {
  cliente: PortabilidadeMultiplaCliente;
  beneficios: PortabilidadeMultiplaBeneficio[];
}
