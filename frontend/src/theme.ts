import { createTheme, type MantineColorsTuple } from '@mantine/core';

const brand: MantineColorsTuple = [
  '#eef4fb',
  '#d6e3f1',
  '#a9c3e2',
  '#7aa3d2',
  '#5388c5',
  '#3c77bd',
  '#2f6fb9',
  '#235ea4',
  '#1b3f6e',
  '#0f2240',
];

const accent: MantineColorsTuple = [
  '#fdecec',
  '#f6cccc',
  '#eba6a6',
  '#df8080',
  '#d56262',
  '#cf4f4f',
  '#cc4646',
  '#b53737',
  '#a12d2d',
  '#8c1f1f',
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 8, dark: 4 },
  defaultRadius: 'md',
  fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
  headings: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    sizes: {
      h5: { fontWeight: '600' },
      h6: { fontWeight: '600' },
    },
  },
  colors: {
    brand,
    accent,
  },
  components: {
    Button: {
      defaultProps: { fw: 600 },
    },
    Chip: {
      defaultProps: { size: 'sm' },
    },
  },
});
