import { getIOC } from '@/lib/db';
import { relativeTime } from '@/lib/format';
import BookmarkButton from '@/components/ui/BookmarkButton';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function parseMeta(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

export default async function IOCPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const ioc = await getIOC(id);
  if (!ioc) notFound();

  const meta = parseMeta(ioc.raw);
  const tags: string[] = ioc.tags || [];
  const isIP = ioc.type === 'attacker_ip' || ioc.type === 'c2_ip';
  const isURL = ioc.type === 'malicious_url' || ioc.type === 'phishing_url';
  const isHash = ioc.type === 'ssl_sha1' || ioc.type === 'md5' || ioc.type === 'sha256';

  return (
    <div className="min-h-screen pb-16 md:pb-32">
      <article className="max-w-[900px] mx-auto px-4 md:px-8 pt-6 md:pt-12">
        {/* Breadcrumb */}
        <div className="text-[10px] tracking-widest2 text-dim mb-6 flex gap-2">
          <Link href="/" className="hover:text-fg">/HOME</Link>
          <span>›</span>
          <Link href="/iocs" className="hover:text-fg">/IOCS</Link>
          <span>›</span>
          <span className="text-fg">/IOC/{id}</span>
        </div>

        {/* Hero */}
        <div className="mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">INDICATOR OF COMPROMISE</div>
          <h1 className={`text-2xl md:text-3xl font-light leading-tight tracking-wider2 mb-4 font-mono break-all ${isIP ? 'text-[#ff9500]' : isURL ? 'text-[#ff3030]' : 'text-fg'}`}>
            {ioc.value}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-[10px] tracking-widest2 text-dim">
            <span className="text-fg border border-fg px-2 py-[1px]">{ioc.type.toUpperCase().replace('_', ' ')}</span>
            <span>{tagValue(ioc.source_name)}</span>
            {ioc.first_seen && <span>FIRST SEEN {new Date(ioc.first_seen).toISOString().slice(0, 10)}</span>}
            {ioc.last_seen && <span>LAST SEEN {relativeTime(ioc.last_seen)}</span>}
            <span className="ml-auto flex items-center gap-2 text-dim">
              <BookmarkButton type="ioc" id={ioc.id} title={ioc.value} />
              ID #{ioc.id}
            </span>
          </div>
        </div>

        {/* Intelligence grid */}
        <div className="border border-line mb-6 md:mb-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 md:px-5 py-2 md:py-3">
            <div className="text-[11px] tracking-widest2">IOC INTELLIGENCE</div>
            <div className="text-[10px] tracking-widest2 text-dim">CONFIDENCE 0.85</div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-line">
            {/* Type-specific renderings */}
            {isIP && (
              <>
                <div className="bg-bg p-3 md:p-4">
                  <div className="text-[10px] tracking-widest2 text-dim mb-2">COUNTRY</div>
                  <div className="text-[13px]">{meta.country || '—'}</div>
                </div>
                <div className="bg-bg p-3 md:p-4">
                  <div className="text-[10px] tracking-widest2 text-dim mb-2">ASN</div>
                  <div className="text-[13px] font-mono break-all">{meta.asn || '—'}</div>
                </div>
                <div className="bg-bg p-3 md:p-4 col-span-2">
                  <div className="text-[10px] tracking-widest2 text-dim mb-2">ASN NAME</div>
                  <div className="text-[13px] break-words">{meta.asn_name || meta.as_name || '—'}</div>
                </div>
                <div className="bg-bg p-3 md:p-4">
                  <div className="text-[10px] tracking-widest2 text-dim mb-2">PORT</div>
                  <div className="text-[13px] font-mono">{meta.port || '—'}</div>
                </div>
                <div className="bg-bg p-3 md:p-4">
                  <div className="text-[10px] tracking-widest2 text-dim mb-2">STATUS</div>
                  <div className="text-[13px]">{meta.status || '—'}</div>
                </div>
                {meta.malware && (
                  <div className="bg-bg p-3 md:p-4 col-span-2">
                    <div className="text-[10px] tracking-widest2 text-dim mb-2">ASSOCIATED MALWARE</div>
                    <div className="text-[14px] break-words" style={{ color: '#ff3030' }}>{meta.malware}</div>
                  </div>
                )}
              </>
            )}

            {isURL && (
              <>
                <div className="bg-bg p-3 md:p-4 col-span-2">
                  <div className="text-[10px] tracking-widest2 text-dim mb-2">URL</div>
                  <div className="text-[12px] font-mono break-all">{ioc.value}</div>
                </div>
                {meta.threat && (
                  <div className="bg-bg p-3 md:p-4 col-span-2">
                    <div className="text-[10px] tracking-widest2 text-dim mb-2">THREAT TYPE</div>
                    <div className="text-[14px] break-words">{meta.threat}</div>
                  </div>
                )}
                {meta.tags && Array.isArray(meta.tags) && (
                  <div className="bg-bg p-3 md:p-4 col-span-2">
                    <div className="text-[10px] tracking-widest2 text-dim mb-2">TAGS</div>
                    <div className="flex flex-wrap gap-1">
                      {meta.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
                    </div>
                  </div>
                )}
                {meta.reporter && (
                  <div className="bg-bg p-3 md:p-4">
                    <div className="text-[10px] tracking-widest2 text-dim mb-2">REPORTER</div>
                    <div className="text-[12px] break-words">{meta.reporter}</div>
                  </div>
                )}
                {meta.status && (
                  <div className="bg-bg p-3 md:p-4">
                    <div className="text-[10px] tracking-widest2 text-dim mb-2">STATUS</div>
                    <div className="text-[12px] break-words">{meta.status}</div>
                  </div>
                )}
              </>
            )}

            {isHash && (
              <>
                <div className="bg-bg p-3 md:p-4 col-span-2">
                  <div className="text-[10px] tracking-widest2 text-dim mb-2">{ioc.type.toUpperCase().replace('_', ' ')}</div>
                  <div className="text-[12px] font-mono break-all">{ioc.value}</div>
                </div>
                {meta.reason && (
                  <div className="bg-bg p-3 md:p-4 col-span-2">
                    <div className="text-[10px] tracking-widest2 text-dim mb-2">LISTING REASON</div>
                    <div className="text-[12px] break-words">{meta.reason}</div>
                  </div>
                )}
              </>
            )}

            {/* Generic tags from DB */}
            {tags.length > 0 && (
              <div className="bg-bg p-3 md:p-4 col-span-2">
                <div className="text-[10px] tracking-widest2 text-dim mb-2">TAGS</div>
                <div className="flex flex-wrap gap-1">
                  {tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Raw meta (collapsible-style) */}
        {Object.keys(meta).length > 0 && (
          <div className="mb-6 md:mb-8">
            <div className="text-[10px] tracking-widest2 text-dim mb-3">RAW METADATA</div>
            <pre className="border border-line p-3 md:p-4 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        )}

        {/* Back link */}
        <div className="mt-8 md:mt-12">
          <Link href="/iocs" className="text-[10px] tracking-widest2 text-dim hover:text-fg">
            ← BACK TO IOCS
          </Link>
        </div>
      </article>
    </div>
  );
}

function tagValue(s: string | null | undefined): string {
  if (!s) return '—';
  return s;
}
