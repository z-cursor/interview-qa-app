import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, FontSize } from '../lib/theme';
import { StudyMode } from '../types';

interface ProgressHeaderProps {
  current: number;
  total: number;
  mode: StudyMode;
  onModeToggle: () => void;
  onBack: () => void;
}

export default function ProgressHeader({
  current,
  total,
  mode,
  onModeToggle,
  onBack,
}: ProgressHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const progress = total > 0 ? Math.round(((current + 1) / total) * 100) : 0;

  return (
    <View style={styles.container}>
      {/* 返回 */}
      <Ionicons
        name="arrow-back"
        size={24}
        color={colors.textPrimary}
        onPress={onBack}
      />

      {/* 进度 */}
      <View style={styles.progressCenter}>
        <Text style={styles.progressText}>{current + 1} / {total}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      {/* 模式切换 */}
      <View style={styles.modeBtn} onTouchEnd={onModeToggle}>
        <Ionicons
          name={mode === 'random' ? 'shuffle' : 'list'}
          size={20}
          color={colors.accent}
        />
        <Text style={styles.modeText}>
          {mode === 'random' ? '随机' : '顺序'}
        </Text>
      </View>
    </View>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      backgroundColor: c.bg,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    progressCenter: {
      flex: 1,
      alignItems: 'center',
      marginHorizontal: Spacing.lg,
    },
    progressText: {
      color: c.textSecondary,
      fontSize: FontSize.sm,
      fontWeight: '600',
      marginBottom: Spacing.xs,
    },
    progressBar: {
      width: '100%',
      height: 3,
      backgroundColor: c.border,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: c.accent,
      borderRadius: 2,
    },
    modeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.micIdle,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: 20,
    },
    modeText: {
      color: c.accent,
      fontSize: FontSize.xs,
      fontWeight: '600',
      marginLeft: Spacing.xs,
    },
  });
}
