import EntityBadge from '@/components/ui/EntityBadge';

type Kind = 'actor' | 'technique' | 'cve' | 'ioc' | 'sector' | 'source';

export interface RelatedItem {
  kind: string;
  value: string;
  display: string;
  count?: number;
}

export interface RelatedEntitiesProps {
  items: RelatedItem[];
}

const VALID_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  'actor',
  'technique',
  'cve',
  'ioc',
  'sector',
  'source',
]);

function isValidKind(k: string): k is Kind {
  return VALID_KINDS.has(k as Kind);
}

function hrefFor(kind: Kind, value: string): string {
  const slug = value.toLowerCase().replace(/\s+/g, '-');
  switch (kind) {
    case 'actor':
      return `/actor/${slug}`;
    case 'technique':
      return `/technique/${encodeURIComponent(value)}`;
    case 'cve':
      return `/cve/${encodeURIComponent(value.toUpperCase())}`;
    case 'ioc':
      return `/ioc/${encodeURIComponent(value)}`;
    case 'sector':
      return `/sector/${slug}`;
    case 'source':
      return `/sources#${slug}`;
  }
}

export default function RelatedEntities({ items }: RelatedEntitiesProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {items.map((item, i) => {
        const kind = isValidKind(item.kind) ? item.kind : 'source';
        return (
          <EntityBadge
            key={`${item.kind}-${item.value}-${i}`}
            kind={kind}
            label={item.display}
            count={item.count}
            href={hrefFor(kind, item.value)}
          />
        );
      })}
    </div>
  );
}