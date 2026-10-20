import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '~/supabase/types/database.types';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const url = String(config.public.supabaseUrl || '');
  const publishableKey = String(config.public.supabasePublishableKey || '');

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
