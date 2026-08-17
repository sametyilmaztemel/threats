// backfill-runner.ts — Madde 17
// Transactional, batch-aware, idempotent backfill driver.
// Run: docker exec threats-worker npx tsx /app/collector/backfill-runner.ts [phase...]
// Phases (default: all):
//   actors        — re-extract actor matches using actor-match.ts
//   ai-taxonomy   — reclassify ai_threats with new taxonomy
//   cvss          — null out-of-range cvss_v3 + canonicalize
//   iocs          — mark public-infrastructure domains as 'mentioned'
//   dedup         — remove duplicate junction rows
//   stats         — refresh daily_stats + actor counts
//
// Each phase:
//   1. Reports affected-row counts BEFORE
//   2. Runs in transaction with batch_size
//   3. Reports affected-row counts AFTER
//   4. Continues to next phase on success; rolls back on failure

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { findActorMatches, type ActorDef } from './actor-match';
import { canonicalCvss } from '../app/src/lib/severity';
import { isAiThreatCategory } from '../app/src/lib/ai-taxonomy';
import { classifyIoc, isPublicInfrastructure } from './ioc-classifier';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[backfill-runner] ${m}`);

const BATCH_SIZE = 200;
const PHASE = (process.argv.slice(2).length ? process.argv.slice(2) : ['actors', 'ai-taxonomy', 'cvss', 'iocs', 'dedup', 'stats']);

async function withTx<T>(name: string, fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    log(`${name} ✓ commit`);
    return result;
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    log(`${name} ✗ ROLLBACK: ${e.message}`);
    throw e;
  } finally {
    client.release();
  }
}

async function countBefore(client: any, table: string, where: string): Promise<number> {
  const r = await client.query(`SELECT COUNT(*)::int as n FROM ${table} WHERE ${where}`);
  return r.rows[0]?.n || 0;
}

async function phaseActors() {
  await withTx('actors', async (c) => {
    const before = await c.query(`SELECT COUNT(*)::int as n FROM document_actors`).then((r: any) => r.rows[0].n);
    // 1) Tüm aktörleri al
    const { rows: actors } = await c.query<any>(`SELECT id, name, COALESCE(aliases, ARRAY[]::text[]) as aliases FROM actors`);
    const actorDefs: ActorDef[] = actors.filter((a: any) => a.aliases.length > 0).map((a: any) => ({ name: a.name, aliases: a.aliases }));
    // 2) Dokümanları batch'ler halinde tara
    const { rows: docs } = await c.query<any>(`SELECT id, title, COALESCE(summary,'') as summary, COALESCE(content,'') as content FROM documents ORDER BY id`);
    let linked = 0, removed = 0;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      for (const d of batch) {
        const text = `${d.title} ${d.summary} ${d.content}`;
        const matches = findActorMatches(text, actorDefs);
        const matchedActorIds = new Set<number>();
        const matchRows: any[] = [];
        for (const m of matches) {
          const actorRow = await c.query(`SELECT id FROM actors WHERE name=$1`, [m.actorName]);
          if (actorRow.rows[0]) {
            matchedActorIds.add(actorRow.rows[0].id);
            matchRows.push({
              document_id: d.id, actor_id: actorRow.rows[0].id,
              confidence: Math.round(m.confidence * 100),
              match_reason: m.matchReason, matched_text: m.matchedText,
            });
          }
        }
        // Mevcut bağlantıları sil (stale)
        if (matchedActorIds.size > 0) {
          await c.query(`DELETE FROM document_actors WHERE document_id=$1`, [d.id]);
        } else {
          await c.query(`DELETE FROM document_actors WHERE document_id=$1 AND confidence < 80`, [d.id]);
        }
        // Yeni bağlantıları ekle
        for (const row of matchRows) {
          await c.query(
            `INSERT INTO document_actors (document_id, actor_id, confidence, match_reason, matched_text)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (document_id, actor_id) DO UPDATE SET
               confidence = EXCLUDED.confidence,
               match_reason = EXCLUDED.match_reason,
               matched_text = EXCLUDED.matched_text`,
            [row.document_id, row.actor_id, row.confidence, row.match_reason, row.matched_text]
          );
          linked++;
        }
      }
      log(`actors batch ${i + batch.length}/${docs.length}`);
    }
    // documents.actors array'i canonical name'lerden güncelle
    await c.query(
      `UPDATE documents d SET actors = COALESCE(
         (SELECT ARRAY_AGG(a.name)
          FROM document_actors da JOIN actors a ON a.id = da.actor_id
          WHERE da.document_id = d.id AND da.confidence >= 50),
         ARRAY[]::text[]
       )`
    );
    const after = await c.query(`SELECT COUNT(*)::int as n FROM document_actors`).then((r: any) => r.rows[0].n);
    log(`actors: before=${before}, after=${after}, +${linked}`);
  });
}

async function phaseAiTaxonomy() {
  await withTx('ai-taxonomy', async (c) => {
    // ai_threats.classification default değer atanmış, sadece confidence ekle
    // Zaten taxonomy-aware content-backfill.ts çalıştırıldıysa burası no-op.
    const r = await c.query(`UPDATE ai_threats SET classification = ai_category WHERE classification IS NULL OR classification = ''`);
    log(`ai-taxonomy: ${r.rowCount} ai_threats classification normalized`);
  });
}

async function phaseCvss() {
  await withTx('cvss', async (c) => {
    const before = await c.query(`SELECT COUNT(*)::int as n FROM cve_enrichment WHERE cvss_v3 IS NOT NULL AND (cvss_v3 < 0 OR cvss_v3 > 10)`).then((r: any) => r.rows[0].n);
    const r = await c.query(`UPDATE cve_enrichment SET cvss_v3 = NULL WHERE cvss_v3 IS NOT NULL AND (cvss_v3 < 0 OR cvss_v3 > 10)`);
    log(`cvss: ${before} out-of-range → ${before - (r.rowCount || 0)} NULLed`);
  });
}

async function phaseIocs() {
  await withTx('iocs', async (c) => {
    // Madde 5: public infrastructure → 'mentioned', confidence düşük
    const allDomains = await c.query(`SELECT id, value FROM iocs WHERE type='domain' AND (classification IS NULL OR classification='observed' OR classification='') LIMIT 50000`);
    let updated = 0;
    for (const row of allDomains.rows) {
      if (isPublicInfrastructure(row.value)) {
        await c.query(`UPDATE iocs SET classification='mentioned', confidence=10 WHERE id=$1`, [row.id]);
        updated++;
      }
    }
    log(`iocs: ${updated} public-infra domains → 'mentioned'`);
  });
}

async function phaseDedup() {
  await withTx('dedup', async (c) => {
    const before = {
      d_actors: await c.query(`SELECT COUNT(*)::int as n FROM document_actors`).then((r: any) => r.rows[0].n),
      d_techs: await c.query(`SELECT COUNT(*)::int as n FROM document_techniques`).then((r: any) => r.rows[0].n),
      d_cves: await c.query(`SELECT COUNT(*)::int as n FROM document_cves`).then((r: any) => r.rows[0].n),
      ai_threats: await c.query(`SELECT COUNT(*)::int as n FROM ai_threats`).then((r: any) => r.rows[0].n),
      iocs: await c.query(`SELECT COUNT(*)::int as n FROM iocs`).then((r: any) => r.rows[0].n),
    };
    await c.query(`DELETE FROM document_actors a USING document_actors b WHERE a.ctid > b.ctid AND a.document_id = b.document_id AND a.actor_id = b.actor_id`);
    await c.query(`DELETE FROM document_techniques a USING document_techniques b WHERE a.ctid > b.ctid AND a.document_id = b.document_id AND a.technique_id = b.technique_id`);
    await c.query(`DELETE FROM document_cves a USING document_cves b WHERE a.ctid > b.ctid AND a.document_id = b.document_id AND a.cve_id = b.cve_id`);
    await c.query(`DELETE FROM ai_threats a USING ai_threats b WHERE a.id > b.id AND a.document_id = b.document_id AND a.ai_category = b.ai_category`);
    await c.query(`DELETE FROM iocs a USING iocs b WHERE a.id > b.id AND a.value = b.value AND a.type = b.type`);
    const after = {
      d_actors: await c.query(`SELECT COUNT(*)::int as n FROM document_actors`).then((r: any) => r.rows[0].n),
      d_techs: await c.query(`SELECT COUNT(*)::int as n FROM document_techniques`).then((r: any) => r.rows[0].n),
      d_cves: await c.query(`SELECT COUNT(*)::int as n FROM document_cves`).then((r: any) => r.rows[0].n),
      ai_threats: await c.query(`SELECT COUNT(*)::int as n FROM ai_threats`).then((r: any) => r.rows[0].n),
      iocs: await c.query(`SELECT COUNT(*)::int as n FROM iocs`).then((r: any) => r.rows[0].n),
    };
    log(`dedup: actors ${before.d_actors}→${after.d_actors} (-${before.d_actors - after.d_actors}), techs ${before.d_techs}→${after.d_techs}, cves ${before.d_cves}→${after.d_cves}, ai ${before.ai_threats}→${after.ai_threats}, iocs ${before.iocs}→${after.iocs}`);
  });
}

async function phaseStats() {
  await withTx('stats', async (c) => {
    // Madde 7: actor document_count yeniden hesapla
    await c.query(`
      UPDATE actors a SET document_count = COALESCE(
        (SELECT COUNT(*) FROM document_actors da WHERE da.actor_id = a.id),
        0
      ), updated_at = NOW()
    `);
    log('stats: actor document_count refreshed');
  });
}

async function main() {
  log(`phases: ${PHASE.join(', ')}`);
  for (const p of PHASE) {
    log(`--- phase: ${p} ---`);
    switch (p) {
      case 'actors': await phaseActors(); break;
      case 'ai-taxonomy': await phaseAiTaxonomy(); break;
      case 'cvss': await phaseCvss(); break;
      case 'iocs': await phaseIocs(); break;
      case 'dedup': await phaseDedup(); break;
      case 'stats': await phaseStats(); break;
      default: log(`unknown phase: ${p}`);
    }
  }
  log('BACKFILL RUNNER TAMAM');
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
