-- Migration: Create proteksi_aset_logs table
-- Run this in Supabase SQL Editor

-- Create the proteksi_aset_logs table
CREATE TABLE IF NOT EXISTS proteksi_aset_logs (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    incident_type VARCHAR(50) NOT NULL CHECK (incident_type IN ('IMPACT', 'VIBRATION', 'THERMAL', 'WATER_LEAK', 'NORMAL')),
    confidence FLOAT,
    data JSONB NOT NULL DEFAULT '{}',
    is_cleared BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_proteksi_aset_logs_device_id ON proteksi_aset_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_proteksi_aset_logs_incident_type ON proteksi_aset_logs(incident_type);
CREATE INDEX IF NOT EXISTS idx_proteksi_aset_logs_is_cleared ON proteksi_aset_logs(is_cleared);
CREATE INDEX IF NOT EXISTS idx_proteksi_aset_logs_timestamp ON proteksi_aset_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_proteksi_aset_logs_created_at ON proteksi_aset_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE proteksi_aset_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust based on your auth setup)
-- Policy for authenticated users to read all logs
CREATE POLICY "Allow authenticated read access to proteksi_aset_logs"
ON proteksi_aset_logs
FOR SELECT
TO authenticated
USING (true);

-- Policy for service role to insert/update/delete
CREATE POLICY "Allow service role full access to proteksi_aset_logs"
ON proteksi_aset_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_proteksi_aset_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_proteksi_aset_logs_updated_at
    BEFORE UPDATE ON proteksi_aset_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_proteksi_aset_logs_updated_at();

-- Enable realtime for the table (for Supabase realtime subscriptions)
ALTER PUBLICATION supabase_realtime ADD TABLE proteksi_aset_logs;

-- Grant necessary permissions
GRANT ALL ON proteksi_aset_logs TO authenticated;
GRANT ALL ON proteksi_aset_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE proteksi_aset_logs_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE proteksi_aset_logs_id_seq TO service_role;

-- Comment on table
COMMENT ON TABLE proteksi_aset_logs IS 'Logs for Proteksi Aset system - TinyML incident detection (vibration/impact), thermal monitoring, and water leak detection';
