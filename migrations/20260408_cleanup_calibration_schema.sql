-- ============================================================================
--  Migration: Cleanup calibration_raw schema
--  Date: 2026-04-08
--
--  Changes:
--    1. DROP dead column `ts_human` (never written by firmware)
--    2. Remove stale default 'xiao-s3-01' from device_id columns
--       (firmware now uses UUID for all tables)
--
--  Run in Supabase SQL Editor.
-- ============================================================================

-- 1. Drop dead column ts_human
ALTER TABLE calibration_raw DROP COLUMN IF EXISTS ts_human;

-- 2. Change device_id defaults (data should always be explicitly set)
ALTER TABLE calibration_raw ALTER COLUMN device_id DROP DEFAULT;
ALTER TABLE calibration_summary ALTER COLUMN device_id DROP DEFAULT;
ALTER TABLE calibration_device_status ALTER COLUMN device_id DROP DEFAULT;

-- 3. Make device_id NOT NULL to prevent accidental null inserts
ALTER TABLE calibration_raw ALTER COLUMN device_id SET NOT NULL;
ALTER TABLE calibration_summary ALTER COLUMN device_id SET NOT NULL;
ALTER TABLE calibration_device_status ALTER COLUMN device_id SET NOT NULL;
