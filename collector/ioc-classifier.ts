// ioc-classifier.ts — classifies IOCs into mentioned/observed/suspicious/confirmed_malicious.
// Used by link-iocs.ts, extract-iocs-from-text.ts, IOC page rendering.
//
// Allowed domains (popular infrastructure) are only IOC when paired with explicit
// malicious-subdomain evidence, never just because the text mentions them.

export type IocClassification = 'mentioned' | 'observed' | 'suspicious' | 'confirmed_malicious';

export const PUBLIC_INFRASTRUCTURE: ReadonlySet<string> = new Set([
  'github.com', 'github.io', 'githubusercontent.com', 'raw.githubusercontent.com',
  'microsoft.com', 'microsoftonline.com', 'office.com', 'office365.com', 'live.com', 'outlook.com', 'azure.com', 'azurewebsites.net',
  'google.com', 'googleapis.com', 'gstatic.com', 'googleusercontent.com', 'ggpht.com',
  'cloudflare.com', 'cloudflare-dns.com', 'cf-ipfs.com',
  'amazonaws.com', 'aws.amazon.com', 'cloudfront.net', 's3.amazonaws.com',
  'apple.com', 'icloud.com', 'apple-dns.net',
  'facebook.com', 'fb.com', 'fbcdn.net',
  'twitter.com', 'x.com', 't.co',
  'linkedin.com', 'licdn.com',
  'wikipedia.org', 'wikimedia.org',
  'ubuntu.com', 'debian.org', 'kernel.org',
  'localhost', 'localhost.localdomain',
]);

/** Is `host` (e.g. github.com, sub.example.com) an allowed public infrastructure domain? */
export function isPublicInfrastructure(host: string): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  if (PUBLIC_INFRASTRUCTURE.has(h)) return true;
  // Also match a 1-level subdomain of the registered public domain
  for (const pub of PUBLIC_INFRASTRUCTURE) {
    if (h.endsWith('.' + pub)) return true;
  }
  return false;
}

export interface ClassifiedIOC {
  value: string;
  type: string;
  classification: IocClassification;
  extractionMethod: string;
  confidence: number;
  reason?: string;
}

/** Decide how strong the evidence is that a value is actually a malicious IOC. */
export function classifyIoc(
  value: string, type: string, context: { hasSourceLink: boolean; hasMaliciousKeyword: boolean },
): ClassifiedIOC {
  let classification: IocClassification = 'observed';
  let confidence = 0.5;
  let reason = '';
  let method = 'regex_text';

  if (isPublicInfrastructure(value)) {
    return {
      value, type, classification: 'mentioned', extractionMethod: method,
      confidence: 0.1, reason: 'public_infrastructure',
    };
  }

  if (context.hasMaliciousKeyword) {
    classification = 'confirmed_malicious';
    confidence = 0.95;
    reason = 'malicious_keyword_context';
    method = 'feed_source';
  } else if (context.hasSourceLink) {
    classification = 'suspicious';
    confidence = 0.7;
    reason = 'source_referenced';
  }

  return { value, type, classification, extractionMethod: method, confidence, reason };
}
