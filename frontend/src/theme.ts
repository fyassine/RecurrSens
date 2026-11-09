import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Shade 7 = #24558A (primary action in light mode).
const brand: MantineColorsTuple = [
  '#eef3f9',
  '#d9e4f0',
  '#b4c9e0',
  '#8aaacb',
  '#5f89b4',
  '#3f6ea0',
  '#2e6094',
  '#24558a',
  '#1b4271',
  '#12304f',
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
  primaryShade: { light: 7, dark: 4 },
  defaultRadius: 'sm',
  radius: { xs: '2px', sm: '4px', md: '6px', lg: '6px', xl: '8px' },
  shadows: { xs: 'none', sm: 'none', md: 'none', lg: 'none', xl: 'none' },
  fontFamily: 'var(--app-font-sans)',
  headings: {
    fontFamily: 'var(--app-font-sans)',
    sizes: {
      h3: { fontWeight: '600' },
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
      defaultProps: { fw: 500 },
    },
    Badge: {
      defaultProps: { radius: 'xs' },
    },
    Paper: {
      defaultProps: { radius: 'md', shadow: undefined },
    },
    Chip: {
      defaultProps: { size: 'sm' },
    },
  },
});
