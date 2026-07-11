import { createClient } from '@supabase/supabase-js';

// Pakai service_role key karena semua otorisasi ditangani di layer API ini (token admin),
// bukan lewat Supabase Auth / RLS. JANGAN pernah expose service_role key ke frontend.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set di environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});
