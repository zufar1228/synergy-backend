-- Migration: Create lingkungan_logs and prediction_results tables
-- Run against your Supabase PostgreSQL database

-- Table: lingkungan_logs (raw_sensor_data for environmental monitoring)
CREATE TABLE IF NOT EXISTS lingkungan_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    co2 REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'unacknowledged'
        CHECK (status IN ('unacknowledged', 'acknowledged', 'resolved', 'false_alarm')),
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    notes TEXT,
    notification_sent_at TIMESTAMPTZ
);

-- Indexes for fast queries
CREATE INDEX idx_lingkungan_logs_device_id ON lingkungan_logs(device_id);
CREATE INDEX idx_lingkungan_logs_timestamp ON lingkungan_logs(timestamp DESC);
CREATE INDEX idx_lingkungan_logs_device_timestamp ON lingkungan_logs(device_id, timestamp DESC);

-- Table: prediction_results (ML inference results)
CREATE TABLE IF NOT EXISTS prediction_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    predicted_temperature REAL NOT NULL,
    predicted_humidity REAL NOT NULL,
    predicted_co2 REAL NOT NULL,
    prediction_horizon_min INTEGER NOT NULL DEFAULT 15,
    fan_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    dehumidifier_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    alert_sent BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes
CREATE INDEX idx_prediction_results_device_id ON prediction_results(device_id);
CREATE INDEX idx_prediction_results_timestamp ON prediction_results(timestamp DESC);
CREATE INDEX idx_prediction_results_device_timestamp ON prediction_results(device_id, timestamp DESC);

-- Enable Realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE lingkungan_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE prediction_results;

-- Add lingkungan-specific columns to devices table
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS fan_state TEXT DEFAULT 'OFF',
    ADD COLUMN IF NOT EXISTS dehumidifier_state TEXT DEFAULT 'OFF',
    ADD COLUMN IF NOT EXISTS last_temperature REAL,
    ADD COLUMN IF NOT EXISTS last_humidity REAL,
    ADD COLUMN IF NOT EXISTS last_co2 REAL,
    ADD COLUMN IF NOT EXISTS control_mode TEXT DEFAULT 'AUTO'
        CHECK (control_mode IN ('AUTO', 'MANUAL')),
    ADD COLUMN IF NOT EXISTS manual_override_until TIMESTAMPTZ;
