'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Banknote, FileText, CheckCircle2, Calendar, Building2, MessageCircle } from 'lucide-react';
import { useRules } from '@/contexts/RuleContext';

export default function SimulacaoDetalhes() {
  const params = useParams();
  const router = useRouter();
  const { banks, generalRules, isLoaded } = useRules();
  const [offerDetails, setOfferDetails] = useState<any>(null);
  const [otherTables, setOtherTables] = useState<any[]>([]);
  const [simData, setSimData] = useState<any>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const storedData = sessionStorage.getItem('simulationData');
    if (!storedData) {
      router.push('/simulacao/nova');
      return;
    }

    const parsedData = JSON.parse(storedData);
    setSimData(parsedData);

    const idParam = params.id as string;
    if (!idParam) return;

    // The ID is in the format "bankId-tabelaNome"
    const lastDashIndex = idParam.lastIndexOf('-');
    if (lastDashIndex === -1) return;

    const bankId = idParam.substring(0, lastDashIndex);
    const tabelaNome = idParam.substring(lastDashIndex + 1);

    const rawBank = banks.find(b => b.id === bankId);
    if (!rawBank) return;

    const bank = {
      ...rawBank,
      minAge: rawBank.minAge !== undefined ? rawBank.minAge : (rawBank.min_age !== undefined ? rawBank.min_age : 0),
      maxAge: rawBank.maxAge !== undefined ? rawBank.maxAge : (rawBank.max_age !== undefined ? rawBank.max_age : 0),
      minInstallmentValue: rawBank.minInstallmentValue !== undefined ? rawBank.minInstallmentValue : (rawBank.min_installment_value !== undefined ? rawBank.min_installment_value : 0),
      minBalance: rawBank.minBalance !== undefined ? rawBank.minBalance : (rawBank.min_balance !== undefined ? rawBank.min_balance : 0),
      minTroco: rawBank.minTroco !== undefined ? rawBank.minTroco : (rawBank.min_troco !== undefined ? rawBank.min_troco : 0),
      portabilityRate: rawBank.portabilityRate !== undefined ? rawBank.portabilityRate : (rawBank.portability_rate !== undefined ? rawBank.portability_rate : 0),
      refinRate: rawBank.refinRate !== undefined ? rawBank.refinRate : (rawBank.refin_rate !== undefined ? rawBank.refin_rate : 0),
      sumBalanceAndTroco: rawBank.sumBalanceAndTroco !== undefined ? rawBank.sumBalanceAndTroco : (rawBank.sum_balance_and_troco !== undefined ? rawBank.sum_balance_and_troco : (rawBank.sumSaldoTroco !== undefined ? rawBank.sumSaldoTroco : rawBank.sum_saldo_troco)),
      acceptsIlliterate: rawBank.acceptsIlliterate !== undefined ? rawBank.acceptsIlliterate : (rawBank.accepts_illiterate !== undefined ? rawBank.accepts_illiterate : false),
      acceptsLOAS: rawBank.acceptsLOAS !== undefined ? rawBank.acceptsLOAS : (rawBank.accepts_loas !== undefined ? rawBank.accepts_loas : false),
      accepts60Mais: rawBank.accepts60Mais !== undefined ? rawBank.accepts60Mais : (rawBank.accepts_60_mais !== undefined ? rawBank.accepts_60_mais : false),
      acceptsInvalidez: rawBank.acceptsInvalidez !== undefined ? rawBank.acceptsInvalidez : (rawBank.accepts_invalidez !== undefined ? rawBank.accepts_invalidez : true),
      invalidezAgeYears: rawBank.invalidezAgeYears !== undefined ? rawBank.invalidezAgeYears : (rawBank.invalidez_age_years !== undefined ? rawBank.invalidez_age_years : 0),
      invalidezMaxAgeYears: rawBank.invalidezMaxAgeYears !== undefined ? rawBank.invalidezMaxAgeYears : (rawBank.invalidez_max_age_years !== undefined ? rawBank.invalidez_max_age_years : 0),
      acceptsOver60Invalidez: rawBank.acceptsOver60Invalidez !== undefined ? rawBank.acceptsOver60Invalidez : (rawBank.accepts_over_60_invalidez !== undefined ? rawBank.accepts_over_60_invalidez : false),
      minBenefitTimeYears: rawBank.minBenefitTimeYears !== undefined ? rawBank.minBenefitTimeYears : (rawBank.min_benefit_time_years !== undefined ? rawBank.min_benefit_time_years : 0),
      minBenefitTimeMonths: rawBank.minBenefitTimeMonths !== undefined ? rawBank.minBenefitTimeMonths : (rawBank.min_benefit_time_months !== undefined ? rawBank.min_benefit_time_months : 0),
      taxaPortabilidadeOrigem: rawBank.taxaPortabilidadeOrigem !== undefined ? rawBank.taxaPortabilidadeOrigem : (rawBank.taxa_portabilidade_origem !== undefined ? rawBank.taxa_portabilidade_origem : 0),
      ajusteTaxa: rawBank.ajusteTaxa !== undefined ? rawBank.ajusteTaxa : (rawBank.ajuste_taxa !== undefined ? rawBank.ajuste_taxa : 0),
      novaTaxaReferencia: rawBank.novaTaxaReferencia !== undefined ? rawBank.novaTaxaReferencia : (rawBank.nova_taxa_referencia !== undefined ? rawBank.nova_taxa_referencia : 0),
      minPaidInstallments: rawBank.minPaidInstallments !== undefined ? rawBank.minPaidInstallments : (rawBank.min_paid_installments !== undefined ? rawBank.min_paid_installments : 0),
      isActive: rawBank.isActive !== undefined ? rawBank.isActive : (rawBank.is_active !== undefined ? rawBank.is_active : true),
      subConvenio: rawBank.subConvenio !== undefined ? rawBank.subConvenio : (rawBank.sub_convenio !== undefined ? rawBank.sub_convenio : ''),
      requireTrocoMaiorQue5PorcentoEndividamento: rawBank.requireTrocoMaiorQue5PorcentoEndividamento !== undefined ? rawBank.requireTrocoMaiorQue5PorcentoEndividamento : (rawBank.require_troco_maior_que_5_porcento_endividamento !== undefined ? rawBank.require_troco_maior_que_5_porcento_endividamento : false),
      excludedBenefits: rawBank.excludedBenefits !== undefined ? rawBank.excludedBenefits : (rawBank.excluded_benefits !== undefined ? rawBank.excluded_benefits : []),
      nonAcceptedBanks: rawBank.nonAcceptedBanks !== undefined ? rawBank.nonAcceptedBanks : (rawBank.non_accepted_banks !== undefined ? rawBank.non_accepted_banks : []),
      specificInstallmentRules: rawBank.specificInstallmentRules !== undefined ? rawBank.specificInstallmentRules : (rawBank.specific_installment_rules !== undefined ? rawBank.specific_installment_rules : []),
      logoUrl: rawBank.logoUrl !== undefined ? rawBank.logoUrl : (rawBank.logo_url !== undefined ? rawBank.logo_url : ''),
    };

    const bankConvenio = bank.convenio || 'INSS';
    const simConvenio = parsedData.convenio || 'INSS';
    if (bankConvenio !== simConvenio) return;

    // Calculate all valid tables for this bank
    const validTables: any[] = [];
    if (bank.tabelas) {
      bank.tabelas.forEach(t => {
        const coef = t.coeficiente;
        if (!coef || coef <= 0) return;

        const valorContrato = parsedData.valorParcela / coef;
        const valorTroco = valorContrato - parsedData.saldoDevedor;
        
        const minTroco = (t.useMinTicket !== false) ? (t.minTicket || bank.minTroco || 0) : 0;

        // Regra: Troco > 5% do Novo Endividamento
        if (bank.requireTrocoMaiorQue5PorcentoEndividamento) {
          const novoEndividamento = parsedData.parcelasRestantes * parsedData.valorParcela;
          const baseTroco = novoEndividamento * 0.05;
          if (valorTroco <= baseTroco) {
            return;
          }
        }

        // Weighted Rate Validation (Taxa Ponderada)
        const originalRate = parsedData.taxaJurosMensal ? parsedData.taxaJurosMensal * 100 : 0;
        const bankConvenio = (bank.convenio || 'INSS').trim().toUpperCase();
        const defaultRate = bankConvenio === 'SIAPE' ? 1.70 : (bankConvenio === 'INSS' ? 1.85 : 2.05);
        const convenioRate = originalRate > 0 ? originalRate : (bank.taxaPortabilidadeOrigem || defaultRate);
        const taxaTabelaValida = (t.taxaTabela !== undefined && t.taxaTabela !== null && t.taxaTabela > 0) ? t.taxaTabela : (bank.refinRate || 0);
        const taxaDiferencial = (t.taxaDiferencial !== undefined && t.taxaDiferencial !== null && t.taxaDiferencial > 0) ? t.taxaDiferencial : 0;
        
        const bankAdjustment = bank.ajusteTaxa || 0;
        
        // Dynamic calculation: client rate + bank adjustment
        const novaTaxaPortabilidade = Number((convenioRate + bankAdjustment).toFixed(2));

        // Correct Calculation: Average of (ConvenioRate + BankAdjustment) and (TaxaDiferencial), then add Adjustment
        // Wait, the requirement was (Original + NovaTaxaPort) / 2
        const portRate = novaTaxaPortabilidade; // This is what is used in simulation
        const taxaPonderada = ((convenioRate + novaTaxaPortabilidade) / 2) + (parseFloat(t.ajusteTaxaPonderada) || 0);

        // Regra: Taxa da tabela deve ser menor ou igual à taxa ponderada
        if (t.useTaxaPonderada !== false && taxaTabelaValida > 0 && taxaTabelaValida > taxaPonderada) {
          return;
        }

        // Basic validation
        if (valorTroco >= minTroco && valorTroco > 0) {
          validTables.push({
            tabela: t,
            valorContrato,
            valorTroco,
            novaTaxaPortabilidade,
            taxaPonderada,
            taxaBase: taxaTabelaValida,
            id: `${bank.id}-${t.nome}`
          });
        }
      });
    }

    const selectedTable = validTables.find(vt => vt.tabela.nome === tabelaNome);
    const others = validTables.filter(vt => vt.tabela.nome !== tabelaNome);

    if (selectedTable) {
      setOfferDetails({
        bank,
        ...selectedTable
      });
      setOtherTables(others);
    } else {
      // Fallback if the specific table isn't found but bank is
      const firstValid = validTables[0];
      if (firstValid) {
        setOfferDetails({
          bank,
          ...firstValid
        });
        setOtherTables(validTables.slice(1));
      }
    }

  }, [isLoaded, params.id, banks, router, generalRules]);

  const handleShareWhatsApp = () => {
    if (!offerDetails) return;
    
    const message = `*Simulação de Portabilidade*\n\n` +
      `*Banco:* ${offerDetails.bank.name}\n` +
      `*Tabela:* ${offerDetails.tabela.nome}\n` +
      `*Valor da Parcela:* ${formatCurrency(simData?.valorParcela || 0)}\n` +
      `*Valor do Contrato:* ${formatCurrency(offerDetails.valorContrato)}\n` +
      `*Valor do Troco:* ${formatCurrency(offerDetails.valorTroco)}\n` +
      `*Prazo:* ${offerDetails.tabela.prazoRefinPort || 96}x\n` +
      `*Taxa Port.:* ${offerDetails.novaTaxaPortabilidade.toFixed(2)}%\n\n` +
      `_Simulação realizada em: ${new Date().toLocaleDateString('pt-BR')}_`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  if (!isLoaded || !offerDetails || !simData) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="flex flex-col min-h-screen w-full md:max-w-none mx-auto max-w-md bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display pb-24 md:pb-0">
      {/* Header */}
      <div className="flex items-center bg-background-light dark:bg-background-dark p-4 pb-2 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
        <Link href="/simulacao/recomendacoes" className="text-slate-900 dark:text-slate-100 flex size-10 shrink-0 items-center justify-center cursor-pointer">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h2 className="text-slate-900 dark:text-slate-100 text-lg font-bold leading-tight tracking-tight flex-1 text-center pr-10">
          Detalhes da Oferta
        </h2>
      </div>

      <div className="p-4 space-y-6">
        {/* Bank Info */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 relative mb-4">
            <Image
              src={offerDetails.bank.logoUrl || 'https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?q=80&w=100&auto=format&fit=crop'}
              alt={`${offerDetails.bank.name} logo`}
              fill
              unoptimized
              className="object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{offerDetails.bank.name}</h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <FileText className="w-4 h-4" />
            <span>{offerDetails.tabela.nome}</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ${
              offerDetails.bank.convenio === 'SIAPE' 
                ? 'bg-[#f59e0b]' 
                : offerDetails.bank.convenio === 'GOVERNO'
                ? 'bg-[#FF0000]'
                : offerDetails.bank.convenio === 'FORÇAS ARMADAS'
                ? 'bg-[#47953D]'
                : 'bg-[#1152d4]'
            }`}>
              {offerDetails.bank.convenio || 'INSS'}
            </span>
            {simData?.subConvenio && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-500 text-white shadow-sm">
                {simData.subConvenio}
              </span>
            )}
          </div>
        </div>

        {/* Values */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Vl. do contrato</span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(offerDetails.valorContrato)}</span>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-4 border border-emerald-200 dark:border-emerald-500/20 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Melhor Troco</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(offerDetails.valorTroco)}</span>
          </div>
        </div>

        {/* Simulation Summary */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Resumo da Operação
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Banco Atual
              </span>
              <span className="font-medium text-slate-900 dark:text-white">{simData.bancoAtual}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Banknote className="w-4 h-4" /> Valor da Parcela
              </span>
              <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(simData.valorParcela)}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Banknote className="w-4 h-4" /> Saldo Devedor
              </span>
              <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(simData.saldoDevedor)}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Prazo Restante
              </span>
              <span className="font-medium text-slate-900 dark:text-white">{simData.parcelasRestantes} meses</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Parcelas Pagas
              </span>
              <span className="font-medium text-slate-900 dark:text-white">{simData.parcelasPagas} meses</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Nova Taxa Port.
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {offerDetails.novaTaxaPortabilidade.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Taxa do Refin
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {offerDetails.taxaBase.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Other Tables Section */}
        {otherTables.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              Outras Tabelas Disponíveis para o {offerDetails.bank.name}
            </h3>
            <div className="space-y-3">
              {otherTables.map((ot) => (
                <Link 
                  key={ot.id}
                  href={`/simulacao/detalhes/${ot.id}`}
                  className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 transition-all shadow-sm group"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-400 uppercase">{ot.tabela.nome}</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">Troco: {formatCurrency(ot.valorTroco)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-primary font-bold text-xs">
                    <span>Ver Detalhes</span>
                    <ArrowLeft className="w-4 h-4 rotate-180 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button 
            onClick={handleShareWhatsApp}
            className="flex-1 bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-md hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            <span>Enviar WhatsApp</span>
          </button>
          <button 
            onClick={() => router.push('/simulacao/recomendacoes')}
            className="flex-1 bg-primary text-white font-bold py-4 rounded-xl shadow-md hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Confirmar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
