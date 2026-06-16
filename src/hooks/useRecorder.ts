import { useState, useCallback, useRef, useEffect } from 'react';
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioRecorderState,
  useAudioPlayerStatus,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import type { RecordingOptions } from 'expo-audio';

const RECORDINGS_DIR = `${FileSystem.documentDirectory}recordings/`;

interface UseRecorderReturn {
  isRecording: boolean;
  isPlaying: boolean;
  hasRecording: boolean;
  isSupported: boolean;
  permissionDenied: boolean;
  error: string | null;
  transcript: string;
  canRecord: boolean;
  /** 最近一次录音的文件 URI（null 表示无录音） */
  recordingUri: string | null;
  /** 最近一次录音的时长(秒) */
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  playRecording: () => void;
  stopPlayback: () => void;
  clearTranscript: () => void;
  setTranscript: (text: string) => void;
  /** 加载历史录音 URI（用于回放已保存的录音） */
  loadRecordingUri: (uri: string | null, duration: number) => void;
}

/**
 * 基于官方 HIGH_QUALITY preset，改为单声道以提高 Android 兼容性。
 * HANDOVER #5: 部分 Android 设备多声道不兼容。
 */
const MONO_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
};

export function useRecorder(): UseRecorderReturn {
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const recorder = useAudioRecorder(MONO_PRESET);
  const player = useAudioPlayer({ uri: '' }, { updateInterval: 500 });

  const recorderState = useAudioRecorderState(recorder);
  const playerStatus = useAudioPlayerStatus(player);

  const uriRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  /** 追踪 native MediaRecorder 是否已 prepare。stop() 后 native 会 reset，需重新 prepare */
  const preparedRef = useRef(false);
  const hasRecording = uriRef.current !== null;

  // ── 初始化：音频模式 → 权限 → prepare ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        console.log('[Recorder] Audio mode set');

        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setIsSupported(false);
          setPermissionDenied(true);
          return;
        }
        console.log('[Recorder] Permission OK');

        if (cancelled) return;

        // 关键：必须先 prepare，native 才会 isPrepared=true，进而 canRecord=true
        await recorder.prepareToRecordAsync();
        preparedRef.current = true;
        console.log('[Recorder] Prepared — canRecord:', recorderState.canRecord);

        setReady(true);
      } catch (e: any) {
        console.warn('[Recorder] Init error:', e?.message);
        if (!cancelled) {
          setIsSupported(false);
          setError(e?.message || '录音初始化失败');
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // 当 canRecord 由 native 事件变为 true 时同步 ready 状态
  useEffect(() => {
    if (recorderState.canRecord && !ready) {
      console.log('[Recorder] canRecord became true (native event)');
      setReady(true);
      preparedRef.current = true;
    }
  }, [recorderState.canRecord, ready]);

  // ── 开始录音 ──
  const startRecording = useCallback(async () => {
    if (startedRef.current) return;
    setError(null);

    // 如果上一次 stop 后 native 已 reset，需重新 prepare
    if (!preparedRef.current) {
      try {
        console.log('[Recorder] Re-preparing before record…');
        await recorder.prepareToRecordAsync();
        preparedRef.current = true;
        console.log('[Recorder] Re-prepared');
      } catch (e: any) {
        console.warn('[Recorder] Re-prepare failed:', e?.message);
        setError(e?.message || '录音准备失败');
        return;
      }
    }

    // 避免录音和播放同时进行
    if (player.playing) player.pause();

    try {
      recorder.record();
      startedRef.current = true;

      // 延迟检查 native 状态（用 recorder.getStatus() 获取最新值，避免闭包捕获旧状态）
      setTimeout(() => {
        const status = recorder.getStatus();
        console.log(
          '[Recorder] After start — isRecording:',
          status.isRecording,
          'canRecord:',
          status.canRecord,
        );
      }, 400);
    } catch (e: any) {
      console.warn('[Recorder] record() threw:', e?.message);
      setError(e?.message || '启动录音失败');
    }
  }, [recorder, player]);

  // ── 停止录音 ──
  const stopRecording = useCallback(async () => {
    if (!startedRef.current) return;
    startedRef.current = false;

    try {
      await recorder.stop();
      // stop() 后 native 会 reset: 释放 MediaRecorder, isPrepared=false
      preparedRef.current = false;

      // 等 native 写入文件
      await new Promise((r) => setTimeout(r, 300));
      const uri = recorder.uri;
      const duration = recorder.currentTime;

      if (!uri) {
        setError('录音保存失败，请重试');
        return;
      }

      // 复制到持久化目录（避免 OS 清理临时文件）
      try {
        await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
        const ext = uri.includes('.') ? uri.split('.').pop() || 'm4a' : 'm4a';
        const persistentUri = `${RECORDINGS_DIR}recording_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: persistentUri });
        // 删除临时文件
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
        uriRef.current = persistentUri;
        setRecordingUri(persistentUri);
        console.log('[Recorder] Saved to:', persistentUri, 'duration:', duration);
      } catch (copyErr: any) {
        // 复制失败时保留原始 URI（可能仍在临时目录）
        console.warn('[Recorder] Copy to persistent failed:', copyErr?.message);
        uriRef.current = uri;
        setRecordingUri(uri);
      }

      setRecordingDuration(duration);
      if (!uriRef.current) setError('录音保存失败，请重试');
    } catch (e: any) {
      console.warn('[Recorder] stop() error:', e?.message);
      setError(e?.message || '停止录音失败');
    }
  }, [recorder]);

  // ── 播放录音 ──
  const playRecording = useCallback(() => {
    const uri = uriRef.current;
    if (!uri) {
      setError('请先录音');
      return;
    }
    setError(null);
    try {
      player.replace({ uri });
      player.play();
    } catch (e: any) {
      setError(e?.message || '播放失败');
    }
  }, [player]);

  const stopPlayback = useCallback(() => {
    if (player.playing) player.pause();
  }, [player]);

  const clearTranscript = useCallback(() => setTranscript(''), []);

  /** 加载历史录音 URI（切换题目时恢复已保存的录音） */
  const loadRecordingUri = useCallback((uri: string | null, duration: number) => {
    uriRef.current = uri;
    setRecordingUri(uri);
    setRecordingDuration(duration);
  }, []);

  return {
    isRecording: startedRef.current || recorderState.isRecording,
    isPlaying: playerStatus.playing,
    hasRecording,
    isSupported,
    permissionDenied,
    error,
    transcript,
    canRecord: ready || recorderState.canRecord,
    recordingUri,
    recordingDuration,
    startRecording,
    stopRecording,
    playRecording,
    stopPlayback,
    clearTranscript,
    setTranscript,
    loadRecordingUri,
  };
}
