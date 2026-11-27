import { describe, it, expect } from 'vitest';
import { resolveInitialLang } from './demo';

describe('resolveInitialLang', () => {
  it('prefers the ?lang= query parameter', () => {
    expect(resolveInitialLang('?lang=de', 'en')).toBe('de');
  });

  it('falls back to the saved choice', () => {
    expect(resolveInitialLang('', 'de')).toBe('de');
  });

  it('defaults to English when nothing valid is set', () => {
    expect(resolveInitialLang('', null)).toBe('en');
    expect(resolveInitialLang('?lang=fr', 'xx')).toBe('en');
  });
});
