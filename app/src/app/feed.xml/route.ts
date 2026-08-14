import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /feed.xml — Atom feed, son 50 doküman
export async function GET(req: NextRequest) {
  const base = `https://threats.0rce.com`;
  const { rows } = await query<any>(
    `SELECT d.id, d.title, d.url, d.summary, d.published_at, d.fetched_at,
            s.name as source_name
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id
     ORDER BY COALESCE(d.published_at, d.fetched_at) DESC
     LIMIT 50`
  );

  const entries = rows.map((d: any) => {
    const updated = (d.published_at || d.fetched_at || new Date()).toISOString();
    const link = d.url || `${base}/document/${d.id}`;
    return `<entry>
  <title>${esc(d.title || '')}</title>
  <link href="${esc(link)}"/>
  <id>${base}/document/${d.id}</id>
  <updated>${updated}</updated>
  <published>${updated}</published>
  <summary type="html">${esc((d.summary || '').slice(0, 400))}</summary>
  <author><name>${esc(d.source_name || 'threats.0rce.com')}</name></author>
</entry>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>0RCE Threat Intelligence Feed</title>
  <subtitle>Aggregated cyber threat intelligence — TLP:GREEN</subtitle>
  <link href="${base}/feed.xml" rel="self"/>
  <link href="${base}/" rel="alternate"/>
  <id>${base}/feed.xml</id>
  <updated>${new Date().toISOString()}</updated>
  <generator uri="${base}">threats.0rce.com</generator>
${entries}
</feed>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'max-age=300, public',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
