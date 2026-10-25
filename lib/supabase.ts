import { createClient } from '@supabase/supabase-js';
import { validateSupabaseConfig } from './server/env-validation';

function getSupabaseConfig() {
  // Validate environment variables at module load time
  const config = validateSupabaseConfig(process.env);
  return config;
}

const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
