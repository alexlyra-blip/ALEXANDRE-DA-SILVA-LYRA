'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';

interface Message {
  type: 'sent' | 'received';
  text: string;
}

export default function WhatsappSimulator() {
  const { profile, isAuthReady } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    { type: 'received', text: 'Simulador Local Iniciado. Digite "Oi" para começar.' }
  ]);
  const [inputText, setInputText] = useState('');
  const [phone] = useState('+5511999999999');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only redirect if auth is ready AND we have a profile AND that profile is NOT an admin
    // If profile is still null but isAuthReady is true, we wait for profile to arrive (or timeout fallback)
    if (isAuthReady && profile && profile.role !== 'admin') {
      console.log("WhatsappSimulator: Non-admin detected, redirecting to dashboard");
      router.push('/dashboard');
    }
  }, [profile, isAuthReady, router]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isAuthReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] text-slate-500 font-medium">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p>Verificando permissões...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] text-slate-500 font-medium p-6 text-center text-slate-900">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold mb-2 text-slate-800 dark:text-white">Erro ao carregar perfil</h2>
        <p className="max-w-xs mb-6 opacity-70 dark:text-slate-400">Não conseguimos validar suas permissões de acesso. Verifique sua conexão ou tente recarregar.</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-primary text-white rounded-xl font-bold transition-transform active:scale-95 shadow-lg shadow-primary/20">Recarregar</button>
      </div>
    );
  }

  if (profile.role !== 'admin') {
    return null; // The useEffect will handle redirect
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const currentText = inputText;
    setMessages(prev => [...prev, { type: 'sent', text: currentText }]);
    setInputText('');
    setLoading(true);

    try {
      const data = new URLSearchParams({
        From: `whatsapp:${phone}`,
        To: 'whatsapp:+14155238886',
        Body: currentText
      }).toString();

      const res = await aPIHit(data);
      
      if (res) {
        setMessages(prev => [...prev, { type: 'received', text: res }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { type: 'received', text: 'Erro ao conectar. Veja o console.' }]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const aPIHit = async (body: string) => {
    const res = await fetch('/api/whatsapp-twilio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    const text = await res.text();
    if (!res.ok) {
        return `Erro HTTP ${res.status}: ${text}`;
    }
    // Parse the TwiML XML
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const msgElement = xml.getElementsByTagName('Message')[0];
    return msgElement ? msgElement.textContent : `Nenhuma resposta (TwiML vazio). Texto bruto: ${text}`;
  };

  return (
    <div className="max-w-md mx-auto my-10 bg-slate-50 border border-slate-300 rounded-xl flex flex-col h-[600px] shadow-lg overflow-hidden">
      <div className="bg-[#075E54] text-white p-4 flex items-center shadow-md">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center mr-3">
          🤖
        </div>
        <div>
          <h2 className="font-bold">Bot Portabilidade</h2>
          <p className="text-xs text-slate-200">Simulador Local (Bypassa Twilio)</p>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto bg-[#E5DDD5]"
        style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat' }}
      >
        <div className="flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}`}>
              <div className={`px-4 py-2 rounded-lg max-w-[80%] whitespace-pre-wrap text-sm shadow-sm ${msg.type === 'sent' ? 'bg-[#DCF8C6] rounded-tr-none text-slate-800' : 'bg-white rounded-tl-none text-slate-800'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-2 bg-white rounded-lg rounded-tl-none shadow-sm text-sm text-slate-500 italic">
                Digitando...
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 bg-[#f0f0f0]">
        <form onSubmit={handleSend} className="flex gap-2 relative">
          <input 
            type="text" 
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            className="flex-1 rounded-full px-4 py-3 border-none shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-500 text-slate-800"
            placeholder="Digite uma mensagem..."
          />
          <button 
            type="submit" 
            disabled={!inputText.trim() || loading}
            className="bg-[#128C7E] text-white rounded-full w-12 h-12 flex items-center justify-center shadow-sm disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" className="fill-current transform translate-x-[-1px] translate-y-[1px]">
              <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
