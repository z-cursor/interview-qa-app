import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Alert, TextInput,
  RefreshControl, Share, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { useStore } from '../store/useStore';
import { useTheme, ColorTokens, ThemeMode } from '../lib/ThemeContext';
import { Spacing, FontSize, BorderRadius, Shadow } from '../lib/theme';
import { FileInfo } from '../types';
import EmptyState from '../components/EmptyState';
import ActionSheet, { ActionSheetOption } from '../components/ActionSheet';
import InputDialog from '../components/InputDialog';

interface FileListScreenProps {
  navigation: any;
}

/** 文件存储目录 */
const FILES_DIR = `${FileSystem.documentDirectory}files/`;

/** 相对时间格式化 */
function relativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function FileListScreen({ navigation }: FileListScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { files, loadFiles, deleteFile, renameFile, linkFileToDeck, unlinkFileFromDeck, loadDecks, createFile, importFile } = useStore();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ActionSheet & rename dialog state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetOptions, setActionSheetOptions] = useState<ActionSheetOption[]>([]);
  const [actionSheetTitle, setActionSheetTitle] = useState('');
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [renameDefaultName, setRenameDefaultName] = useState('');

  // 新建文件 dialog
  const [createVisible, setCreateVisible] = useState(false);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFiles();
    setRefreshing(false);
  }, [loadFiles]);

  // 搜索过滤 + 按更新时间降序
  const filteredFiles = useMemo(() => {
    let list = [...files];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  }, [files, searchQuery]);

  // ── 主题切换（三态循环）──
  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(mode);
    setMode(order[(idx + 1) % 3]);
  }, [mode, setMode]);

  const themeIcon = mode === 'dark' ? 'moon' : mode === 'light' ? 'sunny' : 'contrast';
  const themeLabel = mode === 'dark' ? '暗色' : mode === 'light' ? '亮色' : '跟随系统';

  // ── 点击文件 → 编辑器 ──
  const handleFilePress = useCallback((file: FileInfo) => {
    navigation.navigate('MDEditor', { fileId: file.id });
  }, [navigation]);

  // ── 长按菜单 ──
  const handleFileLongPress = useCallback((file: FileInfo) => {
    const hasDeck = !!file.deckId;

    const opts: ActionSheetOption[] = [
      {
        text: '重命名',
        onPress: () => {
          setRenameFileId(file.id);
          setRenameDefaultName(file.name.replace(/\.md$/i, ''));
          setRenameVisible(true);
        },
      },
      {
        text: '导出 .md',
        onPress: async () => {
          try {
            const filePath = `${FILES_DIR}${file.path}`;
            const info = await FileSystem.getInfoAsync(filePath);
            if (!info.exists) {
              Alert.alert('文件不存在', '文件可能已被删除');
              return;
            }
            await Share.share({
              title: file.name,
              message: Platform.OS === 'android' ? `分享文件: ${file.name}` : undefined as any,
              url: Platform.OS !== 'android' ? filePath : undefined as any,
            } as any);
          } catch (err: any) {
            Alert.alert('导出失败', err?.message || '分享出错');
          }
        },
      },
    ];

    if (hasDeck) {
      opts.push({
        text: '从题库移除',
        destructive: true,
        onPress: () => {
          Alert.alert('确认移除', `将删除"${file.name}"关联的题库和所有答题记录，但保留 MD 文件。`, [
            { text: '取消', style: 'cancel' },
            { text: '移除', style: 'destructive', onPress: () => unlinkFileFromDeck(file.id) },
          ]);
        },
      });
    } else {
      opts.push({
        text: '导入到题库',
        onPress: async () => {
          try {
            const count = await linkFileToDeck(file.id);
            if (count > 0) {
              loadDecks();
              Alert.alert('导入成功', `已解析 ${count} 题并创建题库`);
            } else {
              Alert.alert('未能解析', '文件中未找到 QA 题目。请检查文件格式。');
            }
          } catch (err: any) {
            Alert.alert('导入失败', err?.message || '解析出错');
          }
        },
      });
    }

    opts.push({
      text: '删除文件',
      destructive: true,
      onPress: () => {
        Alert.alert('确认删除', `删除"${file.name}"${hasDeck ? '及其关联的题库' : ''}，此操作不可恢复。`, [
          { text: '取消', style: 'cancel' },
          { text: '删除', style: 'destructive', onPress: () => deleteFile(file.id) },
        ]);
      },
    });

    setActionSheetTitle(file.name);
    setActionSheetOptions(opts);
    setActionSheetVisible(true);
  }, [renameFile, unlinkFileFromDeck, linkFileToDeck, deleteFile, loadDecks]);

  // ── 重命名确认 ──
  const handleRenameConfirm = useCallback((newName: string) => {
    setRenameVisible(false);
    if (renameFileId && newName.trim()) {
      renameFile(renameFileId, newName.trim());
    }
    setRenameFileId(null);
  }, [renameFileId, renameFile]);

  // ── 新建文件 ──
  const handleCreateFile = useCallback((name: string) => {
    setCreateVisible(false);
    const fileName = name.trim() || `未命名-${Date.now().toString(36)}`;
    const fileInfo = createFile(fileName);
    loadFiles();
    // 创建后直接打开编辑器
    setTimeout(() => navigation.navigate('MDEditor', { fileId: fileInfo.id }), 300);
  }, [createFile, loadFiles, navigation]);

  // ── 导入文件 ──
  const handleImportFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/markdown', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const name = file.name || 'imported.md';
      if (!name.toLowerCase().endsWith('.md')) {
        Alert.alert('格式不支持', '仅支持 .md 格式的文件');
        return;
      }
      const fileInfo = await importFile(file.uri, name);
      if (fileInfo) loadFiles();
    } catch (err: any) {
      Alert.alert('导入失败', err?.message || '读取文件出错');
    }
  }, [importFile, loadFiles]);

  // ── 文件行 ──
  const renderFileItem = useCallback(({ item }: { item: FileInfo }) => {
    const hasDeck = !!item.deckId;
    return (
      <Pressable
        style={({ pressed }) => [styles.fileItem, pressed && styles.fileItemPressed]}
        onPress={() => handleFilePress(item)}
        onLongPress={() => handleFileLongPress(item)}
      >
        <View style={styles.fileIconBox}>
          <Ionicons
            name={hasDeck ? 'document-text' : 'document-outline'}
            size={22}
            color={hasDeck ? colors.success : colors.accent}
          />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileMeta}>{relativeTime(item.updatedAt)}</Text>
        </View>
        {hasDeck && (
          <View style={styles.linkedBadge}>
            <Ionicons name="link" size={12} color={colors.success} />
            <Text style={styles.linkedText}>已关联</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    );
  }, [colors, styles, handleFilePress, handleFileLongPress]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>文件</Text>
          <Pressable style={styles.themeBtn} onPress={cycleTheme}>
            <Ionicons name={themeIcon} size={18} color={colors.accent} />
            <Text style={styles.themeLabel}>{themeLabel}</Text>
          </Pressable>
        </View>

        {/* 工具栏：新建 + 导入 */}
        <View style={styles.toolRow}>
          <Pressable style={styles.toolBtn} onPress={() => setCreateVisible(true)}>
            <Ionicons name="add-circle" size={20} color={colors.accent} />
            <Text style={styles.toolBtnText}>新建文件</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} onPress={handleImportFile}>
            <Ionicons name="cloud-download-outline" size={20} color={colors.accent} />
            <Text style={styles.toolBtnText}>导入文件</Text>
          </Pressable>
          <View style={styles.toolSpacer} />
        </View>

        {/* 搜索 */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索文件…"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Ionicons
              name="close-circle"
              size={16}
              color={colors.textMuted}
              onPress={() => setSearchQuery('')}
            />
          )}
        </View>
      </View>

      {/* 文件列表 */}
      <FlatList
        data={filteredFiles}
        keyExtractor={(item) => item.id}
        renderItem={renderFileItem}
        ListEmptyComponent={
          files.length === 0 ? (
            <EmptyState
              icon="document-outline"
              title="还没有文件"
              subtitle="点击上方「新建文件」或「导入文件」开始"
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="没有匹配的文件"
              subtitle={`没有找到包含 "${searchQuery}" 的文件`}
            />
          )
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      />

      {/* 长按操作菜单 */}
      <ActionSheet
        visible={actionSheetVisible}
        title={actionSheetTitle}
        options={actionSheetOptions}
        onClose={() => setActionSheetVisible(false)}
      />

      {/* 重命名弹窗 */}
      <InputDialog
        visible={renameVisible}
        title="重命名"
        placeholder="输入新文件名（不需要 .md 后缀）"
        defaultValue={renameDefaultName}
        confirmText="确定"
        onCancel={() => { setRenameVisible(false); setRenameFileId(null); }}
        onConfirm={handleRenameConfirm}
      />

      {/* 新建文件弹窗 */}
      <InputDialog
        visible={createVisible}
        title="新建 MD 文件"
        placeholder="输入文件名（不需要 .md 后缀）"
        confirmText="创建"
        onCancel={() => setCreateVisible(false)}
        onConfirm={handleCreateFile}
      />
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
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    headerTitle: {
      color: c.textPrimary,
      fontSize: FontSize.title,
      fontWeight: '700',
    },
    themeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.bgInput,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs + 2,
      borderRadius: BorderRadius.full,
    },
    themeLabel: {
      color: c.accent,
      fontSize: FontSize.xs,
      fontWeight: '600',
    },
    toolRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    toolBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.bgInput,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.sm,
    },
    toolBtnText: {
      color: c.accent,
      fontSize: FontSize.sm,
      fontWeight: '600',
    },
    toolSpacer: {
      flex: 1,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      height: 40,
      gap: Spacing.sm,
    },
    searchInput: {
      flex: 1,
      color: c.textPrimary,
      fontSize: FontSize.sm,
      paddingVertical: 0,
    },
    listContent: {
      flexGrow: 1,
      paddingBottom: Spacing.huge,
    },
    fileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
    },
    fileItemPressed: {
      backgroundColor: c.borderLight + '30',
    },
    fileIconBox: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.sm,
      backgroundColor: c.micIdle,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    fileInfo: {
      flex: 1,
    },
    fileName: {
      color: c.textPrimary,
      fontSize: FontSize.md,
      fontWeight: '500',
    },
    fileMeta: {
      color: c.textMuted,
      fontSize: FontSize.xs,
      marginTop: 2,
    },
    linkedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: c.micIdle,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      marginRight: Spacing.sm,
    },
    linkedText: {
      color: c.success,
      fontSize: FontSize.xs,
      fontWeight: '500',
    },
    separator: {
      height: 1,
      backgroundColor: c.border,
      marginLeft: Spacing.xl + 40 + Spacing.md,
    },
  });
}
