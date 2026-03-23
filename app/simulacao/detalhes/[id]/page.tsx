'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Banknote, FileText, CheckCircle2, Calendar, User, Building2 } from 'lucide-react';
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

    const bank = banks.find(b => b.id === bankId);
    if (!bank) return;

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

        // Weighted Rate Validation (Taxa Ponderada)
        const originalRate = parsedData.taxaJurosMensal ? parsedData.taxaJurosMensal * 100 : 0;
        const convenioRate = originalRate > 0 ? originalRate : (bank.taxaPortabilidadeOrigem || 1.85);
        const taxaTabelaValida = (t.taxaTabela !== undefined && t.taxaTabela !== null && t.taxaTabela > 0) ? t.taxaTabela : (bank.refinRate || 0);
        const taxaDiferencial = (t.taxaDiferencial !== undefined && t.taxaDiferencial !== null && t.taxaDiferencial > 0) ? t.taxaDiferencial : taxaTabelaValida;
        const taxaPonderada = ((convenioRate + taxaDiferencial) / 2) + (t.ajusteTaxaPonderada || 0);
        
        const novaTaxaPortabilidade = (bank.novaTaxaReferencia !== undefined && bank.novaTaxaReferencia !== null && bank.novaTaxaReferencia > 0) 
          ? bank.novaTaxaReferencia 
          : taxaTabelaValida;

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
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display pb-24">
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
              className="object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{offerDetails.bank.name}</h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <FileText className="w-4 h-4" />
            <span>{offerDetails.tabela.nome}</span>
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
                {(offerDetails.novaTaxaPortabilidade > 1.85 ? 1.85 : offerDetails.novaTaxaPortabilidade).toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Taxa Ponderada
              </span>
              <span className="font-medium text-slate-900 dark:text-white">{offerDetails.taxaPonderada.toFixed(2)}%</span>
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

        <button 
          onClick={() => router.push('/simulacao/recomendacoes')}
          className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-md hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>Confirmar Portabilidade</span>
        </button>
      </div>
    </div>
  );
}
