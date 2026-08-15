'use client';

import { useEffect, useState } from 'react';

// localStorage tabanlı favori butonu — auth yok (K4 gereği)
// Kullanım: <BookmarkButton type="document" id={33} title="..." />
export default function BookmarkButton({ type, id, title }: { type: string; id: string | number; title?: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const key = `bm:${type}:${id}`;
    try { setSaved(localStorage.getItem(key) === '1'); } catch {}
  }, [type, id]);

  const toggle = () => {
    const key = `bm:${type}:${id}`;
    try {
      if (saved) {
        localStorage.removeItem(key);
        setSaved(false);
      } else {
        localStorage.setItem(key, '1');
        // bookmark listesine kaydet (ad + tip + zaman)
        const list = JSON.parse(localStorage.getItem('bm:list') || '[]');
        const entry = { type, id: String(id), title: title || '', ts: Date.now() };
        const filtered = list.filter((e: any) => !(e.type === type && String(e.id) === String(id)));
        filtered.push(entry);
        localStorage.setItem('bm:list', JSON.stringify(filtered));
        setSaved(true);
      }
      // küçük bir olay — diğer sekmelerdeki butonlar güncellensin
      window.dispatchEvent(new CustomEvent('bookmarks-changed'));
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      title={saved ? 'Remove bookmark' : 'Bookmark this'}
      className={`inline-flex items-center justify-center w-7 h-7 border transition-colors ${
        saved ? 'border-[#ffd60a] text-[#ffd60a]' : 'border-line text-dim hover:text-fg hover:border-fg'
      }`}
    >
      {saved ? '★' : '☆'}
    </button>
  );
}
