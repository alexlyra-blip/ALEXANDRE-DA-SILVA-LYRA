'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, HelpCircle, User, FileText, ChevronDown, TrendingUp, Sparkles, X, Loader2 } from 'lucide-react';
import { QuotaAlert } from '@/components/QuotaAlert';
import { useState, useEffect } from 'react';
import TransitionAnimation from '@/components/TransitionAnimation';
import { useRules } from '@/contexts/RuleContext';
import { useAuth } from '@/contexts/AuthContext';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { safeStringify } from '@/lib/utils';

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });

export default function NovaSimulacao({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const { profile } = useAuth();
  const router = useRouter();
  const [idade, setIdade] = useState('');
  const [convenio, setConvenio] = useState<'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS'>('INSS');
  const [subConvenio, setSubConvenio] = useState('');
  const [codigoBeneficio, setCodigoBeneficio] = useState('');
  
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
      { value: "04", label: "04 - Aposentadoria por invalidez do trabalhador rural" },
      { value: "06", label: "06 - Aposentadoria por idade do trabalhador rural" },
      { value: "07", label: "07 - Aposentadoria por idade do empregador rural" },
      { value: "08", label: "08 - Aposentadoria por tempo de serviço do trabalhador rural" },
      { value: "21", label: "21 - Pensão por morte previdenciária" },
      { value: "32", label: "32 - Aposentadoria por invalidez previdenciária" },
      { value: "41", label: "41 - Aposentadoria por idade" },
      { value: "42", label: "42 - Aposentadoria por tempo de contribuição previdenciária" },
      { value: "46", label: "46 - Aposentadoria por tempo de contribuição especial" },
      { value: "57", label: "57 - Aposentadoria por tempo de contribuição de professor" },
      { value: "87", label: "87 - Amparo social à pessoa com deficiência (BPC/LOAS)" },
      { value: "88", label: "88 - Amparo social ao idoso (BPC/LOAS)" },
      { value: "92", label: "92 - Aposentadoria por invalidez por acidente do trabalho" },
      { value: "93", label: "93 - Pensão por morte por acidente do trabalho" },
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
    ]
  };

  const handleConvenioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConvenio(e.target.value as 'INSS' | 'SIAPE' | 'GOVERNO' | 'FORÇAS ARMADAS');
    setCodigoBeneficio('');
    setSubConvenio('');
    if (e.target.value === 'SIAPE' || e.target.value === 'GOVERNO' || e.target.value === 'FORÇAS ARMADAS') {
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

  const showDataConcessao = convenio === 'INSS' && ['04', '32', '92'].includes(codigoBeneficio) && (parseInt(idade) < 60 || isNaN(parseInt(idade)));
  const show60Mais = parseInt(idade) >= 60;

  const handleIdadeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length <= 2) {
      setIdade(val);
    }
  };

  const formatCurrency = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    if (!numericValue) return '';
    const numberValue = parseInt(numericValue, 10) / 100;
    return numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    if (pmt * n <= pv) return null; // Invalid: total paid is less than or equal to debt

    let low = 0.0;
    let high = 1.0; // 100% per month is a safe upper bound
    let mid = 0;
    const epsilon = 1e-6;

    for (let i = 0; i < 100; i++) {
      mid = (low + high) / 2;
      // PV = PMT * (1 - (1 + r)^-n) / r
      const estimatedPV = pmt * (1 - Math.pow(1 + mid, -n)) / mid;

      if (Math.abs(estimatedPV - pv) < epsilon) {
        break;
      }

      if (estimatedPV > pv) {
        low = mid;
      } else {
        high = mid;
      }
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
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extraia os dados de simulação de portabilidade do seguinte texto: "${aiInput}". 
        Retorne um JSON com os campos: idade (número), convenio (uma das opções: INSS, SIAPE, GOVERNO, FORÇAS ARMADAS), codigoBeneficio (string), bancoAtual (string), valorParcela (número), prazoTotal (número), parcelasRestantes (número), saldoDevedor (número).
        Se não encontrar um campo, deixe nulo.`,
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

      const data = JSON.parse(response.text);
      
      if (data.idade) setIdade(data.idade.toString());
      if (data.convenio) {
        const conv = data.convenio.toUpperCase();
        if (['INSS', 'SIAPE', 'GOVERNO', 'FORÇAS ARMADAS'].includes(conv)) {
          setConvenio(conv as any);
        }
      }
      if (data.codigoBeneficio) setCodigoBeneficio(data.codigoBeneficio);
      if (data.bancoAtual) {
        // Tentar encontrar o banco na lista
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
      alert("Não foi possível processar o texto. Tente novamente ou preencha manualmente.");
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSimulate = () => {
    if (isInvalidCalculation) {
      alert("Cálculo inválido: O valor total das parcelas restantes não pode ser menor ou igual ao saldo devedor.");
      return;
    }

    const valorParcelaParsed = parseCurrency(valorParcela);
    if (profile?.limiteCredito && valorParcelaParsed > profile.limiteCredito) {
      alert(`Valor da parcela (${formatCurrency(valorParcela)}) excede o limite de crédito permitido (${formatCurrency(profile.limiteCredito.toString())}).`);
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
      <div className={`flex flex-col w-full ${isEmbedded ? '' : 'md:w-[450px]'} shrink-0 border-r border-slate-200 dark:border-slate-800 bg-background text-foreground font-display relative`}>
        {isSimulating && <TransitionAnimation onComplete={onAnimationComplete} availableBanks={banks} />}
        {/* Top Navigation Bar */}
      {!isEmbedded && (
        <header className="sticky top-0 z-50 bg-white dark:bg-black/80 backdrop-blur-md border-b border-primary/10">
          <div className="flex items-center p-4 justify-between w-full">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center justify-center size-10 rounded-full hover:bg-primary/10 transition-colors text-slate-900 dark:text-slate-100">
                <ArrowLeft className="w-6 h-6" />
              </Link>
              <h2 className="text-xl font-bold leading-tight tracking-tight">Nova Simulação</h2>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsAIModalOpen(true)}
                className="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title="Assistente IA"
              >
                <Sparkles className="w-5 h-5" />
              </button>
              <button className="flex items-center justify-center size-10 rounded-full hover:bg-primary/10 transition-colors text-slate-900 dark:text-slate-100">
                <HelpCircle className="w-6 h-6" />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 w-full px-4 py-6">
        <QuotaAlert />
        {/* Customer Info Section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <User className="text-primary w-6 h-6" />
            <h3 className="text-lg font-bold leading-tight tracking-tight">Informações do Cliente</h3>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Convênio</label>
              <div className="bg-slate-100 dark:bg-slate-900/50 p-1 rounded-2xl flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => handleConvenioChange({ target: { value: 'INSS' } } as any)}
                  className={`flex-1 px-2 h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center whitespace-nowrap ${
                    convenio === 'INSS'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  INSS
                </button>
                <button
                  type="button"
                  onClick={() => handleConvenioChange({ target: { value: 'SIAPE' } } as any)}
                  className={`flex-1 px-2 h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center whitespace-nowrap ${
                    convenio === 'SIAPE'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  SIAPE
                </button>
                <button
                  type="button"
                  onClick={() => handleConvenioChange({ target: { value: 'GOVERNO' } } as any)}
                  className={`flex-1 px-2 h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center whitespace-nowrap ${
                    convenio === 'GOVERNO'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  GOVERNO
                </button>
                <button
                  type="button"
                  onClick={() => handleConvenioChange({ target: { value: 'FORÇAS ARMADAS' } } as any)}
                  className={`flex-1 px-2 h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center whitespace-nowrap ${
                    convenio === 'FORÇAS ARMADAS'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  FORÇAS ARMADAS
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Idade do Cliente</label>
              <div className="relative group">
                <input
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-input text-slate-900 dark:text-black focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 p-4 text-base font-medium transition-all"
                  placeholder="Ex: 65"
                  type="number"
                  value={idade}
                  onChange={handleIdadeChange}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">
                {convenio === 'INSS' ? 'Código do Benefício' : 'Sub-convênio'}
              </label>
              <div className="relative">
                <select 
                  value={codigoBeneficio}
                  onChange={(e) => {
                    setCodigoBeneficio(e.target.value);
                    if (convenio !== 'INSS') {
                      const selected = beneficios[convenio].find(b => b.value === e.target.value);
                      setSubConvenio(selected ? (selected.label.includes(' - ') ? selected.label.split(' - ')[1] : selected.label) : '');
                    }
                    if (!['04', '32', '92'].includes(e.target.value)) {
                      setDataConcessao('');
                    }
                  }}
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-input text-slate-900 dark:text-black focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 p-4 text-base font-medium appearance-none transition-all"
                >
                  <option disabled value="">Selecione...</option>
                  {beneficios[convenio].map((b) => (
                    <option key={b.value} value={b.value} className="text-slate-900 dark:text-black">{b.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-5 h-5" />
              </div>
            </div>
            {(convenio === 'INSS') && (
              <>
                {showDataConcessao && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Data de Concessão do Benefício</label>
                    <div className="relative group">
                      <input
                        className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 p-4 text-base font-medium transition-all"
                        type="date"
                        value={dataConcessao}
                        onChange={(e) => setDataConcessao(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex items-center justify-between mt-4">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Cliente é analfabeto?</label>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl">
                <button type="button" onClick={() => setIsAnalfabeto(true)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isAnalfabeto === true ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>SIM</button>
                <button type="button" onClick={() => setIsAnalfabeto(false)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isAnalfabeto === false ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>NÃO</button>
              </div>
            </div>
            {show60Mais && (
              <div className="flex items-center justify-between mt-4">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Cliente 60+?</label>
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl">
                  <button type="button" onClick={() => setIsCliente60Mais(true)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isCliente60Mais === true ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>SIM</button>
                  <button type="button" onClick={() => setIsCliente60Mais(false)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isCliente60Mais === false ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>NÃO</button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Divider */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-8"></div>

        {/* Contract Details Section */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="text-primary w-6 h-6" />
            <h3 className="text-lg font-bold leading-tight tracking-tight">Detalhes do Contrato</h3>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Banco Atual</label>
              <div className="relative">
                <select 
                  value={bancoAtual}
                  onChange={(e) => setBancoAtual(e.target.value)}
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-input text-slate-900 dark:text-black focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 p-4 text-base font-medium appearance-none transition-all"
                >
                  <option disabled value="">Selecione uma instituição financeira</option>
                  {allBanks.map(banco => (
                    <option key={banco} value={banco} className="text-slate-900 dark:text-black">{banco}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-5 h-5" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Valor da Parcela</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                <input
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-input text-slate-900 dark:text-black focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 pl-12 pr-4 text-base font-medium transition-all"
                  placeholder="0,00"
                  type="text"
                  value={valorParcela}
                  onChange={handleValorParcelaChange}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Prazo Total</label>
                <input
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-input text-slate-900 dark:text-black focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 p-4 text-base font-medium transition-all"
                  placeholder="Ex: 84"
                  type="number"
                  value={prazoTotal}
                  onChange={(e) => setPrazoTotal(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Parcelas Restantes</label>
                <input
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-input text-slate-900 dark:text-black focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 p-4 text-base font-medium transition-all"
                  placeholder="0"
                  type="number"
                  value={parcelasRestantes}
                  onChange={(e) => setParcelasRestantes(e.target.value)}
                />
              </div>
            </div>
            
            {prazoTotal && parcelasRestantes && (
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Parcelas Pagas (Calculado):</span>
                <span className="text-sm font-bold text-primary">{parcelasPagas > 0 ? parcelasPagas : 0}</span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Saldo Devedor</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                <input
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-input text-slate-900 dark:text-black focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 pl-12 pr-4 text-base font-medium transition-all"
                  placeholder="0.000,00"
                  type="text"
                  value={saldoDevedor}
                  onChange={handleSaldoDevedorChange}
                />
              </div>
            </div>

            {isInvalidCalculation && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 flex items-center justify-between mt-2">
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  Cálculo inválido: O valor total das parcelas restantes (R$ {formatCurrency((parseCurrency(valorParcela) * parseInt(parcelasRestantes)).toString())}) não pode ser menor ou igual ao saldo devedor.
                </span>
              </div>
            )}

            {interestRate && !isInvalidCalculation && (
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4 flex flex-col gap-2 mt-2">
                <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Taxa de Juros do Contrato Atual</h4>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-500">Taxa Mensal:</span>
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{(interestRate.monthlyRate * 100).toFixed(2)}% a.m.</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-500">Taxa Anual Equivalente:</span>
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{(interestRate.annualRate * 100).toFixed(2)}% a.a.</span>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Sticky Footer Action */}
      <footer className={`sticky ${isEmbedded ? 'bottom-0' : 'bottom-[72px]'} bg-background-light dark:bg-background-dark/95 backdrop-blur-sm p-4 border-t border-primary/10 z-40`}>
        <div className="w-full">
          <button 
            onClick={handleSimulate}
            disabled={isInvalidCalculation}
            className={`w-full font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${isInvalidCalculation ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' : 'bg-primary hover:bg-primary/90 text-white shadow-primary/30'}`}
          >
            <span>Analisar Melhores Opções</span>
            <TrendingUp className="w-5 h-5" />
          </button>
          {!isEmbedded && (
            <p className="text-center text-xs text-slate-500 mt-3 font-medium">
              Seus dados estão protegidos com criptografia de ponta a ponta
            </p>
          )}
        </div>
      </footer>

      </div>
      
      {/* AI Assistant Modal */}
      <AnimatePresence>
        {isAIModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Assistente IA</h3>
                    <p className="text-xs text-slate-500">Cole o texto da simulação abaixo</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAIModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="relative">
                  <textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Ex: Cliente João, 65 anos, INSS, parcela de 450,00, saldo de 12.000,00..."
                    className="w-full h-40 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary outline-none resize-none transition-all"
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 font-medium">
                    {aiInput.length} caracteres
                  </div>
                </div>
                
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Dica: Você pode copiar a mensagem inteira do WhatsApp e colar aqui. Nossa IA identificará os valores automaticamente.
                </p>
                
                <button
                  onClick={handleAIParsing}
                  disabled={isAILoading || !aiInput.trim()}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  {isAILoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Processando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Preencher Automaticamente</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {!isEmbedded && (
        <div className="hidden md:flex flex-1 items-center justify-center bg-slate-50 dark:bg-black">
          <div className="flex flex-col items-center text-center max-w-md p-8">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
              <TrendingUp className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Pronto para simular?</h3>
            <p className="text-slate-500 dark:text-slate-300">
              Preencha os dados do cliente ao lado e clique em &quot;Analisar Melhores Opções&quot; para ver as recomendações de portabilidade.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
