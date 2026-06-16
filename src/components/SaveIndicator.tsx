import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { FontSize, Spacing } from '../lib/theme';

type SaveStatus = 'saved' | 'saving' | 'idle';

interface SaveIndicatorProps {
  status: SaveStatus;
  questionCount: number;
}

/** 自动保存状态指示器 */
export default function SaveIndicator({ status, questionCount }: SaveIndicatorProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const config: Record<SaveStatus, { icon: keyof typeof Ionicons.glyphMap; text: string; color: string }> = {
    saved: { icon: 'checkmark-circle', text: `已保存 · ${questionCount} 题`, color: colors.success },
    saving: { icon: 'time-outline', text: '保存中…', color: colors.textMuted },
    idle: { icon: 'checkmark-circle', text: questionCount > 0 ? `${questionCount} 题` : '', color: colors.textMuted },
  };

  const { icon, text, color } = config[status];

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={14} color={color} />
      {text ? <Text style={[styles.text, { color }]}>{text}</Text> : null}
    </View>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Spacing.sm,
    },
    text: {
      fontSize: FontSize.xs,
      fontWeight: '500',
    },
  });
}
