import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const v = `http://test-${Date.now()}.com/x`;
  console.log('value:', v);
  try {
    const r = await pool.query(
      `INSERT INTO iocs (value, type, first_seen, last_seen, document_id, source_id, confidence, tags, ai_related, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (value, type, document_id) DO NOTHING
       RETURNING id`,
      [v, 'malicious_url', null, null, null, 1, 0.8, [], false, JSON.stringify({test:true})]
    );
    console.log('rowCount:', r.rowCount, 'rows:', r.rows);
  } catch (e: any) {
    console.error('ERROR:', e.message);
    console.error('position:', e.position);
    console.error('SQL:', (e as any).query || 'n/a');
  }
  await pool.end();
})();
