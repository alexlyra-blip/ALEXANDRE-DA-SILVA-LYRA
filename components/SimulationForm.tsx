'use client';

import { useRouter } from 'next/navigation';
import { HelpCircle, User, CreditCard, FileText, ChevronDown, TrendingUp, Sparkles, X, Loader2, Search, Check, Landmark, Plus, Trash2, AlertCircle, Crown } from 'lucide-react';
import { getBancoName, calculateSaldoDevedor } from '@/lib/mappings';
import { QuotaAlert } from '@/components/QuotaAlert';
import { useState, useRef, useEffect, useMemo } from 'react';
import TransitionAnimation from '@/components/TransitionAnimation';
import { useRules } from '@/contexts/RuleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { safeStringify } from '@/lib/utils';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ConsultaCPFModal from '@/components/ConsultaCPFModal';

const getAI = () => {
  let apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  if (apiKey.includes("MY_GEMINI") || !apiKey) {
      apiKey = "AIzaSyBLQXgN8KtlZclzEqFeXk7wYAUzkbtcs80"; 
  }
  return new GoogleGenAI({ apiKey });
};

export default function SimulationForm({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const { profile } = useAuth();
  const { banks: rulesBanks } = useRules();
  const { showToast, hideToast } = useToast();
  const router = useRouter();
  const [nomeCliente, setNomeCliente] = useState('');
  const [cpfCliente, setCpfCliente] = useState('');
  const [idade, setIdade] = useState('');
  const [convenio, setConvenio] = useState<'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS' | 'CLT PRIVADO'>('INSS');
  const [subConvenio, setSubConvenio] = useState('');
  const [codigoBeneficio, setCodigoBeneficio] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTermBank, setSearchTermBank] = useState('');
  const [isDropdownOpenBank, setIsDropdownOpenBank] = useState(false);
  const [dropdownBankIndex, setDropdownBankIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [activeIndexBank, setActiveIndexBank] = useState(-1);
  const [visibleBanksCount, setVisibleBanksCount] = useState(15);
  const [visibleBeneficiosCount, setVisibleBeneficiosCount] = useState(15);
  const [activeContractTab, setActiveContractTab] = useState(0);
  
  // Consulta API States
  const [tipoConsulta, setTipoConsulta] = useState<'inss' | 'siape'>('inss');
  const [isConsulting, setIsConsulting] = useState(false);
  const [consultaData, setConsultaData] = useState<any>(null);
  const [isConsultaModalOpen, setIsConsultaModalOpen] = useState(false);
  const [addedContractsIds, setAddedContractsIds] = useState<string[]>([]);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  const validateCPF = (cpf: string) => {
    const cleanCpf = cpf.replace(/\D/g, '');
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

  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const dropdownBankRef = useRef<HTMLDivElement>(null);

  interface Contract {
    id: string;
    bancoAtual: string;
    valorParcela: string;
    prazoTotal: string;
    parcelasRestantes: string;
    saldoDevedor: string;
  }

  const [contracts, setContracts] = useState<Contract[]>([
    { id: '1', bancoAtual: '', valorParcela: '', prazoTotal: '', parcelasRestantes: '', saldoDevedor: '' }
  ]);

  const contractsAmount = contracts.filter(c => c.bancoAtual !== '' || c.valorParcela !== '').length;

  const addContract = () => {
    if (contracts.length < 5) {
      const newId = crypto.randomUUID();
      setContracts([...contracts, { id: newId, bancoAtual: '', valorParcela: '', prazoTotal: '', parcelasRestantes: '', saldoDevedor: '' }]);
      setActiveContractTab(contracts.length); // Switch to the new tab
    }
  };

  const removeContract = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (contracts.length > 1) {
      const indexToRemove = contracts.findIndex(c => c.id === id);
      const newContracts = contracts.filter(c => c.id !== id);
      setContracts(newContracts);
      // Adjust active tab if necessary
      if (activeContractTab >= newContracts.length) {
        setActiveContractTab(newContracts.length - 1);
      } else if (activeContractTab > indexToRemove) {
        setActiveContractTab(activeContractTab - 1);
      }
    }
  };

  const handleConsultaCPF = async () => {
    if (!isCpfValid) {
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
        body: JSON.stringify({ cpf: cpfCliente, type: tipoConsulta })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Falha na consulta');
      }
      
      setConsultaData(data);
      setIsConsultaModalOpen(true);
      
      // Auto-fill some personal data if available
      const isArray = Array.isArray(data);
      const dataArray = isArray ? data : (data.beneficios ? data.beneficios : (data.value ? data.value : [data]));
      const beneficios = dataArray.length > 0 && dataArray[0].Beneficiario ? dataArray : [];
      const firstBenefit = beneficios[0] || {};
      const personalInfo = firstBenefit.Beneficiario || {};
      
      if (personalInfo?.Nome && !nomeCliente) setNomeCliente(personalInfo.Nome);
      if (personalInfo?.DataNascimento && !idade) {
        const birthDate = new Date(personalInfo.DataNascimento);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        if (age > 0) setIdade(age.toString());
      }
      if (firstBenefit?.Beneficiario?.Especie && !codigoBeneficio) {
        setCodigoBeneficio(firstBenefit.Beneficiario.Especie.toString());
      }
      if (firstBenefit?.Beneficiario?.DDB) {
        setDataConcessao(firstBenefit.Beneficiario.DDB);
      }
      
      const rmc = Array.isArray(firstBenefit?.Rmc) ? firstBenefit.Rmc : (firstBenefit?.Rmc ? [firstBenefit.Rmc] : []);
      const rcc = Array.isArray(firstBenefit?.RCC) ? firstBenefit.RCC : (firstBenefit?.RCC ? [firstBenefit.RCC] : []);
      
      if (rmc.length > 0 && rcc.length > 0) {
        setHasTwoCards(true);
        const cardValue1 = parseFloat(rmc[0]?.ValorParcela || rmc[0]?.Desconto || 0);
        const cardValue2 = parseFloat(rcc[0]?.ValorParcela || rcc[0]?.Desconto || 0);
        const maxCardValue = Math.max(cardValue1, cardValue2);
        if (maxCardValue > 0) {
          setNegativeCardValue(maxCardValue.toFixed(2).replace('.', ','));
        }
      } else {
        setHasTwoCards(false);
        setNegativeCardValue('');
      }
      
    } catch (error: any) {
      console.error("Consulta CPF Error:", error);
      showToast(error.message || "Erro ao consultar CPF. Verifique sua conexão.", "error");
    } finally {
      setIsConsulting(false);
    }
  };

  const handleToggleContractFromConsulta = (contractData: any, action: 'add' | 'remove') => {
    const hash = `${contractData.Banco}-${contractData.Contrato}`;
    
    if (action === 'add') {
      const isFirstEmpty = contracts.length === 1 && !contracts[0].bancoAtual && !contracts[0].valorParcela;
      if (contracts.length >= 5 && !isFirstEmpty) {
        showToast("Limite máximo de 5 simulações atingido", "warning");
        return;
      }
      
      const taxa = contractData.Taxa || contractData.taxa || 0;
      const prazoTotalCalc = parseInt(contractData.Prazo || contractData.parcelas || 0);
      const parcelasRestantes = parseInt(contractData.ParcelasRestantes || contractData.prazo_restante || 0);
      const saldoDevedorCalc = calculateSaldoDevedor(parseFloat(contractData.ValorParcela || 0), parcelasRestantes, taxa);
      
      const valorOrigin = contractData.Quitacao || contractData.SaldoDevedor || contractData.saldo || saldoDevedorCalc || 0;
      
      const bancoExibicao = getBancoName(contractData.Banco) !== contractData.Banco 
        ? getBancoName(contractData.Banco) 
        : (contractData.NomeBanco || contractData.Banco || '');

      const newContractInfo = {
        bancoAtual: bancoExibicao,
        valorParcela: contractData.ValorParcela ? parseFloat(contractData.ValorParcela.toString()).toFixed(2).replace('.', ',') : '',
        prazoTotal: prazoTotalCalc ? prazoTotalCalc.toString() : '',
        parcelasRestantes: (contractData.ParcelasRestantes || contractData.prazo_restante || '').toString(),
        saldoDevedor: valorOrigin ? parseFloat(valorOrigin.toString()).toFixed(2).replace('.', ',') : '',
      };
      
      setAddedContractsIds([...addedContractsIds, hash]);
      
      if (isFirstEmpty) {
        const newContracts = [...contracts];
        newContracts[0] = { ...newContracts[0], ...newContractInfo };
        setContracts(newContracts);
        setActiveContractTab(0);
      } else {
        const newId = crypto.randomUUID();
        setContracts([...contracts, { id: newId, ...newContractInfo }]);
        setActiveContractTab(contracts.length); // switch to the newly created tab
      }
      showToast("Contrato adicionado à simulação", "success");
      
    } else {
      // remove
      const indexToRemove = contracts.findIndex(c => c.bancoAtual === contractData.Banco && c.valorParcela === contractData.ValorParcela.toString());
      if (indexToRemove !== -1) {
        if (contracts.length === 1) {
          const newContracts = [...contracts];
          newContracts[0] = { id: newContracts[0].id, bancoAtual: '', valorParcela: '', prazoTotal: '', parcelasRestantes: '', saldoDevedor: '' };
          setContracts(newContracts);
        } else {
          const newContracts = contracts.filter((_, i) => i !== indexToRemove);
          setContracts(newContracts);
          setActiveContractTab(Math.max(0, activeContractTab > indexToRemove ? activeContractTab - 1 : activeContractTab));
        }
        setAddedContractsIds(addedContractsIds.filter(id => id !== hash));
        showToast("Contrato removido", "info");
      }
    }
  };

  const updateContract = (index: number, fields: Partial<Contract>) => {
    const newContracts = [...contracts];
    newContracts[index] = { ...newContracts[index], ...fields };
    setContracts(newContracts);
  };
  
  const allBanks = Array.from(new Set([
    "121 - AGIBANK", "250 - BCV", "025 - BANCO ALFA", "233 - BANCO CIFRA", "001 - BANCO DO BRASIL",
    "047 - BANCO DO ESTADO DO SERGIPE", "079 - BANCO ORIGINAL", "643 - BANCO PINE", "081 - BANCO SEGURO",
    "041 - BANRISUL", "268 - BARIGUI", "318 - BMG", "237 - BRADESCO S.A.", "070 - BRB", "626 - C6",
    "320 - CCB BRASIL", "104 - CAIXA", "069 - CREFISA", "707 - DAYCOVAL", "335 - DIGIO", "149 - FACTA",
    "012 - INBURSA", "029 - ITAÚ CONSIGNADO", "184 - ITAÚ BBA", "341 - ITAÚ UNIBANCO", "389 - MERCANTIL",
    "386 - NU FINANCEIRA S.A.", "753 - NBC BANK", "169 - OLÉ", "290 - PAGBANK", "623 - PAN", "254 - PARANÁ BANCO",
    "752 - BNP PARIBAS", "326 - PARATI", "611 - PAULISTA", "380 - PICPAY", "329 - QI SOCIEDADE", "966 - SABEMI",
    "422 - SAFRA", "033 - SANTANDER", "359 - ZEMA", "OUTROS"
  ]))
    .filter(bank => !['C6 CONSIG', 'BANRISUL', 'BMG', 'DAYCOVAL', 'DIGIO', 'FACTA', 'HAVECRED'].includes(bank))
    .sort((a, b) => {
      if (a === 'OUTROS') return 1;
      if (b === 'OUTROS') return -1;
      const nameA = a.includes(' - ') ? a.split(' - ')[1] : a;
      const nameB = b.includes(' - ') ? b.split(' - ')[1] : b;
      return nameA.localeCompare(nameB);
    });

  const beneficios = useMemo(() => {
    const baseBeneficios = {
      INSS: [
        { value: "01", label: "01 - Pensão por morte do trabalhador rural" },
        { value: "02", label: "02 - Pensão por morte por acidente do trabalho do trabalhador rural" },
        { value: "03", label: "03 - Pensão por morte do empregador rural" },
        { value: "04", label: "04 - Aposentadoria por invalidez do trabalhador rural" },
        { value: "05", label: "05 - Aposentadoria por invalidez, por acidente do trabalhador rural" },
        { value: "06", label: "06 - Aposentadoria por idade do trabalhador rural" },
        { value: "07", label: "07 - Aposentadoria por idade por idade do trabalhador rural" },
        { value: "08", label: "08 - Aposentadoria por tempo de serviço do trabalhador rural" },
        { value: "11", label: "11 - Renda Mensal Vitalícia por invalidez do trabalhador rural" },
        { value: "12", label: "12 - Renda Mensal Vitalícia por idade do trabalhador rural" },
        { value: "21", label: "21 - Pensão por morte previdenciária (LOPS)" },
        { value: "22", label: "22 - Pensão por morte estatutária" },
        { value: "23", label: "23 - Pensão por morte de ex-combatente" },
        { value: "26", label: "26 - Pensão especial" },
        { value: "27", label: "27 - Pensão por morte de servidor público federal com dupla aposentadoria" },
        { value: "28", label: "28 - Pensão por morte, do Regime Geral" },
        { value: "29", label: "29 - Pensão por morte de ex-combatente marítimo" },
        { value: "30", label: "30 - Renda Mensal Vitalícia por invalidez" },
        { value: "32", label: "32 - Aposentadoria por invalidez previdenciária (LOPS)" },
        { value: "33", label: "33 - Aposentadoria por invalidez de aeronauta" },
        { value: "34", label: "34 - Aposentadoria por invalidez de ex-combatente marítimo" },
        { value: "37", label: "37 - Aposentadoria de extranumerário da União" },
        { value: "38", label: "38 - Aposentadoria da extinta CAPIN" },
        { value: "40", label: "40 - Renda Mensal Vitalícia por idade" },
        { value: "41", label: "41 - Aposentadoria por idade" },
        { value: "42", label: "42 - Aposentadoria por tempo de contribuição previdenciária" },
        { value: "43", label: "43 - Aposentadoria por tempo de contribuição de ex-combatente" },
        { value: "44", label: "44 - Aposentadoria por tempo de contribuição de aeronauta" },
        { value: "45", label: "45 - Aposentadoria por tempo de contribuição de jornalista profissional" },
        { value: "46", label: "46 - Aposentadoria por tempo de contribuição especial" },
        { value: "49", label: "49 - Aposentadoria por tempo de contribuição ordinária" },
        { value: "54", label: "54 - Pensão especial vitalícia" },
        { value: "56", label: "56 - Pensão mensal vitalícia por síndrome de talidomida" },
        { value: "57", label: "57 - Aposentadoria por tempo de contribuição de professor" },
        { value: "58", label: "58 - Aposentadoria excepcional do anistiado" },
        { value: "59", label: "59 - Pensão por morte excepcional do anistiado" },
        { value: "60", label: "60 - Pensão especial mensal vitalícia" },
        { value: "72", label: "72 - Aposentadoria por tempo de contribuição de ex-combatente marítimo" },
        { value: "78", label: "78 - Aposentadoria por idade por idade de ex-combatente marítimo" },
        { value: "81", label: "81 - Aposentadoria por idade por idade compulsória" },
        { value: "87", label: "87 - Amparo social à pessoa com deficiência (BPC/LOAS)" },
        { value: "88", label: "88 - Amparo social ao idoso (BPC/LOAS)" },
        { value: "89", label: "89 - Pensão especial aos dependentes de vítimas fatais por contaminação na hemodiálise" },
        { value: "92", label: "92 - Aposentadoria por invalidez por acidente do trabalho" },
        { value: "93", label: "93 - Pensão por morte por acidente do trabalho" },
        { value: "96", label: "96 - Pensão especial para pessoas atingidas por Hanseníase" },
      ],
      SIAPE: [
        { value: "S1", label: "S1 - Ativo/Aposentado" },
        { value: "S2", label: "S2 - Beneficiário de Pensão" },
      ],
      GOVERNO: [
        { value: "AC", label: "AC - Acre" },
        { value: "AL", label: "AL - Alagoas" },
        { value: "AP", label: "AP - Amapá" },
        { value: "AM", label: "AM - Amazonas" },
        { value: "BA", label: "BA - Bahia" },
        { value: "CE", label: "CE - Ceará" },
        { value: "DF", label: "DF - Distrito Federal" },
        { value: "ES", label: "ES - Espírito Santo" },
        { value: "GO", label: "GO - Goiás" },
        { value: "MA", label: "MA - Maranhão" },
        { value: "MT", label: "MT - Mato Grosso" },
        { value: "MS", label: "MS - Mato Grosso do Sul" },
        { value: "MG", label: "MG - Minas Gerais" },
        { value: "PA", label: "PA - Pará" },
        { value: "PB", label: "PB - Paraíba" },
        { value: "PR", label: "PR - Paraná" },
        { value: "PE", label: "PE - Pernambuco" },
        { value: "PI", label: "PI - Piauí" },
        { value: "RJ", label: "RJ - Rio de Janeiro" },
        { value: "RN", label: "RN - Rio Grande do Norte" },
        { value: "RS", label: "RS - Rio Grande do Sul" },
        { value: "RO", label: "RO - Rondônia" },
        { value: "RR", label: "RR - Roraima" },
        { value: "SC", label: "SC - Santa Catarina" },
        { value: "SP", label: "SP - São Paulo" },
        { value: "SE", label: "SE - Sergipe" },
        { value: "TO", label: "TO - Tocantins" },
      ],
      'FORÇAS ARMADAS': [
        { value: "01", label: "01 - Exército" },
        { value: "02", label: "02 - Aeronáutica" },
        { value: "03", label: "03 - Marinha" },
      ],
      'CLT PRIVADO': [
        { value: "CP", label: "CP - CLT PRIVADO" },
      ]
    };

    const matchState = (ruleSub: string | undefined, stateOption: {value: string, label: string}) => {
       if (!ruleSub) return false;
       const r = ruleSub.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
       const code = stateOption.value.toLowerCase();
       const name = stateOption.label.split(' - ')[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
       return r === code || r === name || r.includes(name);
    };

    const activeGovernoStates = baseBeneficios.GOVERNO.filter(state => {
      return rulesBanks.some(bank => 
        bank.isActive !== false && 
        bank.convenio === 'GOVERNO' && 
        bank.tabelas && bank.tabelas.length > 0 &&
        matchState(bank.subConvenio, state)
      );
    });

    return {
      ...baseBeneficios,
      GOVERNO: activeGovernoStates.length > 0 ? activeGovernoStates : []
    };
  }, [rulesBanks]);

  const filteredBeneficios = beneficios[convenio].filter(b => 
    b.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBanks = allBanks.filter(b => b.toLowerCase().includes(searchTermBank.toLowerCase()));

  const displayedBeneficios = filteredBeneficios.slice(0, visibleBeneficiosCount);
  const displayedBanks = filteredBanks.slice(0, visibleBanksCount);

  const handleDropdownScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      setVisibleBeneficiosCount(prev => prev + 15);
    }
  };

  const handleBankDropdownScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      setVisibleBanksCount(prev => prev + 15);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => {
        const next = prev < filteredBeneficios.length - 1 ? prev + 1 : prev;
        if (next >= visibleBeneficiosCount) setVisibleBeneficiosCount(prev => prev + 1);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredBeneficios.length) {
        const b = filteredBeneficios[activeIndex];
        setCodigoBeneficio(b.value);
        if (convenio !== 'INSS') {
          setSubConvenio(b.label.includes(' - ') ? b.label.split(' - ')[1] : b.label);
        }
        setIsDropdownOpen(false);
        setSearchTerm('');
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const handleKeyDownBank = (e: React.KeyboardEvent) => {
    if (!isDropdownOpenBank) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndexBank(prev => (prev < filteredBanks.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndexBank(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndexBank >= 0 && activeIndexBank < filteredBanks.length && dropdownBankIndex !== null) {
        const b = filteredBanks[activeIndexBank];
        updateContract(dropdownBankIndex, { bancoAtual: b });
        setIsDropdownOpenBank(false);
        setSearchTermBank('');
        setDropdownBankIndex(null);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpenBank(false);
      setDropdownBankIndex(null);
    }
  };

  useEffect(() => {
    if (isDropdownOpen) setActiveIndex(-1);
  }, [isDropdownOpen]);

  useEffect(() => {
    if (isDropdownOpenBank) setActiveIndexBank(-1);
  }, [isDropdownOpenBank]);

  useEffect(() => {
    if (activeIndex >= 0 && dropdownRef.current) {
      const activeElement = dropdownRef.current.children[activeIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndexBank >= 0 && dropdownBankRef.current) {
      const activeElement = dropdownBankRef.current.children[activeIndexBank] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndexBank]);

  const handleConvenioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConvenio(e.target.value as 'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS' | 'CLT PRIVADO');
    setCodigoBeneficio('');
    setSearchTerm('');
    setSubConvenio('');
    if (['SIAPE', 'GOVERNO', 'FORÇAS ARMADAS', 'CLT PRIVADO'].includes(e.target.value)) {
      setDataConcessao('');
    }
  };
  const [dataConcessao, setDataConcessao] = useState('');
  const [isAnalfabeto, setIsAnalfabeto] = useState<boolean | null>(null);
  const [isCliente60Mais, setIsCliente60Mais] = useState<boolean | null>(null);
  const [hasTwoCards, setHasTwoCards] = useState<boolean | null>(null);
  const [negativeCardValue, setNegativeCardValue] = useState('');

  const effectiveIs60MaisForUI = isCliente60Mais !== null ? isCliente60Mais : (parseInt(idade) >= 60);
  const isInvalidityBenefit = ['4', '04', '5', '05', '11', '30', '32', '33', '34', '92'].includes(codigoBeneficio);
  const showDataConcessao = convenio === 'INSS' && isInvalidityBenefit && parseInt(idade) < 60;
  const show60Mais = parseInt(idade) >= 60;

  const handleIdadeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length <= 2) {
      setIdade(val);
      if (parseInt(val) < 60) {
        setIsCliente60Mais(null);
      }
    }
  };

  const formatCurrency = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    if (!numericValue) return '';
    const numberValue = parseInt(numericValue, 10) / 100;
    return new Intl.NumberFormat('pt-BR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2,
      useGrouping: true 
    }).format(numberValue);
  };

  const parseCurrency = (value: string) => {
    if (!value) return 0;
    return parseFloat(value.replace(/\./g, '').replace(',', '.'));
  };



  const calculateInterestRate = (saldoDevedor: string, valorParcela: string, parcelasRestantes: string) => {
    const pv = parseCurrency(saldoDevedor);
    const pmt = parseCurrency(valorParcela);
    const n = parseInt(parcelasRestantes) || 0;

    if (pv <= 0 || pmt <= 0 || n <= 0) return null;
    if (pmt * n <= pv) return null;

    let low = 0.0;
    let high = 1.0;
    let mid = 0;
    const epsilon = 1e-6;

    for (let i = 0; i < 100; i++) {
      mid = (low + high) / 2;
      const estimatedPV = pmt * (1 - Math.pow(1 + mid, -n)) / mid;
      if (Math.abs(estimatedPV - pv) < epsilon) break;
      if (estimatedPV > pv) low = mid; else high = mid;
    }

    const monthlyRate = mid;
    const annualRate = Math.pow(1 + monthlyRate, 12) - 1;
    return { monthlyRate, annualRate };
  };

  const isContractInvalid = (c: Contract) => {
    return parseCurrency(c.valorParcela) > 0 && 
           parseInt(c.parcelasRestantes) > 0 && 
           parseCurrency(c.saldoDevedor) > 0 && 
           parseCurrency(c.valorParcela) * parseInt(c.parcelasRestantes) <= parseCurrency(c.saldoDevedor);
  };

  const hasInvalidContract = contracts.some(c => isContractInvalid(c));
  const isFormIncomplete = contracts.some(c => !c.bancoAtual || !c.valorParcela || !c.prazoTotal || !c.parcelasRestantes || !c.saldoDevedor);
  
  const [isSimulating, setIsSimulating] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);

  const handleAIParsing = async () => {
    if (!aiInput.trim()) return;
    setIsAILoading(true);
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Extraia os dados de simulação de portabilidade do seguinte texto em Português: "${aiInput}".
        Obrigatório identificar: Idade, Convênio, Banco Atual, Valor da Parcela, Prazo Total, Parcelas Restantes e Saldo Devedor.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              idade: { type: Type.NUMBER },
              convenio: { type: Type.STRING },
              codigoBeneficio: { type: Type.STRING },
              bancoAtual: { type: Type.STRING },
              valorParcela: { type: Type.NUMBER },
              prazoTotal: { type: Type.NUMBER },
              parcelasRestantes: { type: Type.NUMBER },
              saldoDevedor: { type: Type.NUMBER },
            }
          }
        }
      });
      const text = response.text;
      if (!text) throw new Error("No response from AI");
      const data = JSON.parse(text);
      if (data.idade) setIdade(data.idade.toString());
      if (data.convenio) {
        const conv = data.convenio.toUpperCase();
        if (['INSS', 'SIAPE', 'GOVERNO', 'FORÇAS ARMADAS', 'CLT PRIVADO'].includes(conv)) setConvenio(conv as any);
      }
      if (data.codigoBeneficio) setCodigoBeneficio(data.codigoBeneficio);
      
      const firstContract = { ...contracts[0] };
      if (data.bancoAtual) {
        const foundBank = allBanks.find(b => b.toLowerCase().includes(data.bancoAtual.toLowerCase()));
        if (foundBank) firstContract.bancoAtual = foundBank;
      }
      if (data.valorParcela) firstContract.valorParcela = formatCurrency((data.valorParcela * 100).toString());
      if (data.prazoTotal) firstContract.prazoTotal = data.prazoTotal.toString();
      if (data.parcelasRestantes) firstContract.parcelasRestantes = data.parcelasRestantes.toString();
      if (data.saldoDevedor) firstContract.saldoDevedor = formatCurrency((data.saldoDevedor * 100).toString());
      
      const newContracts = [...contracts];
      newContracts[0] = firstContract;
      setContracts(newContracts);
      
      setIsAIModalOpen(false);
      setAiInput('');
    } catch (error) {
      console.error("Erro ao processar com IA:", error);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSimulate = () => {
    if (hasInvalidContract || isFormIncomplete) return;

    if (parseInt(idade) >= 60 && isCliente60Mais === null) {
      showToast("Por favor, informe se o cliente é 60+.", 'error');
      return;
    }

    const totalParcelas = contracts.reduce((sum, c) => sum + parseCurrency(c.valorParcela), 0);
    if (profile?.limiteCredito && totalParcelas > profile.limiteCredito) {
      showToast(`O valor total das parcelas (R$ ${totalParcelas.toFixed(2)}) excede seu limite de crédito.`, 'error');
      return;
    }
    setIsSimulating(true);
  };

  const onAnimationComplete = () => {
    if (!profile?.uid) {
      showToast("Usuário não autenticado. Faça login novamente.", "error");
      return;
    }

    const simulations = contracts.map(c => {
      const rate = calculateInterestRate(c.saldoDevedor, c.valorParcela, c.parcelasRestantes);
      return {
        id: c.id,
        userId: profile.uid,
        userName: profile?.name || '',
        userAvatar: profile?.avatarUrl || profile?.photoUrl || null,
        promotoraId: profile?.role === 'promotora'
          ? profile.uid
          : profile?.promotoraId || profile?.createdBy || profile.uid,
        nomeCliente,
        cpfCliente,
        convenio,
        subConvenio,
        idade: parseInt(idade) || 0,
        codigoBeneficio,
        dataConcessao,
        bancoAtual: c.bancoAtual,
        valorParcela: parseCurrency(c.valorParcela),
        negativeCardValue: convenio === 'INSS' && hasTwoCards ? (negativeCardValue ? parseCurrency(negativeCardValue) : 81.05) : 0,
        prazoTotal: parseInt(c.prazoTotal) || 0,
        parcelasRestantes: parseInt(c.parcelasRestantes) || 0,
        saldoDevedor: parseCurrency(c.saldoDevedor),
        parcelasPagas: (parseInt(c.prazoTotal) || 0) - (parseInt(c.parcelasRestantes) || 0),
        isAnalfabeto,
        isCliente60Mais,
        taxaJurosMensal: rate?.monthlyRate || 0,
        taxaJurosAnual: rate?.annualRate || 0,
        timestamp: Date.now()
      };
    });
    
    sessionStorage.setItem('simulationData', safeStringify(simulations[0]));
    sessionStorage.setItem('allSimulations', safeStringify(simulations));
    router.push('/simulacao/recomendacoes');
  };

  return (
    <div className={`flex w-full ${isEmbedded ? 'h-full' : 'min-h-screen'} bg-background text-foreground`}>
      <div className={`flex flex-col w-full ${isEmbedded ? '' : 'md:w-[520px]'} shrink-0 border-r border-slate-200 dark:border-slate-800 bg-background relative`}>
        {isSimulating && <TransitionAnimation onComplete={onAnimationComplete} availableBanks={rulesBanks} />}
        
        {!isEmbedded && (
          <header className="sticky top-0 z-50 bg-white dark:bg-white backdrop-blur-md border-b border-primary/10">
            <div className="flex items-center p-4 justify-between w-full">
              <div className="flex items-center gap-3">
                <Link href="/" className="flex items-center justify-center size-10 rounded-full hover:bg-primary/10 transition-colors text-slate-900 dark:text-slate-900">
                  <ArrowLeft className="w-6 h-6" />
                </Link>
                <h2 className="text-xl font-bold text-black dark:text-black">Nova Simulação</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsAIModalOpen(true)} className="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  <Sparkles className="w-5 h-5" />
                </button>
                <button className="flex items-center justify-center size-10 rounded-full hover:bg-primary/10 transition-colors text-slate-900 dark:text-slate-900">
                  <HelpCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
          </header>
        )}

        <main className="flex-1 w-full px-4 py-6 overflow-y-auto">
          <QuotaAlert />
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <User className="text-primary w-6 h-6" />
              <h3 className="text-lg font-bold">Informações do Cliente</h3>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-white uppercase tracking-wider text-[10px]">Nome do Cliente (Opcional)</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                    <input 
                      className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 pl-12 pr-4 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm" 
                      type="text" 
                      value={nomeCliente} 
                      onChange={(e) => setNomeCliente(e.target.value)} 
                      placeholder="Nome completo do segurado" 
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-white uppercase tracking-wider text-[10px]">CPF (Opcional)</label>
                  <div className="relative">
                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                    <input 
                      className={`w-full rounded-xl border ${cpfCliente && !isCpfValid ? 'border-rose-300 bg-rose-50/10' : 'border-primary/20'} bg-white dark:bg-white h-14 pl-12 pr-12 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm`} 
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
                  
                  {/* Multicorban Consulta Area */}
                  <AnimatePresence>
                    {isCpfValid && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl p-3 flex flex-col gap-3"
                      >
                        <div className="flex flex-col sm:flex-row gap-3 items-center">
                          <div className="flex-1 w-full flex items-center bg-white dark:bg-slate-900 rounded-lg p-1 border border-primary/10">
                            <button
                              type="button"
                              onClick={() => setTipoConsulta('inss')}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${tipoConsulta === 'inss' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
                            >
                              INSS
                            </button>
                            <button
                              type="button"
                              onClick={() => setTipoConsulta('siape')}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${tipoConsulta === 'siape' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
                            >
                              SIAPE
                            </button>
                          </div>
                          
                          <button
                            type="button"
                            onClick={handleConsultaCPF}
                            disabled={isConsulting}
                            className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-light hover:to-primary text-white text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 min-w-[140px]"
                          >
                            {isConsulting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                            {isConsulting ? 'Consultando...' : 'Consultar Dados'}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 text-center sm:text-left flex items-center justify-center sm:justify-start gap-1">
                          <Crown className="w-3 h-3 text-amber-500" /> Consultar dados na base nacional.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-white">Convênio</label>
                <div className="bg-slate-100 dark:bg-slate-900/50 p-1 rounded-2xl flex flex-wrap gap-1">
                  {(['INSS', 'SIAPE', 'GOVERNO', 'FORÇAS ARMADAS', 'CLT PRIVADO'] as const).map(lib => (
                    <button key={lib} type="button" onClick={() => handleConvenioChange({ target: { value: lib } } as any)} className={`flex-1 px-2 h-10 rounded-xl text-[10px] font-bold transition-all ${convenio === lib ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}>{lib}</button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-white">Idade do Cliente</label>
                <input className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 p-4 text-base font-medium" type="number" value={idade} onChange={handleIdadeChange} placeholder="Ex: 65" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-white">{convenio === 'INSS' ? 'Código do Benefício' : 'Sub-convênio'}</label>
                <div className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 pl-12 pr-10 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      placeholder={convenio === 'INSS' ? "Buscar por código ou nome..." : "Selecionar sub-convênio..."}
                      value={isDropdownOpen ? searchTerm : (beneficios[convenio].find(b => b.value === codigoBeneficio)?.label || '')}
                      onFocus={() => {
                        setIsDropdownOpen(true);
                        setSearchTerm('');
                      }}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={handleKeyDown}
                      readOnly={false}
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
                    <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  <AnimatePresence>
                    {isDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setIsDropdownOpen(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          onScroll={handleDropdownScroll}
                          className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-20 max-h-64 overflow-y-auto overflow-x-hidden"
                        >
                          <div className="p-2 space-y-1" ref={dropdownRef}>
                            {displayedBeneficios
                              .map((b, index) => (
                                <button
                                  key={b.value}
                                  type="button"
                                  onClick={() => {
                                    setCodigoBeneficio(b.value);
                                    if (convenio !== 'INSS') {
                                      setSubConvenio(b.label.includes(' - ') ? b.label.split(' - ')[1] : b.label);
                                    }
                                    setIsDropdownOpen(false);
                                    setSearchTerm('');
                                  }}
                                  onMouseEnter={() => setActiveIndex(index)}
                                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left text-base font-medium transition-colors ${
                                    codigoBeneficio === b.value || activeIndex === index
                                      ? 'bg-primary/10 text-primary font-bold' 
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <span className="truncate pr-4">{b.label}</span>
                                  {codigoBeneficio === b.value && <Check className="w-4 h-4 shrink-0" />}
                                </button>
                              ))}
                            {beneficios[convenio].filter(b => 
                              b.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              b.value.toLowerCase().includes(searchTerm.toLowerCase())
                            ).length === 0 && (
                              <div className="px-4 py-6 text-center text-slate-500 text-xs italic">
                                Nenhum benefício encontrado para &quot;{searchTerm}&quot;
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {showDataConcessao && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-white">Data de Concessão</label>
                  <input className="w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 h-14 p-4 text-base font-medium" type="date" value={dataConcessao} onChange={(e) => setDataConcessao(e.target.value)} />
                </div>
              )}

              {convenio === 'INSS' && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-600 dark:text-white">Cliente tem 2 cartões ativos?</label>
                    <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl">
                      <button type="button" onClick={() => setHasTwoCards(true)} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${hasTwoCards === true ? 'bg-primary text-white' : 'text-slate-500'}`}>SIM</button>
                      <button type="button" onClick={() => setHasTwoCards(false)} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${hasTwoCards === false ? 'bg-primary text-white' : 'text-slate-500'}`}>NÃO</button>
                    </div>
                  </div>
                  {hasTwoCards === true && (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-600 dark:text-white uppercase tracking-wider text-[10px]">
                        Valor Negativo do Cartão (R$) - Opcional (Padrão: R$ 81,05)
                      </label>
                      <input 
                        className="w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 h-14 p-4 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm" 
                        type="text" 
                        value={negativeCardValue} 
                        onChange={(e) => setNegativeCardValue(formatCurrency(e.target.value))} 
                        placeholder="Ex: 81,05" 
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-600 dark:text-white">Analfabeto?</label>
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl">
                  <button type="button" onClick={() => setIsAnalfabeto(true)} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${isAnalfabeto === true ? 'bg-primary text-white' : 'text-slate-500'}`}>SIM</button>
                  <button type="button" onClick={() => setIsAnalfabeto(false)} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${isAnalfabeto === false ? 'bg-primary text-white' : 'text-slate-500'}`}>NÃO</button>
                </div>
              </div>

              {show60Mais && (
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-600 dark:text-white">Cliente 60+?</label>
                  <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl">
                    <button type="button" onClick={() => setIsCliente60Mais(true)} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${isCliente60Mais === true ? 'bg-primary text-white' : 'text-slate-500'}`}>SIM</button>
                    <button type="button" onClick={() => setIsCliente60Mais(false)} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${isCliente60Mais === false ? 'bg-primary text-white' : 'text-slate-500'}`}>NÃO</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-8"></div>

          <section className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <FileText className="text-primary w-6 h-6" />
                <h3 className="text-lg font-bold">Detalhes do Contrato</h3>
              </div>
              <button 
                type="button"
                onClick={addContract}
                disabled={contracts.length >= 5 || (convenio === 'INSS' && hasTwoCards === true)}
                className="flex items-center gap-1 px-4 py-2 bg-emerald-500/10 text-emerald-600 rounded-xl text-xs font-black uppercase tracking-tight hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-emerald-500/10"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Contrato</span>
              </button>
            </div>
            
            {contracts.length > 1 && (
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none px-1">
                {contracts.map((c, idx) => (
                  <div
                    key={`tab-${c.id}`}
                    onClick={() => setActiveContractTab(idx)}
                    className={`flex-shrink-0 min-w-[100px] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2 flex items-center justify-between gap-2 cursor-pointer ${
                      activeContractTab === idx 
                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30' 
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 hover:border-primary/20'
                    }`}
                  >
                    <span>Contrato #{idx + 1}</span>
                    <button 
                      type="button"
                      onClick={(e) => removeContract(c.id, e)}
                      className={`hover:bg-black/10 rounded-full p-0.5 ${activeContractTab === idx ? 'block' : 'hidden md:block'}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="space-y-6">
              {contracts.map((contract, index) => {
                if (contracts.length > 1 && activeContractTab !== index) return null;
                
                const rate = calculateInterestRate(contract.saldoDevedor, contract.valorParcela, contract.parcelasRestantes);
                const invalid = isContractInvalid(contract);

                return (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={contract.id} 
                    className={`p-6 rounded-3xl border transition-all ${invalid ? 'border-red-200 bg-red-50/10 shadow-inner' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-black/5'} relative border-t-4 ${invalid ? 'border-t-rose-500' : 'border-t-primary'}`}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Detalhes da Operação</span>
                          <h4 className="text-base font-bold text-slate-900 dark:text-white">Contrato #{index + 1}</h4>
                        </div>
                      </div>
                      {contracts.length > 1 && (
                        <button 
                          onClick={(e) => removeContract(contract.id, e)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-rose-500 bg-rose-50 rounded-lg text-xs font-bold hover:bg-rose-500 hover:text-white transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Excluir</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-slate-600 dark:text-white">Banco Atual</label>
                        <div className="relative">
                          <div className="relative">
                            <input
                              type="text"
                              className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 pl-12 pr-10 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                              placeholder="Buscar banco..."
                              value={(isDropdownOpenBank && dropdownBankIndex === index) ? searchTermBank : contract.bancoAtual}
                              onFocus={() => {
                                setIsDropdownOpenBank(true);
                                setSearchTermBank('');
                                setDropdownBankIndex(index);
                              }}
                              onChange={(e) => setSearchTermBank(e.target.value)}
                              onKeyDown={handleKeyDownBank}
                            />
                            <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5 pointer-events-none" />
                            <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 transition-transform duration-200 ${isDropdownOpenBank && dropdownBankIndex === index ? 'rotate-180' : ''}`} />
                          </div>

                          <AnimatePresence>
                            {isDropdownOpenBank && dropdownBankIndex === index && (
                              <>
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={() => {
                                    setIsDropdownOpenBank(false);
                                    setDropdownBankIndex(null);
                                  }}
                                />
                                <motion.div
                                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                  onScroll={handleBankDropdownScroll}
                                  className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-20 max-h-64 overflow-y-auto overflow-x-hidden"
                                >
                                  <div className="p-2 space-y-1" ref={dropdownBankRef}>
                                    {displayedBanks
                                      .map((b, bIndex) => (
                                        <button
                                          key={b}
                                          type="button"
                                          onClick={() => {
                                            updateContract(index, { bancoAtual: b });
                                            setIsDropdownOpenBank(false);
                                            setSearchTermBank('');
                                            setDropdownBankIndex(null);
                                          }}
                                          onMouseEnter={() => setActiveIndexBank(bIndex)}
                                          className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left text-base font-medium transition-colors ${
                                            contract.bancoAtual === b || activeIndexBank === bIndex
                                              ? 'bg-primary/10 text-primary font-bold' 
                                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                          }`}
                                        >
                                          <div className="flex items-center gap-3 truncate">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${contract.bancoAtual === b || activeIndexBank === bIndex ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                                              <Landmark className="w-4 h-4" />
                                            </div>
                                            <span className="truncate pr-4">{b}</span>
                                          </div>
                                          {contract.bancoAtual === b && <Check className="w-4 h-4 shrink-0" />}
                                        </button>
                                      ))}
                                    {filteredBanks.length === 0 && (
                                      <div className="px-4 py-6 text-center text-slate-500 text-xs italic">
                                        Nenhum banco encontrado para &quot;{searchTermBank}&quot;
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-slate-600 dark:text-white">Valor da Parcela</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                          <input 
                            className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 pl-12 pr-4 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none" 
                            type="text" 
                            value={contract.valorParcela} 
                            onChange={(e) => updateContract(index, { valorParcela: formatCurrency(e.target.value) })} 
                            placeholder="0,00" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-semibold text-slate-600 dark:text-white">Prazo Total</label>
                          <input 
                            className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 p-4 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none" 
                            type="number" 
                            value={contract.prazoTotal} 
                            onChange={(e) => updateContract(index, { prazoTotal: e.target.value })} 
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-semibold text-slate-600 dark:text-white">Parc. Restantes</label>
                          <input 
                            className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 p-4 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none" 
                            type="number" 
                            value={contract.parcelasRestantes} 
                            onChange={(e) => updateContract(index, { parcelasRestantes: e.target.value })} 
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-slate-600 dark:text-white">Saldo Devedor</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                          <input 
                            className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 pl-12 pr-4 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none" 
                            type="text" 
                            value={contract.saldoDevedor} 
                            onChange={(e) => updateContract(index, { saldoDevedor: formatCurrency(e.target.value) })} 
                            placeholder="0.000,00" 
                          />
                        </div>
                      </div>

                      {rate && !invalid && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex flex-col gap-1 mt-2 shadow-inner">
                          <div className="flex items-center gap-2 mb-1">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            <h4 className="text-sm font-black uppercase tracking-tighter text-emerald-600 dark:text-emerald-400">Análise de Taxa</h4>
                          </div>
                          <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-xl border border-emerald-500/10 shadow-sm">
                            <span className="text-xs font-bold text-slate-500">Taxa Mensal Estimada:</span>
                            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                              {(rate.monthlyRate * 100).toFixed(2)}% a.m.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        </main>

        <footer className={`sticky bottom-0 bg-white/80 dark:bg-black/80 backdrop-blur-md p-4 border-t border-primary/10 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]`}>
          <button 
            onClick={handleSimulate} 
            disabled={hasInvalidContract || isFormIncomplete || isSimulating} 
            className={`w-full font-black uppercase tracking-wider py-4 rounded-2xl flex items-center justify-center gap-2 transition-all relative overflow-hidden group shadow-xl ${
              hasInvalidContract || isFormIncomplete || isSimulating 
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                : 'bg-primary text-white hover:bg-primary-dark hover:scale-[1.01] active:scale-[0.98]'
            }`}
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            {isSimulating ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <span className="relative z-10 text-base">Analisar {contracts.length > 1 ? `${contracts.length} Contratos` : 'Melhores Opções'}</span>
                <TrendingUp className="w-5 h-5 relative z-10 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
              </>
            )}
          </button>
        </footer>
      </div>

      <AnimatePresence>
        {isAIModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Assistente IA</h3>
                <button onClick={() => setIsAIModalOpen(false)}><X /></button>
              </div>
              <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} className="w-full h-40 bg-slate-50 dark:bg-slate-800 border rounded-2xl p-4 mb-4 outline-none" placeholder="Cole o texto aqui..." />
              <button onClick={handleAIParsing} disabled={isAILoading} className="w-full bg-primary text-white font-bold py-4 rounded-2xl">
                {isAILoading ? 'Processando...' : 'Preencher'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConsultaCPFModal
        isOpen={isConsultaModalOpen}
        onClose={() => setIsConsultaModalOpen(false)}
        data={consultaData}
        addedContractsIds={addedContractsIds}
        onToggleContract={handleToggleContractFromConsulta}
      />

      {!isEmbedded && (
        <div className="hidden md:flex flex-1 items-center justify-center bg-slate-50 dark:bg-black p-8">
          <div className="max-w-md text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <TrendingUp className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Pronto para simular?</h3>
            <p className="text-slate-500">Preencha os dados ao lado.</p>
          </div>
        </div>
      )}
    </div>
  );
}
