// content-backfill.ts — Threats içerik katmanlarını prod seviyesine doldurur
// 7 katman: actors, document_actors, techniques, ai_threats, cve_enrichment, sectors, graph
// Çalıştırma: docker exec threats-worker npx tsx /app/collector/content-backfill.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[backfill] ${m}`);

// ── 1. Aktör tanımlarını zenginleştir + alias eşleştirme tablosu ──
const ACTORS: Record<string, { aliases: string[]; origin: string; type: string; targets: string[]; ttps: string[] }> = {
  'Conti':        { aliases: ['conti'], origin: 'Russia', type: 'ransomware-gang', targets: ['healthcare', 'government', 'finance'], ttps: ['Data Encrypted for Impact', 'Phishing'] },
  'LockBit':      { aliases: ['lockbit', 'lock bit'], origin: 'Russia', type: 'ransomware-gang', targets: ['finance', 'government'], ttps: ['Data Encrypted for Impact', 'Exploit Public-Facing Application'] },
  'Clop':         { aliases: ['clop', 'cl0p'], origin: 'Russia', type: 'ransomware-gang', targets: ['finance', 'healthcare'], ttps: ['Data Encrypted for Impact'] },
  'Lazarus':      { aliases: ['lazarus', 'hidden cobra', 'diamond sic'], origin: 'North Korea', type: 'apt', targets: ['finance', 'crypto'], ttps: ['Phishing', 'Valid Accounts'] },
  'Kimsuky':      { aliases: ['kimsuky', 'velvet chollima'], origin: 'North Korea', type: 'apt', targets: ['government', 'defense'], ttps: ['Phishing', 'Command and Scripting Interpreter'] },
  'Mustang Panda': { aliases: ['mustang panda', 'reddelta', 'honey myte'], origin: 'China', type: 'apt', targets: ['government', 'ngo'], ttps: ['Phishing', 'Command and Scripting Interpreter'] },
  'APT28':        { aliases: ['apt28', 'fancy bear', 'sofacy', 'forest blizzard'], origin: 'Russia', type: 'apt', targets: ['government', 'defense'], ttps: ['Phishing', 'Valid Accounts', 'Exploit Public-Facing Application'] },
  'APT29':        { aliases: ['apt29', 'cozy bear', 'midnight blizzard'], origin: 'Russia', type: 'apt', targets: ['government', 'technology'], ttps: ['Phishing', 'Valid Accounts'] },
  'Scattered Spider': { aliases: ['scattered spider', 'octo tempest', 'scattered spider'], origin: 'US', type: 'financially-motivated', targets: ['technology', 'telecom'], ttps: ['Valid Accounts', 'Phishing'] },
  'UNC3886':      { aliases: ['unc3886', 'barium'], origin: 'China', type: 'apt', targets: ['defense', 'telecom'], ttps: ['Command and Scripting Interpreter', 'Exploit Public-Facing Application'] },
};

// ── 2. Teknik keyword eşleştirme ──
const TECH_KEYWORDS: Record<string, string[]> = {
  'Command and Scripting Interpreter': ['powershell', 'cmd.exe', 'bash -c', 'scripting', 'wmic', 'rundll32', 'mshta'],
  'Phishing': ['phishing', 'spearphishing', 'spam campaign', 'malicious link', 'fake login'],
  'Exploit Public-Facing Application': ['cve-', 'exploit', 'zero-day', 'zeroday', 'vulnerability', 'rce', 'remote code execution', 'unpatched'],
  'Valid Accounts': ['valid account', 'credential stuffing', 'stolen credential', 'account takeover', 'mfa bypass'],
  'Data Encrypted for Impact': ['ransomware', 'encrypted', 'decrypt', 'double extortion', 'lockbit', 'conti', 'clop'],
  'LLM Prompt Injection': ['prompt injection', 'jailbreak', 'indirect prompt', 'llm injection'],
  'Exfiltration via Cyber Means': ['exfiltration', 'data theft', 'data leak', 'stolen data', 'dll sideloading', 'data exfil'],
  'Erode ML Model Integrity': ['model poisoning', 'data poisoning', 'adversarial attack', 'model integrity', 'backdoor model'],
  'Publish Poisoned Datasets': ['poisoned dataset', 'poisoned data', 'malicious dataset', 'huggingface malware', 'dataset poisoning'],
  'Poison Training Data': ['training data poisoning', 'poison training', 'data poisoning'],
};

