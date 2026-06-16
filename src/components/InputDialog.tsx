import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../lib/theme';

interface InputDialogProps {
  visible: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

/** 跨平台输入弹窗 — 替代 iOS-only 的 Alert.prompt */
export default function InputDialog({
  visible,
  title,
  placeholder = '',
  defaultValue = '',
  cancelText = '取消',
  confirmText = '确定',
  onCancel,
  onConfirm,
}: InputDialogProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setValue(defaultValue);
      // 自动聚焦（延迟等 Modal 动画完成）
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible, defaultValue]);

  const handleConfirm = () => {
    onConfirm(value.trim() || defaultValue);
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable onPress={() => {}} style={styles.dialog}>
            <Text style={styles.title}>{title}</Text>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleConfirm}
              returnKeyType="done"
            />
            <View style={styles.buttons}>
              <Pressable style={styles.btnCancel} onPress={onCancel}>
                <Text style={styles.btnCancelText}>{cancelText}</Text>
              </Pressable>
              <Pressable style={styles.btnConfirm} onPress={handleConfirm}>
                <Text style={styles.btnConfirmText}>{confirmText}</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xxl,
    },
    dialog: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: c.bgCard,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
    },
    title: {
      color: c.textPrimary,
      fontSize: FontSize.lg,
      fontWeight: '700',
      marginBottom: Spacing.lg,
    },
    input: {
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      color: c.textPrimary,
      fontSize: FontSize.md,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: Spacing.lg,
    },
    buttons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: Spacing.md,
    },
    btnCancel: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
    },
    btnCancelText: {
      color: c.textMuted,
      fontSize: FontSize.md,
      fontWeight: '600',
    },
    btnConfirm: {
      backgroundColor: c.accent,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.xl,
      borderRadius: BorderRadius.sm,
    },
    btnConfirmText: {
      color: c.textInverse,
      fontSize: FontSize.md,
      fontWeight: '700',
    },
  });
}
