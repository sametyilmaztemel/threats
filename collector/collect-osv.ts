// collect-osv.ts — OSV.dev ekosistem güvenlik kayıtları
// Her ekosistemin all.zip'ini indir → advisory JSON'ları stream ile oku
//  - CVE alias'li kayıtlar → cve_enrichment'a upsert (yeni CVE'ler!)
//  - CVE'siz kayıtlar → documents'a 'package_vulns' kategorisi
// Kaynak: https://osv-vulnerabilities.storage.googleapis.com/{ECO}/all.zip
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { createWriteStream } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import { spawn } from 'child_process';
import { Readable } from 'stream';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[osv] ${m}`);

const BASE = 'https://osv-vulnerabilities.storage.googleapis.com';
// OSV.dev ekosistem güvenlik kayıtları (toplu döküm).
// Sadece all.zip içeriği zip-of-JSON olan ekosistemler: PyPI, crates.io, Go, NuGet, Maven, OSS-Fuzz
// npm/Maven/Debian/Ubuntu dökümleri farklı layout (NDJSON partitioned) — destek eklenmedi
// (Maven all.zip standart zip ama formatı farklı parse gerektirir)
const DEFAULT_ECOS = 'PyPI,crates.io,Go,NuGet,OSS-Fuzz,Maven';
// Kullanıcı override edebilir (OSV_ECOS env)
const ECOS = (process.env.OSV_ECOS || DEFAULT_ECOS).split(',');

// Streaming download: zip'i memory'de tutmadan diske yaz (büyük zip'ler için)
async function downloadToFile(url: string, dest: string): Promise<void> {
  const resp = await fetch(url, { headers: { 'User-Agent': 'threats.0rce.com/1.0' }, signal: AbortSignal.timeout(600000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  if (!resp.body) throw new Error('no body');
  const stream = Readable.fromWeb(resp.body as any);
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(dest);
    stream.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
    stream.on('error', reject);
  });
}

// Disk dostu: zip'i fetch'le dosya yaz, extract et, dosyayı sil
function extractZipToDir(zipPath: string, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('unzip', ['-q', '-o', zipPath, '-d', dir]);
    p.on('exit', (c) => c === 0 ? resolve() : reject(new Error(`unzip exit ${c}`)));
    p.on('error', reject);
  });
}

async function main() {
  const sourceId = (await pool.query(`SELECT id FROM sources WHERE name ILIKE '%osv%'`)).rows[0]?.id;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osv-'));
  let totalAdvisories = 0, cveUpserted = 0, docsInserted = 0;

  for (const eco of ECOS) {
    const zipPath = path.join(tmp, `${eco}.zip`);
    const outDir = path.join(tmp, eco);
    try {
      log(`indiriliyor: ${eco}/all.zip (streaming)...`);
      await downloadToFile(`${BASE}/${eco}/all.zip`, zipPath);
      const stat = fs.statSync(zipPath);
      log(`  ${eco}: zip indi (${(stat.size / 1e6).toFixed(1)}MB) — extract ediliyor...`);
      fs.mkdirSync(outDir, { recursive: true });
      await extractZipToDir(zipPath, outDir);
      // Zip'i hemen sil — disk kazanç
      try { fs.unlinkSync(zipPath); } catch {}
      const files = fs.readdirSync(outDir).filter(f => f.endsWith('.json'));
      log(`  ${eco}: ${files.length} advisory dosyası`);

      let batch: any[] = [];
      const flush = async () => {
        for (const adv of batch) {
          const aliases: string[] = adv.aliases || [];
          const cveId = aliases.find((a: string) => /^CVE-\d{4}-\d{4,7}$/i.test(a));
          const desc = adv.details || adv.summary || '';
          const published = adv.published ? adv.published.slice(0, 10) : null;
          const cvss = adv.severity?.find((s: any) => s.type === 'CVSS_V3')?.score
            ?? adv.severity?.find((s: any) => s.type === 'CVSS_V4')?.score
            ?? null;

          if (cveId) {
            // CVE alias'li → cve_enrichment'a
            await pool.query(
              `INSERT INTO cve_enrichment (cve_id, cvss_v3, description, published_date, last_enriched_at)
               VALUES ($1, $2, $3, $4, NOW())
               ON CONFLICT (cve_id) DO UPDATE SET
                 description = COALESCE(EXCLUDED.description, cve_enrichment.description),
                 cvss_v3 = COALESCE(EXCLUDED.cvss_v3, cve_enrichment.cvss_v3),
                 published_date = COALESCE(EXCLUDED.published_date, cve_enrichment.published_date),
                 last_enriched_at = NOW()`,
              [cveId.toUpperCase(), cvss != null ? Number(cvss) : null, desc.slice(0, 4000), published]
            );
            cveUpserted++;
          } else if (sourceId) {
            // CVE'siz → documents (package_vulns kategorisi)
            const title = `${adv.summary || adv.id} [${adv.id}]`;
            const url = adv.references?.[0]?.url || `https://osv.dev/vulnerability/${adv.id}`;
            await pool.query(
              `INSERT INTO documents (source_id, external_id, title, url, content, summary, published_at, fetched_at, severity, category, tags, cves, ai_threat, tlp, word_count, hash)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 5, ARRAY['package_vulns'], ARRAY['osv', 'package'], $8, $9, 'GREEN', $10, $11)
               ON CONFLICT (url) DO NOTHING`,
              [
                sourceId, adv.id, title, url, desc, adv.summary || '',
                published ? new Date(published) : new Date(),
                cveId ? [cveId] : [], 
                /ai|llm|ml|gpt|openai|anthropic|langchain|tensorflow|pytorch|transformers|huggingface/i.test(desc),
                desc.split(/\s+/).length,
                Buffer.from(url).toString('base64').slice(0, 64),
              ]
            );
            docsInserted++;
          }
        }
        batch = [];
      };

      for (const f of files) {
        try {
          const adv = JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8'));
          batch.push(adv);
          totalAdvisories++;
          if (batch.length >= 100) await flush();
        } catch { /* tek dosya hatalı — atla */ }
      }
      await flush();
      log(`  ${eco}: ${cveUpserted} CVE upsert, ${docsInserted} doküman (kümülatif)`);
    } catch (e: any) {
      log(`  ${eco}: HATA ${e.message}`);
    }
  }

  log(`TAMAM: ${totalAdvisories} advisory işlendi, ${cveUpserted} CVE upsert, ${docsInserted} doküman`);
  fs.rmSync(tmp, { recursive: true, force: true });
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
