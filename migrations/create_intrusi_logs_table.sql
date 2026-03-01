-- Migration: Create intrusi_logs table for door security system (spec v18)
-- Rule-based passive door security: reed switch + IMU (MPU6050), no ML

CREATE TABLE IF NOT EXISTS intrusi_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Event classification
  event_type TEXT NOT NULL,
  -- CHECK (event_type IN ('IMPACT_WARNING','FORCED_ENTRY_ALARM','UNAUTHORIZED_OPEN','POWER_SOURCE_CHANGED','CALIB_SAVED','CALIB_ABORTED','SIREN_SILENCED','ARM','DISARM')),

  -- System state at time of event
  system_state TEXT NOT NULL,  -- ARMED / DISARMED
  door_state   TEXT NOT NULL,  -- OPEN / CLOSED

  -- IMU impact data (nullable — only present for IMPACT_WARNING / FORCED_ENTRY_ALARM)
  peak_delta_g REAL,
  hit_count    INTEGER,

  -- Full MQTT payload preserved for audit
  payload JSONB,

  -- Acknowledgement workflow (same pattern as keamanan_logs)
  status TEXT NOT NULL DEFAULT 'unacknowledged'
    CHECK (status IN ('unacknowledged','acknowledged','resolved','false_alarm')),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  notes TEXT,
  notification_sent_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_intrusi_logs_device_id ON intrusi_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_intrusi_logs_timestamp ON intrusi_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_intrusi_logs_event_type ON intrusi_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_intrusi_logs_status ON intrusi_logs(status);

-- Enable Supabase Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE intrusi_logs;
