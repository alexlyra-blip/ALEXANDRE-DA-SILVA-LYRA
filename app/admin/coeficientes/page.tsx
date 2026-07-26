'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { 
  Calculator, 
  Calendar as CalendarIcon, 
  Save, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Landmark, 
  ArrowLeft, 
  Copy, 
  Info,
  Clock,
  ShieldCheck,
  Zap,
  Edit3,
  X
} from 'lucide-react';
import Link from 'next/link';
import { 
  getMonthlyCoefficients, 
  saveDailyCoefficient, 
  getLatestCoefficient, 
  formatDateStr, 
  isWeekend 
} from '@/lib/coefficients';
import { getBankRules } from '@/lib/data-service';
import { findBankCode } from '@/lib/mappings';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

export default function AdminCoeficientesPage() {
  const { profile, isAuthReady } = useAuth();
  const { showToast } = useToast();

  const today = new Date();
  const [selectedConvenio, setSelectedConvenio] = useState<'INSS' | 'SIAPE'>('INSS');
  const [selectedBanco, setSelectedBanco] = useState<string>('707'); // Default to Daycoval
  const [availableBanks, setAvailableBanks] = useState<{code: string, name: string}[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1); // 1-12

  const [coefficients, setCoefficients] = useState<Record<string, string>>({});
  const [savedCoefficients, setSavedCoefficients] = useState<Record<string, string>>({});
  const [editingDays, setEditingDays] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingDay, setSavingDay] = useState<string | null>(null);

  const [activeCoefInfo, setActiveCoefInfo] = useState<{ date: string; coeficiente: number } | null>(null);
  const [bulkCoefValue, setBulkCoefValue] = useState<string>('0.02270');

  // Carregar coeficientes ao trocar de convênio, mês ou ano
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const banksList = await getBankRules();
        const activeBanks = banksList.filter(b => b.isActive !== false).map(b => {
          const code = findBankCode(b.name);
          return { code, name: b.name };
        });
        
        // Remove duplicates if any
        const uniqueBanks = Array.from(new Map(activeBanks.map(item => [item.code, item])).values());
        uniqueBanks.sort((a, b) => a.name.localeCompare(b.name));
        setAvailableBanks(uniqueBanks);
        
        let currentBanco = selectedBanco;
        if (uniqueBanks.length > 0 && !uniqueBanks.find(b => b.code === currentBanco)) {
            currentBanco = uniqueBanks[0].code;
            setSelectedBanco(currentBanco);
        }

        const [monthlyData, latest] = await Promise.all([
          getMonthlyCoefficients(selectedConvenio, currentBanco, selectedYear, selectedMonth),
          getLatestCoefficient(selectedConvenio, currentBanco)
        ]);

        const strMap: Record<string, string> = {};
        Object.entries(monthlyData).forEach(([dateStr, val]) => {
          strMap[dateStr] = val.toString();
        });

        setCoefficients(strMap);
        setSavedCoefficients(strMap);
        setEditingDays({});
        setActiveCoefInfo(latest);
      } catch (err) {
        console.error("Erro ao carregar coeficientes:", err);
        showToast("Erro ao carregar coeficientes.", "error");
      } finally {
        setIsLoading(false);
      }
    }

    if (isAuthReady) {
      loadData();
    }
  }, [selectedConvenio, selectedBanco, selectedYear, selectedMonth, isAuthReady]);

  // Dias do mês selecionado
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const daysList = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(selectedYear, selectedMonth - 1, day);
    const dayOfWeek = d.getDay();
    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
    return {
      day,
      dateStr,
      dayOfWeek,
      dayName: WEEKDAY_NAMES[dayOfWeek],
      isWeekend: isWeekendDay,
    };
  });

  const handleInputChange = (dateStr: string, value: string) => {
    setCoefficients(prev => ({
      ...prev,
      [dateStr]: value
    }));
  };

  const handleSaveSingleDay = async (dateStr: string) => {
    const rawVal = coefficients[dateStr];
    if (!rawVal) {
      showToast("Informe um valor numérico para salvar.", "warning");
      return;
    }

    const numVal = parseFloat(rawVal.replace(',', '.'));
    if (isNaN(numVal) || numVal <= 0) {
      showToast("Valor de coeficiente inválido.", "error");
      return;
    }

    setSavingDay(dateStr);
    try {
      await saveDailyCoefficient(selectedConvenio, selectedBanco, dateStr, numVal, profile?.uid);
      const valStr = numVal.toString();
      setCoefficients(prev => ({ ...prev, [dateStr]: valStr }));
      setSavedCoefficients(prev => ({ ...prev, [dateStr]: valStr }));
      setEditingDays(prev => ({ ...prev, [dateStr]: false }));
      showToast(`Coeficiente salvo para ${dateStr}: ${numVal}`, "success");
      
      // Atualizar status ativo
      const latest = await getLatestCoefficient(selectedConvenio, selectedBanco);
      setActiveCoefInfo(latest);
    } catch (err) {
      console.error("Erro ao salvar coeficiente:", err);
      showToast("Falha ao salvar no banco de dados.", "error");
    } finally {
      setSavingDay(null);
    }
  };

  const handleApplyBulkValue = () => {
    const numVal = parseFloat(bulkCoefValue.replace(',', '.'));
    if (isNaN(numVal) || numVal <= 0) {
      showToast("Valor do lote inválido.", "error");
      return;
    }

    const updated = { ...coefficients };
    daysList.forEach(d => {
      if (!d.isWeekend) {
        updated[d.dateStr] = bulkCoefValue.replace(',', '.');
      }
    });

    setCoefficients(updated);
    showToast(`Preenchido os dias úteis com ${bulkCoefValue}. Clique em 'Salvar Todos' para confirmar.`, "info");
  };

  const handleSaveAllMonth = async () => {
    setIsSaving(true);
    let savedCount = 0;
    const newSaved = { ...savedCoefficients };
    const newCoefs = { ...coefficients };
    try {
      for (const d of daysList) {
        if (d.isWeekend) continue;
        const valStr = coefficients[d.dateStr];
        if (valStr) {
          const numVal = parseFloat(valStr.replace(',', '.'));
          if (!isNaN(numVal) && numVal > 0) {
            await saveDailyCoefficient(selectedConvenio, selectedBanco, d.dateStr, numVal, profile?.uid);
            newSaved[d.dateStr] = numVal.toString();
            newCoefs[d.dateStr] = numVal.toString();
            savedCount++;
          }
        }
      }

      setCoefficients(newCoefs);
      setSavedCoefficients(newSaved);
      setEditingDays({});
      showToast(`${savedCount} coeficientes de dias úteis salvos com sucesso!`, "success");
      const latest = await getLatestCoefficient(selectedConvenio, selectedBanco);
      setActiveCoefInfo(latest);
    } catch (err) {
      console.error("Erro ao salvar todos os coeficientes:", err);
      showToast("Erro ao salvar alguns coeficientes.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthReady || isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profile?.role !== 'admin' && profile?.role !== 'promotora') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-4 text-center">
        <div className="max-w-md bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Acesso Restrito</h2>
          <p className="text-slate-500 text-sm mb-6">Esta página é exclusiva para administradores do sistema.</p>
          <Link href="/dashboard" className="px-4 py-2 bg-primary text-white font-bold rounded-xl text-xs uppercase">
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-screen bg-background text-foreground">

      <div className="flex flex-col flex-1 min-w-0 pb-20 pt-4 px-4 md:px-8 max-w-6xl mx-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <Calculator className="w-6 h-6 text-primary" />
                Coeficientes Diários do Mês
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Cadastre e gerencie os coeficientes diários para cálculo de margem e liberado (INSS e SIAPE).
              </p>
            </div>
          </div>

          <button
            onClick={handleSaveAllMonth}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Salvar Todos do Mês</span>
          </button>
        </div>

        {/* Informação do Coeficiente Ativo Hoje */}
        {activeCoefInfo && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-black">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Coeficiente Ativo Hoje ({selectedConvenio} - {availableBanks.find(b => b.code === selectedBanco)?.name || selectedBanco})</span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {activeCoefInfo.coeficiente}
                  <span className="text-xs font-semibold text-slate-500 ml-2">
                    (Vigente a partir de: {activeCoefInfo.date})
                  </span>
                </h3>
              </div>
            </div>

            <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <Info className="w-4 h-4 text-sky-500" />
              <span>Sem cadastro no dia? O sistema usará este valor do dia anterior.</span>
            </div>
          </div>
        )}

        {/* Controls Bar: Convênio Tabs & Mês/Ano */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Tab Convênio */}
          <div className="bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl flex border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setSelectedConvenio('INSS')}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                selectedConvenio === 'INSS'
                  ? 'bg-white dark:bg-slate-800 text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Landmark className="w-4 h-4" />
              INSS
            </button>
            <button
              onClick={() => setSelectedConvenio('SIAPE')}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                selectedConvenio === 'SIAPE'
                  ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              SIAPE
            </button>
          </div>

          {/* Select Banco */}
          <div className="flex">
            <select
              value={selectedBanco}
              onChange={e => setSelectedBanco(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2 text-xs font-bold text-slate-800 dark:text-white"
            >
              {availableBanks.map((bank) => (
                <option key={bank.code} value={bank.code}>{bank.name}</option>
              ))}
            </select>
          </div>

          {/* Select Mês & Ano */}
          <div className="flex gap-2">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2 text-xs font-bold text-slate-800 dark:text-white"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx} value={idx + 1}>{name}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2 text-xs font-bold text-slate-800 dark:text-white"
            >
              {[2025, 2026, 2027].map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Bulk Apply Bar */}
          <div className="flex gap-2">
            <input
              type="text"
              value={bulkCoefValue}
              onChange={e => setBulkCoefValue(e.target.value)}
              placeholder="0.02270"
              className="w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3 py-2 text-xs font-bold text-center text-slate-800 dark:text-white"
            />
            <button
              onClick={handleApplyBulkValue}
              className="flex-1 bg-slate-900 text-white dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-black uppercase tracking-wider rounded-2xl px-3 py-2 transition-all flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Preencher Dias Úteis
            </button>
          </div>
        </div>

        {/* Days List Table */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-primary" />
              Calendário de Coeficientes ({MONTH_NAMES[selectedMonth - 1]} / {selectedYear})
            </h3>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {daysInMonth} dias no mês
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto custom-scrollbar">
            {daysList.map(item => {
              const savedVal = savedCoefficients[item.dateStr];
              const isSaved = Boolean(savedVal);
              const isEditing = Boolean(editingDays[item.dateStr]);
              const currentVal = coefficients[item.dateStr] !== undefined ? coefficients[item.dateStr] : (savedVal || '');
              const isToday = item.dateStr === formatDateStr();
              const isSavingThisDay = savingDay === item.dateStr;

              return (
                <div
                  key={item.dateStr}
                  className={`p-3 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors ${
                    isToday ? 'bg-primary/5 dark:bg-primary/10' : (item.isWeekend ? 'bg-slate-50/50 dark:bg-slate-950/40 opacity-75' : 'hover:bg-slate-50/80 dark:hover:bg-slate-950/80')
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex flex-col items-center justify-center font-bold text-xs ${
                      isToday
                        ? 'bg-primary text-white'
                        : (item.isWeekend ? 'bg-slate-200 dark:bg-slate-800 text-slate-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300')
                    }`}>
                      <span className="text-[9px] uppercase leading-none font-medium">{item.dayName.slice(0, 3)}</span>
                      <span className="text-sm font-black leading-none">{item.day}</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {item.dayName}, {item.day} de {MONTH_NAMES[selectedMonth - 1]}
                        </span>
                        {isToday && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase">
                            Hoje
                          </span>
                        )}
                        {isSaved && !isEditing && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/30 uppercase flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Salvo
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {item.isWeekend ? 'Final de Semana / Sem Expediente' : `Data: ${item.dateStr}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {item.isWeekend ? (
                      <span className="text-[10px] font-bold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 uppercase tracking-wider w-full text-center">
                        Sem Coeficiente
                      </span>
                    ) : isSaved && !isEditing ? (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl px-4 py-1.5 text-center flex-1 sm:w-44">
                          <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 font-mono">
                            {savedVal}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            handleInputChange(item.dateStr, savedVal);
                            setEditingDays(prev => ({ ...prev, [item.dateStr]: true }));
                          }}
                          className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 border border-slate-200 dark:border-slate-700"
                          title="Editar Coeficiente"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-primary" />
                          <span>Editar</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative flex-1 sm:w-44">
                          <input
                            type="text"
                            value={currentVal}
                            onChange={e => handleInputChange(item.dateStr, e.target.value)}
                            placeholder="Usará dia anterior"
                            className={`w-full bg-slate-50 dark:bg-slate-950 border text-xs font-bold rounded-xl px-3 py-2 text-center text-slate-900 dark:text-white transition-all ${
                              currentVal ? 'border-primary/50 text-primary' : 'border-slate-200 dark:border-slate-800'
                            }`}
                          />
                        </div>

                        <button
                          onClick={() => handleSaveSingleDay(item.dateStr)}
                          disabled={isSavingThisDay || !currentVal}
                          className="px-3 py-2 bg-primary text-white hover:bg-primary/90 text-xs font-bold rounded-xl transition-all disabled:opacity-40 flex items-center gap-1 shrink-0 shadow-sm"
                        >
                          {isSavingThisDay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span className="hidden sm:inline">{isSaved ? 'Atualizar' : 'Salvar'}</span>
                        </button>

                        {isSaved && isEditing && (
                          <button
                            onClick={() => setEditingDays(prev => ({ ...prev, [item.dateStr]: false }))}
                            className="px-2 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 text-xs font-bold rounded-xl transition-all"
                            title="Cancelar Edição"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
