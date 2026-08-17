// actor-match.ts — canonical threat actor name + alias matching utilities.
// Used by link-actors.ts and content-backfill.ts to avoid false positives.
//
// A "strong match" requires:
//   1. canonical_name OR alias (case-insensitive, normalized)
//   2. word-boundary context (\\b...\\b or quoted/parenthesized or "known-as" phrases)
//   3. length >= 4 characters on the alias term
//
// Generic short words (apt, group, silver, panda, …) are excluded via SKIP_ALIASES.

export const SKIP_ALIASES: ReadonlySet<string> = new Set([
  'apt', 'unit', 'group', 'team', 'gang', 'sector', 'hive', 'play',
  'silver', 'gold', 'cobalt', 'magic', 'dark', 'black', 'blue', 'red',
  'snake', 'dragon', 'tiger', 'panda', 'bear', 'kitten', 'falcon',
  'iron', 'steel', 'grizzly', 'cozy', 'fancy',
  'midnight', 'forest', 'blizzard', 'velvet', 'chollima',
  'silence', 'equation', 'continue', 'continuous', 'conditional',
  'wizard', 'spider',
]);

export interface ActorMatch {
  actorName: string;
  alias: string;
  confidence: number;       // 0..1
  matchReason: string;      // 'alias_word_boundary' | 'alias_phrasal' | 'canonical_name'
  matchedText: string;
  context: string;          // ~80-char window around the match
}

