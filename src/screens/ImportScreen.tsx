import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Alert,
  ActivityIndicator, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { uuidv4 } from '../utils/uuid';
import { useStore } from '../store/useStore';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, BorderRadius, FontSize, Shadow } from '../lib/theme';
import { parseMarkdownToQAs, countQuestions } from '../lib/parser';
import {
  insertDeck, insertQAItems, insertRawFile, getDatabase,
} from '../lib/database';
import { Deck } from '../types';
import { deckNameFromFile } from '../utils/format';
import EmptyState from '../components/EmptyState';
import MarkdownRenderer from '../components/MarkdownRenderer';

/** 超过此字符数隐藏编辑按钮，避免 TextInput 性能问题 */
const EDIT_SIZE_LIMIT = 150_000;

type ViewMode = 'preview' | 'edit';

interface ImportScreenProps {
  navigation: any;
}

export default function ImportScreen({ navigation }: ImportScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refreshDecks } = useStore();

  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [questionCount, setQuestionCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [editorHeight, setEditorHeight] = useState(300);
  const fileTooBig = content.length > EDIT_SIZE_LIMIT;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 重新解析题目数（debounce 500ms） */
  const scheduleReparse = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const n = countQuestions(text);
        setQuestionCount(n);
      } catch {
        setQuestionCount(0);
      }
    }, 500);
  }, []);

  // 清理 debounce
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── 选择文件 ──
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/markdown', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      const name = file.name || 'unknown.md';

      if (!name.endsWith('.md')) {
        Alert.alert('格式不支持', '目前仅支持 .md 格式的题库文件');
        return;
      }

      const text = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (!text.trim()) {
        Alert.alert('文件为空', '请选择包含内容的 .md 文件');
        return;
      }

      setFileName(name);
      setContent(text);
      setViewMode('preview');

      // 初始解析
      try {
        const n = countQuestions(text);
        setQuestionCount(n);
      } catch {
        setQuestionCount(0);
      }
    } catch (err: any) {
      Alert.alert('读取失败', err?.message || '未知错误');
    }
  };

  // ── 编辑时更新 ──
  const handleContentChange = useCallback((text: string) => {
    setContent(text);
    scheduleReparse(text);
  }, [scheduleReparse]);

  // ── 确认导入 ──
  const handleConfirmImport = async () => {
    if (!fileName) return;
    setImporting(true);

    try {
      const qas = parseMarkdownToQAs(content);
      const deckId = uuidv4();
      const now = Date.now();

      const deck: Deck = {
        id: deckId,
        name: deckNameFromFile(fileName),
        fileName,
        isPreset: false,
        itemCount: qas.length,
        completedCount: 0,
        createdAt: now,
      };

      getDatabase().withTransactionSync(() => {
        insertDeck(deck);
        insertQAItems(
          qas.map((qa, idx) => ({
            id: uuidv4(),
            deckId,
            source: fileName,
            title: qa.title,
            question: qa.question,
            answer: qa.answer,
            sections: qa.sections,
            tags: qa.tags,
            sortOrder: idx,
          }))
        );
        insertRawFile(deckId, content);
      });

      refreshDecks();
      Alert.alert('导入成功', `已导入「${deck.name}」共 ${qas.length} 题`, [
        { text: '查看题库', onPress: () => navigation.navigate('题库') },
        { text: '继续导入', onPress: resetState },
      ]);
    } catch (err: any) {
      Alert.alert('导入失败', err?.message || '写入数据库失败');
    } finally {
      setImporting(false);
    }
  };

  const resetState = useCallback(() => {
    setFileName(null);
    setContent('');
    setQuestionCount(0);
    setViewMode('preview');
  }, []);

  // ── 初始空状态 ──
  if (!fileName) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState
          icon="cloud-upload-outline"
          title="导入面试题库"
          subtitle="支持 .md 格式的 Q&A 文件\n自动识别多种题目格式"
          action={
            <Pressable style={styles.pickBtn} onPress={handlePickFile}>
              <Text style={styles.pickBtnText}>📄 选择 .md 文件</Text>
            </Pressable>
          }
        />
      </View>
    );
  }

  // ── 预览 / 编辑视图 ──
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 头部 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>{fileName}</Text>
        <Text style={styles.headerCount}>
          {questionCount > 0
            ? `解析到 ${questionCount} 题`
            : '未解析到题目'}
        </Text>

        {/* 模式切换 + 重新选择 */}
        <View style={styles.toolbar}>
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
                  Alert.alert('文件过大', '超过 15 万字符，不支持编辑模式。仅支持预览。');
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

          <Pressable style={styles.repickBtn} onPress={handlePickFile}>
            <Text style={styles.repickBtnText}>📄 换文件</Text>
          </Pressable>
        </View>
      </View>

      {/* 内容区 */}
      <ScrollView
        style={styles.contentArea}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {viewMode === 'preview' ? (
          <MarkdownRenderer content={content} />
        ) : (
          <>
            {fileTooBig && (
              <Text style={styles.tooBigHint}>文件过大，已自动切换到预览模式</Text>
            )}
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
          </>
        )}
      </ScrollView>

      {/* 底部操作栏 */}
      <View style={styles.actions}>
        <Pressable style={styles.cancelBtn} onPress={resetState}>
          <Text style={styles.cancelBtnText}>取消</Text>
        </Pressable>
        <Pressable
          style={[styles.confirmBtn, questionCount === 0 && styles.confirmBtnDisabled]}
          onPress={handleConfirmImport}
          disabled={importing || questionCount === 0}
        >
          {importing ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={[styles.confirmBtnText, questionCount === 0 && styles.confirmBtnTextDisabled]}>
              确认导入{questionCount > 0 ? ` (${questionCount}题)` : ''}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    pickBtn: {
      backgroundColor: c.accent,
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      ...Shadow.button,
    },
    pickBtnText: {
      color: c.textInverse,
      fontSize: FontSize.lg,
      fontWeight: '700',
    },

    // ── 头部 ──
    header: {
      padding: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      color: c.textPrimary,
      fontSize: FontSize.lg,
      fontWeight: '700',
    },
    headerCount: {
      color: c.accent,
      fontSize: FontSize.sm,
      marginTop: Spacing.xs,
      fontWeight: '600',
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.md,
    },
    modeToggle: {
      flexDirection: 'row',
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      padding: 2,
    },
    modeBtn: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
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
    repickBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    repickBtnText: {
      color: c.textSecondary,
      fontSize: FontSize.xs,
    },

    // ── 内容区 ──
    contentArea: {
      flex: 1,
    },
    contentInner: {
      padding: Spacing.lg,
      paddingBottom: Spacing.xxl,
    },
    tooBigHint: {
      color: c.warning,
      fontSize: FontSize.xs,
      marginBottom: Spacing.sm,
      fontStyle: 'italic',
    },

    // ── 编辑器 ──
    editor: {
      flex: 1,
      minHeight: 300,
      color: c.textPrimary,
      fontSize: FontSize.sm,
      fontFamily: 'monospace',
      lineHeight: 20,
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      textAlignVertical: 'top',
    },

    // ── 底部操作 ──
    actions: {
      flexDirection: 'row',
      padding: Spacing.lg,
      gap: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bg,
    },
    cancelBtn: {
      flex: 1,
      backgroundColor: c.bgCard,
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
    },
    cancelBtnText: {
      color: c.textSecondary,
      fontSize: FontSize.md,
      fontWeight: '600',
    },
    confirmBtn: {
      flex: 2,
      backgroundColor: c.accent,
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      ...Shadow.button,
    },
    confirmBtnDisabled: {
      backgroundColor: c.bgCard,
      opacity: 0.5,
    },
    confirmBtnText: {
      color: c.textInverse,
      fontSize: FontSize.md,
      fontWeight: '700',
    },
    confirmBtnTextDisabled: {
      color: c.textMuted,
    },
  });
}
