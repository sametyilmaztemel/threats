'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// /bookmarks — localStorage'daki favorileri listeler (client-only)
type Bm = { type: string; id: string; title: string; ts: number };

const TYPE_LABEL: Record<string, string> = {
  document: 'REPORT', cve: 'CVE', actor: 'ACTOR', ioc: 'IOC', sector: 'SECTOR', technique: 'TECHNIQUE',
};

export default function BookmarksPage() {
  const [items, setItems] = useState<Bm[]>([]);

  useEffect(() => {
    const load = () => {
      try {
        const list = JSON.parse(localStorage.getItem('bm:list') || '[]');
        setItems(list.sort((a: Bm, b: Bm) => b.ts - a.ts));
      } catch { setItems([]); }
    };
    load();
    window.addEventListener('bookmarks-changed', load);
    return () => window.removeEventListener('bookmarks-changed', load);
  }, []);

  const remove = (type: string, id: string) => {
    try {
      localStorage.removeItem(`bm:${type}:${id}`);
      const list = JSON.parse(localStorage.getItem('bm:list') || '[]').filter((e: Bm) => !(e.type === type && e.id === id));
      localStorage.setItem('bm:list', JSON.stringify(list));
      setItems(list);
      window.dispatchEvent(new CustomEvent('bookmarks-changed'));
    } catch {}
  };

  const hrefFor = (b: Bm) => {
    if (b.type === 'document') return `/document/${b.id}`;
    if (b.type === 'cve') return `/cve/${b.id}`;
    if (b.type === 'actor') return `/actor/${b.title.toLowerCase().replace(/\s+/g, '-')}`;
    if (b.type === 'ioc') return `/ioc/${b.id}`;
    if (b.type === 'technique') return `/technique/${b.id}`;
    if (b.type === 'sector') return `/sector/${b.id}`;
    return '/';
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/BOOKMARKS</div>
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2">BOOKMARKS <span className="terminal-cursor" /></h1>
        <p className="text-xs text-dim mt-2">Stored locally in your browser · no account needed</p>
      </div>

      {items.length === 0 ? (
        <div className="border border-line p-8 md:p-12 text-center text-dim text-sm">
          No bookmarks yet. Click the ☆ on any report, CVE, actor, or IOC to save it here.
        </div>
      ) : (
        <div className="space-y-px">
          {items.map(b => (
            <div key={`${b.type}:${b.id}`} className="flex items-center gap-3 p-3 md:p-4 border-b border-line hover:bg-panel transition-colors">
              <span className="text-[9px] tracking-widest2 text-dim border border-line px-1.5 py-0.5 flex-shrink-0">
                {TYPE_LABEL[b.type] || b.type.toUpperCase()}
              </span>
              <Link href={hrefFor(b)} className="flex-1 min-w-0 text-[13px] font-light truncate hover:text-fg">
                {b.title || b.id}
              </Link>
              <button
                onClick={() => remove(b.type, b.id)}
                className="text-[10px] tracking-widest2 text-dim hover:text-[#ff3030] border border-line px-2 py-1 flex-shrink-0 transition-colors"
              >
                REMOVE
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
