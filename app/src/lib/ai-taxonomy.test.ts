// ai-taxonomy.test.ts — Madde 2, 16
import { describe, it, expect } from 'vitest';
import { AI_CATEGORIES, isAiThreatCategory, type AiCategory } from './ai-taxonomy';

describe('AI taxonomy', () => {
  it('contains the new categories', () => {
    for (const c of ['ai_related', 'ai_research', 'ai_security_research',
                     'adversarial_ai', 'ai_vulnerability', 'ai_incident',
                     'malicious_ai_use', 'prompt_injection', 'data_poisoning',
                     'model_theft', 'privacy_leak', 'deepfake_abuse',
                     'not_ai_security'] as AiCategory[]) {
      expect(AI_CATEGORIES.includes(c), `missing ${c}`).toBe(true);
    }
  });
  it('isAiThreatCategory: true only for real AI threats', () => {
    expect(isAiThreatCategory('prompt_injection')).toBe(true);
    expect(isAiThreatCategory('data_poisoning')).toBe(true);
    expect(isAiThreatCategory('model_theft')).toBe(true);
    expect(isAiThreatCategory('deepfake_abuse')).toBe(true);
    expect(isAiThreatCategory('ai_incident')).toBe(true);
  });
  it('isAiThreatCategory: false for research / generic', () => {
    expect(isAiThreatCategory('ai_research')).toBe(false);
    expect(isAiThreatCategory('ai_related')).toBe(false);
    expect(isAiThreatCategory('not_ai_security')).toBe(false);
    expect(isAiThreatCategory(null)).toBe(false);
    expect(isAiThreatCategory('')).toBe(false);
  });
});
