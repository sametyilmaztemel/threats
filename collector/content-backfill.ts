// content-backfill.ts — Threats içerik katmanlarını prod seviyesine doldurur
// Çalıştırma: docker exec threats-worker npx tsx /app/collector/content-backfill.ts
// Bu versiyon: actor-match.ts, severity.ts, ai-taxonomy.ts, ioc-classifier.ts modüllerini kullanır.
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { findActorMatches, isMatchableAlias, type ActorDef } from './actor-match';
import { canonicalCvss, severityFromCvss } from '../app/src/lib/severity';
import { isAiThreatCategory, type AiCategory } from '../app/src/lib/ai-taxonomy';
import { classifyIoc, isPublicInfrastructure } from './ioc-classifier';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[backfill] ${m}`);

// ── 1. Aktör tanımları (canonical) ────────────────────────────────────
const ACTOR_DEFS: Record<string, { aliases: string[]; origin: string; type: string; targets: string[]; ttps: string[] }> = {
  'Conti':        { aliases: ['Conti', 'Conti ransomware', 'Wizard Spider'], origin: 'Russia', type: 'ransomware-gang', targets: ['healthcare', 'government', 'finance'], ttps: ['Data Encrypted for Impact'] },
  'LockBit':      { aliases: ['LockBit', 'LockBit ransomware'], origin: 'Russia', type: 'ransomware-gang', targets: ['finance', 'government'], ttps: ['Data Encrypted for Impact', 'Exploit Public-Facing Application'] },
  'Clop':         { aliases: ['Clop', 'Cl0p'], origin: 'Russia', type: 'ransomware-gang', targets: ['finance', 'healthcare'], ttps: ['Data Encrypted for Impact'] },
  'Lazarus':      { aliases: ['Lazarus', 'Hidden Cobra', 'Diamond SIC'], origin: 'North Korea', type: 'apt', targets: ['finance', 'crypto'], ttps: ['Phishing', 'Valid Accounts'] },
  'Kimsuky':      { aliases: ['Kimsuky', 'Velvet Chollima'], origin: 'North Korea', type: 'apt', targets: ['government', 'defense'], ttps: ['Phishing'] },
  'Mustang Panda':{ aliases: ['Mustang Panda', 'RedDelta', 'Honey Myte'], origin: 'China', type: 'apt', targets: ['government', 'ngo'], ttps: ['Phishing'] },
  'APT28':        { aliases: ['APT28', 'Fancy Bear', 'Sofacy', 'Forest Blizzard'], origin: 'Russia', type: 'apt', targets: ['government', 'defense'], ttps: ['Phishing', 'Valid Accounts', 'Exploit Public-Facing Application'] },
  'APT29':        { aliases: ['APT29', 'Cozy Bear', 'Midnight Blizzard'], origin: 'Russia', type: 'apt', targets: ['government', 'technology'], ttps: ['Phishing', 'Valid Accounts'] },
  'UNC3886':      { aliases: ['UNC3886', 'Barium'], origin: 'China', type: 'apt', targets: ['defense', 'telecom'], ttps: ['Command and Scripting Interpreter'] },
  'Equation Group':{ aliases: ['Equation Group', 'EquationDrug'], origin: 'US', type: 'apt', targets: ['government', 'technology'], ttps: ['Exploit Public-Facing Application'] },
  'Silence':      { aliases: ['Silence'], origin: 'Russia', type: 'apt', targets: ['finance'], ttps: ['Phishing'] },
};

// ── 2. Teknik keyword (geniş → dar) ─────────────────────────────────────
// Genel keyword tek başına tetiklemez, en az 2 eşleşme ya da CVE/ref ile tetikler.
const TECH_KEYWORDS: Record<string, string[]> = {
  'Command and Scripting Interpreter': ['powershell', 'cmd.exe', 'bash -c', 'rundll32', 'mshta'],
  'Phishing': ['spearphishing', 'spam campaign', 'malicious link', 'fake login', 'phishing kit'],
  'Exploit Public-Facing Application': ['cve-', 'zero-day', 'zeroday', 'remote code execution', 'unpatched server'],
  'Valid Accounts': ['credential stuffing', 'stolen credential', 'account takeover', 'mfa bypass'],
  'Data Encrypted for Impact': ['double extortion', 'lockbit', 'conti', 'clop', 'ransomware gang', 'ransomware attack'],
  'LLM Prompt Injection': ['prompt injection', 'jailbreak', 'indirect prompt', 'llm injection', 'tool poisoning'],
  'Exfiltration via Cyber Means': ['data exfil', 'data theft', 'data leak'],
  'Erode ML Model Integrity': ['model poisoning', 'adversarial attack', 'backdoor model'],
  'Publish Poisoned Datasets': ['poisoned dataset', 'malicious dataset', 'dataset poisoning'],
};

// ── 3. Sektör keyword (güçlü bağlam gerektirir) ───────────────────────
// En az 2 keyword ya da CVE içinde sektör adı geçmeli.
const SECTOR_KEYWORDS: Record<string, string[]> = {
  'finance': ['bank', 'financial', 'fintech', 'swift', 'bitcoin', 'payment', 'exchange', 'wallet', 'kyc'],
  'healthcare': ['hospital', 'medical', 'clinic', 'pharma', 'patient', 'emr', 'ehr', 'hipaa', 'diagnostic'],
  'government': ['state-sponsored', 'public sector', 'ministry', 'election', 'embassy', 'parliament', 'municipality', 'diplomatic'],
  'defense': ['military', 'weapon', 'army', 'navy', 'air force', 'soldier', 'espionage', 'intelligence agency'],
  'technology': ['software', 'tech company', 'saas', 'developer', 'open source', 'api', 'docker', 'linux', 'framework'],
  'telecom': ['isp', 'mobile network', '5g', 'sim swap', 'voip', 'broadband', 'gsm', 'lte'],
  'energy': ['power grid', 'utility', 'oil', 'gas', 'nuclear', 'pipeline', 'power plant', 'smart meter', 'scada'],
  'retail': ['e-commerce', 'shopping', 'store', 'marketplace', 'loyalty', 'checkout'],
};

// ── 4. AI tehdit kategorisi (yeni taksonomi) ─────────────────────────────
// Sadece gerçek AI security vakaları sayılır. ArXiv cs.AI gibi genel
// araştırmalar "ai_research"a düşer ve KPI'ya dahil edilmez.
const AI_CATEGORY_MAP: Array<{ cat: AiCategory; kws: string[]; weight: number }> = [
  { cat: 'prompt_injection', weight: 1, kws: ['prompt injection', 'jailbreak', 'indirect prompt', 'tool poisoning'] },
  { cat: 'data_poisoning', weight: 1, kws: ['data poisoning', 'backdoor model', 'malicious dataset'] },
  { cat: 'model_theft', weight: 1, kws: ['model extraction', 'model theft', 'distill attack', 'steal model'] },
  { cat: 'adversarial_ai', weight: 1, kws: ['adversarial example', 'evasion attack', 'fool classifier'] },
  { cat: 'privacy_leak', weight: 1, kws: ['training data extraction', 'membership inference', 'model inversion'] },
  { cat: 'deepfake_abuse', weight: 1, kws: ['deepfake', 'voice clone', 'synthetic media fraud'] },
  { cat: 'malicious_ai_use', weight: 1, kws: ['attacker uses ai', 'threat actor uses llm', 'ai-assisted phishing'] },
  { cat: 'ai_incident', weight: 1, kws: ['ai incident', 'ai misuse', 'ai enabled breach', 'llm data leak'] },
  { cat: 'ai_security_research', weight: 0, kws: ['defensive ai', 'ai for detection', 'machine learning security'] },
  { cat: 'ai_research', weight: 0, kws: ['arxiv', 'benchmark', 'training methodology'] },
];

const SOURCE_AI_KEYWORDS = /\b(arxiv|mitre atlas|lakera|huggingface.*advisory|hiddenlayer|anthropic.*security|openai.*security)/i;
const MALICIOUS_KEYWORD_RE = /(malware|ransomware|phishing|exploit|cve-\d|threat actor|attacker|adversary|cyberattack|cyber attack|backdoor|trojan|stealer|cryptolocker|cobalt|sodinokibi|revil|conti|lockbit|magniber|wannacry|petya|notpetya|trickbot|emotet|dridex|azorult|agent\.tesla|formbook|lokibot|redline|vidar|raccoon|amadey|pushdo|hancitor|qakbot)/i;

function classifyAIDocument(title: string, summary: string, content: string): { cat: AiCategory; confidence: number } {
  const text = `${title} ${summary} ${content}`.toLowerCase();
  // Araştırma mu? (arxiv / paper / benchmark / dataset / training)
  const researchSignals = [
    /\barxiv[: ]/i.test(text), /\bpaper\b/i.test(text), /\bbenchmark\b/i.test(text),
    /\bdataset\b/i.test(text) && !/poisoned dataset|malicious dataset/.test(text),
    /training methodology|training procedure|training data/i.test(text) && !MALICIOUS_KEYWORD_RE.test(text),
  ].filter(Boolean).length;
  const isResearch = researchSignals >= 2 || SOURCE_AI_KEYWORDS.test(`${title} ${summary}`) && /benchmark|paper|methodology/i.test(text);

  // En yüksek ağırlıklı kategoriyi bul
  let best: AiCategory = 'ai_related';
  let bestWeight = 0;
  for (const { cat, kws, weight } of AI_CATEGORY_MAP) {
    const hits = kws.filter(k => text.includes(k)).length;
    if (hits > 0 && weight > bestWeight) {
      best = cat;
      bestWeight = weight;
    }
  }
  if (isResearch && (best === 'ai_related' || bestWeight === 0)) {
    return { cat: 'ai_research', confidence: 30 };
  }
  return { cat: best, confidence: bestWeight === 0 ? 30 : 80 };
}

function detectAIDocument(title: string, summary: string, content: string): boolean {
  const text = `${title} ${summary} ${content}`.toLowerCase();
  const aiKws = ['llm', 'gpt', 'claude', 'gemini', 'transformer', 'machine learning', 'neural network',
                 'openai', 'anthropic', 'huggingface', 'prompt', 'jailbreak', 'deepfake', 'model extraction',
                 'adversarial', 'rag ', 'agent', 'chatbot', 'fine-tun', 'token', 'embedding'];
  return aiKws.some(k => text.includes(k));
}

function keywordCount(text: string, kws: string[]): number {
  return kws.filter(k => text.includes(k.toLowerCase())).length;
}

async function main() {
  // ── A. Aktör zenginleştirme + eşleştirme (canonical match) ──
  log('A. Aktör zenginleştirme + doküman eşleştirme...');
  for (const [name, info] of Object.entries(ACTOR_DEFS)) {
    await pool.query(
      `UPDATE actors SET aliases=$1, origin_country=$2, type=$3, targets=$4, ttps=$5, updated_at=NOW() WHERE name=$6`,
      [info.aliases, info.origin, info.type, info.targets, info.ttps, name]
    );
  }
  const actorDefs: ActorDef[] = Object.entries(ACTOR_DEFS).map(([name, info]) => ({ name, aliases: info.aliases }));

  const { rows: docs } = await pool.query<any>(
    `SELECT id, title, COALESCE(content,'') as content FROM documents WHERE id > 0`
  );
  log(`  ${docs.length} doküman taranıyor...`);
  let actorLinks = 0;
  const actorCounts: Record<string, number> = {};
  for (const d of docs) {
    const text = d.title + ' ' + d.content;
    const matches = findActorMatches(text, actorDefs);
    if (!matches.length) continue;
    // Sadece canonical name'i documents.actors array'ine yaz (alias'leri değil)
    const actorNames = [...new Set(matches.map(m => m.actorName))];
    const current = (await pool.query<any>(`SELECT actors FROM documents WHERE id=$1`, [d.id])).rows[0]?.actors || [];
    const merged = [...new Set([...current, ...actorNames])];
    await pool.query(`UPDATE documents SET actors=$1 WHERE id=$2`, [merged, d.id]);
    for (const m of matches) {
      const actorRow = await pool.query<any>(`SELECT id FROM actors WHERE name=$1`, [m.actorName]);
      if (!actorRow.rows[0]) continue;
      await pool.query(
        `INSERT INTO document_actors (document_id, actor_id, confidence, match_reason, matched_text, extraction_method)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (document_id, actor_id) DO UPDATE SET
           confidence = EXCLUDED.confidence,
           match_reason = EXCLUDED.match_reason,
           matched_text = EXCLUDED.matched_text`,
        [d.id, actorRow.rows[0].id, Math.round(m.confidence * 100), m.matchReason, m.matchedText, 'canonical_alias_match']
      );
      actorLinks++;
      actorCounts[m.actorName] = (actorCounts[m.actorName] || 0) + 1;
    }
  }
  for (const [name, count] of Object.entries(actorCounts)) {
    await pool.query(`UPDATE actors SET document_count=$1, updated_at=NOW() WHERE name=$2`, [count, name]);
  }
  log(`  ${actorLinks} aktör-doküman bağlantısı`);

  // ── B. Teknik eşleştirme (güçlü bağlam gerekir) ──
  log('B. Teknik eşleştirme...');
  let techLinks = 0;
  for (const d of docs) {
    const text = (d.title + ' ' + d.content).toLowerCase();
    const matched: string[] = [];
    for (const [tech, kws] of Object.entries(TECH_KEYWORDS)) {
      const hits = keywordCount(text, kws);
      if (hits >= 2 || (hits === 1 && /\bcve-\d/i.test(text))) matched.push(tech);
    }
    if (matched.length === 0) continue;
    await pool.query(`UPDATE documents SET techniques=$1 WHERE id=$2`, [matched, d.id]);
    for (const t of matched) {
      await pool.query(
        `INSERT INTO document_techniques (document_id, technique_id, match_reason, matched_text)
         SELECT $1, id, 'keyword_match', $2 FROM techniques WHERE name=$3
         ON CONFLICT (document_id, technique_id) DO UPDATE SET
           match_reason = EXCLUDED.match_reason,
           matched_text = EXCLUDED.matched_text`,
        [d.id, matched.join(','), t]
      );
      techLinks++;
    }
  }
  log(`  ${techLinks} teknik-doküman bağlantısı`);

  // ── C. Sektör eşleştirme (en az 2 keyword veya açık bağlam) ──
  log('C. Sektör eşleştirme...');
  let sectorLinks = 0;
  for (const d of docs) {
    const text = (d.title + ' ' + d.content).toLowerCase();
    const matched: string[] = [];
    for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
      const hits = keywordCount(text, kws);
      if (hits >= 2) matched.push(sector);
    }
    if (matched.length === 0) continue;
    await pool.query(`UPDATE documents SET sectors=$1 WHERE id=$2`, [matched, d.id]);
    sectorLinks += matched.length;
  }
  log(`  ${sectorLinks} sektör etiketi`);

  // ── D. AI tehdit kayıtları (yeni taksonomi) ──
  log('D. ai_threats üretimi (yeni taksonomi)...');
  const { rows: aiDocs } = await pool.query<any>(
    `SELECT id, title, COALESCE(summary,'') as summary, COALESCE(content,'') as content, severity, cves
     FROM documents`
  );
  let aiInserted = 0, aiClassified = 0;
  for (const d of aiDocs) {
    const isAI = detectAIDocument(d.title, d.summary, d.content);
    const cls = classifyAIDocument(d.title, d.summary, d.content);
    const isThreat = isAiThreatCategory(cls.cat);
    // documents.ai_threat sadece gerçek threat kategorilerinde true
    if (isAI && isThreat) {
      await pool.query(`UPDATE documents SET ai_threat=TRUE WHERE id=$1`, [d.id]);
      const technique = cls.cat === 'prompt_injection' ? 'LLM Prompt Injection' : null;
      const cve = Array.isArray(d.cves) && d.cves.length > 0 ? d.cves[0] : null;
      await pool.query(
        `INSERT INTO ai_threats (document_id, ai_category, target_system, technique, severity, cve, classification, confidence)
         VALUES ($1, $2, 'llm', $3, $4, $5, $2, $6)
         ON CONFLICT (document_id, ai_category) DO UPDATE SET
           severity = EXCLUDED.severity,
           technique = EXCLUDED.technique,
           cve = EXCLUDED.cve,
           confidence = EXCLUDED.confidence`,
        [d.id, cls.cat, technique, d.severity ?? null, cve, cls.confidence]
      );
      aiInserted++;
    } else if (isAI) {
      // AI ama threat değil → ai_research/ai_related olarak işaretle
      await pool.query(
        `INSERT INTO ai_threats (document_id, ai_category, classification, confidence)
         VALUES ($1, $2, $2, $3)
         ON CONFLICT (document_id, ai_category) DO UPDATE SET classification = EXCLUDED.classification`,
        [d.id, cls.cat, cls.confidence]
      );
      aiClassified++;
    }
  }
  log(`  ${aiInserted} AI tehdit + ${aiClassified} AI araştırma`);

  // ── E. CVE enrichment (NVD API) ──
  log('E. CVE enrichment (NVD)...');
  const { rows: cveRows } = await pool.query<any>(
    `SELECT DISTINCT cve_id FROM document_cves WHERE cve_id NOT IN (SELECT cve_id FROM cve_enrichment) LIMIT 500`
  );
  let cveEnriched = 0;
  for (const row of cveRows) {
    const cveId = row.cve_id;
    let attempts = 0;
    let ok = false;
    while (attempts < 3 && !ok) {
      attempts++;
      try {
        const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`;
        const resp = await fetch(url, { headers: { 'User-Agent': 'threats.0rce.com/1.0' } });
        if (resp.status === 403 || resp.status === 429) {
          await new Promise(r => setTimeout(r, 5000 * attempts));
          continue;
        }
        if (!resp.ok) { ok = true; continue; }
        ok = true;
        const data: any = await resp.json();
        const vuln = data?.vulnerabilities?.[0]?.cve;
        if (!vuln) continue;
        const metrics = vuln.metrics?.cvssMetricV31?.[0]?.cvssData || vuln.metrics?.cvssMetricV30?.[0]?.cvssData;
        const desc = vuln.descriptions?.find((x: any) => x.lang === 'en')?.value || '';
        const cpes = vuln.configurations?.[0]?.nodes?.[0]?.cpeMatch || [];
        const vendor = cpes[0]?.criteria?.split(':')[3] || '';
        const product = cpes[0]?.criteria?.split(':')[4] || '';
        const cleanCvss = canonicalCvss(metrics?.baseScore);
        await pool.query(
          `INSERT INTO cve_enrichment (cve_id, cvss_v3, description, vendor, product, published_date, last_enriched_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (cve_id) DO UPDATE SET cvss_v3=$2, description=$3, vendor=$4, product=$5, last_enriched_at=NOW()`,
          [cveId, cleanCvss, desc, vendor, product, vuln.published || null]
        );
        cveEnriched++;
      } catch (e) {
        await new Promise(r => setTimeout(r, 3000 * attempts));
      }
    }
    await new Promise(r => setTimeout(r, 1200));
  }
  log(`  ${cveEnriched} CVE zenginleştirildi`);

  // ── F. Veri temizliği ──
  log('F. İstatistik yenileme + veri temizliği...');
  await pool.query(`REFRESH MATERIALIZED VIEW IF EXISTS stats_summary`).catch(() => {});

  await pool.query(`UPDATE documents SET content = summary WHERE (content IS NULL OR content='') AND summary IS NOT NULL AND summary != ''`);
  await pool.query(`UPDATE documents SET summary = title, content = COALESCE(NULLIF(content,''), title) WHERE (summary IS NULL OR summary='') AND title IS NOT NULL`);
  // Duplicate title'leri sil
  await pool.query(`DELETE FROM documents d USING documents d2 WHERE d.id > d2.id AND d.title = d2.title`);

  // CVE ID upper-case normalization (duplicate önlemek için önce temizle)
  await pool.query(`DELETE FROM document_cves dc USING document_cves dc2 WHERE dc.cve_id != UPPER(dc.cve_id) AND dc.document_id = dc2.document_id AND dc2.cve_id = UPPER(dc.cve_id)`);
  await pool.query(`UPDATE document_cves SET cve_id = UPPER(cve_id) WHERE cve_id != UPPER(cve_id)`);
  await pool.query(`UPDATE documents SET cves = (SELECT ARRAY_AGG(DISTINCT UPPER(c)) FROM unnest(cves) c) WHERE EXISTS (SELECT 1 FROM unnest(cves) c WHERE c != UPPER(c))`);

  // ── G. Kill chain (güçlü bağlam) ──
  log('G. Kill chain phase atama...');
  const KILLCHAIN: [string, string[]][] = [
    ['recon', ['reconnaissance', 'discovery scan', 'fingerprint', 'osint']],
    ['weaponize', ['payload development', 'malware develop', 'exploit kit']],
    ['deliver', ['spearphishing', 'watering hole', 'malvertising']],
    ['exploit', ['exploit vulnerability', 'zero-day exploit', 'cve-\\d', 'remote code execution']],
    ['install', ['persistence mechanism', 'backdoor implant', 'webshell dropper']],
    ['c2', ['command-and-control', 'beacon traffic', 'botnet command']],
    ['actions', ['data exfiltration', 'ransomware encryption', 'lateral movement']],
  ];
  let kcUpdated = 0;
  const { rows: kcDocs } = await pool.query<any>(`SELECT id, title, COALESCE(content,'') as content FROM documents WHERE kill_chain_phase IS NULL OR kill_chain_phase=''`);
  for (const d of kcDocs) {
    const text = (d.title + ' ' + d.content).toLowerCase();
    for (const [phase, kws] of KILLCHAIN) {
      const hits = keywordCount(text, kws);
      if (hits >= 2 || (hits === 1 && phase === 'exploit' && /\bcve-\d/i.test(text))) {
        await pool.query(`UPDATE documents SET kill_chain_phase=$1 WHERE id=$2`, [phase, d.id]);
        kcUpdated++;
        break;
      }
    }
  }
  log(`  ${kcUpdated} dokümana kill chain atandı`);

  // ── H. AI summary üretimi ──
  log('H. AI summary üretimi...');
  const { rows: sumDocs } = await pool.query<any>(
    `SELECT id, title, COALESCE(summary,'') as summary, COALESCE(content,'') as content,
            actors, cves, sectors, techniques, severity, kill_chain_phase
     FROM documents WHERE (ai_summary IS NULL OR ai_summary='') AND id > 0`
  );
  let sumUpdated = 0;
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
      sumUpdated++;
    }
  }
  log(`  ${sumUpdated} dokümana AI summary üretildi`);

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
