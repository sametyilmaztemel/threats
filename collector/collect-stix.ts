// collect-stix.ts — MITRE ATT&CK / ATLAS STIX feed → actors + techniques
// Kaynak: sources tablosundaki 'MITRE ATT&CK' (stix type)
// Full sync ilk koşuda, sonra incremental (modified timestamp)
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[stix] ${m}`);

// ATT&CK grup isimleri → ülke/type normalizasyonu (güvenilir eşleştirme)
const COUNTRY_HINTS: [RegExp, string][] = [
  [/north korea|dprk|kimsuky|lazarus|andariel/i, 'North Korea'],
  [/russia|russian|fancy bear|apt28|apt29|cozy bear|midnight blizzard|conti|clop|lockbit|wizard spider/i, 'Russia'],
  [/china|chinese|apt41|mustang panda|muddywater|red api|winnti/i, 'China'],
  [/iran|iranian|apt35|apt42|charming kitten|muddywater/i, 'Iran'],
  [/vietnam|apt32|ocean lotus/i, 'Vietnam'],
  [/north korea/i, 'North Korea'],
  [/pakistan|apt36|patchwork/i, 'Pakistan'],
  [/india|apt40|bitter/i, 'India'],
  [/turkey|turkish/i, 'Turkey'],
];

const TYPE_HINTS: [RegExp, string][] = [
  [/nation-state|government|state-sponsored|espionage|apt/i, 'apt'],
  [/ransomware|extortion/i, 'ransomware-gang'],
  [/financially|cybercrime|financial/i, 'financially-motivated'],
  [/hacktiv|protest/i, 'hacktivist'],
];

function guessCountry(name: string, description: string): string | null {
  const text = `${name} ${description || ''}`;
  for (const [re, country] of COUNTRY_HINTS) {
    if (re.test(text)) return country;
  }
  return null;
}

function guessType(name: string, description: string): string | null {
  const text = `${name} ${description || ''}`;
  for (const [re, type] of TYPE_HINTS) {
    if (re.test(text)) return type;
  }
  return null;
}

async function main() {
  // STIX feed'i indir (MITRE ATT&CK enterprise)
  log('STIX feed indiriliyor (MITRE ATT&CK enterprise)...');
  const resp = await fetch('https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json', {
    headers: { 'User-Agent': 'threats.0rce.com/1.0' },
  });
  if (!resp.ok) { log(`indirme hatası: HTTP ${resp.status}`); process.exit(1); }
  const bundle: any = await resp.json();
  const objects: any[] = bundle.objects || [];
  log(`bundle: ${objects.length} nesne`);

  // 1) THREAT ACTORS (intrusion-set)
  const groups = objects.filter((o: any) => o.type === 'intrusion-set');
  log(`intrusion-set: ${groups.length}`);

  let actorUpsert = 0, actorNew = 0;
  for (const g of groups) {
    const name = g.name;
    if (!name) continue;
    const aliases = g.aliases || [];
    const desc = g.description || '';
    const country = guessCountry(name, desc);
    const type = guessType(name, desc);
    // İlk görülme: first_seen alanı yok — created_date kullan
    const created = g.created ? new Date(g.created) : null;
    // TTP bağlantıları (technique kullanımı)
    const ttps = (g.external_references || [])
      .filter((r: any) => r.source_name === 'mitre-attack' && r.external_id)
      .map((r: any) => r.external_id)
      .slice(0, 15);

    const exists = await pool.query(`SELECT id FROM actors WHERE name = $1`, [name]);
    if (exists.rowCount === 0) actorNew++;
    await pool.query(
      `INSERT INTO actors (name, aliases, origin_country, type, first_seen, description, ttps, targets, document_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ARRAY[]::text[], 0, NOW())
       ON CONFLICT (name) DO UPDATE SET
         aliases = EXCLUDED.aliases,
         origin_country = COALESCE(actors.origin_country, EXCLUDED.origin_country),
         type = COALESCE(actors.type, EXCLUDED.type),
         description = EXCLUDED.description,
         ttps = EXCLUDED.ttps,
         updated_at = NOW()`,
      [name, aliases, country, type, created, desc, ttps]
    );
    actorUpsert++;
  }
  log(`aktör upsert: ${actorUpsert} (yeni: ${actorNew})`);

  // 2) TECHNIQUES (attack-pattern)
  const patterns = objects.filter((o: any) => o.type === 'attack-pattern');
  log(`attack-pattern: ${patterns.length}`);

  let techUpsert = 0;
  for (const p of patterns) {
    const ext = (p.external_references || []).find((r: any) => r.source_name === 'mitre-attack');
    const attackId = ext?.external_id || '';
    const name = p.name || '';
    if (!attackId || !name) continue;
    // Taktik: kill_chain_phases
    const tactic = (p.kill_chain_phases || [])
      .filter((k: any) => k.kill_chain_name === 'mitre-attack')
      .map((k: any) => k.phase_name)
      .join(', ') || null;

    await pool.query(
      `INSERT INTO techniques (attack_id, name, tactic, description, detection, mitigation, is_atlas, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
       ON CONFLICT (attack_id) DO UPDATE SET
         name = EXCLUDED.name,
         tactic = EXCLUDED.tactic,
         description = EXCLUDED.description,
         detection = EXCLUDED.detection,
         mitigation = EXCLUDED.mitigation`,
      [attackId, name, tactic, p.description || null, p.x_mitre_detection || null, p.x_mitre_mitigation || null]
    );
    techUpsert++;
  }
  log(`teknik upsert: ${techUpsert}`);

  // 3) Aktör↔teknik ilişkileri (relationship nesneleri: uses)
  //    intrusion-set → attack-pattern (uses) — actors.ttps'e attack_id ekle
  const relationships = objects.filter((o: any) => o.type === 'relationship' && o.relationship_type === 'uses');
  log(`uses relationship: ${relationships.length}`);
  // STIX id → attack_id map
  const patternIdToAttack = new Map<string, string>();
  for (const p of patterns) {
    if (p.id) patternIdToAttack.set(p.id, (p.external_references || []).find((r: any) => r.source_name === 'mitre-attack')?.external_id || '');
  }
  const groupIdToName = new Map<string, string>();
  for (const g of groups) if (g.id) groupIdToName.set(g.id, g.name);

  let relLinked = 0;
  const ttpsByActor = new Map<string, Set<string>>(); // actor name → attack ids
  for (const rel of relationships) {
    const groupId = rel.source_ref || '';
    const patternId = rel.target_ref || '';
    const actorName = groupIdToName.get(groupId);
    const attackId = patternIdToAttack.get(patternId);
    if (!actorName || !attackId) continue;
    if (!ttpsByActor.has(actorName)) ttpsByActor.set(actorName, new Set());
    ttpsByActor.get(actorName)!.add(attackId);
    relLinked++;
  }
  log(`ilişkili (aktör→teknik): ${relLinked}`);
  for (const [actorName, ttpSet] of ttpsByActor) {
    const ttpArr = [...ttpSet].slice(0, 50);
    await pool.query(`UPDATE actors SET ttps=$1 WHERE LOWER(name)=LOWER($2)`, [ttpArr, actorName]);
  }
  log(`${ttpsByActor.size} aktörün ttps'i güncellendi`);

  // 4) Opsiyonel: kampanyalar (campaign) → description'a not
  const campaigns = objects.filter((o: any) => o.type === 'campaign');
  log(`campaign: ${campaigns.length} (atlandı)`);

  await pool.end();
  log('TAMAM');
}

main().catch(e => { console.error(e); process.exit(1); });
