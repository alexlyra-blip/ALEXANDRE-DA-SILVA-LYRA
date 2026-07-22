'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, CreditCard, Check, AlertCircle, Crown } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import { useToast } from '@/contexts/ToastContext';
import ConsultaCPFModal from '@/components/ConsultaCPFModal';

export default function ConsultaCPFPage() {
  const router = useRouter();
  const { showToast, hideToast } = useToast();
  const [cpfCliente, setCpfCliente] = useState('');
  const [tipoConsulta, setTipoConsulta] = useState<'inss' | 'siape'>('inss');
  const [isConsulting, setIsConsulting] = useState(false);
  const [consultaData, setConsultaData] = useState<any>(null);
  const [isConsultaModalOpen, setIsConsultaModalOpen] = useState(false);

  const formatCPF = (value: any) => {
    if (!value) return '';
    return String(value)
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const validateCPF = (cpf: any) => {
    if (!cpf) return false;
    const cleanCpf = String(cpf).replace(/\D/g, '');
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

  const handleConsultaCPF = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
      
    } catch (error: any) {
      console.error("Consulta CPF Error:", error);
      showToast(error.message || "Erro ao consultar CPF. Verifique sua conexão.", "error");
    } finally {
      setIsConsulting(false);
    }
  };

  const handleToggleContract = (contractData: any, action: 'add' | 'remove') => {
    setIsConsultaModalOpen(false);
    showToast("Redirecionando para simulação...", "success");
    router.push(`/simulacao/nova?cpf=${cpfCliente}&type=${tipoConsulta}`);
  };

  return (
    <div className="flex min-h-screen bg-background-light dark:bg-background-dark">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden relative pb-20 md:pb-0">
        <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800 dark:text-white">Consulta de Cliente</h1>
                <p className="text-slate-500 text-sm">Pesquise os dados do benefício direto na base nacional.</p>
              </div>
            </div>

            <form onSubmit={handleConsultaCPF} className="space-y-6">
              <div className="flex flex-col gap-2 max-w-md">
                <label className="text-sm font-semibold text-slate-600 dark:text-white uppercase tracking-wider text-[10px]">CPF do Cliente</label>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                  <input 
                    className={`w-full rounded-xl border ${cpfCliente && !isCpfValid ? 'border-rose-300 bg-rose-50/10' : 'border-primary/20'} bg-white dark:bg-slate-950 h-14 pl-12 pr-12 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm`} 
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
              </div>

              <div className="flex flex-col gap-2 max-w-md">
                <label className="text-sm font-semibold text-slate-600 dark:text-white uppercase tracking-wider text-[10px]">Tipo de Consulta</label>
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setTipoConsulta('inss')}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${tipoConsulta === 'inss' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
                  >
                    INSS
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoConsulta('siape')}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${tipoConsulta === 'siape' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
                  >
                    SIAPE
                  </button>
                </div>
              </div>

              <div className="pt-4 max-w-md">
                <button
                  type="submit"
                  disabled={isConsulting || !isCpfValid}
                  className="w-full h-14 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-light hover:to-primary text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConsulting ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Search className="w-6 h-6" />
                  )}
                  {isConsulting ? 'Consultando...' : 'Consultar Base Nacional'}
                </button>
                <p className="text-xs text-slate-500 text-center mt-3 flex items-center justify-center gap-1">
                  <Crown className="w-3 h-3 text-amber-500" /> Consulta Premium Ativa
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
      <BottomNav />
      
      <ConsultaCPFModal
        isOpen={isConsultaModalOpen}
        onClose={() => setIsConsultaModalOpen(false)}
        data={consultaData}
        onToggleContract={handleToggleContract}
      />
    </div>
  );
}
