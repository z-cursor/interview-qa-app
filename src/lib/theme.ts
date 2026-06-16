/** 面试 QA App 主题定义 */

/** 暗色色板 */
export const darkColors = {
  // 背景层级
  bg: '#0F0F0F',
  bgCard: '#1A1A2E',
  bgCardAlt: '#16213E',
  bgInput: '#1E1E36',

  // 文字
  textPrimary: '#EAEAEA',
  textSecondary: '#A0A0B0',
  textMuted: '#6B6B80',
  textInverse: '#0F0F0F',

  // 强调色 — 暖金
  accent: '#F0A500',
  accentLight: '#FFC947',
  accentDark: '#C68400',

  // 功能色
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',
  info: '#2196F3',

  // 边框 & 分割
  border: '#2A2A40',
  borderLight: '#3A3A55',

  // 语音按钮
  micIdle: 'rgba(240, 165, 0, 0.15)',
  micActive: 'rgba(240, 165, 0, 0.35)',
  micPulse: 'rgba(240, 165, 0, 0.5)',
} as const;

/** 明色色板 */
export const lightColors = {
  // 背景层级
  bg: '#FAFAFA',
  bgCard: '#FFFFFF',
  bgCardAlt: '#F5F5F5',
  bgInput: '#F0F0F0',

  // 文字
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  textMuted: '#999999',
  textInverse: '#FFFFFF',

  // 强调色 — 暖金（明色基调偏深）
  accent: '#C68400',
  accentLight: '#E09E00',
  accentDark: '#8B5E00',

  // 功能色
  success: '#388E3C',
  error: '#D32F2F',
  warning: '#F57C00',
  info: '#1976D2',

  // 边框 & 分割
  border: '#E0E0E0',
  borderLight: '#EEEEEE',

  // 语音按钮
  micIdle: 'rgba(198, 132, 0, 0.1)',
  micActive: 'rgba(198, 132, 0, 0.25)',
  micPulse: 'rgba(198, 132, 0, 0.4)',
} as const;

/** @deprecated 使用 useTheme() hook 代替。保留以兼容旧代码。 */
export const Colors = darkColors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  title: 28,
  hero: 36,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  button: {
    shadowColor: '#F0A500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;
