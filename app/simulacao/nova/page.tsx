'use client';

import { Suspense } from 'react';
import SimulationForm from '@/components/SimulationForm';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';

export default function NovaSimulacaoPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-black min-h-screen">Carregando formulário...</div>}>
      <SimulationForm isEmbedded={false} />
    </Suspense>
  );
}
