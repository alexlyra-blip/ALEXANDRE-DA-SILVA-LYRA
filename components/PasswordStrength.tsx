'use client';

import React, { useMemo } from 'react';

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const strength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  const getStrengthLabel = () => {
    if (strength === 0) return '';
    if (strength === 1) return 'Fraca';
    if (strength === 2) return 'Média';
    if (strength === 3) return 'Boa';
    return 'Forte';
  };

  const getStrengthColor = () => {
    if (strength === 1) return 'bg-red-500';
    if (strength === 2) return 'bg-amber-500';
    if (strength === 3) return 'bg-blue-500';
    if (strength === 4) return 'bg-emerald-500';
    return 'bg-slate-200 dark:bg-slate-700';
  };

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Força da senha</span>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${
          strength === 1 ? 'text-red-500' : 
          strength === 2 ? 'text-amber-500' : 
          strength === 3 ? 'text-blue-500' : 'text-emerald-500'
        }`}>
          {getStrengthLabel()}
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div 
            key={level}
            className={`h-full flex-1 transition-all duration-500 ${
              strength >= level ? getStrengthColor() : 'bg-slate-200 dark:bg-slate-700/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
