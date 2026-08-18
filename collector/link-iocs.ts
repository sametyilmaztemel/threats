// link-iocs.ts — doküman içeriklerindeki IOC değerlerini iocs tablosuna bağlar
// Strateji: her dokümanın title+content+summary'ından regex ile IP/domain/URL çıkar,
// iocs tablosunda ara (tek toplu sorgu), document_iocs junction'a yaz.
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[link-iocs] ${m}`);

const IPV4_RE = /\b((?:\d{1,3}\.){3}\d{1,3})\b/g;
const DOMAIN_RE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|xyz|top|ru|cn|info|biz|shop|online|site|live|cloud|dev|app|click|link|tk|ml|ga|cf|gq|cc|me|tv|biz|us|uk|de|fr|tr)\b)/gi;
const URL_RE = /https?:\/\/([a-z0-9.-]+)/gi;

function validIp(ip: string): boolean {
  return ip.split('.').every(o => parseInt(o, 10) <= 255);
}

async function main() {
  // 1) Tüm dokümanları çek (son 90 gün, içerikli)
  const { rows: docs } = await pool.query<any>(
    `SELECT d.id, d.title, COALESCE(d.content,'') as content, COALESCE(d.summary,'') as summary
     FROM documents d
     WHERE d.fetched_at > NOW() - interval '90 days'
     ORDER BY d.id`
  );
  log(`${docs.length} doküman taranacak`);

  // 2) Her dokümandan aday değerler çıkar
  const candidates = new Map<string, Set<number>>(); // value → doc ids
  for (const d of docs) {
    const text = `${d.title || ''} ${d.summary || ''} ${d.content || ''}`.toLowerCase();
    const found = new Set<string>();

    for (const m of text.matchAll(IPV4_RE)) {
      const ip = m[1];
      if (validIp(ip) && !ip.startsWith('0.')) found.add(ip);
    }
    for (const m of text.matchAll(DOMAIN_RE)) {
      const dom = m[1].toLowerCase();
      if (dom.length > 4 && !dom.endsWith('.com.') && dom.split('.').length >= 2) found.add(dom);
    }
    for (const m of text.matchAll(URL_RE)) {
      const host = m[1].toLowerCase();
      if (host.split('.').length >= 2) found.add(host);
    }

    for (const v of found) {
      if (!candidates.has(v)) candidates.set(v, new Set());
      candidates.get(v)!.add(d.id);
    }
  }
  log(`${candidates.size} benzersiz aday değer`);

  // 3) Adayları iocs tablosunda ara (chunk'lı IN sorgusu)
  //    - domain/IP adayları: LOWER(value) eşleşmesi
  //    - URL adayları: value host kısmı eşleşmesi (malicious_url tipi https://host/path)
  //    - hash adayları: md5/sha1/sha256/ssl_sha1 desenleri
  const values = [...candidates.keys()];
  const urlCandidates = new Set<string>(); // full URL'ler
  const hashCandidates = new Set<string>(); // hash değerleri
  for (const d of docs) {
    const text = `${d.title || ''} ${d.summary || ''} ${d.content || ''}`;
    for (const m of text.matchAll(/https?:\/\/[a-z0-9.\-:/_%?=&~+#]+/gi)) {
      const u = m[0];
      if (u.length < 12 && u.length > 500) continue;
      urlCandidates.add(u.toLowerCase());
    }
    for (const m of text.matchAll(/\b(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})\b/g)) {
      hashCandidates.add(m[0].toLowerCase());
    }
  }
  log(`${values.length} host/domain aday + ${urlCandidates.size} URL aday + ${hashCandidates.size} hash aday`);
  let linked = 0, docCount = 0;
  const linkedDocIds = new Set<number>();

  // a) host/domain eşleşmesi — public-infra (classification='mentioned') bağlanmaz (Madde 2)
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    const { rows: iocRows } = await pool.query<any>(
      `SELECT id, value, type FROM iocs
       WHERE LOWER(value) = ANY($1::text[]) AND COALESCE(classification,'') != 'mentioned'`,
      [chunk]
    );
    for (const ioc of iocRows) {
      const docIds = candidates.get(ioc.value.toLowerCase());
      if (!docIds) continue;
      for (const docId of docIds) {
        await pool.query(
          `INSERT INTO document_iocs (document_id, ioc_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [docId, ioc.id]
        );
        linked++;
        linkedDocIds.add(docId);
      }
    }
  }

  // b) URL eşleşmesi (malicious_url / phishing_url değerleri) + HOST bazlı
  //    - full URL eşleşmesi (nadir)
  //    - URL host kısmı → domain/attacker_ip değerleriyle eşleşme (sık)
  const urlDocMap = new Map<string, Set<number>>();
  const hostDocMap = new Map<string, Set<number>>();
  const ipDocMap = new Map<string, Set<number>>();
  const hashDocMap = new Map<string, Set<number>>();
  for (const d of docs) {
    const text = `${d.title || ''} ${d.summary || ''} ${d.content || ''}`.toLowerCase();
    for (const m of text.matchAll(/https?:\/\/[a-z0-9.\-:/_%?=&~+#]+/gi)) {
      const u = m[0].toLowerCase();
      if (u.length < 12 && u.length > 500) continue;
      if (!urlDocMap.has(u)) urlDocMap.set(u, new Set());
      urlDocMap.get(u)!.add(d.id);
      // host kısmını çıkar
      try {
        const host = new URL(u.startsWith('http') ? u : `http://${u}`).hostname;
        if (host && host.includes('.')) {
          if (!hostDocMap.has(host)) hostDocMap.set(host, new Set());
          hostDocMap.get(host)!.add(d.id);
        }
      } catch {}
    }
    // IP'ler zaten candidates'te (IPV4_RE) — hostDocMap'e IP'leri de ekle
    for (const m of text.matchAll(IPV4_RE)) {
      const ip = m[1];
      if (validIp(ip)) {
        if (!ipDocMap.has(ip)) ipDocMap.set(ip, new Set());
        ipDocMap.get(ip)!.add(d.id);
      }
    }
    // Hash'ler (md5/sha1/sha256/ssl_sha1)
    for (const m of text.matchAll(/\b(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})\b/g)) {
      const h = m[0];
      if (!hashDocMap.has(h)) hashDocMap.set(h, new Set());
      hashDocMap.get(h)!.add(d.id);
    }
  }
  // ioc değerlerinden host çıkar ve eşleştir (chunk'lı) — public-infra 'mentioned' bağlanmaz
  const { rows: allIocRows } = await pool.query<any>(
    `SELECT id, value, type FROM iocs
     WHERE type IN ('malicious_url','phishing_url','domain','c2_ip','attacker_ip','ssl_sha1','md5','sha1','sha256')
       AND COALESCE(classification,'') != 'mentioned'`
  );
  for (const ioc of allIocRows) {
      const v = ioc.value.toLowerCase();
      let docIds: Set<number> | undefined;

      if (ioc.type === 'malicious_url' || ioc.type === 'phishing_url') {
        docIds = urlDocMap.get(v);
        if (!docIds) {
          try {
            const host = new URL(v.startsWith('http') ? v : `http://${v}`).hostname;
            docIds = hostDocMap.get(host) || ipDocMap.get(host);
          } catch {}
        }
      } else if (ioc.type === 'domain') {
        docIds = hostDocMap.get(v);
      } else if (ioc.type === 'c2_ip' || ioc.type === 'attacker_ip') {
        docIds = ipDocMap.get(v);
      } else if (ioc.type === 'md5' || ioc.type === 'sha1' || ioc.type === 'sha256' || ioc.type === 'ssl_sha1') {
        docIds = hashDocMap.get(v);
      }

      if (docIds) {
        for (const docId of docIds) {
          await pool.query(
            `INSERT INTO document_iocs (document_id, ioc_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [docId, ioc.id]
          );
          linked++;
          linkedDocIds.add(docId);
        }
      }
  }
  log(`toplam ${linked} bağlantı eklendi (${linkedDocIds.size} doküman)`);

  // 4) documents.ioc_count güncelle
  const { rows: counts } = await pool.query<any>(
    `SELECT document_id, COUNT(*)::int as cnt FROM document_iocs GROUP BY document_id`
  );
  for (const c of counts) {
    await pool.query(`UPDATE documents SET ioc_count = $1 WHERE id = $2`, [c.cnt, c.document_id]);
  }
  log(`ioc_count güncellendi: ${counts.length} doküman`);

  await pool.end();
  log('TAMAM');
}

main().catch(e => { console.error(e); process.exit(1); });
