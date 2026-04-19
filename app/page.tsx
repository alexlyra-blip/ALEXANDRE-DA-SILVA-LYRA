import { Suspense } from 'react';
import LoginContent from './LoginContent';

export default function Page() {
  return (
    <Suspense fallback={<div className="flex flex-col h-screen w-full max-w-md mx-auto bg-background items-center justify-center">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
      <p className="text-slate-500 text-sm animate-pulse">Carregando...</p>
    </div>}>
      <LoginContent />
    </Suspense>
  );
}
