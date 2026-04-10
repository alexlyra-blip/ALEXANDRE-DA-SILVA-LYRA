'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { getPublicUrl } from '@/lib/storage-service';

interface PromotoraAvatarProps {
  logoUrl?: string;
  name: string;
  className?: string;
}

export function PromotoraAvatar({ logoUrl, name, className = "size-10" }: PromotoraAvatarProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [logoUrl]);

  const initial = name?.charAt(0).toUpperCase() || 'U';
  const isRoundedFull = !className.includes('rounded-');

  // If we have a logo and no error, show the image
  if (logoUrl && !hasError) {
    return (
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        transition={{ duration: 0.5 }}
        className={`${className} ${isRoundedFull ? 'rounded-full' : ''} overflow-hidden border border-primary/20 bg-slate-100 dark:bg-slate-800 relative`}
      >
        <Image
          src={getPublicUrl(logoUrl)}
          alt={name}
          fill
          unoptimized
          className="object-cover"
          onError={() => setHasError(true)}
          referrerPolicy="no-referrer"
        />
      </motion.div>
    );
  }

  // Fallback to initial
  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.5 }}
      className={`${className} ${isRoundedFull ? 'rounded-full' : ''} bg-primary/10 flex items-center justify-center border border-primary/20`}
    >
      <span className="font-bold text-primary uppercase">{initial}</span>
    </motion.div>
  );
}
