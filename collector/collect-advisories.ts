// collect-advisories.ts — GHSA (GitHub Security Advisories) → documents
// GitHub'ın public advisory API'si (key gerektirmez, rate-limit 60/h unauth)
// Doküman olarak ekler: title, url, cves, severity, published_at
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const USER_AGENT = 'threats.0rce.com/1.0 (+https://threats.0rce.com)';

async function fetchJSON(url: string): Promise<any> {
  const r = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function main() {
  // GHSA source id'sini sources tablosundan al
  const src = await pool.query(`SELECT id FROM sources WHERE name='GHSA' LIMIT 1`);
  const sourceId = src.rows[0]?.id;
  if (!sourceId) {
    console.log('[advisories] GHSA kaynağı bulunamadı — iptal');
    await pool.end();
    return;
  }

  // Son 3 günün advisory'leri (paginated)
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  let page = 1;
  let inserted = 0;
  let total = 0;

  while (page <= 3) { // max 3 sayfa (60 advisory/sayfa → 180)
    const url = `https://api.github.com/advisories?updated_since=${encodeURIComponent(since)}&per_page=60&page=${page}`;
    let advisories: any[];
    try {
      advisories = await fetchJSON(url);
    } catch (e) {
      console.log(`[advisories] sayfa ${page} hata: ${(e as Error).message}`);
      break;
    }
    if (!Array.isArray(advisories) || advisories.length === 0) break;

    for (const adv of advisories) {
      const ghsaId = adv.ghsa_id;
      const cveId = adv.cve_id;
      const title = `${adv.summary} (${ghsaId})`;
      const url = adv.html_url || `https://github.com/advisories/${ghsaId}`;
      const severity = adv.severity; // 'critical' | 'high' | 'moderate' | 'low'
      const sevNum = severity === 'critical' ? 9 : severity === 'high' ? 7 : severity === 'moderate' ? 5 : 2;
      const publishedAt = adv.published_at ? new Date(adv.published_at) : new Date();
      const content = [
        adv.summary,
        ...(adv.description ? [adv.description] : []),
        ...(adv.identifiers?.map((i: any) => `${i.type}: ${i.value}`) || []),
        `Severity: ${severity}`,
        ...(adv.vulnerabilities?.map((v: any) => `Package: ${v.package?.name || ''} ${v.package?.ecosystem || ''} | Patched: ${v.patched_versions || 'none'}`) || []),
      ].join('\n');

      // Eklenmiş mi kontrol et (external_id = ghsa_id)
      const exists = await pool.query(`SELECT id FROM documents WHERE external_id=$1`, [ghsaId]);
      if (exists.rowCount && exists.rowCount > 0) continue;

      await pool.query(
        `INSERT INTO documents (source_id, external_id, title, url, content, summary, published_at, fetched_at, severity, confidence, category, tags, cves, ai_threat, tlp, word_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, 0.9, ARRAY['advisory'], ARRAY['ghsa','security-advisory'], $9, $10, 'GREEN', $11)`,
        [
          sourceId,
          ghsaId, title, url, content, adv.summary || '',
          publishedAt, sevNum,
          cveId ? [cveId] : [],
          /gpt|llm|claude|openai|anthropic|machine learning|tensorflow|pytorch|transformer/i.test(`${adv.summary} ${adv.description || ''}`),
          content.split(/\s+/).length,
        ]
      );
      inserted++;
      total++;
    }
    console.log(`[advisories] sayfa ${page}: ${advisories.length} advisory (${inserted} yeni)`);
    page++;
    await new Promise(r => setTimeout(r, 1500)); // rate-limit koruması
  }

  console.log(`[advisories] TAMAM: ${inserted} yeni advisory dokümanı`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
