// severity.test.ts — Madde 3, 16
import { describe, it, expect } from 'vitest';
import { canonicalCvss, severityFromCvss } from './severity';

describe('canonicalCvss', () => {
  it('NaN string becomes NULL', () => {
    expect(canonicalCvss('NaN')).toBe(null);
  });
  it('empty / null / undefined → NULL', () => {
    expect(canonicalCvss('')).toBe(null);
    expect(canonicalCvss(null)).toBe(null);
    expect(canonicalCvss(undefined)).toBe(null);
  });
  it('Infinity / -Infinity → NULL', () => {
    expect(canonicalCvss(Infinity)).toBe(null);
    expect(canonicalCvss(-Infinity)).toBe(null);
  });
  it('out-of-range values (negative, >10) → NULL', () => {
    expect(canonicalCvss(-1)).toBe(null);
    expect(canonicalCvss(11)).toBe(null);
    expect(canonicalCvss(15.5)).toBe(null);
  });
  it('valid in-range values are accepted', () => {
    expect(canonicalCvss(0)).toBe(0);
    expect(canonicalCvss(9.5)).toBe(9.5);
    expect(canonicalCvss(10)).toBe(10);
  });
  it('numeric strings are parsed', () => {
    expect(canonicalCvss('9.5')).toBe(9.5);
    expect(canonicalCvss('0')).toBe(0);
  });
  it('values rounded to 1 decimal', () => {
    expect(canonicalCvss(9.123)).toBe(9.1);
    expect(canonicalCvss(9.999)).toBe(10);
  });
});

describe('severityFromCvss', () => {
  it('NULL → UNKNOWN (NOT LOW)', () => {
    expect(severityFromCvss(null)).toBe('unknown');
    expect(severityFromCvss(NaN)).toBe('unknown');
  });
  it('9.0–10.0 → critical', () => {
    expect(severityFromCvss(9.0)).toBe('critical');
    expect(severityFromCvss(10)).toBe('critical');
  });
  it('7.0–8.9 → high', () => {
    expect(severityFromCvss(7.0)).toBe('high');
    expect(severityFromCvss(8.9)).toBe('high');
  });
  it('4.0–6.9 → medium', () => {
    expect(severityFromCvss(4.0)).toBe('medium');
    expect(severityFromCvss(6.9)).toBe('medium');
  });
  it('0.1–3.9 → low', () => {
    expect(severityFromCvss(0.1)).toBe('low');
    expect(severityFromCvss(3.9)).toBe('low');
  });
  it('exactly 9.0 is critical, not high', () => {
    expect(severityFromCvss(9.0)).toBe('critical');
    expect(severityFromCvss(8.999)).toBe('high');
  });
});
