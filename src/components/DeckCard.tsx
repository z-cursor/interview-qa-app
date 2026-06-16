import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Deck } from '../types';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, BorderRadius, Shadow, FontSize } from '../lib/theme';

interface DeckCardProps {
  deck: Deck;
  onPress: () => void;
  onLongPress?: () => void;
}

export default function DeckCard({ deck, onPress, onLongPress }: DeckCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const progress = deck.itemCount > 0
    ? Math.round((deck.completedCount / deck.itemCount) * 100)
    : 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Ionicons
            name={deck.isPreset ? 'library' : 'document-text'}
            size={24}
            color={colors.accent}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>{deck.name}</Text>
          <Text style={styles.fileName} numberOfLines={1}>{deck.fileName}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>

      {/* 进度条 */}
      <View style={styles.progressRow}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {deck.completedCount}/{deck.itemCount}
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.statText}>
          {deck.itemCount} 题
        </Text>
        {deck.isPreset && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>内置</Text>
          </View>
        )}
        {deck.fileId && (
          <View style={styles.linkedBadge}>
            <Ionicons name="link" size={10} color={colors.success} />
            <Text style={styles.linkedBadgeText}>已关联</Text>
          </View>
        )}
        <View style={styles.spacer} />
        <Ionicons name="ellipsis-horizontal" size={12} color={colors.textMuted} />
        <Text style={styles.longPressHint}>长按查看原文</Text>
      </View>
    </Pressable>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.bgCard,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      marginHorizontal: Spacing.lg,
      marginVertical: Spacing.sm,
      ...Shadow.card,
    },
    cardPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    iconBox: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.md,
      backgroundColor: c.micIdle,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    headerText: {
      flex: 1,
    },
    name: {
      color: c.textPrimary,
      fontSize: FontSize.lg,
      fontWeight: '600',
    },
    fileName: {
      color: c.textMuted,
      fontSize: FontSize.xs,
      marginTop: 2,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    progressBar: {
      flex: 1,
      height: 4,
      backgroundColor: c.border,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: c.accent,
      borderRadius: 2,
    },
    progressText: {
      color: c.textSecondary,
      fontSize: FontSize.sm,
      marginLeft: Spacing.md,
      minWidth: 48,
      textAlign: 'right',
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.md,
    },
    statText: {
      color: c.textMuted,
      fontSize: FontSize.sm,
    },
    badge: {
      marginLeft: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      backgroundColor: c.micIdle,
    },
    badgeText: {
      color: c.accent,
      fontSize: FontSize.xs,
      fontWeight: '500',
    },
    linkedBadge: {
      marginLeft: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      backgroundColor: c.micIdle,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    linkedBadgeText: {
      color: c.success,
      fontSize: FontSize.xs,
      fontWeight: '500',
    },
    spacer: {
      flex: 1,
    },
    longPressHint: {
      color: c.textMuted,
      fontSize: 10,
      marginLeft: 2,
      opacity: 0.6,
    },
  });
}
