'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Newspaper, Info, Check, Trash2, Edit } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { useToast } from '@/contexts/ToastContext';
import { motion, AnimatePresence } from 'motion/react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'news' | 'system' | 'update';
  date: any;
  link?: string;
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { profile } = useAuth();
  const { showToast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  // MOCK NEWS
  const MOCK_NEWS: Notification[] = [
    {
      id: 'news-1',
      title: 'Taxa Selic mantida em 10,50%',
      message: 'Copom decide manter a taxa básica de juros, impactando as taxas do crédito consignado para o próximo semestre.',
      type: 'news',
      date: new Date()
    },
    {
      id: 'news-2',
      title: 'Novas Regras INSS 2024',
      message: 'Governo altera regras de margem consignável para aposentados e pensionistas do INSS com redução de taxas.',
      type: 'news',
      date: new Date(Date.now() - 86400000)
    }
  ];

  useEffect(() => {
    // Listen for admin notifications in Firestore
    const q = query(collection(db, 'notifications'), orderBy('date', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snap) => {
      const dbNotifs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      const allNotifs = [...dbNotifs, ...MOCK_NEWS].sort((a, b) => {
        const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const db = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return db.getTime() - da.getTime();
      });
      setNotifications(allNotifs);
      
      // Simples localStorage based unread count
      const lastRead = localStorage.getItem('lastReadNotifications');
      if (lastRead) {
        const lastReadDate = new Date(lastRead);
        const unread = allNotifs.filter(n => {
          const nd = n.date?.toDate ? n.date.toDate() : new Date(n.date);
          return nd > lastReadDate;
        }).length;
        setUnreadCount(unread);
      } else {
        setUnreadCount(allNotifs.length);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setUnreadCount(0);
      localStorage.setItem('lastReadNotifications', new Date().toISOString());
    }
  };

  const deleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'notifications', id));
      showToast("Notificação excluída", "success");
    } catch (e) {
      showToast("Erro ao excluir", "error");
    }
  };

  const createNotification = async () => {
    const title = window.prompt('Título da Notificação:');
    if (!title) return;
    const message = window.prompt('Mensagem da Notificação:');
    if (!message) return;

    try {
      await addDoc(collection(db, 'notifications'), {
        title,
        message,
        type: 'system',
        date: serverTimestamp()
      });
      showToast('Notificação enviada a todos!', 'success');
    } catch (e) {
      showToast('Erro ao enviar', 'error');
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button 
        onClick={handleOpen}
        className="relative p-2 text-white/80 hover:text-white bg-white/5 rounded-lg transition-colors hover:bg-white/10"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-12 -left-2 sm:left-auto sm:right-0 w-80 max-h-96 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-[100] flex flex-col"
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                Notificações e Notícias
              </h3>
              {profile?.role === 'admin' && (
                <button onClick={createNotification} className="text-primary hover:text-primary/80 bg-primary/10 p-1.5 rounded-md transition-colors" title="Criar nova notificação global">
                  <Edit className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-2">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  Nenhuma notificação no momento.
                </div>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} className="p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl hover:border-primary/30 transition-colors group relative">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full shrink-0 ${notif.type === 'news' ? 'bg-blue-50 text-blue-500 dark:bg-blue-500/10' : 'bg-primary/10 text-primary'}`}>
                        {notif.type === 'news' ? <Newspaper className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight mb-1">{notif.title}</h4>
                        <p className="text-xs text-slate-500 leading-snug">{notif.message}</p>
                        <span className="text-[9px] text-slate-400 font-bold uppercase mt-2 block">
                          {notif.date?.toDate ? notif.date.toDate().toLocaleDateString('pt-BR') : new Date(notif.date).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                    {profile?.role === 'admin' && notif.type !== 'news' && (
                      <button 
                        onClick={(e) => deleteNotification(notif.id, e)}
                        className="absolute top-2 right-2 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                        title="Excluir notificação"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
