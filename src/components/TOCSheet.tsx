import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../lib/theme';
import { HeadingInfo } from './MarkdownRenderer';

interface TOCSheetProps {
  visible: boolean;
  headings: HeadingInfo[];
  onClose: () => void;
  onSelectHeading: (index: number) => void;
}

/** 标题导航 Bottom Sheet */
export default function TOCSheet({ visible, headings, onClose, onSelectHeading }: TOCSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handleBar}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>目录</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* List */}
        {headings.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>暂无标题</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {headings.map((h, idx) => (
              <Pressable
                key={idx}
                style={({ pressed }) => [
                  styles.item,
                  { paddingLeft: Spacing.md + h.level * Spacing.lg },
                  pressed && styles.itemPressed,
                ]}
                onPress={() => {
                  onSelectHeading(idx);
                  onClose();
                }}
              >
                <Text style={styles.itemText} numberOfLines={1}>
                  {h.level <= 2 ? '● ' : '○ '}{h.text}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: c.bgCard,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      maxHeight: '60%',
      paddingBottom: Spacing.xxl,
    },
    handleBar: {
      alignItems: 'center',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: {
      color: c.textPrimary,
      fontSize: FontSize.lg,
      fontWeight: '700',
    },
    closeBtn: {
      padding: Spacing.xs,
    },
    list: {
      flexGrow: 0,
    },
    item: {
      paddingVertical: Spacing.md,
      paddingRight: Spacing.xl,
    },
    itemPressed: {
      backgroundColor: c.micIdle,
    },
    itemText: {
      color: c.textPrimary,
      fontSize: FontSize.sm,
      lineHeight: 20,
    },
    empty: {
      padding: Spacing.xxxl,
      alignItems: 'center',
    },
    emptyText: {
      color: c.textMuted,
      fontSize: FontSize.sm,
    },
  });
}
