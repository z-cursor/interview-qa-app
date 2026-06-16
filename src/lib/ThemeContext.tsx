import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { darkColors, lightColors } from './theme';

export interface ColorTokens {
  bg: string; bgCard: string; bgCardAlt: string; bgInput: string;
  textPrimary: string; textSecondary: string; textMuted: string; textInverse: string;
  accent: string; accentLight: string; accentDark: string;
  success: string; error: string; warning: string; info: string;
  border: string; borderLight: string;
  micIdle: string; micActive: string; micPulse: string;
}
export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  colors: ColorTokens;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  mode: 'system',
  setMode: () => {},
  isDark: true,
});

/** 从 mode + 系统值解析最终颜色 */
function resolveColors(mode: ThemeMode, systemIsDark: boolean): ColorTokens {
  const isDark = mode === 'dark' || (mode === 'system' && systemIsDark);
  return isDark ? darkColors : lightColors;
}

/** ThemeProvider — 包裹在 App 根节点 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const systemIsDark = systemScheme === 'dark';
  const [mode, setModeRaw] = useState<ThemeMode>('system');

  const colors = resolveColors(mode, systemIsDark);
  const isDark = colors === darkColors;

  const setMode = useCallback((m: ThemeMode) => {
    setModeRaw(m);
  }, []);

  return (
    <ThemeContext.Provider value={{ colors, mode, setMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** useTheme hook — 组件内获取当前主题色 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