// ── 3. Sektör keyword eşleştirme ──
const SECTOR_KEYWORDS: Record<string, string[]> = {
  'finance': ['bank', 'financial', 'fintech', 'crypto', 'bitcoin', 'payment', 'swift', 'atm', 'card'],
  'healthcare': ['healthcare', 'hospital', 'medical', 'clinic', 'pharma', 'health system', 'patient'],
  'government': ['government', 'state-sponsored', 'public sector', 'agency', 'ministry', 'election'],
  'defense': ['defense', 'military', 'missile', 'weapon', 'defence', 'army'],
  'technology': ['software', 'tech company', 'cloud', 'saas', 'developer', 'open source', 'github', 'android', 'ios'],
  'telecom': ['telecom', 'isp', 'mobile network', '5g', 'router', 'sim swap'],
  'energy': ['energy', 'power grid', 'utility', 'oil', 'gas', 'electricity', 'nuclear'],
  'retail': ['retail', 'e-commerce', 'ecommerce', 'shopping', 'store'],
};

// ── 4. AI tehdit kategorisi keyword eşleştirme ──
const AI_CATEGORIES: Record<string, string[]> = {
  'ai-abuse': ['deepfake', 'fraud', 'scam', 'abuse', 'misuse'],
  'prompt-injection': ['prompt injection', 'jailbreak', 'indirect prompt', 'tool poisoning'],
  'model-theft': ['model theft', 'model extraction', 'distill', 'steal model', 'api theft'],
  'data-poisoning': ['poison', 'corrupt', 'manipulate', 'backdoor'],
  'privacy-leak': ['leak', 'expose', 'privacy', 'personal data', 'training data'],
  'autonomous-weapon': ['weapon', 'drone', 'autonomous', 'military', 'targeting'],
  'content-safety': ['watermark', 'evasion', 'detection evasion', 'content filter', 'safety'],
  'research': ['research', 'paper', 'arxiv', 'benchmark', 'evaluation', 'training'],
};

