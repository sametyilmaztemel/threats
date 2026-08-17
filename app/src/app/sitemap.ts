// app/sitemap.ts — Madde 13: dinamik sitemap.xml
import type { MetadataRoute } from 'next';
import { getStats } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const BASE = 'https://threats.0rce.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stats = await getStats().catch(() => ({}) as any);
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'hourly', priority: 1.0 },
    { url: `${BASE}/feed`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE}/cves`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/actors`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/iocs`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/trends`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${BASE}/graph`, lastModified: now, changeFrequency: 'daily', priority: 0.5 },
    { url: `${BASE}/ai-threats`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/sources`, lastModified: now, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${BASE}/reports`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE}/stats`, lastModified: now, changeFrequency: 'weekly', priority: 0.4 },
  ];
}
