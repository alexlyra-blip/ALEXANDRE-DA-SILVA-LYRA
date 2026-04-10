import { createClient } from '@supabase/supabase-js';

let supabaseClient: any = null;

export const getSupabase = () => {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  if (!supabaseUrl || !supabaseAnonKey || !isValidUrl(supabaseUrl)) {
    // Return a dummy object if not configured or invalid
    console.warn("Supabase not configured or invalid URL:", supabaseUrl);
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
            order: () => Promise.resolve({ data: [], error: new Error('Supabase not configured') })
          }),
          order: () => Promise.resolve({ data: [], error: new Error('Supabase not configured') })
        }),
        upsert: () => Promise.resolve({ error: new Error('Supabase not configured') }),
        delete: () => ({
          eq: () => Promise.resolve({ error: new Error('Supabase not configured') })
        })
      } as any)
    } as any;
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

// For backward compatibility, but we should use getSupabase()
export const supabase = new Proxy({}, {
  get: (target, prop) => {
    return getSupabase()[prop];
  }
}) as any;
