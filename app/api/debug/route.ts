import { db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const input = {
      idade: 71,
      codigoBeneficio: '41',
      bancoAtual: 'Itaú',
      valorParcela: 54.71,
      saldoDevedor: 1208.77,
      parcelasPagas: 55, // 84 total - 29 remaining
      parcelasRestantes: 29,
      convenio: 'INSS' as const,
      isAnalfabeto: false,
      taxaJurosMensal: 0.0192,
      originalRate: 1.92
    };
    
    // Simulate with logging
    const banksSnapshot = await getDocs(collection(db, 'banks'));
    const banks = banksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    
    let logs: string[] = [];

    banks.forEach(bank => {
        const isTarget = ['C6', 'DAYCOVAL', 'FACTA'].some(n => bank.name.toUpperCase().includes(n));
        const log = (msg: string) => { if (isTarget) logs.push(`[${bank.name}] ${msg}`); };

        if (!isTarget) return; // Only process targets for debug

        if (bank.convenio && bank.convenio !== input.convenio) { log('Filtered by convenio'); return; }
        if (bank.minInstallmentValue && input.valorParcela < bank.minInstallmentValue) { log(`Filtered by minInstallmentValue: ${input.valorParcela} < ${bank.minInstallmentValue}`); return; }
        if (bank.minBalance && input.saldoDevedor < bank.minBalance) { log(`Filtered by minBalance: ${input.saldoDevedor} < ${bank.minBalance}`); return; }
        if (bank.maxAge > 0 && input.idade > bank.maxAge) { log(`Filtered by maxAge: ${input.idade} > ${bank.maxAge}`); return; }
        if (bank.minAge > 0 && input.idade < bank.minAge) { log(`Filtered by minAge: ${input.idade} < ${bank.minAge}`); return; }
        
        if (bank.tabelas && bank.tabelas.length > 0) {
            bank.tabelas.forEach((tabela: any) => {
                const coef = tabela.coeficiente;
                if (!coef || coef <= 0) return;
        
                const valorContrato = input.valorParcela / coef;
                const valorTroco = valorContrato - input.saldoDevedor;
                
                const valorParaValidarMinTicket = (tabela.somaSaldoTroco === true) ? (input.saldoDevedor + valorTroco) : input.saldoDevedor;
                const minTicketValue = (tabela.useMinTicket === true) ? (tabela.minTicket || bank.minTroco || 0) : 0;
                
                if (tabela.useMinTicket === true && minTicketValue > 0 && valorParaValidarMinTicket < minTicketValue) {
                    log(`Tabela ${tabela.nome}: filtrada por minTicketValue (${valorParaValidarMinTicket} < ${minTicketValue})`);
                    return;
                }
        
                const originalRate = input.taxaJurosMensal * 100;
                const bankAdjustment = bank.ajusteTaxa || 0;
                const novaTaxa = (tabela.taxaDiferencial > 0) ? tabela.taxaDiferencial : (originalRate + bankAdjustment);
                
                if (bank.portabilityRate > 0 && novaTaxa < bank.portabilityRate) {
                    log(`Tabela ${tabela.nome}: filtrada por portabilityRate. NovaTaxa (${novaTaxa}) < minPortabilityRate (${bank.portabilityRate})`);
                    return;
                }

                const taxaPonderadaFinal = ((originalRate + novaTaxa) / 2) + (parseFloat(tabela.ajusteTaxaPonderada) || 0);
                const taxaTabelaValida = (tabela.taxaTabela > 0) ? tabela.taxaTabela : (bank.refinRate || 0);

                if (tabela.useTaxaPonderada === true && taxaTabelaValida > 0 && taxaTabelaValida >= taxaPonderadaFinal) {
                    log(`Tabela ${tabela.nome}: filtrada por taxaPonderadaFinal. taxaTabelaValida (${taxaTabelaValida}) >= taxaPonderadaFinal (${taxaPonderadaFinal})`);
                    return;
                }
                
                if (valorTroco <= 0) {
                    log(`Tabela ${tabela.nome}: filtrada por troco <= 0 (${valorTroco}). Contrato: ${valorContrato}, Saldo: ${input.saldoDevedor}, Coef: ${coef}`);
                    return;
                }

                log(`Tabela ${tabela.nome} PASSED: troco=${valorTroco}, ponderada=${taxaPonderadaFinal}, novaTaxa=${novaTaxa}`);
            });
        } else {
            log('No tables found');
        }
    });

    return NextResponse.json({ logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
