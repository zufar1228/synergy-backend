"use strict";
/**
 * @file supabaseAdmin.ts
 * @purpose Supabase Admin client (service_role) for server-side auth operations
 * @usedBy userService
 * @deps @supabase/supabase-js, env
 * @exports supabaseAdmin
 * @sideEffects None
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("./env");
// Klien ini memiliki hak akses admin dan hanya boleh digunakan di backend.
exports.supabaseAdmin = (0, supabase_js_1.createClient)(env_1.env.NEXT_PUBLIC_SUPABASE_URL, env_1.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
