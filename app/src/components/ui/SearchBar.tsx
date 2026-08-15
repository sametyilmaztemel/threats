'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export interface SearchBarProps {
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

type Suggestion = { type: string; id: string | number; label: string };

export default function SearchBar({
  defaultValue = '',
  placeholder = 'Search: +required -excluded "phrase"',
  autoFocus = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/suggest?q=${encodeURIComponent(query.trim())}&type=all`);
        const j = await r.json();
        setSuggestions(j.suggestions || []);
        setOpen(true);
      } catch { setSuggestions([]); }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [query]);

  const hrefFor = (s: Suggestion) => {
    if (s.type === 'document') return `/document/${s.id}`;
    if (s.type === 'actor') return `/actor/${String(s.label).toLowerCase().replace(/\s+/g, '-')}`;
    if (s.type === 'cve') return `/cve/${s.label}`;
    if (s.type === 'source') return `/feed?source=${encodeURIComponent(s.label)}`;
    if (s.type === 'sector') return `/sector/${encodeURIComponent(s.label)}`;
    return '#';
  };

  const TYPE_COLOR: Record<string, string> = {
    document: '#00d97e', actor: '#ff3030', cve: '#ffd60a', source: '#00b4d8', sector: '#a05cff',
  };

  return (
    <form action="/feed" method="GET" className="w-full" onSubmit={() => setOpen(false)}>
      <div className="flex items-stretch border border-line bg-bg-2 focus-within:border-fg transition-colors relative">
        <input
          type="text"
          name="q"
          value={query}
          onChange={(e) => { setQuery(e.target.value); }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 px-3 py-2 bg-transparent text-fg font-mono text-[13px] placeholder:text-dim focus:outline-none"
        />
        <button
          type="submit"
          className="px-4 py-2 border-l border-line text-[10px] font-mono tracking-widest2 text-fg hover:bg-fg hover:text-bg transition-colors"
        >
          SEARCH
        </button>

        {/* Autocomplete dropdown */}
        {open && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 border border-line bg-bg z-50 shadow-lg">
            {suggestions.map((s, i) => (
              <Link
                key={`${s.type}:${s.id}`}
                href={hrefFor(s)}
                onMouseDown={(e) => e.preventDefault()}
                className="flex items-center gap-2 px-3 py-2 border-b border-line/50 last:border-0 hover:bg-bg-2 transition-colors"
              >
                <span className="text-[9px] tracking-widest2 font-mono border border-line px-1 py-[1px] flex-shrink-0" style={{ color: TYPE_COLOR[s.type] || '#888' }}>
                  {s.type.toUpperCase()}
                </span>
                <span className="text-[12px] font-light truncate text-fg">{s.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1 text-[9px] tracking-widest2 text-dim font-mono">
        SYNTAX: <span className="text-fg">+required</span> <span className="text-fg">-excluded</span> <span className="text-fg">&quot;phrase&quot;</span> <span className="text-fg">actor:conti</span> <span className="text-fg">cve:CVE-2024-*</span>
      </div>
    </form>
  );
}
