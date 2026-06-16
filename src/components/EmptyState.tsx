import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, FontSize } from '../lib/theme';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function EmptyState({
  icon = 'file-tray-outline',
  title,
  subtitle,
  action,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={64} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.xxxl,
    },
    title: {
      color: c.textSecondary,
      fontSize: FontSize.lg,
      fontWeight: '600',
      marginTop: Spacing.xl,
      textAlign: 'center',
    },
    subtitle: {
      color: c.textMuted,
      fontSize: FontSize.md,
      marginTop: Spacing.sm,
      textAlign: 'center',
      lineHeight: 22,
    },
    action: {
      marginTop: Spacing.xl,
    },
  });
}
