import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uuidv4 } from '../utils/uuid';
import { useStore } from '../store/useStore';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, BorderRadius, FontSize, Shadow } from '../lib/theme';
import { useRecorder } from '../hooks/useRecorder';
import QuestionCard from '../components/QuestionCard';
import VoiceRecordButton from '../components/VoiceRecordButton';
import AnswerSheet from '../components/AnswerSheet';
import ProgressHeader from '../components/ProgressHeader';
import EmptyState from '../components/EmptyState';
import { StudyMode } from '../types';

interface StudyScreenProps {
  route: { params: { deckId: string; mode?: StudyMode } };
  navigation: any;
}

export default function StudyScreen({ route, navigation }: StudyScreenProps) {
  const { deckId, mode: initialMode = 'sequential' } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    currentSession, currentQA,
    startSession, goNext, goPrev, saveAnswerRecord, loadAnswerRecord,
  } = useStore();

  const [mode, setMode] = useState<StudyMode>(initialMode);
  const [answerRevealed, setAnswerRevealed] = useState(false);

  const recorder = useRecorder();

  // 用 ref 存 transcript 和录音信息，避免 useCallback 依赖不稳定
  const transcriptRef = useRef('');
  transcriptRef.current = recorder.transcript;
  const recordingUriRef = useRef<string | null>(null);
  recordingUriRef.current = recorder.recordingUri;
  const recordingDurationRef = useRef(0);
  recordingDurationRef.current = recorder.recordingDuration;

  // 初始化会话
  useEffect(() => {
    startSession(deckId, mode);
  }, [deckId, mode, startSession]);

  // 切换题目时加载答题记录
  useEffect(() => {
    if (currentQA) {
      loadAnswerRecord(currentQA.id);
      const record = useStore.getState().currentRecord;
      setAnswerRevealed(record?.revealed ?? false);
      if (record?.voiceTranscript) {
        recorder.setTranscript(record.voiceTranscript);
      } else {
        recorder.clearTranscript();
      }
      // 恢复录音文件
      recorder.loadRecordingUri(record?.voiceUri ?? null, record?.voiceDuration ?? 0);
    }
  }, [currentQA?.id, loadAnswerRecord]);

  // 揭晓答案
  const handleReveal = useCallback(() => {
    if (!currentQA) return;
    setAnswerRevealed(true);

    const record = {
      id: uuidv4(),
      qaItemId: currentQA.id,
      voiceTranscript: transcriptRef.current,
      voiceUri: recordingUriRef.current,
      voiceDuration: recordingDurationRef.current,
      revealed: true,
      timestamp: Date.now(),
    };
    saveAnswerRecord(record);
  }, [currentQA, saveAnswerRecord]);

  const handleNext = useCallback(() => {
    // 切题前保存当前题目的录音信息
    if (currentQA && transcriptRef.current) {
      saveAnswerRecord({
        id: uuidv4(),
        qaItemId: currentQA.id,
        voiceTranscript: transcriptRef.current,
        voiceUri: recordingUriRef.current,
        voiceDuration: recordingDurationRef.current,
        revealed: answerRevealed,
        timestamp: Date.now(),
      });
    }
    setAnswerRevealed(false);
    recorder.clearTranscript();
    goNext();
  }, [goNext, recorder, currentQA, answerRevealed, saveAnswerRecord]);

  const handlePrev = useCallback(() => {
    // 切题前保存当前题目的录音信息
    if (currentQA && transcriptRef.current) {
      saveAnswerRecord({
        id: uuidv4(),
        qaItemId: currentQA.id,
        voiceTranscript: transcriptRef.current,
        voiceUri: recordingUriRef.current,
        voiceDuration: recordingDurationRef.current,
        revealed: answerRevealed,
        timestamp: Date.now(),
      });
    }
    setAnswerRevealed(false);
    recorder.clearTranscript();
    goPrev();
  }, [goPrev, recorder, currentQA, answerRevealed, saveAnswerRecord]);

  const handleModeToggle = useCallback(() => {
    const newMode = mode === 'random' ? 'sequential' : 'random';
    setMode(newMode);
    setAnswerRevealed(false);
    recorder.clearTranscript();
    startSession(deckId, newMode);
  }, [mode, deckId, startSession, recorder]);

  if (!currentSession || !currentQA) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState
          icon="alert-circle-outline"
          title="无法加载题目"
          subtitle="请返回重试"
        />
      </View>
    );
  }

  const isLast = currentSession.currentIndex >= currentSession.order.length - 1;
  const isFirst = currentSession.currentIndex <= 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ProgressHeader
        current={currentSession.currentIndex}
        total={currentSession.order.length}
        mode={mode}
        onModeToggle={handleModeToggle}
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        {/* 可滚动区域：题目 + 揭晓 + 答案 */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <QuestionCard
            title={currentQA.title}
            question={currentQA.question}
            index={currentSession.currentIndex}
            total={currentSession.order.length}
          />

          {/* 揭晓答案 */}
          <Pressable
            style={({ pressed }) => [styles.revealBtn, pressed && styles.revealBtnPressed]}
            onPress={() => {
              if (answerRevealed) setAnswerRevealed(false);
              else handleReveal();
            }}
          >
            <Text style={styles.revealBtnText}>
              {answerRevealed ? '🔼 收起答案' : '✨ 揭晓答案'}
            </Text>
          </Pressable>

          {/* 答案面板 */}
          {answerRevealed && (
            <View style={styles.answerWrapper}>
              <AnswerSheet
                answer={currentQA.answer}
                sections={currentQA.sections}
                visible={true}
              />
            </View>
          )}
        </ScrollView>

        {/* 录音面板 — 固定在底部，不随 ScrollView 滚动 */}
        <View style={styles.recorderPanel}>
          {/* 向上收起栏 — 答案展开时显示，替代浮动收起按钮 */}
          {answerRevealed && (
            <Pressable
              style={({ pressed }) => [
                styles.collapseBar,
                pressed && styles.collapseBarPressed,
              ]}
              onPress={() => setAnswerRevealed(false)}
            >
              <View style={styles.collapseHandle} />
              <Text style={styles.collapseHint}>收起答案</Text>
            </Pressable>
          )}

          <VoiceRecordButton
            isRecording={recorder.isRecording}
            isPlaying={recorder.isPlaying}
            hasRecording={recorder.hasRecording}
            isSupported={recorder.isSupported}
            permissionDenied={recorder.permissionDenied}
            error={recorder.error}
            transcript={recorder.transcript}
            recordingUri={recorder.recordingUri}
            recordingDuration={recorder.recordingDuration}
            onStartRecording={recorder.startRecording}
            onStopRecording={recorder.stopRecording}
            onPlayRecording={recorder.playRecording}
            onStopPlayback={recorder.stopPlayback}
            onTranscriptChange={recorder.setTranscript}
          />
        </View>

        {/* 底部导航 */}
        <View style={styles.bottomNav}>
          <NavButton
            label="上一题"
            icon="chevron-back"
            disabled={isFirst}
            onPress={handlePrev}
            colors={colors}
          />
          <NavButton
            label="下一题"
            icon="chevron-forward"
            disabled={isLast}
            onPress={handleNext}
            colors={colors}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function NavButton({
  label, icon, disabled, onPress, colors,
}: {
  label: string; icon: keyof typeof Ionicons.glyphMap; disabled: boolean; onPress: () => void; colors: ColorTokens;
}) {
  const styles = useMemo(() => createNavStyles(colors), [colors]);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.navBtn,
        disabled && styles.navBtnDisabled,
        pressed && !disabled && styles.navBtnPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons
        name={icon}
        size={24}
        color={disabled ? colors.textMuted : colors.textPrimary}
      />
      <Text style={[styles.navBtnLabel, disabled && styles.navBtnTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

function createNavStyles(c: ColorTokens) {
  return StyleSheet.create({
    navBtn: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: c.bgCard,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
    },
    navBtnPressed: { backgroundColor: c.border },
    navBtnDisabled: { opacity: 0.35 },
    navBtnLabel: { color: c.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
    navBtnTextDisabled: { color: c.textMuted },
  });
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    body: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Spacing.lg,
    },
    revealBtn: {
      backgroundColor: c.accent,
      marginHorizontal: Spacing.xxl,
      marginTop: Spacing.lg,
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      ...Shadow.button,
    },
    revealBtnPressed: {
      backgroundColor: c.accentDark,
      opacity: 0.9,
    },
    revealBtnText: {
      color: c.textInverse,
      fontSize: FontSize.lg,
      fontWeight: '700',
    },
    answerWrapper: {
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.lg,
    },
    recorderPanel: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bg,
    },
    collapseBar: {
      alignItems: 'center',
      paddingVertical: Spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    collapseBarPressed: {
      backgroundColor: c.bgInput,
    },
    collapseHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.textMuted,
      marginBottom: 2,
    },
    collapseHint: {
      color: c.textMuted,
      fontSize: FontSize.xs,
    },
    bottomNav: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      gap: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bg,
    },
  });
}