async function main() {
  // ── A. Aktör zenginleştirme + eşleştirme ──
  log('A. Aktör zenginleştirme + doküman eşleştirme...');
  for (const [name, info] of Object.entries(ACTORS)) {
    await pool.query(
      `UPDATE actors SET aliases=$1, origin_country=$2, type=$3, targets=$4, ttps=$5, updated_at=NOW() WHERE name=$6`,
      [info.aliases, info.origin, info.type, info.targets, info.ttps, name]
    );
  }
  // Alias listesi: tüm aktörler
  const aliasMap: { name: string; alias: string }[] = [];
  for (const [name, info] of Object.entries(ACTORS)) {
    for (const a of info.aliases) aliasMap.push({ name, alias: a });
  }

  // Dokümanları tara → actors array + document_actors
  const { rows: docs } = await pool.query<any>(
    `SELECT id, title, COALESCE(content,'') as content FROM documents WHERE id > 0`
  );
  log(`  ${docs.length} doküman taranıyor...`);
  let actorLinks = 0;
  const actorCounts: Record<string, number> = {};
  for (const d of docs) {
    const text = (d.title + ' ' + d.content).toLowerCase();
    const matched = new Set<string>();
    for (const { name, alias } of aliasMap) {
      if (text.includes(alias)) matched.add(name);
    }
    if (matched.size > 0) {
      const arr = [...matched];
      await pool.query(`UPDATE documents SET actors=$1 WHERE id=$2`, [arr, d.id]);
      for (const a of arr) {
        await pool.query(
          `INSERT INTO document_actors (document_id, actor_id) SELECT $1, id FROM actors WHERE name=$2
           ON CONFLICT DO NOTHING`, [d.id, a]
        );
        actorCounts[a] = (actorCounts[a] || 0) + 1;
        actorLinks++;
      }
    }
  }
  // document_count güncelle
  for (const [name, count] of Object.entries(actorCounts)) {
    await pool.query(`UPDATE actors SET document_count=$1, updated_at=NOW() WHERE name=$2`, [count, name]);
  }
  log(`  ${actorLinks} aktör-doküman bağlantısı`);

  // ── B. Teknik eşleştirme ──
  log('B. Teknik eşleştirme...');
  let techLinks = 0;
  for (const d of docs) {
    const text = (d.title + ' ' + d.content).toLowerCase();
    const matched: string[] = [];
    for (const [tech, kws] of Object.entries(TECH_KEYWORDS)) {
      if (kws.some(k => text.includes(k))) matched.push(tech);
    }
    if (matched.length > 0) {
      await pool.query(`UPDATE documents SET techniques=$1 WHERE id=$2`, [matched, d.id]);
      for (const t of matched) {
        await pool.query(
          `INSERT INTO document_techniques (document_id, technique_id) SELECT $1, id FROM techniques WHERE name=$2
           ON CONFLICT DO NOTHING`, [d.id, t]
        );
        techLinks++;
      }
    }
  }
  log(`  ${techLinks} teknik-doküman bağlantısı`);

  // ── C. Sektör eşleştirme ──
  log('C. Sektör eşleştirme...');
  let sectorLinks = 0;
  for (const d of docs) {
    const text = (d.title + ' ' + d.content).toLowerCase();
    const matched: string[] = [];
    for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
      if (kws.some(k => text.includes(k))) matched.push(sector);
    }
    if (matched.length > 0) {
      await pool.query(`UPDATE documents SET sectors=$1 WHERE id=$2`, [matched, d.id]);
      sectorLinks += matched.length;
    }
  }
  log(`  ${sectorLinks} sektör etiketi`);

  // ── D. AI tehdit kayıtları ──
  log('D. ai_threats üretimi...');
  const { rows: aiDocs } = await pool.query<any>(
    `SELECT id, title, COALESCE(content,'') as content, severity, cves FROM documents WHERE ai_threat = true`
  );
  let aiInserted = 0;
  for (const d of aiDocs) {
    const text = (d.title + ' ' + d.content).toLowerCase();
    let category = 'ai-security';
    for (const [cat, kws] of Object.entries(AI_CATEGORIES)) {
      if (kws.some(k => text.includes(k))) { category = cat; break; }
    }
    const technique = d.content?.toLowerCase().includes('prompt injection') ? 'LLM Prompt Injection' : null;
    const cve = Array.isArray(d.cves) && d.cves.length > 0 ? d.cves[0] : null;
    await pool.query(
      `INSERT INTO ai_threats (document_id, ai_category, target_system, technique, severity, cve)
       VALUES ($1, $2, 'llm', $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [d.id, category, technique, d.severity, cve]
    );
    aiInserted++;
  }
  log(`  ${aiInserted} AI tehdit kaydı`);

  // ── E. CVE enrichment (NVD API) ──
  log('E. CVE enrichment (NVD)...');
  const { rows: cveRows } = await pool.query<any>(
    `SELECT DISTINCT cve_id FROM document_cves WHERE cve_id NOT IN (SELECT cve_id FROM cve_enrichment) LIMIT 2000`
  );
  let cveEnriched = 0;
  for (const row of cveRows) {
    const cveId = row.cve_id;
    try {
      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'threats.0rce.com/1.0' } });
      if (!resp.ok) { continue; }
      const data: any = await resp.json();
      const vuln = data?.vulnerabilities?.[0]?.cve;
      if (!vuln) continue;
      const metrics = vuln.metrics?.cvssMetricV31?.[0]?.cvssData || vuln.metrics?.cvssMetricV30?.[0]?.cvssData;
      const desc = vuln.descriptions?.find((x: any) => x.lang === 'en')?.value || '';
      const cpes = vuln.configurations?.[0]?.nodes?.[0]?.cpeMatch || [];
      const vendor = cpes[0]?.criteria?.split(':')[3] || '';
      const product = cpes[0]?.criteria?.split(':')[4] || '';
      await pool.query(
        `INSERT INTO cve_enrichment (cve_id, cvss_v3, description, vendor, product, published_date, last_enriched_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (cve_id) DO UPDATE SET cvss_v3=$2, description=$3, vendor=$4, product=$5, last_enriched_at=NOW()`,
        [cveId, metrics?.baseScore ?? null, desc, vendor, product, vuln.published || null]
      );
      cveEnriched++;
    } catch (e) {
      // rate limit veya ağ hatası — devam
    }
    await new Promise(r => setTimeout(r, 1200)); // NVD rate limit 5 req/s
  }
  log(`  ${cveEnriched} CVE zenginleştirildi`);

  // ── F. stats_summary yenile ──
  log('F. İstatistik yenileme...');
  await pool.query(`REFRESH MATERIALIZED VIEW IF EXISTS stats_summary`).catch(() => {});
  // actors.document_count: her aktörün adını içeren doküman sayısı
  await pool.query(`
    UPDATE actors a SET document_count = (
      SELECT COUNT(*) FROM documents d WHERE d.actors IS NOT NULL AND a.name = ANY(d.actors)
    ), updated_at = NOW()
  `);

  log('BACKFILL TAMAM');
  const final = await pool.query<any>(`SELECT
    (SELECT COUNT(*) FROM ai_threats) as ai,
    (SELECT COUNT(*) FROM document_actors) as d_actors,
    (SELECT COUNT(*) FROM document_techniques) as d_tech,
    (SELECT COUNT(*) FROM cve_enrichment) as cve,
    (SELECT COUNT(*) FROM documents WHERE sectors IS NOT NULL AND array_length(sectors,1)>0) as sectors`);
  console.log(final.rows[0]);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
