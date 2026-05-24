import { createContext, useContext } from 'react';

export const ColorModeContext = createContext({ toggleMode: () => {} });

export function useColorMode() {
  return useContext(ColorModeContext);
}
