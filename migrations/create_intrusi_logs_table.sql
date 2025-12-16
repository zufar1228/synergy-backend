-- ============================================================================
-- INTRUSI LOGS TABLE FOR TINYML INTRUSION DETECTION
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Buat Enum untuk Kelas Event TinyML
-- Jika sudah ada, ini akan error (bisa diabaikan)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intrusi_event_class') THEN
        CREATE TYPE public.intrusi_event_class AS ENUM ('Normal', 'Disturbance', 'Intrusion');
    END IF;
END$$;

-- 2. Buat Tabel Logs Intrusi
CREATE TABLE IF NOT EXISTS public.intrusi_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
    event_class public.intrusi_event_class NOT NULL, -- Hasil klasifikasi ML
    confidence DECIMAL(5,4), -- Score 0.0 sampai 1.0
    payload JSONB, -- Data tambahan (opsional, misal raw values sesaat)
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- 3. Buat Index untuk query performa
CREATE INDEX IF NOT EXISTS idx_intrusi_logs_device_id ON public.intrusi_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_intrusi_logs_timestamp ON public.intrusi_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_intrusi_logs_event_class ON public.intrusi_logs(event_class);

-- 4. Aktifkan RLS (Keamanan)
ALTER TABLE public.intrusi_logs ENABLE ROW LEVEL SECURITY;

-- 5. Policy Akses (Buka untuk Authenticated User)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.intrusi_logs;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.intrusi_logs;

CREATE POLICY "Enable read access for authenticated users" 
    ON public.intrusi_logs 
    FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Enable insert for authenticated users" 
    ON public.intrusi_logs 
    FOR INSERT 
    TO authenticated 
    WITH CHECK (true);

-- 6. Allow service_role to bypass RLS (untuk backend)
DROP POLICY IF EXISTS "Service role can do all" ON public.intrusi_logs;
CREATE POLICY "Service role can do all"
    ON public.intrusi_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 7. Tambahkan ke Realtime Subscription Supabase
-- (Jika privilege cukup, atau lakukan manual di Dashboard: Database -> Replication -> intrusi_logs -> ON)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.intrusi_logs;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'Table already added to supabase_realtime publication';
END$$;

-- 8. Grant permissions
GRANT SELECT, INSERT ON public.intrusi_logs TO authenticated;
GRANT ALL ON public.intrusi_logs TO service_role;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Jalankan query ini untuk memastikan tabel berhasil dibuat:
-- SELECT * FROM public.intrusi_logs LIMIT 5;
