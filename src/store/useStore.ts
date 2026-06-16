import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import { Deck, QAItem, StudySession, AnswerRecord, FileInfo } from '../types';
import { parseMarkdownToQAs } from '../lib/parser';
import { uuidv4 } from '../utils/uuid';
import * as db from '../lib/database';

interface AppState {
  // 数据
  decks: Deck[];
  files: FileInfo[];
  currentSession: StudySession | null;
  currentQA: QAItem | null;
  currentRecord: AnswerRecord | null;

  // 加载状态
  isPreloading: boolean;
  preloadDone: boolean;

  // Actions — Decks
  loadDecks: () => void;
  refreshDecks: () => void;
  startSession: (deckId: string, mode: 'random' | 'sequential') => void;
  goToQuestion: (index: number) => void;
  goNext: () => void;
  goPrev: () => void;
  markCompleted: (qaItemId: string) => void;
  saveAnswerRecord: (record: AnswerRecord) => void;
  loadAnswerRecord: (qaItemId: string) => void;
  setPreloading: (v: boolean) => void;
  setPreloadDone: () => void;

  // Actions — Files (v2.0)
  loadFiles: () => void;
  createFile: (name: string) => FileInfo;
  deleteFile: (id: string) => void;
  renameFile: (id: string, newName: string) => void;
  linkFileToDeck: (fileId: string) => Promise<number>;  // returns QA count
  unlinkFileFromDeck: (fileId: string) => void;
  saveFileContent: (fileId: string, content: string) => Promise<number>;  // returns QA count
  /** 复制文件到内部存储并创建 files 行。返回新 FileInfo。 */
  importFile: (sourceUri: string, name: string) => Promise<FileInfo | null>;
}

const FILES_DIR = `${FileSystem.documentDirectory}files/`;

