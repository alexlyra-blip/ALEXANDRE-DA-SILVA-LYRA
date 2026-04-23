'use client';

import { useRouter } from 'next/navigation';
import { HelpCircle, User, FileText, ChevronDown, TrendingUp, Sparkles, X, Loader2, Search, Check, Landmark } from 'lucide-react';
import { QuotaAlert } from '@/components/QuotaAlert';
import { useState, useRef, useEffect } from 'react';
import TransitionAnimation from '@/components/TransitionAnimation';
import { useRules } from '@/contexts/RuleContext';
import { useAuth } from '@/contexts/AuthContext';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { motion, AnimatePresence } from 'motion/react';
import { safeStringify } from '@/lib/utils';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const getAI = () => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  return new GoogleGenerativeAI(apiKey);
};

export default function SimulationForm({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const { profile } = useAuth();
  const { banks: rulesBanks } = useRules();
  const router = useRouter();
  const [idade, setIdade] = useState('');
  const [convenio, setConvenio] = useState<'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS' | 'CLT PRIVADO'>('INSS');
  const [subConvenio, setSubConvenio] = useState('');
  const [codigoBeneficio, setCodigoBeneficio] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTermBank, setSearchTermBank] = useState('');
  const [isDropdownOpenBank, setIsDropdownOpenBank] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [activeIndexBank, setActiveIndexBank] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownBankRef = useRef<HTMLDivElement>(null);
  
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

  const beneficios = {
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

  const filteredBeneficios = beneficios[convenio].filter(b => 
    b.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBanks = allBanks.filter(b => b.toLowerCase().includes(searchTermBank.toLowerCase()));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < filteredBeneficios.length - 1 ? prev + 1 : prev));
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
      if (activeIndexBank >= 0 && activeIndexBank < filteredBanks.length) {
        const b = filteredBanks[activeIndexBank];
        setBancoAtual(b);
        setIsDropdownOpenBank(false);
        setSearchTermBank('');
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpenBank(false);
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
  const [bancoAtual, setBancoAtual] = useState('');
  const [valorParcela, setValorParcela] = useState('');
  const [saldoDevedor, setSaldoDevedor] = useState('');
  const [prazoTotal, setPrazoTotal] = useState('');
  const [parcelasRestantes, setParcelasRestantes] = useState('');
  const [isAnalfabeto, setIsAnalfabeto] = useState<boolean | null>(null);
  const [isCliente60Mais, setIsCliente60Mais] = useState<boolean | null>(null);

  const effectiveIs60MaisForUI = isCliente60Mais !== null ? isCliente60Mais : (parseInt(idade) >= 60);
  const isInvalidityBenefit = ['04', '05', '11', '30', '32', '33', '34', '92'].includes(codigoBeneficio);
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

  const handleValorParcelaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValorParcela(formatCurrency(e.target.value));
  };

  const handleSaldoDevedorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaldoDevedor(formatCurrency(e.target.value));
  };

  const parcelasPagas = (parseInt(prazoTotal) || 0) - (parseInt(parcelasRestantes) || 0);

  const calculateInterestRate = () => {
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

  const interestRate = calculateInterestRate();
  const isInvalidCalculation = parseCurrency(valorParcela) > 0 && parseInt(parcelasRestantes) > 0 && parseCurrency(saldoDevedor) > 0 && parseCurrency(valorParcela) * parseInt(parcelasRestantes) <= parseCurrency(saldoDevedor);

  const [isSimulating, setIsSimulating] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);

  const handleAIParsing = async () => {
    if (!aiInput.trim()) return;
    setIsAILoading(true);
    try {
      const ai = getAI();
      const model = ai.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              idade: { type: SchemaType.NUMBER },
              convenio: { type: SchemaType.STRING },
              codigoBeneficio: { type: SchemaType.STRING },
              bancoAtual: { type: SchemaType.STRING },
              valorParcela: { type: SchemaType.NUMBER },
              prazoTotal: { type: SchemaType.NUMBER },
              parcelasRestantes: { type: SchemaType.NUMBER },
              saldoDevedor: { type: SchemaType.NUMBER },
            }
          }
        }
      });
      const response = await model.generateContent(`Extraia os dados de simulação de portabilidade do seguinte texto: "${aiInput}".`);
      const data = JSON.parse(response.response.text());
      if (data.idade) setIdade(data.idade.toString());
      if (data.convenio) {
        const conv = data.convenio.toUpperCase();
        if (['INSS', 'SIAPE', 'GOVERNO', 'FORÇAS ARMADAS', 'CLT PRIVADO'].includes(conv)) setConvenio(conv as any);
      }
      if (data.codigoBeneficio) setCodigoBeneficio(data.codigoBeneficio);
      if (data.bancoAtual) {
        const foundBank = allBanks.find(b => b.toLowerCase().includes(data.bancoAtual.toLowerCase()));
        if (foundBank) setBancoAtual(foundBank);
      }
      if (data.valorParcela) setValorParcela(formatCurrency((data.valorParcela * 100).toString()));
      if (data.prazoTotal) setPrazoTotal(data.prazoTotal.toString());
      if (data.parcelasRestantes) setParcelasRestantes(data.parcelasRestantes.toString());
      if (data.saldoDevedor) setSaldoDevedor(formatCurrency((data.saldoDevedor * 100).toString()));
      setIsAIModalOpen(false);
      setAiInput('');
    } catch (error) {
      console.error("Erro ao processar com IA:", error);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSimulate = () => {
    if (isInvalidCalculation) return;

    if (parseInt(idade) >= 60 && isCliente60Mais === null) {
      alert("Por favor, informe se o cliente é 60+.");
      return;
    }

    const valorParcelaParsed = parseCurrency(valorParcela);
    if (profile?.limiteCredito && valorParcelaParsed > profile.limiteCredito) {
      alert(`Valor da parcela excede o limite de crédito.`);
      return;
    }
    setIsSimulating(true);
  };

  const onAnimationComplete = () => {
    const simulationData = {
      id: crypto.randomUUID(),
      convenio,
      subConvenio,
      idade: parseInt(idade) || 0,
      codigoBeneficio,
      dataConcessao,
      bancoAtual,
      valorParcela: parseCurrency(valorParcela),
      prazoTotal: parseInt(prazoTotal) || 0,
      parcelasRestantes: parseInt(parcelasRestantes) || 0,
      saldoDevedor: parseCurrency(saldoDevedor),
      parcelasPagas,
      isAnalfabeto,
      isCliente60Mais,
      taxaJurosMensal: interestRate?.monthlyRate || 0,
      taxaJurosAnual: interestRate?.annualRate || 0,
      timestamp: Date.now()
    };
    sessionStorage.setItem('simulationData', safeStringify(simulationData));
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
                          className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-20 max-h-64 overflow-y-auto overflow-x-hidden"
                        >
                          <div className="p-2 space-y-1" ref={dropdownRef}>
                            {filteredBeneficios
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
            <div className="flex items-center gap-2 mb-4">
              <FileText className="text-primary w-6 h-6" />
              <h3 className="text-lg font-bold">Detalhes do Contrato</h3>
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
                      value={isDropdownOpenBank ? searchTermBank : bancoAtual}
                      onFocus={() => {
                        setIsDropdownOpenBank(true);
                        setSearchTermBank('');
                      }}
                      onChange={(e) => setSearchTermBank(e.target.value)}
                      onKeyDown={handleKeyDownBank}
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
                    <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 transition-transform duration-200 ${isDropdownOpenBank ? 'rotate-180' : ''}`} />
                  </div>

                  <AnimatePresence>
                    {isDropdownOpenBank && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setIsDropdownOpenBank(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-20 max-h-64 overflow-y-auto overflow-x-hidden"
                        >
                          <div className="p-2 space-y-1" ref={dropdownBankRef}>
                            {filteredBanks
                              .map((b, index) => (
                                <button
                                  key={b}
                                  type="button"
                                  onClick={() => {
                                    setBancoAtual(b);
                                    setIsDropdownOpenBank(false);
                                    setSearchTermBank('');
                                  }}
                                  onMouseEnter={() => setActiveIndexBank(index)}
                                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left text-base font-medium transition-colors ${
                                    bancoAtual === b || activeIndexBank === index
                                      ? 'bg-primary/10 text-primary font-bold' 
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 truncate">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bancoAtual === b || activeIndexBank === index ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                                      <Landmark className="w-4 h-4" />
                                    </div>
                                    <span className="truncate pr-4">{b}</span>
                                  </div>
                                  {bancoAtual === b && <Check className="w-4 h-4 shrink-0" />}
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
                  <input className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 pl-12 pr-4 text-base font-medium" type="text" value={valorParcela} onChange={handleValorParcelaChange} placeholder="0,00" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-white">Prazo Total</label>
                  <input className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 p-4 text-base font-medium" type="number" value={prazoTotal} onChange={(e) => setPrazoTotal(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-white">Parcelas Restantes</label>
                  <input className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 p-4 text-base font-medium" type="number" value={parcelasRestantes} onChange={(e) => setParcelasRestantes(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-white">Saldo Devedor</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                  <input className="w-full rounded-xl border border-primary/20 bg-white dark:bg-white h-14 pl-12 pr-4 text-base font-medium" type="text" value={saldoDevedor} onChange={handleSaldoDevedorChange} placeholder="0.000,00" />
                </div>
              </div>

              {interestRate && !isInvalidCalculation && (
                <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 rounded-xl p-4 flex flex-col gap-2">
                  <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Taxa Atual</h4>
                  <div className="flex justify-between">
                    <span className="text-xs text-emerald-600">Mensal:</span>
                    <span className="text-sm font-bold">{(interestRate.monthlyRate * 100).toFixed(2)}% a.m.</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>

        <footer className={`sticky bottom-0 bg-white dark:bg-black/95 p-4 border-t border-primary/10`}>
          <button onClick={handleSimulate} disabled={isInvalidCalculation} className={`w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all ${isInvalidCalculation ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-primary text-white'}`}>
            <span>Analisar Melhores Opções</span>
            <TrendingUp className="w-5 h-5" />
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
