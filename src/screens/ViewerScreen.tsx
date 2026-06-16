import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Alert, Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, BorderRadius, FontSize, Shadow } from '../lib/theme';
import { getRawFile, getDeckById, updateDeckContent } from '../lib/database';
import { parseMarkdownToQAs, countQuestions } from '../lib/parser';
import { uuidv4 } from '../utils/uuid';
import MarkdownRenderer from '../components/MarkdownRenderer';
import EmptyState from '../components/EmptyState';

type ViewMode = 'preview' | 'edit';

interface ViewerScreenProps {
  route: { params: { deckId: string } };
  navigation: any;
}

/** 超过此字符数隐藏编辑按钮 */
const EDIT_SIZE_LIMIT = 150_000;

export default function ViewerScreen({ route, navigation }: ViewerScreenProps) {
  const { deckId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [content, setContent] = useState('');
  const [deckName, setDeckName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [questionCount, setQuestionCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editorHeight, setEditorHeight] = useState(300);

  const fileTooBig = content.length > EDIT_SIZE_LIMIT;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载
  useEffect(() => {
    const deck = getDeckById(deckId);
    if (deck) {
      setDeckName(deck.fileName);
      setQuestionCount(deck.itemCount);
    }
    const raw = getRawFile(deckId);
    if (raw) setContent(raw);
  }, [deckId]);

  // 编辑时 debounce 重新解析题目数
  const scheduleReparse = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        setQuestionCount(countQuestions(text));
      } catch {
        setQuestionCount(0);
      }
    }, 500);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleContentChange = useCallback((text: string) => {
    setContent(text);
    scheduleReparse(text);
  }, [scheduleReparse]);

  // 保存修改
  const handleSave = async () => {
    if (!content.trim()) {
      Alert.alert('内容为空', '无法保存空内容');
      return;
    }

    setSaving(true);
    try {
      const qas = parseMarkdownToQAs(content);
      const newItems = qas.map((qa, idx) => ({
        id: uuidv4(),
        deckId,
        source: deckName,
        title: qa.title,
        question: qa.question,
        answer: qa.answer,
        sections: qa.sections,
        tags: qa.tags,
        sortOrder: idx,
      }));

      updateDeckContent(deckId, content, newItems);

      Alert.alert('保存成功', `已更新 ${newItems.length} 题`, [
        { text: '返回题库', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('保存失败', err?.message || '解析失败');
    } finally {
      setSaving(false);
    }
  };

  if (!content) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState
          icon="document-outline"
          title="无法加载原文"
          subtitle="该题库的原始文件可能已被删除"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{deckName}</Text>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeBtn, viewMode === 'preview' && styles.modeBtnActive]}
            onPress={() => setViewMode('preview')}
          >
            <Text style={[styles.modeBtnText, viewMode === 'preview' && styles.modeBtnTextActive]}>
              Preview
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeBtn,
              viewMode === 'edit' && styles.modeBtnActive,
              fileTooBig && styles.modeBtnDisabled,
            ]}
            onPress={() => {
              if (fileTooBig) {
                Alert.alert('文件过大', '超过 15 万字符，不支持编辑。仅支持预览。');
                return;
              }
              setViewMode('edit');
            }}
          >
            <Text style={[
              styles.modeBtnText,
              viewMode === 'edit' && styles.modeBtnTextActive,
              fileTooBig && styles.modeBtnTextDisabled,
            ]}>
              Markdown
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {viewMode === 'preview' ? (
        <ScrollView
          style={styles.contentArea}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator
        >
          <MarkdownRenderer content={content} />
        </ScrollView>
      ) : (
        <>
          <ScrollView
            style={styles.contentArea}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <TextInput
              style={[styles.editor, { height: Math.max(300, editorHeight) }]}
              value={content}
              onChangeText={handleContentChange}
              onContentSizeChange={(e) =>
                setEditorHeight(e.nativeEvent.contentSize.height)
              }
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
            />
          </ScrollView>

          {/* 保存按钮 */}
          <View style={styles.saveBar}>
            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.saveBtnText}>
                  保存修改 ({questionCount}题)
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: Spacing.sm,
    },
    headerBack: {
      padding: Spacing.xs,
    },
    headerTitle: {
      color: c.textPrimary,
      fontSize: FontSize.md,
      fontWeight: '600',
      flex: 1,
    },
    modeToggle: {
      flexDirection: 'row',
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      padding: 2,
    },
    modeBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs + 2,
      borderRadius: BorderRadius.sm - 2,
    },
    modeBtnActive: {
      backgroundColor: c.accent,
    },
    modeBtnDisabled: {
      opacity: 0.35,
    },
    modeBtnText: {
      color: c.textMuted,
      fontSize: FontSize.xs,
      fontWeight: '600',
    },
    modeBtnTextActive: {
      color: c.textInverse,
    },
    modeBtnTextDisabled: {
      color: c.textMuted,
    },
    contentArea: {
      flex: 1,
    },
    contentInner: {
      padding: Spacing.lg,
      paddingBottom: Spacing.xxl,
    },
    editor: {
      color: c.textPrimary,
      fontSize: FontSize.sm,
      fontFamily: 'monospace',
      lineHeight: 20,
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      textAlignVertical: 'top',
    },
    saveBar: {
      padding: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bg,
    },
    saveBtn: {
      backgroundColor: c.accent,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      ...Shadow.button,
    },
    saveBtnDisabled: {
      opacity: 0.6,
    },
    saveBtnText: {
      color: c.textInverse,
      fontSize: FontSize.md,
      fontWeight: '700',
    },
  });
}
