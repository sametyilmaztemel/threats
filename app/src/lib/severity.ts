// severity.ts — canonical CVSS scoring + NULL-safe severity labels.
// All CVSS values outside [0,10] or non-finite map to null.
// Used by db.ts queries (severity filter) and CVEsPage rendering.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export function canonicalCvss(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null;
  const n = typeof input === 'string' ? parseFloat(input) : Number(input);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 10) return null;
  // Round to one decimal (matches CVSS v3 spec)
  return Math.round(n * 10) / 10;
}

export function severityFromCvss(cvss: number | string | null | undefined): Severity {
  const n = canonicalCvss(cvss);
  if (n === null) return 'unknown';
  if (n >= 9.0) return 'critical';
  if (n >= 7.0) return 'high';
  if (n >= 4.0) return 'medium';
  return 'low';
}

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 9, high: 7, medium: 4, low: 1, unknown: 0,
};

/** SQL ORDER BY fragment that puts NULL CVSS last when sorting by CVSS descending. */
export const ORDER_BY_CVSS_DESC = 'ORDER BY cvss_v3 DESC NULLS LAST';
