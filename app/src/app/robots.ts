// app/robots.ts — Madde 13
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://threats.0rce.com/sitemap.xml',
  };
}
