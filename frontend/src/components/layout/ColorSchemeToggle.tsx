import { ActionIcon, useMantineColorScheme } from '@mantine/core';
import { Sun, Moon } from 'lucide-react';

export default function ColorSchemeToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  return (
    <ActionIcon
      variant="subtle"
      color={tone === 'dark' ? 'gray.0' : 'gray'}
      size="lg"
      onClick={() => toggleColorScheme()}
      title={isDark ? 'Hellmodus' : 'Dunkelmodus'}
      aria-label={isDark ? 'Hellmodus' : 'Dunkelmodus'}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </ActionIcon>
  );
}
