const { Pool } = require('pg');
const p = new Pool({
  connectionString: 'postgresql://postgres.yjgguuekranauuvxjbkh:11111111@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
});

(async () => {
  // List all calibration tables and views
  const r = await p.query(
    "SELECT table_name, table_type FROM information_schema.tables WHERE table_name LIKE 'calibration%' ORDER BY table_name"
  );
  console.log('=== TABLES/VIEWS ===');
  r.rows.forEach(x => console.log(x.table_type.padEnd(14), x.table_name));

  // Check counts for base tables
  console.log('\n=== ROW COUNTS ===');
  for (const t of r.rows.filter(x => x.table_type === 'BASE TABLE')) {
    try {
      const c = await p.query('SELECT COUNT(*) as n FROM ' + t.table_name);
      console.log(t.table_name, ':', c.rows[0].n, 'rows');
    } catch (e) {
      console.log(t.table_name, ': ERROR -', e.message);
    }
  }

  // Check view definitions
  console.log('\n=== VIEW DEFINITIONS ===');
  const v = await p.query("SELECT viewname, definition FROM pg_views WHERE viewname LIKE 'calibration%'");
  v.rows.forEach(x => {
    console.log('\n--', x.viewname);
    console.log(x.definition.trim());
  });

  p.end();
})().catch(e => { console.error('FATAL:', e.message); p.end(); });
