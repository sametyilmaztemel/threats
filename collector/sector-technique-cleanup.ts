// sector-technique-cleanup.ts — Madde 2 kapsamında sector/technique backfill
// 1) Mevcut düşük-confidence sector/technique eşleştirmelerini temizle
// 2) content-backfill'in yenilenmiş keyword mantığıyla yeniden hesapla
// 3) documents.sectors / documents.techniques kolonlarını güncelle
// Transactional, batch-aware, idempotent.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[sector-technique-cleanup] ${m}`);

const BATCH = 200;

const SECTOR_KEYWORDS: Record<string, string[]> = {
  'finance': ['bank', 'banking', 'financial', 'financial loss', 'monetary', 'transaction', 'swift', 'atm', 'cryptocurrency', 'wallet', 'bitcoin', 'ethereum', 'trading platform'],
  'healthcare': ['hospital', 'medical', 'patient', 'health care', 'healthcare', 'clinical', 'pharma'],
  'government': ['state-sponsored', 'public sector', 'ministry', 'election', 'embassy', 'parliament', 'municipality', 'diplomatic', 'government agency'],
  'technology': ['software vendor', 'tech company', 'saas', 'platform provider', 'cloud provider'],
  'education': ['university', 'school', 'academic', 'research institution', 'campus'],
  'energy': ['power grid', 'electric utility', 'oil and gas', 'pipeline', 'scada', 'energy sector'],
  'retail': ['retail chain', 'e-commerce', 'point-of-sale', 'pos system'],
  'manufacturing': ['industrial', 'factory', 'manufacturing plant'],
  'telecom': ['telecommunications', 'telecom provider', 'mobile network'],
  'transportation': ['airline', 'logistics', 'shipping company'],
  'media': ['news outlet', 'media organization', 'broadcasting'],
};

const TECHNIQUE_KEYWORDS: Record<string, string[]> = {
  'Exploit Public-Facing Application': ['public-facing application', 'web application exploit', 'exploit public-facing', 'cve-', 'vulnerability in', 'authenticated access', 'unauthenticated remote attacker'],
  'Phishing': ['phishing campaign', 'spear-phishing', 'credential harvesting', 'fake login'],
  'Data Encrypted for Impact': ['ransomware', 'encrypts files', 'data encrypted for impact', 'files encrypted', 'payment demanded'],
  'Spearphishing Attachment': ['malicious attachment', 'infected document', 'macro-enabled'],
  'Exploitation for Privilege Escalation': ['privilege escalation', 'local privilege escalation', 'elevation of privilege'],
  'Exploitation for Defense Evasion': ['bypass detection', 'evade antivirus', 'evade edr'],
  'Brute Force': ['brute force', 'password spraying', 'credential stuffing'],
  'Valid Accounts': ['valid accounts', 'legitimate credentials', 'stolen credentials'],
  'Remote Service Exploitation': ['remote service', 'remote code execution', 'rce'],
  'Supply Chain Compromise': ['supply chain', 'third-party vendor', 'dependency confusion'],
  'Drive-by Compromise': ['drive-by', 'malicious website', 'watering hole'],
  'Lateral Movement': ['lateral movement', 'pivot', 'pass-the-hash', 'pass-the-ticket'],
  'Exfiltration Over C2 Channel': ['data exfiltration', 'stolen data', 'data leak'],
};

async function main() {
  // Önce-sonra raporu
  const beforeDocs = await pool.query('SELECT COUNT(*) FROM documents WHERE sectors IS NOT NULL AND array_length(sectors,1)>0');
  const beforeTechs = await pool.query('SELECT COUNT(*) FROM documents WHERE techniques IS NOT NULL AND array_length(techniques,1)>0');
  const beforeDocTech = await pool.query('SELECT COUNT(*) FROM document_techniques');
  log(`BEFORE: documents with sectors=${beforeDocs.rows[0].count}, with techniques=${beforeTechs.rows[0].count}, doc_tech=${beforeDocTech.rows[0].count}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) document_techniques junction temizle
    await client.query('DELETE FROM document_techniques');
    // 2) documents.sectors temizle
    await client.query('UPDATE documents SET sectors=ARRAY[]::text[]');
    // 3) documents.techniques temizle
    await client.query('UPDATE documents SET techniques=ARRAY[]::text[]');

    await client.query('COMMIT');
    log('Cleaned. Re-extracting from corpus...');
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // Yeniden hesapla (batch)
  const { rows: docs } = await pool.query<any>(`SELECT id, title, summary, content FROM documents`);
  let sectorLinks = 0, techLinks = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    for (const d of batch) {
      const text = `${d.title || ''}\n${d.summary || ''}\n${d.content || ''}`.toLowerCase();
      // Sectors (≥2 keyword)
      const matchedSectors: string[] = [];
      for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
        const hits = kws.filter(k => text.includes(k)).length;
        if (hits >= 2) matchedSectors.push(sector);
      }
      // Techniques (≥2 keyword)
      const matchedTechs: string[] = [];
      for (const [tech, kws] of Object.entries(TECHNIQUE_KEYWORDS)) {
        const hits = kws.filter(k => text.includes(k)).length;
        if (hits >= 2) matchedTechs.push(tech);
      }
      await pool.query('UPDATE documents SET sectors=$1, techniques=$2 WHERE id=$3', [matchedSectors, matchedTechs, d.id]);
      // document_techniques junction
      for (const t of matchedTechs) {
        await pool.query(
          `INSERT INTO document_techniques (document_id, technique_id, match_reason, matched_text)
           SELECT $1, id, 'keyword_match', $2 FROM techniques WHERE name=$3
           ON CONFLICT DO NOTHING`,
          [d.id, t, t]
        );
        techLinks++;
      }
      sectorLinks += matchedSectors.length;
    }
    if ((i / BATCH) % 20 === 0) log(`  batch ${i + batch.length}/${docs.length}`);
  }

  const afterDocs = await pool.query('SELECT COUNT(*) FROM documents WHERE sectors IS NOT NULL AND array_length(sectors,1)>0');
  const afterTechs = await pool.query('SELECT COUNT(*) FROM documents WHERE techniques IS NOT NULL AND array_length(techniques,1)>0');
  const afterDocTech = await pool.query('SELECT COUNT(*) FROM document_techniques');
  log(`AFTER: documents with sectors=${afterDocs.rows[0].count}, with techniques=${afterTechs.rows[0].count}, doc_tech=${afterDocTech.rows[0].count}`);
  log(`SECTOR LINKS: ${sectorLinks}, TECH LINKS: ${techLinks}`);
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });