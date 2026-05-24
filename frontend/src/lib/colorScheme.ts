import { useEffect } from 'react';
import { useMantineColorScheme } from '@mantine/core';

export function useTailwindDarkMirror() {
  const { colorScheme } = useMantineColorScheme();

  useEffect(() => {
    const resolve = () =>
      colorScheme === 'auto'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : colorScheme;

    const apply = () =>
      document.documentElement.classList.toggle('dark', resolve() === 'dark');

    apply();

    if (colorScheme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [colorScheme]);
}
