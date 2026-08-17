// ai-taxonomy.ts — canonical AI threat classification taxonomy.
// Used by content-backfill.ts and ai-threats page filters.

export const AI_CATEGORIES = [
  'ai_related',          // generic: mentions AI, not necessarily a threat
  'ai_research',          // academic / non-threat research (arXiv cs.AI/LG)
  'ai_security_research', // defensive AI research
  'adversarial_ai',       // attack on ML models (evasion, etc.)
  'ai_vulnerability',     // CVE in an AI system (model theft, prompt bug)
  'ai_incident',          // real-world AI misuse incident
  'malicious_ai_use',     // documented attacker using AI
  'prompt_injection',
  'data_poisoning',
  'model_theft',
  'privacy_leak',
  'deepfake_abuse',
  'not_ai_security',      // AI mentioned but not security-relevant
] as const;

export type AiCategory = typeof AI_CATEGORIES[number];

export const AI_THREAT_CATEGORIES: ReadonlySet<AiCategory> = new Set([
  'adversarial_ai', 'ai_vulnerability', 'ai_incident', 'malicious_ai_use',
  'prompt_injection', 'data_poisoning', 'model_theft', 'privacy_leak', 'deepfake_abuse',
]);

/** Should this category count towards the "AI THREATS TRACKED" KPI? */
export function isAiThreatCategory(c: string | null | undefined): boolean {
  if (!c) return false;
  return AI_THREAT_CATEGORIES.has(c as AiCategory);
}
