"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
// backend/src/config/supabaseAdmin.ts
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("./env");
// Klien ini memiliki hak akses admin dan hanya boleh digunakan di backend.
exports.supabaseAdmin = (0, supabase_js_1.createClient)(env_1.env.NEXT_PUBLIC_SUPABASE_URL, env_1.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
