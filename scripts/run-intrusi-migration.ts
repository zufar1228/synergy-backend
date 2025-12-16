// backend/scripts/run-intrusi-migration.ts
// Run with: pnpm ts-node scripts/run-intrusi-migration.ts

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runMigration() {
  console.log("=".repeat(60));
  console.log("🚀 RUNNING INTRUSI_LOGS TABLE MIGRATION");
  console.log("=".repeat(60));

  try {
    // Check if table already exists
    const { data: existingTable, error: checkError } = await supabase
      .from("intrusi_logs")
      .select("id")
      .limit(1);

    if (!checkError) {
      console.log("✅ Table 'intrusi_logs' already exists!");
      console.log("   Migration skipped (table exists).");
      
      // Verify structure
      const { count } = await supabase
        .from("intrusi_logs")
        .select("*", { count: "exact", head: true });
      
      console.log(`   Current row count: ${count || 0}`);
      return;
    }

    // Table doesn't exist, need to create via SQL Editor
    console.log("⚠️  Table 'intrusi_logs' does not exist yet.");
    console.log("\n📋 Please run the following SQL in Supabase SQL Editor:");
    console.log("   File: backend/migrations/create_intrusi_logs_table.sql");
    console.log("\n" + "=".repeat(60));
    console.log("SQL CONTENT:");
    console.log("=".repeat(60));
    
    const sql = `
-- 1. Create Enum (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intrusi_event_class') THEN
        CREATE TYPE public.intrusi_event_class AS ENUM ('Normal', 'Disturbance', 'Intrusion');
    END IF;
END$$;

-- 2. Create Table
CREATE TABLE IF NOT EXISTS public.intrusi_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
    event_class public.intrusi_event_class NOT NULL,
    confidence DECIMAL(5,4),
    payload JSONB,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Indexes
CREATE INDEX IF NOT EXISTS idx_intrusi_logs_device_id ON public.intrusi_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_intrusi_logs_timestamp ON public.intrusi_logs(timestamp DESC);

-- 4. Enable RLS
ALTER TABLE public.intrusi_logs ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.intrusi_logs;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.intrusi_logs;
DROP POLICY IF EXISTS "Service role can do all" ON public.intrusi_logs;

CREATE POLICY "Enable read access for authenticated users" ON public.intrusi_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.intrusi_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service role can do all" ON public.intrusi_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Enable Realtime
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.intrusi_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- 7. Grant Permissions
GRANT SELECT, INSERT ON public.intrusi_logs TO authenticated;
GRANT ALL ON public.intrusi_logs TO service_role;
`;
    
    console.log(sql);
    console.log("=".repeat(60));
    console.log("\n🔗 Supabase Dashboard URL:");
    console.log(`   ${supabaseUrl!.replace('.supabase.co', '.supabase.co/project/')}/sql/new`);
    
  } catch (error) {
    console.error("❌ Migration error:", error);
    process.exit(1);
  }
}

runMigration()
  .then(() => {
    console.log("\n✅ Migration check complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  });
