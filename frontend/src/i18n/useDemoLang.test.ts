import { describe, it, expect } from 'vitest';
import { resolveInitialLang } from './demo';

describe('resolveInitialLang', () => {
  it('prefers the ?lang= query parameter', () => {
    expect(resolveInitialLang('?lang=en', 'de', 'de-DE')).toBe('en');
  });

  it('falls back to the saved choice', () => {
    expect(resolveInitialLang('', 'en', 'de-DE')).toBe('en');
  });

  it('ignores invalid values and uses the browser language', () => {
    expect(resolveInitialLang('?lang=fr', 'xx', 'de-AT')).toBe('de');
    expect(resolveInitialLang('', null, 'en-US')).toBe('en');
    expect(resolveInitialLang('', null, 'fr-FR')).toBe('en');
  });
});
