import { createClient } from '@supabase/supabase-js';

const defaultSupabaseUrl = 'https://bkfxvxkdasxqlmzyjpoz.supabase.co';
const defaultSupabaseAnonKey = 'sb_publishable_OYbHXFEQ1JCkjB_5NCIeXQ_QqUTQB7N';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  defaultSupabaseUrl;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  defaultSupabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