export const useStore = create<AppState>((set, get) => ({
  decks: [],
  files: [],
  currentSession: null,
  currentQA: null,
  currentRecord: null,
  isPreloading: true,
  preloadDone: false,

  // ── Deck actions ──

  loadDecks: () => {
    const decks = db.getAllDecks();
    const updated = decks.map(d => ({
      ...d,
      completedCount: db.getCompletedCount(d.id),
    }));
    set({ decks: updated });
  },

  refreshDecks: () => {
    get().loadDecks();
  },

  startSession: (deckId: string, mode) => {
    const items = db.getQAItemsByDeck(deckId);
    let order = items.map(i => i.id);

    if (mode === 'random') {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }

    const session: StudySession = {
      deckId,
      mode,
      currentIndex: 0,
      order,
      completedIds: [],
    };

    const qa = items.find(i => i.id === order[0]) || null;
    set({ currentSession: session, currentQA: qa, currentRecord: null });
  },

  goToQuestion: (index: number) => {
    const { currentSession } = get();
    if (!currentSession) return;

    const newIndex = Math.max(0, Math.min(index, currentSession.order.length - 1));
    const items = db.getQAItemsByDeck(currentSession.deckId);
    const qa = items.find(i => i.id === currentSession.order[newIndex]) || null;

    set({
      currentSession: { ...currentSession, currentIndex: newIndex },
      currentQA: qa,
      currentRecord: null,
    });
  },

  goNext: () => {
    const { currentSession } = get();
    if (!currentSession) return;
    get().goToQuestion(currentSession.currentIndex + 1);
  },

  goPrev: () => {
    const { currentSession } = get();
    if (!currentSession) return;
    get().goToQuestion(currentSession.currentIndex - 1);
  },

  markCompleted: (qaItemId: string) => {
    const { currentSession } = get();
    if (!currentSession) return;

    const newCompleted = currentSession.completedIds.includes(qaItemId)
      ? currentSession.completedIds
      : [...currentSession.completedIds, qaItemId];

    const newSession = { ...currentSession, completedIds: newCompleted };
    set({ currentSession: newSession });
    db.updateDeckCompletedCount(currentSession.deckId, newCompleted.length);
  },

  saveAnswerRecord: (record) => {
    db.insertAnswerRecord(record);
    set({ currentRecord: record });
    get().markCompleted(record.qaItemId);
  },

  loadAnswerRecord: (qaItemId: string) => {
    const record = db.getAnswerRecord(qaItemId);
    set({ currentRecord: record });
  },

  setPreloading: (v) => set({ isPreloading: v }),
  setPreloadDone: () => set({ preloadDone: true, isPreloading: false }),

  // ── File actions (v2.0) ──

  loadFiles: () => {
    const files = db.getAllFiles();
    set({ files });
  },

  createFile: (name: string) => {
    const fileName = name.endsWith('.md') ? name : `${name}.md`;
    const id = uuidv4();
    const now = Date.now();

    const fileInfo: FileInfo = {
      id,
      name: fileName,
      path: fileName,
      deckId: null,
      createdAt: now,
      updatedAt: now,
    };

    // 异步写入空文件到磁盘（fire-and-forget）
    FileSystem.writeAsStringAsync(
      `${FILES_DIR}${fileName}`,
      `# ${name}\n\n`,
      { encoding: FileSystem.EncodingType.UTF8 }
    ).catch(err => console.warn('[Store] createFile 写入磁盘失败:', err));

    db.insertFile(fileInfo);
    get().loadFiles();
    return fileInfo;
  },

  deleteFile: (id: string) => {
    db.deleteFileWithDeck(id);
    get().loadFiles();
    get().loadDecks();
  },

  renameFile: (id: string, newName: string) => {
    const file = db.getFileById(id);
    if (!file) return;

    const safeName = newName.endsWith('.md') ? newName : `${newName}.md`;
    const oldPath = `${FILES_DIR}${file.path}`;
    const newPath = `${FILES_DIR}${safeName}`;

    // 重命名磁盘文件
    try {
      FileSystem.moveAsync({ from: oldPath, to: newPath });
    } catch (err) {
      console.warn('[Store] renameFile 移动文件失败:', err);
    }

    // 更新 DB
    db.updateFile(id, { name: safeName, path: safeName, updatedAt: Date.now() });

    // 同步 deck 名称
    if (file.deckId) {
      db.updateDeckName(file.deckId, safeName.replace(/\.md$/i, ''));
    }

    get().loadFiles();
    get().loadDecks();
  },

  linkFileToDeck: async (fileId: string): Promise<number> => {
    const file = db.getFileById(fileId);
    if (!file) return 0;

    // 读取文件内容
    const filePath = `${FILES_DIR}${file.path}`;
    let content = '';
    try {
      content = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch {
      return 0;
    }

    if (!content.trim()) return 0;

    const qas = parseMarkdownToQAs(content);
    if (qas.length === 0) return 0;

    const now = Date.now();
    const deckId = file.deckId || uuidv4();

    if (file.deckId) {
      // 已有 deck，更新内容
      const items = qas.map((qa, idx) => ({
        id: uuidv4(),
        deckId,
        source: file.name,
        title: qa.title,
        question: qa.question,
        answer: qa.answer,
        sections: qa.sections,
        tags: qa.tags,
        sortOrder: idx,
      }));
      db.updateDeckContent(deckId, content, items);
      db.updateFile(fileId, { updatedAt: now });
    } else {
      // 新建 deck
      const deck: Deck = {
        id: deckId,
        name: file.name.replace(/\.md$/i, ''),
        fileName: file.name,
        isPreset: false,
        itemCount: qas.length,
        completedCount: 0,
        createdAt: now,
        fileId,
      };

      db.getDatabase().withTransactionSync(() => {
        db.insertDeck(deck);
        db.insertQAItems(
          qas.map((qa, idx) => ({
            id: uuidv4(),
            deckId,
            source: file.name,
            title: qa.title,
            question: qa.question,
            answer: qa.answer,
            sections: qa.sections,
            tags: qa.tags,
            sortOrder: idx,
          }))
        );
        db.updateDeckFileId(deckId, fileId);
        db.updateFile(fileId, { deckId, updatedAt: now });
      });
    }

    get().loadFiles();
    get().loadDecks();
    return qas.length;
  },

  unlinkFileFromDeck: (fileId: string) => {
    db.unlinkDeckFromFile(fileId);
    get().loadFiles();
    get().loadDecks();
  },

  saveFileContent: async (fileId: string, content: string): Promise<number> => {
    const file = db.getFileById(fileId);
    if (!file) return 0;

    const filePath = `${FILES_DIR}${file.path}`;

    // 写入磁盘
    try {
      await FileSystem.writeAsStringAsync(filePath, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (err) {
      console.warn('[Store] saveFileContent 写入失败:', err);
      return 0;
    }

    // 更新 DB 时间戳
    db.updateFile(fileId, { updatedAt: Date.now() });

    // 如果已关联 deck，自动重新解析更新题库
    let qaCount = 0;
    if (file.deckId) {
      try {
        const qas = parseMarkdownToQAs(content);
        qaCount = qas.length;

        if (qaCount > 0) {
          const d = db.getDatabase();
          d.withTransactionSync(() => {
            d.runSync('DELETE FROM qa_items WHERE deck_id = ?', [file.deckId!]);
            db.insertQAItems(
              qas.map((qa, idx) => ({
                id: uuidv4(),
                deckId: file.deckId!,
                source: file.name,
                title: qa.title,
                question: qa.question,
                answer: qa.answer,
                sections: qa.sections,
                tags: qa.tags,
                sortOrder: idx,
              }))
            );
            d.runSync(
              'UPDATE decks SET item_count = ?, file_name = ? WHERE id = ?',
              [qaCount, file.name, file.deckId!]
            );
          });
        }
      } catch (err) {
        console.warn('[Store] saveFileContent 解析失败:', err);
      }
    }

    get().loadFiles();
    if (file.deckId) get().loadDecks();
    return qaCount;
  },

  importFile: async (sourceUri: string, name: string) => {
    const safeName = name.endsWith('.md') ? name : `${name}.md`;
    const id = uuidv4();
    const now = Date.now();

    try {
      // 确保 files 目录存在
      await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });

      const destPath = `${FILES_DIR}${safeName}`;
      await FileSystem.copyAsync({ from: sourceUri, to: destPath });

      const fileInfo: FileInfo = {
        id,
        name: safeName,
        path: safeName,
        deckId: null,
        createdAt: now,
        updatedAt: now,
      };

      db.insertFile(fileInfo);
      get().loadFiles();
      return fileInfo;
    } catch (err) {
      console.error('[Store] importFile 失败:', err);
      return null;
    }
  },
}));
