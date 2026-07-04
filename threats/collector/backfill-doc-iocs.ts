// backfill-doc-iocs.ts — Extract IOCs from existing document content
// One-shot script. Reads all documents with content, regex-extracts IPs/domains/URLs/hashes,
// inserts into iocs + document_iocs. Idempotent via unique constraint.
// Uses shared extractIOCs from extract-iocs-from-text.ts so the filter set is consistent.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { extractIOCs } from './extract-iocs-from-text.js';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows: docs } = await pool.query<any>(
    `SELECT id, title, content FROM documents
     WHERE content IS NOT NULL AND length(content) > 50
     ORDER BY id DESC`
  );
  console.log(`[backfill] processing ${docs.length} documents...`);

  let docCount = 0;
  let iocInserted = 0;
  let linkInserted = 0;
  let errors = 0;
  const t0 = Date.now();

  for (const doc of docs) {
    try {
      const iocs = extractIOCs(doc.content + ' ' + (doc.title || ''));
      if (iocs.length === 0) { docCount++; continue; }
      for (const i of iocs) {
        try {
          const r = await pool.query(
            `INSERT INTO iocs (value, type, document_id, source_id, confidence, ai_related, meta)
             VALUES ($1, $2, $3, NULL, 0.6, FALSE, $4)
             ON CONFLICT (value, type, document_id) DO NOTHING
             RETURNING id`,
            [i.value, i.type, doc.id, JSON.stringify({ extraction: 'document_content', doc_id: doc.id })]
          );
          if (r.rowCount && r.rowCount > 0) {
            iocInserted++;
            await pool.query(
              `INSERT INTO document_iocs (document_id, ioc_id) VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [doc.id, r.rows[0].id]
            );
            linkInserted++;
          }
        } catch (e: any) {
          errors++;
          if (errors <= 3) console.error(`  [doc ${doc.id}] insert error: ${e.message}`);
        }
      }
    } catch (e: any) {
      errors++;
    }
    docCount++;
    if (docCount % 100 === 0) console.log(`  [${docCount}/${docs.length}] IOCs: ${iocInserted}, links: ${linkInserted}`);
  }

  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[backfill] done in ${sec}s. docs=${docCount} iocs_inserted=${iocInserted} links=${linkInserted} errors=${errors}`);

  // Recompute documents.ioc_count for docs that gained links
  console.log('[backfill] recomputing documents.ioc_count...');
  await pool.query(`
    UPDATE documents d SET ioc_count = COALESCE(sub.cnt, 0)
    FROM (
      SELECT document_id, COUNT(*) AS cnt
      FROM document_iocs
      WHERE document_id IS NOT NULL
      GROUP BY document_id
    ) sub
    WHERE d.id = sub.document_id
  `);
  await pool.query(`UPDATE documents SET ioc_count = 0 WHERE ioc_count IS NULL`);
  console.log('[backfill] ioc_count recomputed.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });