-- ============================================================================
--  CALIBRATION TABLES — Supabase SQL Migration
--  Purpose: Store MPU6050 vibration profile data for threshold calibration
--  Run this in Supabase SQL Editor BEFORE using the calibration firmware
-- ============================================================================
DROP TABLE IF EXISTS calibration_raw CASCADE;
DROP TABLE IF EXISTS calibration_summary CASCADE;
DROP TABLE IF EXISTS calibration_device_status CASCADE;
-- Tabel data mentah (Sesi B/C/D — setiap sampel)
CREATE TABLE calibration_raw (
  id          BIGSERIAL PRIMARY KEY,
  session     TEXT NOT NULL,
  trial       INTEGER NOT NULL,
  ts_device   BIGINT,
  ts_human    TEXT,
  ts_iso      TEXT,
  delta_g     REAL NOT NULL,
  marker      TEXT,
  note        TEXT,
  device_id   TEXT DEFAULT 'xiao-s3-01',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Tabel ringkasan (Sesi A — periodik 5 detik, atau final summary)
CREATE TABLE calibration_summary (
  id            BIGSERIAL PRIMARY KEY,
  session       TEXT NOT NULL,
  trial         INTEGER DEFAULT 1,
  summary_type  TEXT NOT NULL,
  dg_min        REAL NOT NULL,
  dg_max        REAL NOT NULL,
  dg_mean       REAL NOT NULL,
  n_samples     INTEGER NOT NULL,
  window_ms     BIGINT,
  device_id     TEXT DEFAULT 'xiao-s3-01',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Tabel status device kalibrasi (heartbeat setiap 1 menit)
CREATE TABLE calibration_device_status (
  id            BIGSERIAL PRIMARY KEY,
  session       TEXT,
  recording     BOOLEAN,
  trial         INTEGER,
  uptime_sec    BIGINT,
  wifi_rssi     INTEGER,
  free_heap     INTEGER,
  offline_buf   INTEGER,
  device_id     TEXT DEFAULT 'xiao-s3-01',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_raw_session ON calibration_raw (session);
CREATE INDEX idx_raw_session_trial ON calibration_raw (session, trial);
CREATE INDEX idx_raw_created ON calibration_raw (created_at);
CREATE INDEX idx_summary_session ON calibration_summary (session);
CREATE INDEX idx_summary_created ON calibration_summary (created_at);

-- RLS — ESP32 boleh INSERT via anon key
ALTER TABLE calibration_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_device_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow ESP32 insert" ON calibration_raw
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow ESP32 insert" ON calibration_summary
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow ESP32 insert" ON calibration_device_status
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow read for authenticated" ON calibration_raw
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON calibration_summary
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON calibration_device_status
  FOR SELECT TO authenticated USING (true);

-- View statistik per trial
CREATE OR REPLACE VIEW calibration_statistics AS
SELECT
  session, trial,
  COUNT(*) AS n_samples,
  ROUND(MIN(delta_g)::numeric, 4) AS dg_min,
  ROUND(MAX(delta_g)::numeric, 4) AS dg_max,
  ROUND(AVG(delta_g)::numeric, 4) AS dg_mean,
  ROUND(STDDEV(delta_g)::numeric, 4) AS dg_stddev
FROM calibration_raw
GROUP BY session, trial
ORDER BY session, trial;

-- View statistik keseluruhan per sesi
CREATE OR REPLACE VIEW calibration_session_stats AS
SELECT
  session,
  COUNT(*) AS total_samples,
  COUNT(DISTINCT trial) AS n_trials,
  ROUND(MIN(delta_g)::numeric, 4) AS dg_min,
  ROUND(MAX(delta_g)::numeric, 4) AS dg_max,
  ROUND(AVG(delta_g)::numeric, 4) AS dg_mean,
  ROUND(STDDEV(delta_g)::numeric, 4) AS dg_stddev,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY delta_g)::numeric, 4) AS dg_median,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY delta_g)::numeric, 4) AS dg_p95,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY delta_g)::numeric, 4) AS dg_p99
FROM calibration_raw
GROUP BY session
ORDER BY session;
