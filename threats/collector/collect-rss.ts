import Parser from 'rss-parser';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const parser = new Parser({ timeout: 30000, headers: { 'User-Agent': 'threats.0rce.com/1.0' } });

const AI_KEYWORDS = ['llm', 'gpt', 'claude', 'gemini', 'prompt injection', 'jailbreak', 'adversarial', 'model extraction', 'deepfake', 'machine learning', 'neural network', 'rag', 'embedding', 'transformer', 'training data', 'fine-tun', 'openai', 'anthropic', 'huggingface', 'langchain'];

function stripHTML(html: string): string {
  if (!html) return '';
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function detectAI(text: string): boolean {
  const lower = text.toLowerCase();
  return AI_KEYWORDS.some(k => lower.includes(k));
}

function extractCVEs(text: string): string[] {
  const m = text.match(/CVE-\d{4}-\d{4,7}/gi) || [];
  return [...new Set(m)];
}

function detectSeverity(text: string): number {
  const lower = text.toLowerCase();
  if (lower.includes('critical') || lower.includes('rce') || lower.includes('zero-day')) return 9;
  if (lower.includes('high severity') || lower.includes('actively exploited') || lower.includes('emergency')) return 7;
  if (lower.includes('medium')) return 5;
  if (lower.includes('low') || lower.includes('info')) return 2;
  return 5;
}

function categoryFor(text: string): string[] {
  const cats: string[] = [];
  const lower = text.toLowerCase();
  if (lower.includes('ransomware')) cats.push('ransomware');
  if (lower.includes('malware') || lower.includes('trojan')) cats.push('malware');
  if (lower.includes('phishing')) cats.push('phishing');
  if (lower.includes('breach') || lower.includes('leak')) cats.push('data_breach');
  if (lower.includes('vulnerability') || lower.includes('cve')) cats.push('vulnerability');
  if (lower.includes('apt') || lower.includes('state-sponsored')) cats.push('apt');
  if (lower.includes('supply chain')) cats.push('supply_chain');
  if (lower.includes('cloud')) cats.push('cloud');
  if (lower.includes('iot') || lower.includes('ot ')) cats.push('iot');
  if (lower.includes('identity')) cats.push('identity');
  if (lower.includes('ai') || lower.includes('llm') || lower.includes('machine learning')) cats.push('ai');
  return cats.length ? cats : ['general'];
}

async function ingestRSS(source: any) {
  try {
    const feed = await parser.parseURL(source.url);
    let count = 0;
    for (const item of feed.items.slice(0, 50)) {
      if (!item.link || !item.title) continue;
      const text = `${item.title} ${stripHTML(item.contentSnippet || '')} ${stripHTML(item.content || '')}`;
      const aiThreat = detectAI(text);
      const cves = extractCVEs(text);
      const severity = detectSeverity(text);
      const category = categoryFor(text);

      const cleanContent = stripHTML(item.content || item.contentSnippet || '');

      try {
        await pool.query(
          `INSERT INTO documents (source_id, external_id, title, url, content, summary, author, published_at, severity, category, cves, ai_threat, hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (url) DO NOTHING`,
          [
            source.id, item.guid || item.link,
            item.title, item.link,
            cleanContent,
            cleanContent.slice(0, 500),
            item.creator || item.author,
            item.pubDate ? new Date(item.pubDate) : null,
            severity, category, cves, aiThreat,
            Buffer.from(item.link).toString('base64').slice(0, 64)
          ]
        );
        count++;
      } catch (e: any) {
        // skip duplicate
      }
    }
    await pool.query(
      `UPDATE sources SET last_fetched_at = NOW(), last_status = 'ok', last_items_count = $1, total_items = total_items + $1 WHERE id = $2`,
      [count, source.id]
    );
    return count;
  } catch (e: any) {
    await pool.query(
      `UPDATE sources SET last_fetched_at = NOW(), last_status = $1 WHERE id = $2`,
      [`error: ${e.message.slice(0, 200)}`, source.id]
    );
    return 0;
  }
}

async function main() {
  const { rows: sources } = await pool.query<any>(
    `SELECT * FROM sources WHERE type = 'rss' AND enabled = TRUE`
  );
  console.log(`[collector] ${sources.length} RSS sources`);
  let total = 0;
  for (const s of sources) {
    const c = await ingestRSS(s);
    console.log(`  ${s.name}: ${c}`);
    total += c;
  }
  console.log(`[collector] total inserted: ${total}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
