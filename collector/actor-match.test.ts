// actor-match.test.ts — Madde 1, 16 (canonical threat-actor name + alias matching)
import { describe, it, expect } from 'vitest';
import { findActorMatches, isMatchableAlias, normalize, type ActorDef } from '../collector/actor-match';

const actors: ActorDef[] = [
  { name: 'Conti',  aliases: ['conti'] },
  { name: 'Equation Group', aliases: ['equation group'] },
  { name: 'Silence', aliases: ['silence'] },
  // Test için: 'wizard spider' multi-word alias, FP riski düşük
  { name: 'Wizard Spider', aliases: ['wizard spider'] },
];

describe('actor-match false-positive guards (Madde 1)', () => {
  it('continue does NOT match Conti', () => {
    const matches = findActorMatches('Please continue the conversation tomorrow.', actors);
    expect(matches.some(m => m.actorName === 'Conti')).toBe(false);
  });
  it('continuous does NOT match Conti', () => {
    const matches = findActorMatches('Continuous deployment reduces risk.', actors);
    expect(matches.some(m => m.actorName === 'Conti')).toBe(false);
  });
  it('conditional does NOT match Conti', () => {
    const matches = findActorMatches('Use a conditional branch to handle errors.', actors);
    expect(matches.some(m => m.actorName === 'Conti')).toBe(false);
  });
  it('equation (standalone word) does NOT match Equation Group', () => {
    const matches = findActorMatches('Solve the equation for x.', actors);
    expect(matches.some(m => m.actorName === 'Equation Group')).toBe(false);
  });
  it('silence (standalone word) does NOT match Silence canonical name (proximate-token)', () => {
    // 'Silence' actor adı tek-kelime canonical → proximity-token kontrolü
    // tek kelime için word-boundary ile aynı. "silence" kelimesi text'te
    // sessizlik anlamıyla geçtiğinde FALSE pozitif olur. SKIP'te olduğu için
    // 'silence' alias'ı zaten kabul edilmiyor. Canonical için test:
    const matches = findActorMatches('The room fell into silence after the speech.', actors);
    // Tek-kelime canonical "Silence" için matchable — bu yüzden silence kelimesi
    // geçince eşleşir. Bunu engellemek için Silence'ın alias'ı SKIP'te olmalı
    // (zaten 'silence' eklendi). Canonical için ise pozitif match olur.
    // Test: stand-alone "silence" kelimesi canonical name'i tetikler mi?
    // Sonuç: Evet (canonical_name kontrolünde), çünkü 'Silence' matchable.
    // Bu istenen davranış DEĞİL — gerçek test daha spesifik olmalı.
    expect(matches.some(m => m.actorName === 'Silence')).toBe(false);
  });
});

describe('actor-match positive matches', () => {
  it('whole-word "Conti" is detected with word-boundary', () => {
    const matches = findActorMatches('The Conti ransomware gang attacked hospitals.', actors);
    expect(matches.some(m => m.actorName === 'Conti' && m.matchReason === 'canonical_name')).toBe(true);
  });
  it('Equation Group canonical name matched when written in text', () => {
    const matches = findActorMatches('The Equation Group is a sophisticated threat actor.', actors);
    // Equation Group'un canonical name'i SKIP'te yok → matchable. Multi-word
    // olduğu için proximity-token check yapılır.
    expect(matches.some(m => m.actorName === 'Equation Group')).toBe(true);
  });
  it('"also known as Equation Group" matches via phrasal', () => {
    const matches = findActorMatches('The actor, also known as Equation Group, exploits firmware.', actors);
    // canonical_name proximity-token check'i de geçer (yakın kelimeler)
    expect(matches.some(m => m.actorName === 'Equation Group')).toBe(true);
  });
});

describe('isMatchableAlias', () => {
  it('rejects too-short aliases', () => {
    expect(isMatchableAlias('apt')).toBe(false);
    expect(isMatchableAlias('cat')).toBe(false);
  });
  it('rejects generic / known-short words', () => {
    expect(isMatchableAlias('panda')).toBe(false);
    expect(isMatchableAlias('tiger')).toBe(false);
    expect(isMatchableAlias('snake')).toBe(false);
  });
  it('rejects generic English words used as actor names', () => {
    // 'silence' ve 'equation' tek-kelime English sözcüklerdir; metinlerde
    // bağlam olmadan geçebilirler → FP riski yüksek, SKIP'te
    expect(isMatchableAlias('silence')).toBe(false);
    expect(isMatchableAlias('equation')).toBe(false);
    expect(isMatchableAlias('continue')).toBe(false);
  });
});

describe('normalize', () => {
  it('lowercases and trims', () => {
    expect(normalize('Wizard-Spider')).toBe('wizard-spider');
    expect(normalize('  Wizard  ')).toBe('wizard');
  });
  it('collapses whitespace', () => {
    expect(normalize('Wizard   Spider')).toBe('wizard spider');
  });
  it('keeps multi-word actors coherent', () => {
    expect(normalize('Equation Group')).toBe('equation group');
    expect(normalize('WIZARD SPIDER')).toBe('wizard spider');
  });
  it('normalizes en-dash and em-dash to hyphen', () => {
    expect(normalize('Wizard\u2013Spider')).toBe('wizard-spider'); // en-dash
    expect(normalize('Wizard\u2014Spider')).toBe('wizard-spider'); // em-dash
  });
});
