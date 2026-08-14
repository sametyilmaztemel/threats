// quick-enrich.ts — kill chain + AI summary (CVE'den bağımsız, hızlı)
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[quick] ${m}`);

const KILLCHAIN: [string, string[]][] = [
  ['recon', ['recon', 'scan', 'fingerprint', 'discovery', 'probe', 'osint']],
  ['weaponize', ['weaponiz', 'malware develop', 'payload', 'exploit kit', 'doc weapon']],
  ['deliver', ['phishing', 'spam', 'malicious link', 'drive-by', 'watering hole', 'malvertising']],
  ['exploit', ['exploit', 'cve-', 'rce', 'vulnerability', 'zero-day', 'zeroday', 'remote code']],
  ['install', ['install', 'persistence', 'backdoor', 'implant', 'dropper', 'loader', 'webshell']],
  ['c2', ['c2', 'command and control', 'command-and-control', 'botnet', 'beacon']],
  ['actions', ['exfiltrat', 'data theft', 'ransomware', 'encrypt', 'lateral movement', 'data leak', 'destroy']],
];

async function main() {
  log('kill chain atama...');
  const { rows: kcDocs } = await pool.query<any>(
    `SELECT id, title, COALESCE(content,'') as content FROM documents WHERE kill_chain_phase IS NULL OR kill_chain_phase=''`);
  let kc = 0;
  for (const d of kcDocs) {
    const text = (d.title + ' ' + d.content).toLowerCase();
    for (const [phase, kws] of KILLCHAIN) {
      if (kws.some(k => text.includes(k))) {
        await pool.query(`UPDATE documents SET kill_chain_phase=$1 WHERE id=$2`, [phase, d.id]);
        kc++; break;
      }
    }
  }
  log(`${kc} kill chain atandı`);

  log('AI summary üretimi...');
  const { rows: sumDocs } = await pool.query<any>(
    `SELECT id, title, COALESCE(summary,'') as summary, COALESCE(content,'') as content,
            actors, cves, sectors, techniques, severity, kill_chain_phase
     FROM documents WHERE (ai_summary IS NULL OR ai_summary='') AND id > 0`);
  let sums = 0;
  for (const d of sumDocs) {
    const parts: string[] = [];
    const text = (d.summary || d.content || d.title || '').trim();
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.slice(0, 280) || '';
    if (firstSentence) parts.push(firstSentence);
    const entBits: string[] = [];
    if (Array.isArray(d.actors) && d.actors.length) entBits.push(`actors: ${d.actors.slice(0,3).join(', ')}`);
    if (Array.isArray(d.cves) && d.cves.length) entBits.push(`cves: ${d.cves.slice(0,3).join(', ')}`);
    if (Array.isArray(d.sectors) && d.sectors.length) entBits.push(`sectors: ${d.sectors.slice(0,3).join(', ')}`);
    if (Array.isArray(d.techniques) && d.techniques.length) entBits.push(`ttps: ${d.techniques.slice(0,2).join(', ')}`);
    if (d.kill_chain_phase) entBits.push(`phase: ${d.kill_chain_phase}`);
    if (d.severity) entBits.push(`severity: ${d.severity}/10`);
    if (entBits.length) parts.push('[' + entBits.join(' · ') + ']');
    parts.push(`${(d.content || '').split(/\s+/).filter(Boolean).length} words`);
    const aiSummary = parts.join(' ');
    if (aiSummary.trim()) {
      await pool.query(`UPDATE documents SET ai_summary=$1 WHERE id=$2`, [aiSummary, d.id]);
      sums++;
    }
  }
  log(`${sums} AI summary üretildi`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
