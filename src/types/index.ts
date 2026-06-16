/** QA 题目格式类型 */
export type QAFormat = 'unified' | 'agent' | 'restful' | 'ammo' | 'simple' | 'unknown';

/** 单道 QA 题目 */
export interface QAItem {
  id: string;
  deckId: string;
  source: string;
  title: string;
  question: string;          // markdown
  answer: string;             // markdown
  sections: QASections;
  tags: string[];
  sortOrder: number;
}

export interface QASections {
  analysis?: string;
  keyPoints?: string;
  interviewerWants?: string;
  followUp?: string;
}

/** 题库 */
export interface Deck {
  id: string;
  name: string;
  fileName: string;
  isPreset: boolean;
  itemCount: number;
  completedCount: number;
  createdAt: number;
  fileId?: string;            // 关联的 MD 文件 ID（v2.0 新增）
}

/** MD 文件信息（v2.0 新增） */
export interface FileInfo {
  id: string;
  name: string;
  path: string;               // 相对于 documents/files/ 的路径
  deckId: string | null;      // 关联的题库 ID
  createdAt: number;
  updatedAt: number;
}

/** 刷题模式 */
export type StudyMode = 'random' | 'sequential';

/** 刷题会话 */
export interface StudySession {
  deckId: string;
  mode: StudyMode;
  currentIndex: number;
  order: string[];            // QAItem id 序列
  completedIds: string[];
}

/** 答题记录 */
export interface AnswerRecord {
  id: string;
  qaItemId: string;
  voiceTranscript: string;
  voiceUri: string | null;      // 录音文件路径
  voiceDuration: number;        // 录音时长(秒)
  revealed: boolean;
  timestamp: number;
}
