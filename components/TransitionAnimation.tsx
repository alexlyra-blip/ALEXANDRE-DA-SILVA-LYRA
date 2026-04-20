'use client';

import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Zap, Search, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { getBankRules } from '@/lib/data-service';

const LOADING_STEPS = [
  "Iniciando análise segura...",
  "Consultando convênios disponíveis...",
  "Verificando margem consignável...",
  "Buscando as melhores taxas do mercado...",
  "Calculando parcelas ideais...",
  "Finalizando recomendações personalizadas..."
];

export default function TransitionAnimation({ onComplete, availableBanks }: { onComplete: () => void, availableBanks?: any[] }) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [banks, setBanks] = useState<{name: string, logo: string}[]>([]);
  const [currentBankIdx, setCurrentBankIdx] = useState(0);

  // Generate random particles for background
  const particles = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 10 + 10,
      delay: Math.random() * 5
    }));
  }, []);

  // Generate logos to be sucked into the center
  const suckedLogos = useMemo(() => {
    if (banks.length === 0) return [];
    const items = [];
    for (let i = 0; i < banks.length; i++) {
      for (let j = 0; j < 3; j++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 250 + Math.random() * 150; // Random distance between 250 and 400
        items.push({
          id: `${banks[i].name}-${i}-${j}`,
          bank: banks[i],
          startX: Math.cos(angle) * distance,
          startY: Math.sin(angle) * distance,
          delay: Math.random() * 5,
          duration: 2 + Math.random() * 2
        });
      }
    }
    return items;
  }, [banks]);

  // Fetch banks for the cycling animation
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        let uniqueBanks: {name: string, logo: string}[] = [];
        
        if (availableBanks && availableBanks.length > 0) {
          // Use provided context banks - they are already populated and fast
          uniqueBanks = Array.from(new Map(
            availableBanks
              .filter(r => r.logoUrl)
              .map(r => [r.name, { name: r.name, logo: r.logoUrl }])
          ).values());
        } else {
           // Fallback to fetch explicitly if not provided
          const rules = await getBankRules();
          uniqueBanks = Array.from(new Map(
            rules
              .filter(r => r.logoUrl)
              .map(r => [r.name, { name: r.name, logo: r.logoUrl }])
          ).values());
        }
        
        if (uniqueBanks.length > 0) {
          setBanks(uniqueBanks.sort(() => 0.5 - Math.random()).slice(0, 8));
        }
      } catch (e) {
        console.error("Error fetching banks for animation", e);
      }
    };
    fetchBanks();
  }, [availableBanks]);

  // Progress and step logic
  useEffect(() => {
    const duration = 3000; // Increased to at least 3 seconds as requested
    const intervalTime = 25;
    const totalSteps = duration / intervalTime;
    const increment = 100 / totalSteps;

    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 400); // Reduced delay at 100%
          return 100;
        }
        return next;
      });
    }, intervalTime);

    return () => clearInterval(interval);
  }, [onComplete]);

  // Update text steps based on progress
  useEffect(() => {
    const stepIdx = Math.min(Math.floor((progress / 100) * LOADING_STEPS.length), LOADING_STEPS.length - 1);
    setCurrentStep(stepIdx);
  }, [progress]);

  // Cycle through bank logos
  useEffect(() => {
    if (banks.length === 0) return;
    const interval = setInterval(() => {
      setCurrentBankIdx(prev => (prev + 1) % banks.length);
    }, 1500); // Slowed down from 700ms to 1500ms for better legibility
    return () => clearInterval(interval);
  }, [banks]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/80 dark:bg-[#020617] backdrop-blur-md text-slate-900 dark:text-white overflow-hidden font-sans">
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Animated Particles */}
        {particles.map(p => (
          <motion.div
            key={p.id}
            className="absolute bg-primary/20 dark:bg-white/20 rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
            }}
            animate={{
              y: [0, -100, 0],
              opacity: [0, 0.5, 0],
              scale: [1, 1.5, 1]
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        ))}

        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[150px] animate-pulse delay-1000" />
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5 mix-blend-overlay" />
      </div>

      {/* Main Animation Container */}
      <div className="relative z-10 flex flex-col items-center">
        
        {/* Central Glowing Ring Container */}
        <div className="relative size-72 flex items-center justify-center mb-16">
          
          {/* Outer Orbiting Ring */}
          <motion.div 
            className="absolute inset-0 rounded-full border border-primary/20 dark:border-white/5"
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 size-2 bg-primary rounded-full blur-[2px] shadow-[0_0_10px_#1152d4]" />
          </motion.div>
          
          {/* Middle Dashed Ring */}
          <motion.div 
            className="absolute inset-6 rounded-full border-2 border-dashed border-primary/20"
            animate={{ rotate: -360 }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          />
          
          {/* Inner Glowing Ring */}
          <motion.div 
            className="absolute inset-10 rounded-full border-[6px] border-primary/40 shadow-[0_0_60px_rgba(17,82,212,0.4)]"
            animate={{ 
              scale: [1, 1.03, 1],
              borderColor: ['rgba(17,82,212,0.4)', 'rgba(17,82,212,0.6)', 'rgba(17,82,212,0.4)']
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Scanning Line Effect */}
          <motion.div 
            className="absolute inset-0 rounded-full overflow-hidden z-10 pointer-events-none"
          >
            <motion.div 
              className="w-full h-1/3 bg-gradient-to-b from-transparent via-primary/30 to-transparent"
              animate={{ y: ['-100%', '300%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>

          {/* Logo Container (The Core) */}
          <div className="relative size-44 bg-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.1)] overflow-hidden border-[8px] border-slate-100 dark:border-slate-950 z-20">
            <AnimatePresence mode="wait">
              {banks.length > 0 && (
                <motion.div
                  key={currentBankIdx}
                  initial={{ opacity: 0, scale: 1.2, filter: 'blur(10px)', rotateY: 90 }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', rotateY: 0 }}
                  exit={{ opacity: 0, scale: 0.8, filter: 'blur(10px)', rotateY: -90 }}
                  transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                  className="absolute inset-0 flex items-center justify-center p-2"
                >
                  <div className="relative w-full h-full rounded-full overflow-hidden">
                    <Image 
                      src={banks[currentBankIdx].logo} 
                      alt={banks[currentBankIdx].name} 
                      fill 
                      className="object-cover" 
                      sizes="200px"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Glass Reflection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-black/10 via-transparent to-white/20 pointer-events-none z-30" />
          </div>

          {/* Logos being sucked into the center */}
          <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center">
            {suckedLogos.map((item) => (
              <motion.div
                key={item.id}
                className="absolute size-14 bg-white rounded-full shadow-lg flex items-center justify-center border border-slate-100 overflow-hidden"
                initial={{ x: item.startX, y: item.startY, scale: 0, opacity: 0 }}
                animate={{ 
                  x: [item.startX, item.startX * 0.5, 0], 
                  y: [item.startY, item.startY * 0.5, 0],
                  scale: [0, 1, 0],
                  opacity: [0, 1, 0]
                }}
                transition={{ 
                  duration: item.duration, 
                  delay: item.delay, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
              >
                <div className="relative w-full h-full">
                  <Image 
                    src={item.bank.logo} 
                    alt={item.bank.name} 
                    fill 
                    className="object-cover" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Floating Tech Elements */}
          {[Zap, ShieldCheck, Search, Sparkles].map((Icon, i) => (
            <motion.div
              key={i}
              className="absolute size-12 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-center text-primary shadow-2xl z-30"
              animate={{
                y: [0, -15, 0],
                rotate: [0, 10, -10, 0],
                boxShadow: ['0 0 0px rgba(17,82,212,0)', '0 0 20px rgba(17,82,212,0.3)', '0 0 0px rgba(17,82,212,0)']
              }}
              transition={{
                duration: 4,
                delay: i * 0.8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              style={{
                top: i === 0 ? '-5%' : i === 1 ? '15%' : i === 2 ? '75%' : '85%',
                left: i === 0 ? '5%' : i === 1 ? '85%' : i === 2 ? '-10%' : '80%',
              }}
            >
              <Icon className="size-6" />
            </motion.div>
          ))}
        </div>

        {/* Text and Progress Section */}
        <div className="text-center space-y-8 max-w-lg px-8">
          <div className="space-y-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -20, filter: 'blur(8px)' }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center"
              >
                <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-transparent bg-clip-text dark:bg-gradient-to-b dark:from-white dark:to-white/60 uppercase italic">
                  {LOADING_STEPS[currentStep]}
                </h2>
              </motion.div>
            </AnimatePresence>
            <p className="text-slate-500 text-sm font-bold tracking-[0.2em] uppercase">
              Processando com Inteligência Artificial
            </p>
          </div>

          {/* High-End Progress Bar */}
          <div className="relative w-80 h-4 bg-slate-200 dark:bg-slate-900 rounded-full p-1 border border-slate-300 dark:border-white/5 mx-auto overflow-hidden">
            <motion.div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-blue-500 to-secondary rounded-full" 
              initial={{ width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: "linear" }}
            />
            {/* Shimmer overlay */}
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-1/2"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </div>

          {/* Trust Badges */}
          <div className="flex items-center justify-center gap-6 pt-4">
            <motion.div 
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500"
              whileHover={{ scale: 1.05 }}
            >
              <div className="size-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <ShieldCheck className="size-3 text-emerald-500" />
              </div>
              Segurança Bancária
            </motion.div>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-800" />
            <motion.div 
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500"
              whileHover={{ scale: 1.05 }}
            >
              <div className="size-5 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Zap className="size-3 text-amber-500" />
              </div>
              Resposta Imediata
            </motion.div>
          </div>
        </div>
      </div>

      {/* Decorative Corner Elements */}
      <div className="absolute top-0 left-0 p-8 opacity-20">
        <div className="size-32 border-t-2 border-l-2 border-primary/30 rounded-tl-3xl" />
      </div>
      <div className="absolute bottom-0 right-0 p-8 opacity-20">
        <div className="size-32 border-b-2 border-r-2 border-secondary/30 rounded-br-3xl" />
      </div>
    </div>
  );
}