/** Normalize a string for matching: NFKD + strip combining marks, lowercase, collapse spaces. */
export function normalize(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2012-\u2014]/g, '-') // various dashes
    .replace(/[^a-z0-9\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alias is matchable if length >= 4 and not in the generic skip list. */
export function isMatchableAlias(alias: string): boolean {
  const n = normalize(alias);
  if (n.length < 4) return false;
  if (SKIP_ALIASES.has(n)) return false;
  // Reject aliases that are entirely numeric or punctuation
  if (!/[a-z]/.test(n)) return false;
  // Multi-word aliases: require ALL words to be present together with a
  // shared proximity window. This prevents e.g. "Equation Group" matching
  // any text that just contains "equation".
  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    for (const t of tokens) {
      if (t.length < 3) continue; // tiny particles (the, and, of, …) ignored
      if (SKIP_ALIASES.has(t)) return false;
    }
  }
  return true;
}

/**
 * Canonical name always matchable (even if it contains generic tokens like
 * "equation" or "group"). Aliases go through the stricter isMatchableAlias
 * filter. This is the key asymmetry that lets "Equation Group" match as a
 * whole actor name while preventing the standalone word "equation" from
 * matching random text.
 */
export function isMatchableCanonical(name: string): boolean {
  const n = normalize(name);
  if (n.length < 4) return false;
  if (!/[a-z]/.test(n)) return false;
  return true;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordChar(ch: string): boolean {
  return /[a-z0-9_]/i.test(ch);
}

/**
 * Does every "token" (word of length >= 3) of `alias` occur as a word-boundary
 * match within `text` AND within `maxDistance` chars of each other?
 * This is the strong form of the match used for multi-word aliases.
 */
function hasProximateWordMatch(text: string, alias: string, maxDistance = 120): { hit: boolean; ctx: string } {
  const tokens = alias.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
  if (tokens.length < 2) return { hit: false, ctx: '' };
  // Locate the position of each token (case-insensitive, word-boundary)
  const positions: number[] = [];
  for (const tok of tokens) {
    const re = new RegExp(`(?:^|[^a-z0-9_])(${escapeRegExp(tok)})(?:[^a-z0-9_]|$)`, 'i');
    const m = text.match(re);
    if (!m || m.index === undefined) return { hit: false, ctx: '' };
    positions.push(m.index + (m[0].startsWith(tok[0]) ? 0 : 1)); // bias to token start
  }
  if (positions.length !== tokens.length) return { hit: false, ctx: '' };
  const minP = Math.min(...positions);
  const maxP = Math.max(...positions);
  if (maxP - minP > maxDistance) return { hit: false, ctx: '' };
  // Order matters for "Equation Group" — but we accept any order to be permissive
  // for the rare cases where the alias is written in a different order.
  const start = Math.max(0, minP - 40);
  const end = Math.min(text.length, maxP + tokens[tokens.length - 1].length + 40);
  return { hit: true, ctx: text.slice(start, end).trim() };
}

/** Does `alias` occur in `text` as a whole word? Word chars [a-z0-9_] as boundaries. */
function hasWordBoundaryMatch(text: string, alias: string): { hit: boolean; ctx: string } {
  const re = new RegExp(`(?:^|[^a-z0-9_])(${escapeRegExp(alias)})(?:[^a-z0-9_]|$)`, 'i');
  const m = text.match(re);
  if (!m || m.index === undefined) return { hit: false, ctx: '' };
  const start = Math.max(0, m.index - 40);
  const end = Math.min(text.length, m.index + m[0].length + 40);
  return { hit: true, ctx: text.slice(start, end).trim() };
}

/** Does `alias` occur in `text` inside a known "also known as" phrase? */
function hasPhrasalMatch(text: string, alias: string): { hit: boolean; ctx: string } {
  const phrases = [
    'also known as', 'aka', 'also-called', 'also called', 'tracked as',
    'referred to as', 'also referred', 'known as', 'aka.',
  ];
  for (const ph of phrases) {
    const re = new RegExp(`${escapeRegExp(ph)}\\s+(${escapeRegExp(alias)})`, 'i');
    const m = text.match(re);
    if (m && m.index !== undefined) {
      const start = Math.max(0, m.index - 20);
      const end = Math.min(text.length, m.index + m[0].length + 20);
      return { hit: true, ctx: text.slice(start, end).trim() };
    }
  }
  return { hit: false, ctx: '' };
}

export interface ActorDef {
  name: string;
  aliases: string[];
}

/** Find all strong actor matches in `text`. */
export function findActorMatches(text: string, actors: ActorDef[]): ActorMatch[] {
  if (!text || !actors?.length) return [];
  const out: ActorMatch[] = [];
  for (const a of actors) {
    // Canonical name: her zaman matchable (multi-word dahil), alias ise sıkı kontrol
    if (!isMatchableCanonical(a.name)) continue;
    // 1) Canonical name — multi-word için tüm token'ların proximity gerekli
    //    Tek-kelime canonical için de bağlam kontrolü uygula: eğer canonical
    //    tek kelime ise ve o kelime SKIP'te ise (FP riski yüksek genel sözcük),
    //    sadece "also known as X" gibi phrasal bağlamda match et.
    const canon = normalize(a.name);
    const canonTokens = canon.split(/\s+/).filter((t: string) => t.length >= 3);
    const isCanonMulti = canonTokens.length >= 2;
    const canonIsSingleGeneric = canonTokens.length === 1 && SKIP_ALIASES.has(canonTokens[0]);
    const canonHits = isCanonMulti ? hasProximateWordMatch(text, a.name) : hasWordBoundaryMatch(text, a.name);
    if (canonHits.hit && !canonIsSingleGeneric) {
      out.push({
        actorName: a.name, alias: a.name, confidence: 0.95,
        matchReason: isCanonMulti ? 'canonical_proximate_tokens' : 'canonical_name',
        matchedText: a.name, context: canonHits.ctx,
      });
      continue;
    }
    const canonPhrasal = hasPhrasalMatch(text, a.name);
    if (canonPhrasal.hit) {
      out.push({
        actorName: a.name, alias: a.name, confidence: 0.85,
        matchReason: 'alias_phrasal', matchedText: a.name, context: canonPhrasal.ctx,
      });
      continue;
    }
    // 2) Aliases — only word-boundary, only when matchable
    for (const alias of a.aliases || []) {
      if (!isMatchableAlias(alias)) continue;
      const n = normalize(alias);
      if (n === canon) continue; // already counted canonical
      const isMulti = n.split(/\s+/).filter((t: string) => t.length >= 3).length >= 2;
      // Multi-word aliases: tokens must be proximate (within ~120 chars)
      const wb = isMulti ? hasProximateWordMatch(text, alias) : hasWordBoundaryMatch(text, alias);
      if (wb.hit) {
        out.push({
          actorName: a.name, alias, confidence: isMulti ? 0.80 : 0.85,
          matchReason: isMulti ? 'alias_proximate_tokens' : 'alias_word_boundary',
          matchedText: alias, context: wb.ctx,
        });
      } else {
        const ph = hasPhrasalMatch(text, alias);
        if (ph.hit) {
          out.push({
            actorName: a.name, alias, confidence: 0.70,
            matchReason: 'alias_phrasal', matchedText: alias, context: ph.ctx,
          });
        }
      }
    }
  }
  return out;
}
