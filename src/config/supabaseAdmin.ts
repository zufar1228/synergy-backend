/**
 * @file supabaseAdmin.ts
 * @purpose Supabase Admin client (service_role) for server-side auth operations
 * @usedBy userService
 * @deps @supabase/supabase-js, env
 * @exports supabaseAdmin
 * @sideEffects None
 */

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
