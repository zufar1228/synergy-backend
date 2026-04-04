// backend/src/config/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Klien ini memiliki hak akses admin dan hanya boleh digunakan di backend.
export const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
