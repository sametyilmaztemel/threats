// llm-summary.ts — isteğe bağlı LLM özet katmanı (opsiyonel)
// LLM_ENDPOINT + LLM_API_KEY tanımlıysa son N dokümanı özetler,
// yoksa deterministik özet korunur (akademik dürüstlük + maliyet)
// Kullanım: LLM_ENDPOINT=https://.../v1/chat/completions LLM_API_KEY=... npx tsx llm-summary.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[llm-summary] ${m}`);

const ENDPOINT = process.env.LLM_ENDPOINT || '';
const API_KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
const LIMIT = parseInt(process.env.LLM_BATCH || '10', 10);

async function main() {
  if (!ENDPOINT || !API_KEY) {
    log('LLM_ENDPOINT/API_KEY tanımsız — deterministik özet korunuyor (atlandı)');
    log('.env.example\'a LLM_ENDPOINT + LLM_API_KEY + LLM_MODEL ekleyerek aktifleştir');
    await pool.end();
    return;
  }

  // Son N doküman (summary'si olmayan veya çok kısa olan)
  const { rows } = await pool.query<any>(
    `SELECT d.id, d.title, d.summary,
            LEFT(COALESCE(d.content, d.summary, ''), 4000) as content
     FROM documents d
     WHERE d.content IS NOT NULL AND length(d.content) > 500
       AND (d.summary IS NULL OR length(d.summary) < 200)
     ORDER BY d.fetched_at DESC
     LIMIT $1`,
    [LIMIT]
  );
  log(`${rows.length} doküman LLM özeti için aday`);

  let done = 0;
  for (const d of rows) {
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: 'You are a threat intelligence analyst. Summarize the given cybersecurity report in 2-3 concise sentences in English. Focus on: threat actor, target, technique, impact. Return only the summary.' },
            { role: 'user', content: `Title: ${d.title}\n\n${d.content.slice(0, 3500)}` },
          ],
          max_tokens: 200,
        }),
      });
      if (!resp.ok) { log(`LLM ${resp.status} — retry sonraki`); continue; }
      const j = await resp.json();
      const summary = j.choices?.[0]?.message?.content?.trim();
      if (summary && summary.length > 50) {
        await pool.query(`UPDATE documents SET summary = $1 WHERE id = $2`, [summary, d.id]);
        done++;
      }
    } catch (e: any) { log(`hata: ${e.message}`); }
    await new Promise(r => setTimeout(r, 500));
  }
  log(`TAMAM: ${done} doküman LLM ile özetlendi`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
