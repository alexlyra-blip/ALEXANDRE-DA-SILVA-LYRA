'use client';
import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';

interface PromotoraAvatarProps {
  logoUrl?: string;
  name: string;
  className?: string;
}

export function PromotoraAvatar({ logoUrl, name, className = "size-10" }: PromotoraAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const initial = name?.charAt(0).toUpperCase() || 'U';

  // If we have a logo and no error, show the image
  if (logoUrl && !hasError) {
    return (
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        transition={{ duration: 0.5 }}
        className={`${className} rounded-full overflow-hidden border border-primary/20 flex items-center justify-center bg-white`}
      >
        <Image
          src={logoUrl}
          alt={name}
          width={40}
          height={40}
          className="object-cover w-full h-full"
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
      className={`${className} rounded-full bg-primary/10 flex items-center justify-center border border-primary/20`}
    >
      <span className="font-bold text-primary uppercase">{initial}</span>
    </motion.div>
  );
}
