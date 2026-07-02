export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  return n.toLocaleString('en-US');
}

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toISOString().slice(0, 10);
}

export function format(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export function severityClass(sev: number | null | undefined): string {
  if (sev == null) return 'text-dim';
  if (sev >= 8) return 'sev-crit';
  if (sev >= 5) return 'sev-high';
  if (sev >= 3) return 'sev-med';
  return 'sev-low';
}

export function severityLabel(sev: number | null | undefined): string {
  if (sev == null) return 'UNK';
  if (sev >= 9) return 'CRIT';
  if (sev >= 7) return 'HIGH';
  if (sev >= 4) return 'MED';
  if (sev >= 1) return 'LOW';
  return 'INFO';
}

export function truncate(s: string, n = 140): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
