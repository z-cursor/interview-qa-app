import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, BorderRadius, FontSize } from '../lib/theme';
import { QASections } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

interface AnswerSheetProps {
  answer: string;
  sections: QASections;
  visible: boolean;
}

/** 答案展示面板 — 渲染在父级 ScrollView 内，不使用嵌套 ScrollView */
export default function AnswerSheet({ answer, sections, visible }: AnswerSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* 主答案 */}
      <View style={styles.answerSection}>
        <MarkdownRenderer content={answer} type="answer" />
      </View>

      {/* 题目解析 */}
      {sections.analysis ? (
        <View style={styles.extraSection}>
          <Text style={styles.sectionTitle}>🔍 题目解析</Text>
          <MarkdownRenderer content={sections.analysis} />
        </View>
      ) : null}

      {/* 考察点 */}
      {sections.keyPoints ? (
        <View style={styles.extraSection}>
          <Text style={styles.sectionTitle}>✅ 考察点</Text>
          <MarkdownRenderer content={sections.keyPoints} />
        </View>
      ) : null}

      {/* 面试官更想听 */}
      {sections.interviewerWants ? (
        <View style={styles.extraSection}>
          <Text style={styles.sectionTitle}>💡 面试官更想听</Text>
          <MarkdownRenderer content={sections.interviewerWants} />
        </View>
      ) : null}

      {/* 追问点 */}
      {sections.followUp ? (
        <View style={styles.extraSection}>
          <Text style={styles.sectionTitle}>🔄 追问点</Text>
          <MarkdownRenderer content={sections.followUp} />
        </View>
      ) : null}
    </View>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      backgroundColor: c.bgCard,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
    },
    answerSection: {
      marginBottom: Spacing.lg,
    },
    extraSection: {
      marginBottom: Spacing.lg,
      paddingTop: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    sectionTitle: {
      color: c.accent,
      fontSize: FontSize.lg,
      fontWeight: '700',
      marginBottom: Spacing.md,
    },
  });
}
