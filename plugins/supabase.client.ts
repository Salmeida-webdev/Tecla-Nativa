import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '~/supabase/types/database.types';

export default defineNuxtPlugin(() => {
  const url = __SUPABASE_URL__;
  const publishableKey = __SUPABASE_PUBLISHABLE_KEY__;

  let supabase: SupabaseClient<Database> | null = null;
  if (url && publishableKey) {
    supabase = createClient<Database>(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }

  return { provide: { supabase } };
});
