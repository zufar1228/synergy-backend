const { Pool } = require('pg');
const p = new Pool({
  connectionString: 'postgresql://postgres.yjgguuekranauuvxjbkh:11111111@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
});

(async () => {
  // 1. calibration_statistics — per session+trial stats
  //    Combines calibration_raw (B/C/D) with calibration_summary (A)
  await p.query(`
    CREATE OR REPLACE VIEW calibration_statistics AS
    -- Sessions B/C/D: per-sample stats from calibration_raw
    SELECT session, trial,
      count(*) AS n_samples,
      round(min(delta_g)::numeric, 4) AS dg_min,
      round(max(delta_g)::numeric, 4) AS dg_max,
      round(avg(delta_g)::numeric, 4) AS dg_mean,
      round(stddev(delta_g)::numeric, 4) AS dg_stddev
    FROM calibration_raw
    WHERE marker IS NULL
    GROUP BY session, trial

    UNION ALL

    -- Session A: re-aggregate from 5-second summaries
    SELECT session, trial,
      sum(n_samples)::bigint AS n_samples,
      round(min(dg_min)::numeric, 4) AS dg_min,
      round(max(dg_max)::numeric, 4) AS dg_max,
      round((sum(dg_mean * n_samples) / nullif(sum(n_samples), 0))::numeric, 4) AS dg_mean,
      NULL::numeric AS dg_stddev
    FROM calibration_summary
    GROUP BY session, trial

    ORDER BY session, trial;
  `);
  console.log('✓ calibration_statistics updated');

  // 2. calibration_session_stats — per session aggregate
  await p.query(`
    CREATE OR REPLACE VIEW calibration_session_stats AS
    -- Sessions B/C/D: from calibration_raw
    SELECT session,
      count(*) AS total_samples,
      count(DISTINCT trial) AS n_trials,
      round(min(delta_g)::numeric, 4) AS dg_min,
      round(max(delta_g)::numeric, 4) AS dg_max,
      round(avg(delta_g)::numeric, 4) AS dg_mean,
      round(stddev(delta_g)::numeric, 4) AS dg_stddev,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY delta_g)::numeric, 4) AS dg_median,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY delta_g)::numeric, 4) AS dg_p95,
      round(percentile_cont(0.99) WITHIN GROUP (ORDER BY delta_g)::numeric, 4) AS dg_p99
    FROM calibration_raw
    WHERE marker IS NULL
    GROUP BY session

    UNION ALL

    -- Session A: re-aggregate from summaries
    SELECT session,
      sum(n_samples)::bigint AS total_samples,
      count(DISTINCT trial)::bigint AS n_trials,
      round(min(dg_min)::numeric, 4) AS dg_min,
      round(max(dg_max)::numeric, 4) AS dg_max,
      round((sum(dg_mean * n_samples) / nullif(sum(n_samples), 0))::numeric, 4) AS dg_mean,
      NULL::numeric AS dg_stddev,
      NULL::numeric AS dg_median,
      NULL::numeric AS dg_p95,
      NULL::numeric AS dg_p99
    FROM calibration_summary
    GROUP BY session

    ORDER BY session;
  `);
  console.log('✓ calibration_session_stats updated');

  // 3. calibration_trial_peaks — per trial peak Δg
  await p.query(`
    CREATE OR REPLACE VIEW calibration_trial_peaks AS
    -- B/C/D: peak from raw samples
    SELECT session, trial,
      round(max(delta_g)::numeric, 4) AS dg_peak,
      count(*) AS n_samples
    FROM calibration_raw
    WHERE marker IS NULL
    GROUP BY session, trial

    UNION ALL

    -- Session A: peak from summary max values
    SELECT session, trial,
      round(max(dg_max)::numeric, 4) AS dg_peak,
      sum(n_samples)::bigint AS n_samples
    FROM calibration_summary
    GROUP BY session, trial

    ORDER BY session, trial;
  `);
  console.log('✓ calibration_trial_peaks updated');

  // 4. calibration_peak_summary — per session peak stats
  await p.query(`
    CREATE OR REPLACE VIEW calibration_peak_summary AS
    SELECT session,
      count(DISTINCT trial) AS n_trials,
      round(min(peak)::numeric, 4) AS peak_min,
      round(max(peak)::numeric, 4) AS peak_max,
      round(avg(peak)::numeric, 4) AS peak_mean,
      round(stddev(peak)::numeric, 4) AS peak_stddev
    FROM (
      -- B/C/D peaks from raw
      SELECT session, trial, max(delta_g) AS peak
      FROM calibration_raw WHERE marker IS NULL
      GROUP BY session, trial

      UNION ALL

      -- Session A peaks from summary
      SELECT session, trial, max(dg_max) AS peak
      FROM calibration_summary
      GROUP BY session, trial
    ) sub
    GROUP BY session
    ORDER BY session;
  `);
  console.log('✓ calibration_peak_summary updated');

  // Verify
  console.log('\n=== VERIFICATION ===');
  for (const v of ['calibration_statistics', 'calibration_session_stats', 'calibration_trial_peaks', 'calibration_peak_summary']) {
    const r = await p.query('SELECT * FROM ' + v + ' LIMIT 3');
    console.log(v, ':', r.rows.length, 'rows', r.rows.length > 0 ? JSON.stringify(r.rows[0]) : '(empty)');
  }

  p.end();
})().catch(e => { console.error('ERROR:', e.message); p.end(); });
