import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
