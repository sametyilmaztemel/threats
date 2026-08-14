import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/v1 — API index
export async function GET() {
  const base = 'https://threats.0rce.com';
  return NextResponse.json({
    ok: true,
    name: '0RCE Threat Intelligence API',
    version: 'v1',
    tlp: 'GREEN',
    docs: {
      documents: `${base}/api/v1/documents?limit=25&q=&source=&sev=&ai=`,
      iocs: `${base}/api/v1/iocs?limit=50&type=&q=`,
      cves: `${base}/api/v1/cves?limit=50&q=&sev=&vendor=`,
      feed_atom: `${base}/feed.xml`,
    },
    notes: 'All endpoints public, read-only, TLP:GREEN. 300s cache.',
    generated: new Date().toISOString(),
  });
}
