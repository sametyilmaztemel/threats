import { getCVEList, getCVECount } from '@/lib/db';
import Breadcrumb from '@/components/layout/Breadcrumb';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toISOString().split('T')[0];
}

function cvssColor(score: number | null): string {
  if (score === null) return '#555';
  if (score >= 9) return '#ff3030';
  if (score >= 7) return '#ff5c5c';
  if (score >= 4) return '#ffd60a';
  return '#00d97e';
}

function cvssLabel(score: number | null): string {
  if (score === null) return '—';
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

export default async function CVEsPage({ searchParams }: { searchParams: { q?: string; sev?: string; vendor?: string; page?: string } }) {
  const page = Math.max(1, parseInt(searchParams.page || '1') || 1);
  const q = searchParams.q || '';
  const sev = searchParams.sev || '';
  const vendor = searchParams.vendor || '';
  // sev: critical=9, high=7, medium=4, low=1
  const sevMap: Record<string, number> = { critical: 9, high: 7, medium: 4, low: 1 };
  const minCvss = sevMap[sev] ?? undefined;
  const [cves, total] = await Promise.all([
    getCVEList(page, PAGE_SIZE, q, minCvss, vendor),
    getCVECount(q, minCvss, vendor),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pages: number[] = [];
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);
  for (let p = startPage; p <= endPage; p++) pages.push(p);

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (sev) p.set('sev', sev);
    if (vendor) p.set('vendor', vendor);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <Breadcrumb items={[{ label: '/home', href: '/' }, { label: '/cves' }]} />

      {/* Hero */}
      <section className="mb-8 md:mb-10">
        <div className="text-[10px] tracking-widest2 text-dim mb-3">ENRICHED CVE DATABASE</div>
        <h1 className="text-2xl md:text-4xl font-extralight tracking-wider2">
          CVES<span className="text-high">.</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-[11px] font-mono text-dim">
          <div>{total} CVEs</div>
          <div>CVSS · vendor · product</div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#ff3030] inline-block" /> critical</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#ff5c5c] inline-block" /> high</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#ffd60a] inline-block" /> medium</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#00d97e] inline-block" /> low</span>
          </div>
        </div>

        {/* Filter bar */}
        <form method="GET" className="mt-5 flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="CVE ID / keyword…"
            className="flex-1 min-w-[180px] bg-transparent border border-line px-3 py-2 text-[12px] font-mono outline-none placeholder:text-dim/50"
          />
          <select
            name="sev"
            defaultValue={sev}
            className="bg-bg border border-line px-3 py-2 text-[12px] font-mono outline-none text-dim"
          >
            <option value="">SEVERITY: ALL</option>
            <option value="critical">CRITICAL (≥9.0)</option>
            <option value="high">HIGH (≥7.0)</option>
            <option value="medium">MEDIUM (≥4.0)</option>
            <option value="low">LOW (≥1.0)</option>
          </select>
          <input
            type="text"
            name="vendor"
            defaultValue={vendor}
            placeholder="Vendor…"
            className="w-36 bg-transparent border border-line px-3 py-2 text-[12px] font-mono outline-none placeholder:text-dim/50"
          />
          <button type="submit" className="px-4 py-2 text-[10px] tracking-widest2 border border-[#00d97e] text-[#00d97e] hover:bg-[#00d97e] hover:text-bg transition-colors">
            FILTER
          </button>
          {(q || sev || vendor) && (
            <a href="/cves" className="px-3 py-2 text-[10px] tracking-widest2 text-dim hover:text-fg border border-line transition-colors">
              RESET
            </a>
          )}
        </form>
      </section>

      {/* CVE table */}
      <div className="border border-line overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] tracking-widest2 text-dim border-b border-line">
              <th className="text-left px-3 py-2 font-normal">CVE</th>
              <th className="text-left px-3 py-2 font-normal">CVSS</th>
              <th className="text-left px-3 py-2 font-normal">SEVERITY</th>
              <th className="text-left px-3 py-2 font-normal hidden sm:table-cell">VENDOR / PRODUCT</th>
              <th className="text-left px-3 py-2 font-normal hidden md:table-cell">DESCRIPTION</th>
              <th className="text-right px-3 py-2 font-normal hidden sm:table-cell">MENTIONS</th>
              <th className="text-right px-3 py-2 font-normal hidden lg:table-cell">PUBLISHED</th>
            </tr>
          </thead>
          <tbody>
            {cves.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-dim text-[12px]">No CVEs found.</td></tr>
            )}
            {cves.map((c: any) => (
              <tr key={c.cve_id} className="border-b border-line/50 hover:bg-fg/5 transition-colors">
                <td className="px-3 py-2">
                  <a href={`/cve/${c.cve_id}`} className="text-[#ffd60a] hover:underline font-mono">
                    {c.cve_id}
                  </a>
                </td>
                <td className="px-3 py-2 font-mono" style={{ color: cvssColor(c.cvss_v3) }}>
                  {c.cvss_v3 !== null ? Number(c.cvss_v3).toFixed(1) : '—'}
                </td>
                <td className="px-3 py-2">
                  <span className="text-[9px] tracking-widest px-1.5 py-[2px] border" style={{ color: cvssColor(c.cvss_v3), borderColor: cvssColor(c.cvss_v3) }}>
                    {cvssLabel(c.cvss_v3)}
                  </span>
                </td>
                <td className="px-3 py-2 text-dim hidden sm:table-cell">
                  {c.vendor ? <span className="text-fg">{c.vendor}</span> : '—'}
                  {c.product ? <span className="text-dim/70"> / {c.product}</span> : ''}
                </td>
                <td className="px-3 py-2 text-dim hidden md:table-cell max-w-[340px] truncate">
                  {c.description?.slice(0, 120) || '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono hidden sm:table-cell">
                  {c.mentions}
                  {c.ai_mentions > 0 && <span className="text-[#ff9500] ml-1">AI</span>}
                </td>
                <td className="px-3 py-2 text-right text-dim hidden lg:table-cell">{fmtDate(c.published_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-6">
          {page > 1 && (
            <a
              href={`/cves${qs({ page: String(page - 1) })}`}
              className="px-3 py-1.5 text-[11px] border border-line hover:bg-fg hover:text-bg transition-colors"
            >←</a>
          )}
          {pages.map(p => (
            <a
              key={p}
              href={`/cves${qs({ page: String(p) })}`}
              className={`px-3 py-1.5 text-[11px] border transition-colors ${
                p === page ? 'bg-fg text-bg border-fg' : 'border-line hover:bg-fg/10'
              }`}
            >{p}</a>
          ))}
          {page < totalPages && (
            <a
              href={`/cves${qs({ page: String(page + 1) })}`}
              className="px-3 py-1.5 text-[11px] border border-line hover:bg-fg hover:text-bg transition-colors"
            >→</a>
          )}
          <span className="ml-3 text-[10px] text-dim font-mono">{page}/{totalPages}</span>
        </div>
      )}
    </div>
  );
}
