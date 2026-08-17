// ioc-classifier.test.ts — Madde 5, 16
import { describe, it, expect } from 'vitest';
import { classifyIoc, isPublicInfrastructure } from './ioc-classifier';

describe('IOC classifier — public infrastructure guard', () => {
  it('github.com is NOT classified as malicious IOC', () => {
    const c = classifyIoc('github.com', 'domain', { hasSourceLink: false, hasMaliciousKeyword: false });
    expect(c.classification).toBe('mentioned');
    expect(c.confidence).toBeLessThan(0.5);
  });
  it('github.com stays mentioned even with malicious keyword (public infra)', () => {
    // Madde 5: public infrastructure is NEVER classified as malicious IOC
    // regardless of surrounding context. Only subdomain-targeted attacks
    // (e.g. evil.github.io) can be malicious — handled via separate flow.
    const c = classifyIoc('github.com', 'domain', { hasSourceLink: false, hasMaliciousKeyword: true });
    expect(c.classification).toBe('mentioned');
  });
  it('microsoft.com is NOT automatically a malicious IOC', () => {
    const c = classifyIoc('microsoft.com', 'domain', { hasSourceLink: false, hasMaliciousKeyword: false });
    expect(c.classification).toBe('mentioned');
  });
  it('amazonaws.com is NOT automatically a malicious IOC', () => {
    const c = classifyIoc('amazonaws.com', 'domain', { hasSourceLink: false, hasMaliciousKeyword: false });
    expect(c.classification).toBe('mentioned');
  });
  it('cloudflare.com is NOT automatically a malicious IOC', () => {
    const c = classifyIoc('cloudflare.com', 'domain', { hasSourceLink: false, hasMaliciousKeyword: false });
    expect(c.classification).toBe('mentioned');
  });
  it('subdomains of public infrastructure are also mentioned', () => {
    const c = classifyIoc('evil-subdomain.github.com', 'domain', { hasSourceLink: false, hasMaliciousKeyword: false });
    expect(c.classification).toBe('mentioned');
  });
  it('unknown domain with malicious keyword is confirmed_malicious', () => {
    const c = classifyIoc('evil-malicious-domain.tld', 'domain', { hasSourceLink: false, hasMaliciousKeyword: true });
    expect(c.classification).toBe('confirmed_malicious');
  });
  it('unknown domain with source link is suspicious', () => {
    const c = classifyIoc('some-suspicious.tld', 'domain', { hasSourceLink: true, hasMaliciousKeyword: false });
    expect(c.classification).toBe('suspicious');
  });
});

describe('isPublicInfrastructure', () => {
  it('recognizes direct matches', () => {
    expect(isPublicInfrastructure('github.com')).toBe(true);
    expect(isPublicInfrastructure('cloudflare.com')).toBe(true);
    expect(isPublicInfrastructure('microsoft.com')).toBe(true);
    expect(isPublicInfrastructure('amazonaws.com')).toBe(true);
  });
  it('strips leading www.', () => {
    expect(isPublicInfrastructure('www.github.com')).toBe(true);
  });
  it('matches 1-level subdomains', () => {
    expect(isPublicInfrastructure('api.github.com')).toBe(true);
    expect(isPublicInfrastructure('subdomain.cloudflare.com')).toBe(true);
  });
  it('does NOT match unrelated domains', () => {
    expect(isPublicInfrastructure('malicious-c2.tld')).toBe(false);
    expect(isPublicInfrastructure('conti-leaked-files.ru')).toBe(false);
  });
  it('localhost is excluded', () => {
    expect(isPublicInfrastructure('localhost')).toBe(true);
  });
});
