'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { MessageCircle, X, Send, User, Bot, Loader2, Minimize2, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  role: 'user' | 'model';
  content: string;
}

const GUTTO_AVATAR = "https://img.freepik.com/free-psd/3d-illustration-human-avatar-profile_23-2150671142.jpg";

export default function ChatAssistant() {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0 && profile) {
      setMessages([
        { role: 'model', content: `Olá, ${profile.name || 'Parceiro'}! Sou o Gutto, seu assistente especialista em Portabilidade. Como posso te ajudar com uma simulação hoje?` }
      ]);
    }
  }, [profile, messages.length]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages.slice(-10),
          userId: profile?.uid
        })
      });

      const data = await response.json();
      
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'model', content: data.reply }]);
      } else {
        throw new Error(data.error || 'Erro na resposta do assistente');
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'model', content: 'Ops! Tive um probleminha técnico aqui. Pode tentar novamente em instantes?' }]);
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-4 w-[350px] sm:w-[400px] h-[500px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-primary p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl overflow-hidden shrink-0 shadow-inner">
                  <img src={GUTTO_AVATAR} alt="Gutto Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Gutto Assistant</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-[10px] text-white/70 font-bold uppercase tracking-wider">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsMinimized(true)}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 transition-colors"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 p-4 overflow-y-auto bg-slate-50 dark:bg-slate-950/50 space-y-4 custom-scrollbar"
            >
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-sm overflow-hidden ${
                      msg.role === 'user' ? 'bg-secondary text-primary' : 'bg-primary text-white border border-primary/20'
                    }`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <img src={GUTTO_AVATAR} alt="Gutto" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap ${
                      msg.role === 'user' 
                        ? 'bg-secondary/10 dark:bg-secondary/5 text-slate-800 dark:text-slate-200 border border-secondary/20 rounded-tr-none' 
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[85%] items-center">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs shadow-sm overflow-hidden border border-primary/20">
                      <img src={GUTTO_AVATAR} alt="Gutto" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700 shadow-sm">
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="O que deseja simular?"
                  disabled={loading}
                   className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary placeholder:text-slate-400 dark:text-white disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="bg-primary text-white p-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:grayscale"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <p className="text-[9px] text-center mt-2 text-slate-400 font-bold uppercase tracking-widest">
                Portabilidade PRO Intelligence
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <div className="flex flex-col items-end">
        {isMinimized && isOpen && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setIsMinimized(false)}
            className="mb-3 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span>Continuar conversa</span>
            <Maximize2 className="w-3 h-3" />
          </motion.button>
        )}
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (isMinimized) setIsMinimized(false);
            else setIsOpen(!isOpen);
          }}
          className={`flex items-center justify-center size-14 rounded-full shadow-2xl transition-all duration-300 group relative ${
            isOpen && !isMinimized ? 'bg-rose-500' : 'bg-primary'
          }`}
        >
          {isOpen && !isMinimized ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <>
              <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-25 group-hover:hidden" />
              <div className="relative w-full h-full rounded-full overflow-hidden border-2 border-white shadow-inner group-hover:scale-105 transition-transform">
                <img src={GUTTO_AVATAR} alt="Gutto" className="w-full h-full object-cover scale-110" referrerPolicy="no-referrer" />
              </div>
            </>
          )}
          {!isOpen && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-2 border-primary rounded-full" />
          )}
        </motion.button>
      </div>
    </div>
  );
}
