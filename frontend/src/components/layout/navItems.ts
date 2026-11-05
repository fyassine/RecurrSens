import { LayoutGrid, Settings } from 'lucide-react';

export const NAV_ITEMS = [
  { label: 'Übersicht', icon: LayoutGrid, path: '/', matchPrefixes: ['/', '/details/'] },
  { label: 'Einstellungen', icon: Settings, path: '/einstellungen', matchPrefixes: ['/einstellungen'] },
];

export function isNavActive(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) =>
    prefix.endsWith('/') && prefix !== '/'
      ? pathname.startsWith(prefix)
      : prefix === '/'
        ? pathname === '/' || pathname.startsWith('/details/')
        : pathname.startsWith(prefix),
  );
}
