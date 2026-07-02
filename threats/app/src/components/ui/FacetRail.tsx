import Link from 'next/link';

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  selected: boolean;
}

export interface Facet {
  name: string;
  label: string;
  values: FacetValue[];
}

export interface FacetRailProps {
  facets: Facet[];
  baseUrl?: string;
}

function toggleUrl(baseUrl: string, facetName: string, value: string, selected: boolean): string {
  const url = new URL(baseUrl, 'http://placeholder.local');
  const params = url.searchParams;
  const current = params.get(facetName);
  let next: string[];
  if (current) {
    const arr = current.split(',').filter(Boolean);
    if (selected) {
      next = arr.filter((v) => v !== value);
    } else {
      next = arr.includes(value) ? arr : [...arr, value];
    }
  } else {
    next = selected ? [] : [value];
  }
  if (next.length === 0) {
    params.delete(facetName);
  } else {
    params.set(facetName, next.join(','));
  }
  const qs = params.toString();
  return `${url.pathname}${qs ? `?${qs}` : ''}`;
}

export default function FacetRail({ facets, baseUrl = '/feed' }: FacetRailProps) {
  return (
    <aside className="w-full md:w-[280px] flex-shrink-0 md:sticky md:top-20 md:self-start">
      <div className="text-[10px] tracking-widest2 text-dim uppercase mb-4 border-b border-line pb-2">
        FILTERS
      </div>
      {facets.map((facet) => (
        <section key={facet.name} className="mb-6">
          <h3 className="text-[10px] tracking-widest2 text-dim uppercase border-b border-line pb-1 mb-2">
            {facet.label}
          </h3>
          <ul className="flex flex-col">
            {facet.values.map((v) => {
              const href = toggleUrl(baseUrl, facet.name, v.value, v.selected);
              return (
                <li key={`${facet.name}:${v.value}`}>
                  <Link
                    href={href}
                    className={`flex items-center justify-between py-1 px-2 hover:bg-bg-2 transition-colors ${
                      v.selected ? 'bg-bg-2 text-fg' : 'text-dim'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-block w-3 h-3 border ${
                          v.selected ? 'bg-fg border-fg' : 'border-line'
                        }`}
                        aria-hidden
                      >
                        {v.selected && (
                          <span className="block w-full h-full leading-none text-bg text-[10px] text-center">
                            ×
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[11px] truncate">{v.label}</span>
                    </span>
                    <span className="font-mono text-[10px] text-dim tabular-nums">
                      {v.count.toLocaleString('en-US')}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}