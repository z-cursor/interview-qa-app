import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Alert, PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { useStore } from '../store/useStore';
import { Shadow, BorderRadius, FontSize } from '../lib/theme';
import InputDialog from './InputDialog';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FAB_SIZE = 56;
const MARGIN = 16;

interface FABProps {
  onFileCreated?: (fileId: string) => void;
  onFileImported?: (fileId: string) => void;
}

/**
 * 可拖拽浮动操作按钮
 * - 单击：展开/收起菜单
 * - 拖拽：移动按钮位置（自动吸附屏幕边缘）
 */
export default function FAB({ onFileCreated, onFileImported }: FABProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { createFile, importFile } = useStore();

  const [expanded, setExpanded] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);

  // ── 位置（可拖拽）──
  // 初始位置：屏幕右侧中部偏下，避开 TabBar
  const INITIAL_X = SCREEN_W - FAB_SIZE - MARGIN;
  const INITIAL_Y = SCREEN_H * 0.55;
  const pan = useRef(new Animated.ValueXY({ x: INITIAL_X, y: INITIAL_Y })).current;
  const basePos = useRef({ x: INITIAL_X, y: INITIAL_Y });

  // ── 动画值 ──
  const animValue = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // 用 ref 存最新值，避免 PanResponder 闭包过期
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const toggleRef = useRef<() => void>(() => {});

  // 关门锁：遮罩 Pressable 和 PanResponder 在同一触摸中都会触发，
  // 关门锁在 close() 时上锁，toggle() 检测到锁就跳过，微任务自动解锁供下次交互使用。
  const closeGateRef = useRef(false);

  // ── 展开/收起 ──
  const open = useCallback(() => {
    setExpanded(true);
    Animated.parallel([
      Animated.spring(animValue, { toValue: 1, friction: 6, tension: 80, useNativeDriver: false }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [animValue, backdropOpacity]);

  const close = useCallback(() => {
    closeGateRef.current = true;
    setExpanded(false);
    Animated.parallel([
      Animated.spring(animValue, { toValue: 0, friction: 6, tension: 80, useNativeDriver: false }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 150, useNativeDriver: false }),
    ]).start();
    // 微任务解锁：同一次触摸中的 toggle() 被阻止，但下次交互时锁已解开
    Promise.resolve().then(() => { closeGateRef.current = false; });
  }, [animValue, backdropOpacity]);

  const toggle = useCallback(() => {
    if (closeGateRef.current) return;
    if (expandedRef.current) close();
    else open();
  }, [open, close]);
  toggleRef.current = toggle;

  // ── PanResponder（通过 ref 调用最新 toggle，避免闭包过期）──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8,
      onPanResponderGrant: () => {
        pan.setOffset({ x: basePos.current.x, y: basePos.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gs) => {
        pan.setValue({ x: gs.dx, y: gs.dy });
      },
      onPanResponderRelease: (_, gs) => {
        pan.flattenOffset();
        const distance = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);

        // 用欧氏距离区分 tap vs drag（10px 阈值容忍手指微颤）
        if (distance < 10) {
          toggleRef.current();
          pan.setValue({ x: basePos.current.x, y: basePos.current.y });
          return;
        }

        // 拖拽结束 → 吸附到最近边缘
        const currentX = basePos.current.x + gs.dx;
        const currentY = basePos.current.y + gs.dy;
        const snapX =
          currentX + FAB_SIZE / 2 < SCREEN_W / 2
            ? MARGIN
            : SCREEN_W - FAB_SIZE - MARGIN;
        const clampedY = Math.max(
          60,
          Math.min(currentY, SCREEN_H - FAB_SIZE - 80),
        );

        basePos.current = { x: snapX, y: clampedY };
        pan.setValue({ x: snapX, y: clampedY });
      },
    }),
  ).current;

  // ── 新建文件 ──
  const handleCreateFile = useCallback(() => {
    close();
    setTimeout(() => setPromptVisible(true), 300);
  }, [close]);

  const handleCreateConfirm = useCallback(
    (name: string) => {
      setPromptVisible(false);
      const fileName = name.trim() || `未命名-${Date.now().toString(36)}`;
      const fileInfo = createFile(fileName);
      onFileCreated?.(fileInfo.id);
    },
    [createFile, onFileCreated],
  );

  // ── 导入文件 ──
  const handleImportFile = useCallback(async () => {
    close();
    setTimeout(async () => {
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
        if (fileInfo) onFileImported?.(fileInfo.id);
      } catch (err: any) {
        Alert.alert('导入失败', err?.message || '读取文件出错');
      }
    }, 300);
  }, [close, importFile, onFileImported]);

  // ── 动画插值 ──
  const createBtnY = animValue.interpolate({ inputRange: [0, 1], outputRange: [0, -70] });
  const importBtnY = animValue.interpolate({ inputRange: [0, 1], outputRange: [0, -130] });
  const childOpacity = animValue.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
  const mainRotation = animValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* 遮罩 — 点击空白区关闭菜单 */}
      {expanded && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.3)' },
              { opacity: backdropOpacity },
            ]}
            pointerEvents="none"
          />
        </Pressable>
      )}

      {/* FAB 按钮组 — 可拖拽定位 */}
      <Animated.View
        style={[styles.wrapper, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}
        pointerEvents="box-none"
      >
        {/* 新建文件 */}
        <Animated.View
          style={[
            styles.childContainer,
            { opacity: childOpacity, transform: [{ translateY: createBtnY }] },
          ]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <Pressable
            style={({ pressed }) => [
              styles.childBtn,
              pressed && { backgroundColor: colors.accent },
            ]}
            onPress={handleCreateFile}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.textInverse} />
          </Pressable>
          <View style={styles.childLabel}>
            <Text style={styles.childLabelText}>新建文件</Text>
          </View>
        </Animated.View>

        {/* 导入文件 */}
        <Animated.View
          style={[
            styles.childContainer,
            { opacity: childOpacity, transform: [{ translateY: importBtnY }] },
          ]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <Pressable
            style={({ pressed }) => [
              styles.childBtn,
              pressed && { backgroundColor: colors.accent },
            ]}
            onPress={handleImportFile}
          >
            <Ionicons name="cloud-download-outline" size={20} color={colors.textInverse} />
          </Pressable>
          <View style={styles.childLabel}>
            <Text style={styles.childLabelText}>导入文件</Text>
          </View>
        </Animated.View>

        {/* 主按钮 — PanResponder 处理点击 + 拖拽 */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.mainBtn]}
        >
          <Animated.View style={{ transform: [{ rotate: mainRotation }] }}>
            <Ionicons name="add" size={28} color={colors.textInverse} />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* 输入弹窗 */}
      <InputDialog
        visible={promptVisible}
        title="新建 MD 文件"
        placeholder="输入文件名（不需要 .md 后缀）"
        confirmText="创建"
        onCancel={() => setPromptVisible(false)}
        onConfirm={handleCreateConfirm}
      />
    </View>
  );
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    root: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'box-none' as const,
    },
    wrapper: {
      position: 'absolute',
      left: 0,
      top: 0,
      // 位置由 Animated.ValueXY translate 控制
    },
    mainBtn: {
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadow.button,
      elevation: 8,
    },
    mainBtnPressed: {
      backgroundColor: c.accentDark,
      transform: [{ scale: 0.95 }],
    },
    childContainer: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
    },
    childBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.accentDark,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadow.button,
      elevation: 4,
    },
    childLabel: {
      marginRight: 10,
      backgroundColor: c.bgCard,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      ...Shadow.button,
      elevation: 2,
    },
    childLabelText: {
      color: c.textPrimary,
      fontSize: FontSize.sm,
      fontWeight: '600',
    },
  });
}
