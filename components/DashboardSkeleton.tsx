import React from 'react';
import { Loader2, BarChart3, Building2, TrendingUp, Users, PlusCircle, Clock } from 'lucide-react';

export const DashboardSkeleton = () => {
  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 shadow-2xl pb-24 animate-pulse">
      {/* Header Skeleton */}
      <header className="p-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="flex flex-col gap-2">
            <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
        </div>
        <div className="size-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
      </header>

      <main className="flex-1 p-4 flex flex-col gap-6">
        {/* Info Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-2 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
          <div className="size-8 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>

        {/* Action Button Skeleton */}
        <div className="w-full h-14 bg-slate-200 dark:bg-slate-800 rounded-2xl" />

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-2 gap-4">
          <div className="h-32 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="size-4 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-2 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>

          <div className="h-32 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="size-4 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="h-6 w-full bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-2 w-20 bg-slate-200 dark:bg-slate-700 rounded mt-auto" />
          </div>
        </div>

        {/* Chart Skeleton */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-64 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="size-5 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
          <div className="flex-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs font-medium">Buscando simulações...</span>
            </div>
          </div>
        </div>

        {/* List Skeleton */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="size-5 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="flex flex-col gap-1">
                    <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-2 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                  </div>
                </div>
                <div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};
