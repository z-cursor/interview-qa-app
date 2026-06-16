import React, {
  useEffect, useState, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, Keyboard,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from '../store/useStore';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../lib/theme';
import { FileInfo } from '../types';
import { getFileById } from '../lib/database';
import MarkdownRenderer, { MarkdownRendererRef } from '../components/MarkdownRenderer';
import EditorToolbar from '../components/EditorToolbar';
import ScrollProgressBar from '../components/ScrollProgressBar';

const FILES_DIR = `${FileSystem.documentDirectory}files/`;

type EditorMode = 'edit' | 'preview';

interface MDEditorScreenProps {
  route: { params: { fileId: string } };
  navigation: any;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved';

const IDLE_SAVE_DELAY = 30_000;

/** MD 文件编辑器 — 按钮切换 编辑/预览 模式 */
export default function MDEditorScreen({ route, navigation }: MDEditorScreenProps) {
  const { fileId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { saveFileContent, loadDecks } = useStore();

  // ── State ──
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [mode, setMode] = useState<EditorMode>('preview');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [questionCount, setQuestionCount] = useState(0);
  const [inputActive, setInputActive] = useState(false);

  // TextInput 自身内容高度（用于显式设高，确保超出视口可滚动）
  const [textContentHeight, setTextContentHeight] = useState(0);

  // 滚动条追踪（编辑 & 预览共用——同一时间只有一个模式可见）
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // ── Refs ──
  const inputRef = useRef<TextInput>(null);
  const editorScrollRef = useRef<ScrollView>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rendererRef = useRef<MarkdownRendererRef>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const contentRef = useRef('');
  const originalRef = useRef('');

  // ── 加载文件 ──
  useEffect(() => {
    const info = getFileById(fileId);
    if (!info) {
      navigation.goBack();
      return;
    }
    setFileInfo(info);

    const filePath = `${FILES_DIR}${info.path}`;
    FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 })
      .then((text) => {
        setContent(text);
        setOriginalContent(text);
        contentRef.current = text;
        originalRef.current = text;
      })
      .catch((err) => {
        console.warn('[MDEditor] 读取文件失败:', err);
        setContent('');
      });
  }, [fileId, navigation]);

  // ── 清理定时器 ──
  useEffect(() => {
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
    };
  }, []);

  // ── 卸载时保存 ──
  useEffect(() => {
    return () => {
      if (contentRef.current !== originalRef.current && originalRef.current !== '') {
        saveFileContent(fileId, contentRef.current).catch(() => {});
      }
    };
  }, [fileId, saveFileContent]);

  // ── 实际保存 ──
  const doSave = useCallback(async (text: string) => {
    if (text === originalRef.current) return;
    setSaveStatus('saving');
    try {
      const count = await saveFileContent(fileId, text);
      setQuestionCount(count);
    } catch (err) {
      console.warn('[MDEditor] 保存失败:', err);
      setSaveStatus('unsaved');
      return;
    }
    originalRef.current = text;
    setOriginalContent(text);
    setContent(text);
    setSaveStatus('saved');
    loadDecks();
    if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
    savedFlashRef.current = setTimeout(() => {
      setSaveStatus((s) => (s === 'saved' ? 'idle' : s));
    }, 3000);
  }, [fileId, saveFileContent, loadDecks]);

  // ── 手动保存 ──
  const handleSave = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    doSave(contentRef.current);
  }, [doSave]);

  // ── 编辑模式 onChangeText（非受控：不调 setContent，避免每击键重渲染）──
  const onEditChange = useCallback((text: string) => {
    contentRef.current = text;
    if (text === originalRef.current) {
      setSaveStatus('idle');
    } else {
      setSaveStatus('unsaved');
    }
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => doSave(text), IDLE_SAVE_DELAY);
  }, [doSave]);

  // ── 切换模式 ──
  const switchToEdit = useCallback(() => {
    setMode('edit');
  }, []);

  const switchToPreview = useCallback(() => {
    Keyboard.dismiss();
    setInputActive(false);
    inputRef.current?.blur();
    const latest = contentRef.current;
    if (latest !== originalRef.current) {
      doSave(latest);
    }
    setContent(latest);
    setMode('preview');
  }, [doSave]);

  // ── 返回 ──
  const handleBack = useCallback(() => {
    Keyboard.dismiss();
    if (contentRef.current !== originalRef.current) {
      doSave(contentRef.current);
    }
    navigation.goBack();
  }, [doSave, navigation]);

  // ── 工具栏操作 ──
  const handleInsert = useCallback((insertText: string) => {
    const text = contentRef.current;
    const { start, end } = selectionRef.current;
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);
    const newText = before + (selected || insertText) + after;
    contentRef.current = newText;
    inputRef.current?.setNativeProps({ text: newText } as any);
    const newCursor = start + (selected ? selected.length : insertText.length);
    setTimeout(() => {
      inputRef.current?.setNativeProps({
        selection: { start: newCursor, end: newCursor },
      } as any);
      selectionRef.current = { start: newCursor, end: newCursor };
    }, 0);
    if (newText === originalRef.current) {
      setSaveStatus('idle');
    } else {
      setSaveStatus('unsaved');
    }
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => doSave(newText), IDLE_SAVE_DELAY);
  }, [doSave]);

  const handleWrapSelection = useCallback((before: string, after: string) => {
    const text = contentRef.current;
    const { start, end } = selectionRef.current;
    const textBefore = text.slice(0, start);
    const selected = text.slice(start, end);
    const textAfter = text.slice(end);
    const wrapped = before + (selected || '文本') + after;
    const newText = textBefore + wrapped + textAfter;
    contentRef.current = newText;
    inputRef.current?.setNativeProps({ text: newText } as any);
    const newCursor = start + wrapped.length;
    setTimeout(() => {
      inputRef.current?.setNativeProps({
        selection: { start: newCursor, end: newCursor },
      } as any);
      selectionRef.current = { start: newCursor, end: newCursor };
    }, 0);
    if (newText === originalRef.current) {
      setSaveStatus('idle');
    } else {
      setSaveStatus('unsaved');
    }
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => doSave(newText), IDLE_SAVE_DELAY);
  }, [doSave]);

  const handleSelectionChange = useCallback((e: any) => {
    selectionRef.current = e.nativeEvent.selection;
  }, []);

  // ── 滚动条拖拽（预览）→ MarkdownRenderer.scrollTo ──
  const handlePreviewScrollBarDrag = useCallback((ratio: number) => {
    const scrollableH = contentHeight - viewportHeight;
    if (scrollableH <= 0) return;
    rendererRef.current?.scrollTo(ratio * scrollableH);
  }, [contentHeight, viewportHeight]);

  // ── 滚动条拖拽（编辑）→ ScrollView.scrollTo ──
  const handleScrollBarDrag = useCallback((ratio: number) => {
    const scrollableH = contentHeight - viewportHeight;
    if (scrollableH <= 0 || !editorScrollRef.current) return;
    editorScrollRef.current.scrollTo({ y: ratio * scrollableH, animated: false });
  }, [contentHeight, viewportHeight]);

  // ── ScrollView 回调（编辑模式）──
  const handleScroll = useCallback((e: any) => {
    setScrollOffset(e.nativeEvent.contentOffset.y);
  }, []);

  // ScrollView onContentSizeChange 上报 contentHeight（给滚动条）
  const handleEditContentSize = useCallback((_w: number, h: number) => {
    setContentHeight(h);
  }, []);

  // TextInput onContentSizeChange → 显式设高（保证内容溢出视口时可滚）
  const handleTextInputContentSize = useCallback((e: any) => {
    const h = e.nativeEvent.contentSize.height;
    if (h > 0) {
      setTextContentHeight(h);
      setContentHeight(h); // 同时更新滚动条
    }
  }, []);

  // ── 预览模式 ScrollView 回调 ──
  const handlePreviewScroll = useCallback((e: any) => {
    setScrollOffset(e.nativeEvent.contentOffset.y);
  }, []);

  const handlePreviewContentSize = useCallback((_w: number, h: number) => {
    setContentHeight(h);
  }, []);

  // ── 加载中 ──
  if (!fileInfo) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={{ color: colors.textMuted, padding: Spacing.xl }}>加载中…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBack} onPress={handleBack}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{fileInfo.name}</Text>
          <View style={styles.saveRow}>
            {saveStatus === 'unsaved' && (
              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <Ionicons name="save-outline" size={14} color={colors.textInverse} />
                <Text style={styles.saveBtnText}>保存</Text>
              </Pressable>
            )}
            {saveStatus === 'saving' && (
              <Text style={[styles.saveHint, { color: colors.textMuted }]}>保存中…</Text>
            )}
            {saveStatus === 'saved' && (
              <Text style={[styles.saveHint, { color: colors.success }]}>已保存</Text>
            )}
            {saveStatus === 'idle' && questionCount > 0 && (
              <Text style={[styles.saveHint, { color: colors.textMuted }]}>{questionCount} 题</Text>
            )}
          </View>
        </View>

        {/* 编辑/预览 切换 */}
        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeBtn, mode === 'edit' && styles.modeBtnActive]}
            onPress={switchToEdit}
          >
            <Ionicons
              name="code-slash"
              size={14}
              color={mode === 'edit' ? colors.textInverse : colors.textMuted}
            />
            <Text style={[styles.modeBtnText, mode === 'edit' && styles.modeBtnTextActive]}>
              编辑
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === 'preview' && styles.modeBtnActive]}
            onPress={switchToPreview}
          >
            <Ionicons
              name="eye"
              size={14}
              color={mode === 'preview' ? colors.textInverse : colors.textMuted}
            />
            <Text style={[styles.modeBtnText, mode === 'preview' && styles.modeBtnTextActive]}>
              预览
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 信息横幅 */}
      {!fileInfo.deckId && questionCount > 0 && (
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={14} color={colors.info} />
          <Text style={styles.infoBannerText}>
            解析到 {questionCount} 题。长按文件可导入到题库。
          </Text>
        </View>
      )}
      {fileInfo.deckId && questionCount === 0 && content !== originalContent && saveStatus === 'saved' && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={14} color={colors.warning} />
          <Text style={styles.warningBannerText}>解析到 0 题，题库未更新</Text>
        </View>
      )}

      {/* Content */}
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {mode === 'preview' ? (
          <View
            style={styles.editorWrapper}
            onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
          >
            <MarkdownRenderer
              ref={rendererRef}
              content={content}
              onScroll={handlePreviewScroll}
              onContentSizeChange={handlePreviewContentSize}
            />
            {contentHeight > viewportHeight && (
              <ScrollProgressBar
                contentHeight={contentHeight}
                viewportHeight={viewportHeight}
                scrollOffset={scrollOffset}
                onScrollTo={handlePreviewScrollBarDrag}
                accentColor={colors.accent}
              />
            )}
          </View>
        ) : (
          <View
            style={styles.editorWrapper}
            onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
          >
            {/* 外层 ScrollView：滚动内容 + 拖拽跳转 */}
            <ScrollView
              ref={editorScrollRef}
              style={styles.editorScroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
              scrollEventThrottle={32}
              onScroll={handleScroll}
              onContentSizeChange={handleEditContentSize}
              onTouchStart={(e) => {
                touchStartRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
              }}
              onTouchEnd={(e) => {
                const dx = Math.abs(e.nativeEvent.pageX - touchStartRef.current.x);
                const dy = Math.abs(e.nativeEvent.pageY - touchStartRef.current.y);
                if (dx < 10 && dy < 10) {
                  // tap → 激活 TextInput 开始编辑
                  setInputActive(true);
                  inputRef.current?.focus();
                }
              }}
            >
              {/* 非受控 TextInput：onContentSizeChange 设显式高度 → 内容超视口 → ScrollView 可滚 + 滚动条可拖拽跳转 */}
              <TextInput
                ref={inputRef}
                style={[
                  styles.editor,
                  {
                    height: Math.max(textContentHeight, viewportHeight, 400),
                  },
                ]}
                defaultValue={content}
                onChangeText={onEditChange}
                onSelectionChange={handleSelectionChange}
                onContentSizeChange={handleTextInputContentSize}
                multiline
                scrollEnabled={false}
                textAlignVertical="top"
                autoCorrect={false}
                autoCapitalize="none"
                spellCheck={false}
                pointerEvents={inputActive ? 'auto' : 'none'}
                onBlur={() => setInputActive(false)}
              />
            </ScrollView>

            {contentHeight > viewportHeight && (
              <ScrollProgressBar
                contentHeight={contentHeight}
                viewportHeight={viewportHeight}
                scrollOffset={scrollOffset}
                onScrollTo={handleScrollBarDrag}
                accentColor={colors.accent}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* 编辑模式工具栏 */}
      {mode === 'edit' && (
        <EditorToolbar
          onInsert={handleInsert}
          onWrapSelection={handleWrapSelection}
        />
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

    // ── Header ──
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: Spacing.sm,
    },
    headerBack: {
      padding: Spacing.xs,
    },
    headerCenter: {
      flex: 1,
    },
    headerTitle: {
      color: c.textPrimary,
      fontSize: FontSize.md,
      fontWeight: '600',
    },
    saveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.accent,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    saveBtnText: {
      color: c.textInverse,
      fontSize: FontSize.xs,
      fontWeight: '600',
    },
    saveHint: {
      fontSize: FontSize.xs,
      fontWeight: '500',
    },

    // 模式切换
    modeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    modeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs + 2,
      borderRadius: BorderRadius.sm,
      backgroundColor: c.bgInput,
    },
    modeBtnActive: {
      backgroundColor: c.accent,
    },
    modeBtnText: {
      color: c.textMuted,
      fontSize: FontSize.xs,
      fontWeight: '600',
    },
    modeBtnTextActive: {
      color: c.textInverse,
    },

    // ── Banners ──
    infoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.micIdle,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    infoBannerText: {
      color: c.info,
      fontSize: FontSize.xs,
      flex: 1,
    },
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.micActive,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    warningBannerText: {
      color: c.warning,
      fontSize: FontSize.xs,
      flex: 1,
    },

    // ── Body ──
    body: {
      flex: 1,
    },

    // ── Editor ──
    editorWrapper: {
      flex: 1,
    },
    editorScroll: {
      flex: 1,
    },
    editor: {
      // 不设 flex:1 — 靠 minHeight 撑满视口，天然高度溢出时 ScrollView 可滚
      color: c.textPrimary,
      fontSize: FontSize.sm,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      lineHeight: 22,
      padding: Spacing.md,
      textAlignVertical: 'top',
    },
  });
}
