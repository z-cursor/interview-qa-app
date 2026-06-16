import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, BorderRadius, Shadow, FontSize } from '../lib/theme';
import MarkdownRenderer from './MarkdownRenderer';

interface QuestionCardProps {
  title: string;
  question: string;
  index: number;
  total: number;
}

export default function QuestionCard({ title, question, index, total }: QuestionCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      {/* 题号 */}
      <View style={styles.badgeRow}>
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>Q{index + 1}/{total}</Text>
        </View>
      </View>

      {/* 标题 */}
      <Text style={styles.title}>{title}</Text>

      {/* 题目内容 */}
      <View style={styles.content}>
        <MarkdownRenderer content={question} type="question" />
      </View>
    </View>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.bgCard,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      marginHorizontal: Spacing.lg,
      ...Shadow.card,
      maxHeight: 360,
    },
    badgeRow: {
      flexDirection: 'row',
      marginBottom: Spacing.md,
    },
    indexBadge: {
      backgroundColor: c.micIdle,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.sm,
    },
    indexText: {
      color: c.accent,
      fontSize: FontSize.xs,
      fontWeight: '600',
    },
    title: {
      color: c.textPrimary,
      fontSize: FontSize.xl,
      fontWeight: '700',
      marginBottom: Spacing.md,
      lineHeight: 28,
    },
    content: {
      marginTop: Spacing.xs,
    },
  });
}
