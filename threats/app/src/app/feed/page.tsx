import { getRecentDocuments } from '@/lib/db';
import DocumentRow from '@/components/DocumentRow';

export const dynamic = 'force-dynamic';

export default async function FeedPage({ searchParams }: { searchParams: { ai?: string; severity?: string } }) {
  const aiOnly = searchParams.ai === '1';
  const docs = await getRecentDocuments(200, aiOnly);

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-12">
      <div className="mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/FEED</div>
        <h1 className="text-3xl font-light tracking-wider2">
          {aiOnly ? 'AI THREAT FEED' : 'LIVE FEED'} <span className="terminal-cursor" />
        </h1>
      </div>
      <div className="flex gap-3 mb-6 text-[11px] tracking-widest2">
        <a href="/feed" className={`px-3 py-1 border ${!aiOnly ? 'border-fg text-fg' : 'border-line text-dim hover:text-fg hover:border-fg'}`}>ALL</a>
        <a href="/feed?ai=1" className={`px-3 py-1 border ${aiOnly ? 'border-fg text-fg' : 'border-line text-dim hover:text-fg hover:border-fg'}`}>AI ONLY</a>
      </div>
      <div className="border-t border-line">
        {docs.map((doc: any) => <DocumentRow key={doc.id} doc={doc} />)}
      </div>
    </div>
  );
}
