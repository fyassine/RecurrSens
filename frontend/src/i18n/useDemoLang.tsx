import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { STRINGS, resolveInitialLang, type DemoStrings, type Lang } from './demo';

const STORAGE_KEY = 'demo_lang';

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

type Ctx = { lang: Lang; setLang: (lang: Lang) => void; t: DemoStrings };
const DemoLangContext = createContext<Ctx | null>(null);

export function DemoLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    resolveInitialLang(window.location.search, readSaved()),
  );

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t: STRINGS[lang] }), [lang, setLang]);
  return <DemoLangContext.Provider value={value}>{children}</DemoLangContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDemoLang(): Ctx {
  const ctx = useContext(DemoLangContext);
  if (!ctx) return { lang: 'de', setLang: () => {}, t: STRINGS.de };
  return ctx;
}
