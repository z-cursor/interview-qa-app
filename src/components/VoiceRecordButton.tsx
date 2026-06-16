import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, BorderRadius, FontSize } from '../lib/theme';

interface VoiceRecordButtonProps {
  isRecording: boolean;
  isPlaying: boolean;
  hasRecording: boolean;
  isSupported: boolean;
  permissionDenied: boolean;
  error: string | null;
  transcript: string;
  /** 历史录音 URI（加载已有答题记录时传入） */
  recordingUri?: string | null;
  /** 历史录音时长 */
  recordingDuration?: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPlayRecording: () => void;
  onStopPlayback: () => void;
  onTranscriptChange: (text: string) => void;
}

/** 格式化秒数为 mm:ss */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceRecordButton(props: VoiceRecordButtonProps) {
  const {
    isRecording, isPlaying, hasRecording, isSupported, permissionDenied,
    error, transcript, recordingUri, recordingDuration,
    onStartRecording, onStopRecording, onPlayRecording, onStopPlayback,
    onTranscriptChange,
  } = props;

  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // 录音计时
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasEverRecorded, setHasEverRecorded] = useState(false);

  // 脉动动画
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);

      // 脉动循环
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      pulse.start();

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        pulse.stop();
        pulseAnim.setValue(1);
      };
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  if (hasRecording && !hasEverRecorded) setHasEverRecorded(true);

  // ── 无权限 / 不支持 ──
  if (permissionDenied || !isSupported) {
    return (
      <View style={styles.container}>
        {permissionDenied && (
          <Text style={styles.mutedHint}>麦克风未授权，请前往系统设置开启</Text>
        )}
        <TextInput
          style={styles.notesInput}
          placeholder="输入笔记…"
          placeholderTextColor={colors.textMuted}
          multiline
          value={transcript}
          onChangeText={onTranscriptChange}
          textAlignVertical="top"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── 笔记输入区（上方）── */}
      <View style={styles.notesWrapper}>
        {isRecording && (
          <View style={styles.recordingBanner}>
            <Animated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
            <Text style={styles.recordingBannerText}>
              正在录音 {formatDuration(recordingSeconds)}
            </Text>
          </View>
        )}
        <TextInput
          style={[styles.notesInput, isRecording && styles.notesInputRecording]}
          placeholder={isRecording ? '录音中，也可同时输入笔记…' : '输入笔记…'}
          placeholderTextColor={isRecording ? colors.accent : colors.textMuted}
          multiline
          value={transcript}
          onChangeText={onTranscriptChange}
          textAlignVertical="top"
        />
      </View>

      {/* ── 控制行（居中）── */}
      <View style={styles.controlRow}>
        {/* 录音按钮 */}
        <Pressable
          onPressIn={onStartRecording}
          onPressOut={onStopRecording}
          style={({ pressed }) => [
            styles.recordBtn,
            (pressed || isRecording) && styles.recordBtnActive,
          ]}
        >
          <Ionicons
            name="mic"
            size={22}
            color={isRecording ? colors.textInverse : colors.accent}
          />
        </Pressable>

        {/* 状态文字 */}
        <View style={styles.statusArea}>
          {isRecording ? (
            <Text style={styles.recordingHint}>松手停止</Text>
          ) : hasRecording ? (
            <Pressable
              onPress={isPlaying ? onStopPlayback : onPlayRecording}
              style={({ pressed }) => [
                styles.playBtn,
                pressed && styles.playBtnPressed,
              ]}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={18}
                color={colors.accent}
              />
              <Text style={styles.playLabel}>
                {isPlaying ? '暂停' : '回放'}
              </Text>
            </Pressable>
          ) : recordingUri ? (
            <View style={styles.historyInfo}>
              <Ionicons name="recording" size={14} color={colors.textMuted} />
              <Text style={styles.historyDuration}>
                {formatDuration(Math.floor(recordingDuration ?? 0))}
              </Text>
            </View>
          ) : hasEverRecorded ? null : (
            <Text style={styles.mutedHint}>按住录音</Text>
          )}
        </View>
      </View>

      {/* ── 错误提示 ── */}
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}
    </View>
  );
}

const RECORD_BTN_SIZE = 48;

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
    },

    // ── 笔记区 ──
    notesWrapper: {
      marginBottom: Spacing.sm,
    },
    recordingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.xs,
      paddingLeft: 2,
    },
    pulseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.error,
      marginRight: Spacing.xs,
    },
    recordingBannerText: {
      color: c.error,
      fontSize: FontSize.xs,
      fontWeight: '600',
    },
    notesInput: {
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
      color: c.textPrimary,
      fontSize: FontSize.sm,
      minHeight: 48,
      maxHeight: 72,
      lineHeight: 20,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    notesInputRecording: {
      borderColor: 'rgba(244, 67, 54, 0.3)',
      backgroundColor: c.micActive,
    },

    // ── 控制行 ──
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
    },

    // ── 录音按钮 48x48 ──
    recordBtn: {
      width: RECORD_BTN_SIZE,
      height: RECORD_BTN_SIZE,
      borderRadius: RECORD_BTN_SIZE / 2,
      backgroundColor: c.micIdle,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'rgba(240, 165, 0, 0.35)',
    },
    recordBtnActive: {
      backgroundColor: c.error,
      borderColor: c.error,
      transform: [{ scale: 1.05 }],
    },

    // ── 状态区 ──
    statusArea: {
      minWidth: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordingHint: {
      color: c.error,
      fontSize: FontSize.xs,
      fontWeight: '600',
    },
    playBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      backgroundColor: c.micIdle,
      borderRadius: BorderRadius.full,
    },
    playBtnPressed: {
      backgroundColor: c.micActive,
    },
    playLabel: {
      color: c.accent,
      fontSize: FontSize.xs,
      fontWeight: '600',
    },
    mutedHint: {
      color: c.textMuted,
      fontSize: FontSize.xs,
    },
    historyInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    historyDuration: {
      color: c.textMuted,
      fontSize: FontSize.xs,
    },

    // ── 错误 ──
    errorText: {
      color: c.error,
      fontSize: FontSize.xs,
      marginTop: Spacing.xs,
      textAlign: 'center',
    },
  });
}
