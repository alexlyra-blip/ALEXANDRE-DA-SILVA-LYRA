'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, HelpCircle, User, FileText, ChevronDown, TrendingUp } from 'lucide-react';
import { QuotaAlert } from '@/components/QuotaAlert';
import { useState } from 'react';

import BottomNav from '@/components/BottomNav';

export default function NovaSimulacao() {
  const router = useRouter();
  const [idade, setIdade] = useState('');
  const [convenio, setConvenio] = useState<'INSS' | 'SIAPE'>('INSS');
  const [codigoBeneficio, setCodigoBeneficio] = useState('');

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
    ]
  };

  const handleConvenioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConvenio(e.target.value as 'INSS' | 'SIAPE');
    setCodigoBeneficio('');
    if (e.target.value === 'SIAPE') {
      setDataConcessao('');
    }
  };
  const [dataConcessao, setDataConcessao] = useState('');
  const [bancoAtual, setBancoAtual] = useState('');
  const [valorParcela, setValorParcela] = useState('');
  const [saldoDevedor, setSaldoDevedor] = useState('');
  const [prazoTotal, setPrazoTotal] = useState('');
  const [parcelasRestantes, setParcelasRestantes] = useState('');
  const [isAnalfabeto, setIsAnalfabeto] = useState(false);

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

  const handleSimulate = () => {
    if (isInvalidCalculation) {
      alert("Cálculo inválido: O valor total das parcelas restantes não pode ser menor ou igual ao saldo devedor.");
      return;
    }

    const simulationData = {
      id: crypto.randomUUID(),
      convenio,
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
      taxaJurosMensal: interestRate?.monthlyRate || 0,
      taxaJurosAnual: interestRate?.annualRate || 0,
      timestamp: Date.now()
    };
    sessionStorage.setItem('simulationData', JSON.stringify(simulationData));
    router.push('/simulacao/recomendacoes');
  };

  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-background-light dark:bg-background-dark/80 backdrop-blur-md border-b border-primary/10">
        <div className="flex items-center p-4 justify-between w-full">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center justify-center size-10 rounded-full hover:bg-primary/10 transition-colors text-slate-900 dark:text-slate-100">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h2 className="text-xl font-bold leading-tight tracking-tight">Nova Simulação</h2>
          </div>
          <button className="flex items-center justify-center size-10 rounded-full hover:bg-primary/10 transition-colors text-slate-900 dark:text-slate-100">
            <HelpCircle className="w-6 h-6" />
          </button>
        </div>
      </header>

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
              <div className="bg-slate-100 dark:bg-slate-900/50 p-1 rounded-2xl flex gap-1 h-14">
                <button
                  type="button"
                  onClick={() => handleConvenioChange({ target: { value: 'INSS' } } as any)}
                  className={`flex-1 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    convenio === 'INSS'
                      ? 'bg-white dark:bg-slate-800 text-primary shadow-sm'
                      : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  INSS
                </button>
                <button
                  type="button"
                  onClick={() => handleConvenioChange({ target: { value: 'SIAPE' } } as any)}
                  className={`flex-1 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    convenio === 'SIAPE'
                      ? 'bg-white dark:bg-slate-800 text-primary shadow-sm'
                      : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  SIAPE
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Idade do Cliente</label>
              <div className="relative group">
                <input
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 p-4 text-base font-medium transition-all"
                  placeholder="Ex: 65"
                  type="number"
                  value={idade}
                  onChange={(e) => setIdade(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Código do Benefício</label>
              <div className="relative">
                <select 
                  value={codigoBeneficio}
                  onChange={(e) => setCodigoBeneficio(e.target.value)}
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 p-4 text-base font-medium appearance-none transition-all"
                >
                  <option disabled value="">Selecione o benefício</option>
                  {beneficios[convenio].map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-5 h-5" />
              </div>
            </div>
            {convenio === 'INSS' && (
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
            <div className="flex items-center gap-3 mt-4">
              <input
                type="checkbox"
                id="isAnalfabeto"
                checked={isAnalfabeto}
                onChange={(e) => setIsAnalfabeto(e.target.checked)}
                className="w-5 h-5 rounded border-primary/20 text-primary focus:ring-primary/20"
              />
              <label htmlFor="isAnalfabeto" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Cliente é analfabeto?
              </label>
            </div>
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
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 p-4 text-base font-medium appearance-none transition-all"
                >
                  <option disabled value="">Selecione uma instituição financeira</option>
                  <option value="121 - AGIBANK">121 - AGIBANK</option>
                  <option value="250 - BCV">250 - BCV</option>
                  <option value="025 - BANCO ALFA">025 - BANCO ALFA</option>
                  <option value="233 - BANCO CIFRA">233 - BANCO CIFRA</option>
                  <option value="001 - BANCO DO BRASIL">001 - BANCO DO BRASIL</option>
                  <option value="047 - BANCO DO ESTADO DO SERGIPE">047 - BANCO DO ESTADO DO SERGIPE</option>
                  <option value="079 - BANCO ORIGINAL">079 - BANCO ORIGINAL</option>
                  <option value="643 - BANCO PINE">643 - BANCO PINE</option>
                  <option value="081 - BANCO SEGURO">081 - BANCO SEGURO</option>
                  <option value="041 - BANRISUL">041 - BANRISUL</option>
                  <option value="268 - BARIGUI">268 - BARIGUI</option>
                  <option value="318 - BMG">318 - BMG</option>
                  <option value="237 - BRADESCO S.A.">237 - BRADESCO S.A.</option>
                  <option value="070 - BRB">070 - BRB</option>
                  <option value="626 - C6">626 - C6</option>
                  <option value="320 - CCB BRASIL">320 - CCB BRASIL</option>
                  <option value="104 - CAIXA">104 - CAIXA</option>
                  <option value="069 - CREFISA">069 - CREFISA</option>
                  <option value="707 - DAYCOVAL">707 - DAYCOVAL</option>
                  <option value="335 - DIGIO">335 - DIGIO</option>
                  <option value="149 - FACTA">149 - FACTA</option>
                  <option value="012 - INBURSA">012 - INBURSA</option>
                  <option value="029 - ITAÚ CONSIGNADO">029 - ITAÚ CONSIGNADO</option>
                  <option value="184 - ITAÚ BBA">184 - ITAÚ BBA</option>
                  <option value="341 - ITAÚ UNIBANCO">341 - ITAÚ UNIBANCO</option>
                  <option value="389 - MERCANTIL">389 - MERCANTIL</option>
                  <option value="386 - NU FINANCEIRA S.A.">386 - NU FINANCEIRA S.A.</option>
                  <option value="753 - NBC">753 - NBC</option>
                  <option value="169 - OLÉ">169 - OLÉ</option>
                  <option value="290 - PAGBANK">290 - PAGBANK</option>
                  <option value="623 - PAN">623 - PAN</option>
                  <option value="254 - PARANÁ BANCO">254 - PARANÁ BANCO</option>
                  <option value="752 - PARIBAS">752 - PARIBAS</option>
                  <option value="326 - PARATI">326 - PARATI</option>
                  <option value="611 - PAULISTA">611 - PAULISTA</option>
                  <option value="380 - PICPAY">380 - PICPAY</option>
                  <option value="329 - QI SOCIEDADE">329 - QI SOCIEDADE</option>
                  <option value="966 - SABEMI">966 - SABEMI</option>
                  <option value="422 - SAFRA">422 - SAFRA</option>
                  <option value="033 - SANTANDER">033 - SANTANDER</option>
                  <option value="359 - ZEMA">359 - ZEMA</option>
                  <option value="OUTROS">OUTROS</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-5 h-5" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Valor da Parcela</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                <input
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 pl-12 pr-4 text-base font-medium transition-all"
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
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 p-4 text-base font-medium transition-all"
                  placeholder="Ex: 84"
                  type="number"
                  value={prazoTotal}
                  onChange={(e) => setPrazoTotal(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Parcelas Restantes</label>
                <input
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 p-4 text-base font-medium transition-all"
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
                  className="flex w-full rounded-xl border border-primary/20 bg-white dark:bg-slate-800/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 placeholder:text-slate-400 dark:placeholder:text-slate-600 pl-12 pr-4 text-base font-medium transition-all"
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
      <footer className="sticky bottom-[72px] bg-background-light dark:bg-background-dark/95 backdrop-blur-sm p-4 border-t border-primary/10 z-40">
        <div className="w-full">
          <button 
            onClick={handleSimulate}
            disabled={isInvalidCalculation}
            className={`w-full font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${isInvalidCalculation ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' : 'bg-primary hover:bg-primary/90 text-white shadow-primary/30'}`}
          >
            <span>Analisar Melhores Opções</span>
            <TrendingUp className="w-5 h-5" />
          </button>
          <p className="text-center text-xs text-slate-500 mt-3 font-medium">
            Seus dados estão protegidos com criptografia de ponta a ponta
          </p>
        </div>
      </footer>

      <BottomNav activeTab="nova" />
    </div>
  );
}
