import { getCVEs } from '@/lib/db';
import DocumentRow from '@/components/DocumentRow';

export const dynamic = 'force-dynamic';

export default async function CVEsPage() {
  const docs = await getCVEs(100);
  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/CVES</div>
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2">CVE FEED</h1>
      </div>
      <div className="border-t border-line">
        {docs.length === 0 ? <div className="p-8 md:p-12 text-center text-dim text-sm">No CVE-tagged documents yet.</div> : docs.map((d: any) => <DocumentRow key={d.id} doc={d} />)}
      </div>
    </div>
  );
}
