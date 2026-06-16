import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../lib/theme';

export interface ActionSheetOption {
  text: string;
  destructive?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  onClose: () => void;
}

/** 底部操作菜单 — 点击空白区域关闭 */
export default function ActionSheet({ visible, title, options, onClose }: ActionSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* 点击空白区域关闭 */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title && <Text style={styles.title}>{title}</Text>}

          {options.map((opt, idx) => (
            <Pressable
              key={idx}
              style={({ pressed }) => [
                styles.option,
                idx > 0 && styles.optionBorder,
                pressed && styles.optionPressed,
              ]}
              onPress={() => {
                onClose();
                // 延迟执行，等 modal 关闭
                setTimeout(opt.onPress, 200);
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  opt.destructive && styles.optionDestructive,
                ]}
              >
                {opt.text}
              </Text>
            </Pressable>
          ))}

          <Pressable
            style={({ pressed }) => [
              styles.option,
              styles.cancelBtn,
              pressed && styles.optionPressed,
            ]}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
      padding: Spacing.md,
      paddingBottom: Spacing.xxxl,
    },
    sheet: {
      backgroundColor: c.bgCard,
      borderRadius: BorderRadius.xl,
      overflow: 'hidden',
    },
    title: {
      color: c.textSecondary,
      fontSize: FontSize.xs,
      textAlign: 'center',
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    option: {
      paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    optionBorder: {
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    optionPressed: {
      backgroundColor: c.micIdle,
    },
    optionText: {
      color: c.textPrimary,
      fontSize: FontSize.md,
      fontWeight: '500',
    },
    optionDestructive: {
      color: c.error,
    },
    cancelBtn: {
      marginTop: Spacing.sm,
      borderRadius: BorderRadius.xl,
      backgroundColor: c.bgCard,
    },
    cancelText: {
      color: c.textMuted,
      fontSize: FontSize.md,
      fontWeight: '600',
    },
  });
}
