import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeStringify(obj: any) {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (value instanceof HTMLElement) return "[HTMLElement]";
      if (value['$$typeof']) return "[ReactElement]";
      if (cache.has(value)) return "[Circular]";
      cache.add(value);
    }
    return value;
  });
}

export function safeLocalStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e instanceof DOMException && (
      e.code === 22 || 
      e.code === 1014 || 
      e.name === 'QuotaExceededError' || 
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    )) {
      console.warn(`LocalStorage quota exceeded for key: ${key}. Clearing cache and skipping storage.`);
      // Clear all items that might be large to try and recover
      try {
        // Clear specific known large cache keys
        localStorage.removeItem('dashboard_simulations_cache');
        localStorage.removeItem('rules_banks');
        localStorage.removeItem('rules_general');
      } catch (clearError) {
        console.error("Error clearing localStorage:", clearError);
      }
    } else {
      console.error(`Error saving to LocalStorage for key: ${key}`, e);
    }
  }
}

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

export const formatCPF = (value: any) => {
  if (!value) return '';
  const strValue = String(value);
  const cleanValue = strValue.replace(/\D/g, '').padStart(11, '0');
  return cleanValue
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};
