// push-misp.ts — STIX export'u MISP/OpenCTI'ye iletir (opsiyonel)
// Gereksinimler: MISP_URL + MISP_AUTH_KEY env'leri (yoksa sadece STIX üretir)
// İşleyiş: son 24 saatlik IOC'ler → STIX 2.1 bundle → MISP REST /attributes/add
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[push-misp] ${m}`);

const MISP_URL = process.env.MISP_URL || '';
const MISP_KEY = process.env.MISP_AUTH_KEY || '';
const HOURS = 24;

function stixPattern(value: string, type: string): string {
  if (type.includes('ip')) return `[ipv4-addr:value = '${value}']`;
  if (type.includes('url')) return `[url:value = '${value}']`;
  if (type.includes('domain')) return `[domain-name:value = '${value}']`;
  if (type.includes('sha256')) return `[file:hashes.'SHA-256' = '${value}']`;
  if (type.includes('sha1')) return `[file:hashes.'SHA-1' = '${value}']`;
  if (type.includes('md5')) return `[file:hashes.'MD5' = '${value}']`;
  return `[indicator:value = '${value}']`;
}

async function main() {
  // Son 24 saat IOC'leri
  const { rows } = await pool.query<any>(
    `SELECT i.value, i.type, i.confidence, s.name as source_name
     FROM iocs i LEFT JOIN sources s ON i.source_id = s.id
     WHERE i.created_at > NOW() - ($1 || ' hours')::interval
     ORDER BY i.created_at DESC LIMIT 500`,
    [HOURS]
  );
  log(`${rows.length} IOC (son ${HOURS} saat)`);
  if (rows.length === 0) { await pool.end(); return; }

  // STIX bundle üret
  const bundle = {
    type: 'bundle', id: `bundle--${crypto.randomUUID()}`,
    spec_version: '2.1',
    objects: rows.map((r: any) => ({
      type: 'indicator', id: `indicator--${crypto.randomUUID()}`,
      pattern: stixPattern(r.value, r.type),
      created: new Date().toISOString(), modified: new Date().toISOString(),
      valid_from: new Date().toISOString(),
      confidence: r.confidence != null ? Math.round(r.confidence * 100) : 80,
      labels: [r.type],
      x_source: r.source_name || 'threats.0rce.com',
    })),
  };

  // STIX'i reports/ dizinine kaydet (her koşuda güncel export)
  try {
    const fs = await import('fs');
    const dir = process.env.REPORT_DIR || '/app/reports';
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/iocs-latest-stix.json`, JSON.stringify(bundle, null, 2));
    log(`STIX bundle yazıldı: ${dir}/iocs-latest-stix.json (${rows.length} indicator)`);
  } catch (e: any) { log(`STIX yazma hata: ${e.message}`); }

  // MISP'e push (opsiyonel)
  if (MISP_URL && MISP_KEY) {
    let pushed = 0;
    for (const r of rows) {
      try {
        const resp = await fetch(`${MISP_URL}/attributes/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': MISP_KEY,
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            Attribute: {
              type: r.type,
              value: r.value,
              category: 'Network activity',
              to_ids: true,
              comment: `threats.0rce.com · ${r.source_name || ''}`,
            },
          }),
        });
        if (resp.ok) pushed++;
        else log(`MISP ${resp.status} for ${r.value.slice(0, 40)}`);
      } catch (e: any) { log(`MISP hata: ${e.message}`); break; }
    }
    log(`MISP'e push: ${pushed}/${rows.length}`);
  } else {
    log('MISP_URL/AUTH_KEY tanımsız — sadece STIX bundle üretildi (.env.example\'a ekle)');
  }

  await pool.end();
  log('TAMAM');
}

main().catch(e => { console.error(e); process.exit(1); });
