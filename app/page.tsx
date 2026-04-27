import { Suspense } from 'react';
import LoginContent from './LoginContent';

export default function Page() {
  return (
    <Suspense fallback={<div className="flex flex-col h-screen w-full max-w-md mx-auto bg-background items-center justify-center p-6 text-center">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6"></div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Carregando Sistema</h2>
      <p className="text-slate-500 text-sm animate-pulse">Aguarde um instante enquanto preparamos tudo para você...</p>
    </div>}>
      <LoginContent />
    </Suspense>
  );
}
