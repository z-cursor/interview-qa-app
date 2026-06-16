import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../lib/theme';

interface ToolbarButton {
  label: string;
  insert: string;        // 插入模板
  wrapBefore?: string;   // 选中文本包裹前缀
  wrapAfter?: string;    // 选中文本包裹后缀
}

const TOOLS: ToolbarButton[] = [
  { label: 'B', insert: '**粗体**', wrapBefore: '**', wrapAfter: '**' },
  { label: 'I', insert: '*斜体*', wrapBefore: '*', wrapAfter: '*' },
  { label: '`', insert: '`代码`', wrapBefore: '`', wrapAfter: '`' },
  { label: '-', insert: '- 列表项', wrapBefore: '- ' },
  { label: '#', insert: '## 标题', wrapBefore: '## ' },
  { label: '1.', insert: '1. 有序项', wrapBefore: '1. ' },
  { label: '🔗', insert: '[链接](url)', wrapBefore: '[', wrapAfter: '](url)' },
  { label: '🖼', insert: '![alt](url)', wrapBefore: '![', wrapAfter: '](url)' },
  { label: 'S', insert: '~~删除~~', wrapBefore: '~~', wrapAfter: '~~' },
];

interface EditorToolbarProps {
  onInsert: (text: string) => void;
  onWrapSelection: (before: string, after: string) => void;
}

/** L2 编辑工具栏 — 9 个快捷按钮 */
export default function EditorToolbar({ onInsert, onWrapSelection }: EditorToolbarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = (tool: ToolbarButton) => {
    if (tool.wrapBefore && tool.wrapAfter) {
      onWrapSelection(tool.wrapBefore, tool.wrapAfter);
    } else if (tool.wrapBefore) {
      onWrapSelection(tool.wrapBefore, '');
    } else {
      onInsert(tool.insert);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        {TOOLS.map((tool) => (
          <Pressable
            key={tool.label}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={() => handlePress(tool)}
          >
            <Text style={styles.btnText}>{tool.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      backgroundColor: c.bgCard,
      borderTopWidth: 1,
      borderTopColor: c.border,
      height: 44,
    },
    scrollContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.sm,
      gap: 4,
    },
    btn: {
      minWidth: 36,
      height: 32,
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.sm,
    },
    btnPressed: {
      backgroundColor: c.accent,
    },
    btnText: {
      color: c.textPrimary,
      fontSize: FontSize.sm,
      fontWeight: '600',
    },
  });
}
