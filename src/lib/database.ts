import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Deck, QAItem, AnswerRecord, FileInfo } from '../types';
import { uuidv4 } from '../utils/uuid';

let db: SQLite.SQLiteDatabase | null = null;

/** 获取数据库实例 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('interview_qa.db');
    initTables();
  }
  return db;
}

/** 初始化表结构。含简易 migration：检测旧表结构并升级。 */
function initTables(): void {
  const d = getDatabase();

  // 检测 v1.0 → v1.1 migration（voice_uri / voice_duration 列）
  const needsMigration = checkNeedsMigration(d);
  // 检测 v1.1 → v2.0 migration（decks.file_id 列 + files 表）
  const needsV2Migration = checkNeedsV2Migration(d);

  d.execSync(`
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      is_preset INTEGER DEFAULT 0,
      item_count INTEGER DEFAULT 0,
      completed_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      file_id TEXT
    );

    CREATE TABLE IF NOT EXISTS qa_items (
      id TEXT PRIMARY KEY,
      deck_id TEXT NOT NULL,
      source TEXT,
      title TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sections TEXT DEFAULT '{}',
      tags TEXT DEFAULT '[]',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS raw_files (
      deck_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_qa_deck ON qa_items(deck_id);
  `);

  if (needsMigration) {
    // 旧表无 voice_uri/voice_duration 列 → 重建
    d.execSync('DROP TABLE IF EXISTS answer_records');
  }

  d.execSync(`
    CREATE TABLE IF NOT EXISTS answer_records (
      id TEXT PRIMARY KEY,
      qa_item_id TEXT NOT NULL,
      voice_transcript TEXT DEFAULT '',
      voice_uri TEXT,
      voice_duration REAL DEFAULT 0,
      revealed INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (qa_item_id) REFERENCES qa_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_records_qa ON answer_records(qa_item_id);
  `);

  // v2.0: files 表
  d.execSync(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      deck_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // v2.0: decks.file_id 迁移（表创建前检测一次，创建后再兜底一次）
  if (needsV2Migration || checkNeedsV2Migration(d)) {
    try {
      d.execSync('ALTER TABLE decks ADD COLUMN file_id TEXT');
      console.log('[DB] 已添加 decks.file_id 列');
    } catch (err) {
      console.warn('[DB] 添加 decks.file_id 失败（可能已存在）:', err);
    }
  }
}

/** 检查 answer_records 表是否缺少 voice_uri 列 */
function checkNeedsMigration(d: SQLite.SQLiteDatabase): boolean {
  try {
    const info = d.getAllSync<{ name: string }>(
      "PRAGMA table_info(answer_records)"
    );
    const hasVoiceUri = info.some(row => row.name === 'voice_uri');
    return info.length > 0 && !hasVoiceUri;
  } catch {
    return false;
  }
}

/** 检查 decks 表是否缺少 file_id 列（v1 → v2 迁移） */
function checkNeedsV2Migration(d: SQLite.SQLiteDatabase): boolean {
  try {
    const info = d.getAllSync<{ name: string }>(
      "PRAGMA table_info(decks)"
    );
    const hasFileId = info.some(row => row.name === 'file_id');
    return info.length > 0 && !hasFileId;
  } catch {
    return false;
  }
}

// ── Deck CRUD ──

export function insertDeck(deck: Deck): void {
  const d = getDatabase();
  d.runSync(
    `INSERT OR REPLACE INTO decks (id, name, file_name, is_preset, item_count, completed_count, created_at, file_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [deck.id, deck.name, deck.fileName, deck.isPreset ? 1 : 0, deck.itemCount, deck.completedCount, deck.createdAt, deck.fileId ?? null]
  );
}

export function getAllDecks(): Deck[] {
  const d = getDatabase();
  const rows = d.getAllSync<{
    id: string; name: string; file_name: string; is_preset: number;
    item_count: number; completed_count: number; created_at: number;
    file_id: string | null;
  }>('SELECT * FROM decks ORDER BY created_at DESC');
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    isPreset: row.is_preset === 1,
    itemCount: row.item_count,
    completedCount: row.completed_count,
    createdAt: row.created_at,
    fileId: row.file_id ?? undefined,
  }));
}

export function getDeckById(id: string): Deck | null {
  const d = getDatabase();
  const row = d.getFirstSync<{
    id: string; name: string; file_name: string; is_preset: number;
    item_count: number; completed_count: number; created_at: number;
    file_id: string | null;
  }>('SELECT * FROM decks WHERE id = ?', [id]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    isPreset: row.is_preset === 1,
    itemCount: row.item_count,
    completedCount: row.completed_count,
    createdAt: row.created_at,
    fileId: row.file_id ?? undefined,
  };
}

export function updateDeckCompletedCount(deckId: string, count: number): void {
  const d = getDatabase();
  d.runSync('UPDATE decks SET completed_count = ? WHERE id = ?', [count, deckId]);
}

/** 更新题库名称 */
export function updateDeckName(deckId: string, name: string): void {
  const d = getDatabase();
  d.runSync('UPDATE decks SET name = ? WHERE id = ?', [name, deckId]);
}

/** 更新题库 MD 内容：重新解析 → 替换 QA items + raw_file + deck itemCount */
export function updateDeckContent(deckId: string, newContent: string, newItems: QAItem[]): void {
  const d = getDatabase();

  d.withTransactionSync(() => {
    d.runSync('DELETE FROM qa_items WHERE deck_id = ?', [deckId]);
    insertQAItems(newItems);
    d.runSync('INSERT OR REPLACE INTO raw_files (deck_id, content) VALUES (?, ?)', [deckId, newContent]);
    d.runSync('UPDATE decks SET item_count = ? WHERE id = ?', [newItems.length, deckId]);
  });
}

export function deleteDeck(deckId: string): void {
  const d = getDatabase();

  // 清理录音文件
  const records = d.getAllSync<{ voice_uri: string | null }>(
    `SELECT ar.voice_uri FROM answer_records ar
     JOIN qa_items qi ON ar.qa_item_id = qi.id
     WHERE qi.deck_id = ?`, [deckId]
  );
  for (const r of records) {
    if (r.voice_uri) {
      try { FileSystem.deleteAsync(r.voice_uri, { idempotent: true }); } catch {}
    }
  }

  d.runSync('DELETE FROM raw_files WHERE deck_id = ?', [deckId]);
  d.runSync('DELETE FROM answer_records WHERE qa_item_id IN (SELECT id FROM qa_items WHERE deck_id = ?)', [deckId]);
  d.runSync('DELETE FROM qa_items WHERE deck_id = ?', [deckId]);
  d.runSync('DELETE FROM decks WHERE id = ?', [deckId]);
}

// ── QA Items CRUD ──

export function insertQAItems(items: QAItem[]): void {
  const d = getDatabase();
  const stmt = d.prepareSync(
    `INSERT OR REPLACE INTO qa_items (id, deck_id, source, title, question, answer, sections, tags, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const item of items) {
    stmt.executeSync([
      item.id, item.deckId, item.source, item.title,
      item.question, item.answer,
      JSON.stringify(item.sections), JSON.stringify(item.tags),
      item.sortOrder,
    ]);
  }
  stmt.finalizeSync();
}

export function getQAItemsByDeck(deckId: string): QAItem[] {
  const d = getDatabase();
  const rows = d.getAllSync<{
    id: string; deck_id: string; source: string; title: string;
    question: string; answer: string; sections: string; tags: string;
    sort_order: number;
  }>('SELECT * FROM qa_items WHERE deck_id = ? ORDER BY sort_order', [deckId]);
  return rows.map(row => ({
    id: row.id,
    deckId: row.deck_id,
    source: row.source,
    title: row.title,
    question: row.question,
    answer: row.answer,
    sections: JSON.parse(row.sections || '{}'),
    tags: JSON.parse(row.tags || '[]'),
    sortOrder: row.sort_order,
  }));
}

export function getQAItemById(id: string): QAItem | null {
  const d = getDatabase();
  const row = d.getFirstSync<{
    id: string; deck_id: string; source: string; title: string;
    question: string; answer: string; sections: string; tags: string;
    sort_order: number;
  }>('SELECT * FROM qa_items WHERE id = ?', [id]);
  if (!row) return null;
  return {
    id: row.id,
    deckId: row.deck_id,
    source: row.source,
    title: row.title,
    question: row.question,
    answer: row.answer,
    sections: JSON.parse(row.sections || '{}'),
    tags: JSON.parse(row.tags || '[]'),
    sortOrder: row.sort_order,
  };
}

export function countQAInDeck(deckId: string): number {
  const d = getDatabase();
  const row = d.getFirstSync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM qa_items WHERE deck_id = ?', [deckId]
  );
  return row?.cnt ?? 0;
}

// ── Answer Records CRUD ──

export function insertAnswerRecord(record: AnswerRecord): void {
  const d = getDatabase();

  // 删除同 qaItemId 的旧录音文件和 DB 记录
  const old = getAnswerRecord(record.qaItemId);
  if (old?.voiceUri) {
    try { FileSystem.deleteAsync(old.voiceUri, { idempotent: true }); } catch {}
  }
  d.runSync('DELETE FROM answer_records WHERE qa_item_id = ?', [record.qaItemId]);

  // 插入新记录
  d.runSync(
    `INSERT INTO answer_records (id, qa_item_id, voice_transcript, voice_uri, voice_duration, revealed, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [record.id, record.qaItemId, record.voiceTranscript, record.voiceUri, record.voiceDuration, record.revealed ? 1 : 0, record.timestamp]
  );
}

export function getAnswerRecord(qaItemId: string): AnswerRecord | null {
  const d = getDatabase();
  const row = d.getFirstSync<{
    id: string; qa_item_id: string; voice_transcript: string;
    voice_uri: string | null; voice_duration: number;
    revealed: number; timestamp: number;
  }>('SELECT * FROM answer_records WHERE qa_item_id = ?', [qaItemId]);
  if (!row) return null;
  return {
    id: row.id,
    qaItemId: row.qa_item_id,
    voiceTranscript: row.voice_transcript,
    voiceUri: row.voice_uri ?? null,
    voiceDuration: row.voice_duration ?? 0,
    revealed: row.revealed === 1,
    timestamp: row.timestamp,
  };
}

export function getCompletedCount(deckId: string): number {
  const d = getDatabase();
  const row = d.getFirstSync<{ cnt: number }>(
    `SELECT COUNT(DISTINCT ar.qa_item_id) as cnt
     FROM answer_records ar
     JOIN qa_items qi ON ar.qa_item_id = qi.id
     WHERE qi.deck_id = ? AND ar.revealed = 1`,
    [deckId]
  );
  return row?.cnt ?? 0;
}

// ── Raw Files ──

export function insertRawFile(deckId: string, content: string): void {
  const d = getDatabase();
  d.runSync('INSERT OR REPLACE INTO raw_files (deck_id, content) VALUES (?, ?)', [deckId, content]);
}

export function getRawFile(deckId: string): string | null {
  const d = getDatabase();
  const row = d.getFirstSync<{ content: string }>(
    'SELECT content FROM raw_files WHERE deck_id = ?', [deckId]
  );
  return row?.content ?? null;
}

// ── Files CRUD (v2.0) ──

export function insertFile(file: FileInfo): void {
  const d = getDatabase();
  d.runSync(
    `INSERT OR REPLACE INTO files (id, name, path, deck_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [file.id, file.name, file.path, file.deckId ?? null, file.createdAt, file.updatedAt]
  );
}

export function getAllFiles(): FileInfo[] {
  const d = getDatabase();
  const rows = d.getAllSync<{
    id: string; name: string; path: string; deck_id: string | null;
    created_at: number; updated_at: number;
  }>('SELECT * FROM files ORDER BY updated_at DESC');
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    path: row.path,
    deckId: row.deck_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getFileById(id: string): FileInfo | null {
  const d = getDatabase();
  const row = d.getFirstSync<{
    id: string; name: string; path: string; deck_id: string | null;
    created_at: number; updated_at: number;
  }>('SELECT * FROM files WHERE id = ?', [id]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    deckId: row.deck_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getFileByDeckId(deckId: string): FileInfo | null {
  const d = getDatabase();
  const row = d.getFirstSync<{
    id: string; name: string; path: string; deck_id: string | null;
    created_at: number; updated_at: number;
  }>('SELECT * FROM files WHERE deck_id = ?', [deckId]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    deckId: row.deck_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updateFile(id: string, changes: Partial<Pick<FileInfo, 'name' | 'path' | 'deckId' | 'updatedAt'>>): void {
  const d = getDatabase();
  const sets: string[] = [];
  const vals: any[] = [];

  if (changes.name !== undefined) { sets.push('name = ?'); vals.push(changes.name); }
  if (changes.path !== undefined) { sets.push('path = ?'); vals.push(changes.path); }
  if (changes.deckId !== undefined) { sets.push('deck_id = ?'); vals.push(changes.deckId); }
  if (changes.updatedAt !== undefined) { sets.push('updated_at = ?'); vals.push(changes.updatedAt); }

  if (sets.length > 0) {
    vals.push(id);
    d.runSync(`UPDATE files SET ${sets.join(', ')} WHERE id = ?`, vals);
  }
}

/** 删除文件 + 关联 deck + qa_items + answer_records + 录音文件 */
export function deleteFileWithDeck(fileId: string): void {
  const d = getDatabase();
  const file = getFileById(fileId);

  d.withTransactionSync(() => {
    if (file?.deckId) {
      // 删除录音文件
      const records = d.getAllSync<{ voice_uri: string | null }>(
        `SELECT ar.voice_uri FROM answer_records ar
         JOIN qa_items qi ON ar.qa_item_id = qi.id
         WHERE qi.deck_id = ?`, [file.deckId]
      );
      for (const r of records) {
        if (r.voice_uri) {
          try { FileSystem.deleteAsync(r.voice_uri, { idempotent: true }); } catch {}
        }
      }
      d.runSync('DELETE FROM answer_records WHERE qa_item_id IN (SELECT id FROM qa_items WHERE deck_id = ?)', [file.deckId]);
      d.runSync('DELETE FROM qa_items WHERE deck_id = ?', [file.deckId]);
      d.runSync('DELETE FROM raw_files WHERE deck_id = ?', [file.deckId]);
      d.runSync('DELETE FROM decks WHERE id = ?', [file.deckId]);
    }
    d.runSync('DELETE FROM files WHERE id = ?', [fileId]);
  });

  // 删除磁盘上的 MD 文件
  if (file) {
    try {
      const filePath = `${FileSystem.documentDirectory}files/${file.path}`;
      FileSystem.deleteAsync(filePath, { idempotent: true });
    } catch {}
  }
}

/** 建立 deck ↔ file 关联 */
export function updateDeckFileId(deckId: string, fileId: string | null): void {
  const d = getDatabase();
  d.runSync('UPDATE decks SET file_id = ? WHERE id = ?', [fileId, deckId]);
  if (fileId) {
    d.runSync('UPDATE files SET deck_id = ? WHERE id = ?', [deckId, fileId]);
  }
}

/** 解除 deck 关联并删除 deck 相关数据（保留文件） */
export function unlinkDeckFromFile(fileId: string): void {
  const file = getFileById(fileId);
  if (!file?.deckId) return;

  const d = getDatabase();
  const deckId = file.deckId;

  d.withTransactionSync(() => {
    // 删除录音文件
    const records = d.getAllSync<{ voice_uri: string | null }>(
      `SELECT ar.voice_uri FROM answer_records ar
       JOIN qa_items qi ON ar.qa_item_id = qi.id
       WHERE qi.deck_id = ?`, [deckId]
    );
    for (const r of records) {
      if (r.voice_uri) {
        try { FileSystem.deleteAsync(r.voice_uri, { idempotent: true }); } catch {}
      }
    }
    d.runSync('DELETE FROM answer_records WHERE qa_item_id IN (SELECT id FROM qa_items WHERE deck_id = ?)', [deckId]);
    d.runSync('DELETE FROM qa_items WHERE deck_id = ?', [deckId]);
    d.runSync('DELETE FROM raw_files WHERE deck_id = ?', [deckId]);
    d.runSync('DELETE FROM decks WHERE id = ?', [deckId]);
    d.runSync('UPDATE files SET deck_id = NULL WHERE id = ?', [fileId]);
  });
}

/** 将旧 raw_files 数据迁移到 files 表 + 写入磁盘 */
export async function migrateRawFilesToFiles(): Promise<number> {
  const d = getDatabase();

  // 检查是否已有 files 数据
  const existingCount = d.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM files');
  if (existingCount && existingCount.cnt > 0) {
    console.log('[Migration] files 表已有数据，跳过迁移');
    return 0;
  }

  const rawFiles = d.getAllSync<{ deck_id: string; content: string }>('SELECT * FROM raw_files');
  if (rawFiles.length === 0) {
    console.log('[Migration] raw_files 为空，跳过迁移');
    return 0;
  }

  const filesDir = `${FileSystem.documentDirectory}files/`;
  try {
    await FileSystem.makeDirectoryAsync(filesDir, { intermediates: true });
  } catch {}

  let migrated = 0;
  for (const raw of rawFiles) {
    try {
      const deck = getDeckById(raw.deck_id);
      if (!deck) continue;

      // 生成文件名
      const safeName = deck.fileName.replace(/[<>:"/\\|?*]/g, '_');
      const fileName = safeName.endsWith('.md') ? safeName : `${safeName}.md`;

      // 写入磁盘
      const filePath = `${filesDir}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, raw.content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // 创建 files 行
      const fileId = uuidv4();
      const now = Date.now();

      insertFile({
        id: fileId,
        name: fileName,
        path: fileName,
        deckId: deck.id,
        createdAt: now,
        updatedAt: now,
      });

      // 回写 decks.file_id
      updateDeckFileId(deck.id, fileId);

      migrated++;
      console.log(`[Migration] ✅ ${fileName}`);
    } catch (err) {
      console.warn(`[Migration] ❌ ${raw.deck_id}:`, err);
    }
  }

  console.log(`[Migration] 完成，迁移 ${migrated} 个文件`);
  return migrated;
}

// ── Statistics ──

export function getTotalStats(): { totalQuestions: number; totalCompleted: number; totalDecks: number } {
  const d = getDatabase();
  const qRow = d.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM qa_items');
  const cRow = d.getFirstSync<{ cnt: number }>(
    'SELECT COUNT(DISTINCT qa_item_id) as cnt FROM answer_records WHERE revealed = 1'
  );
  const dRow = d.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM decks');
  return {
    totalQuestions: qRow?.cnt ?? 0,
    totalCompleted: cRow?.cnt ?? 0,
    totalDecks: dRow?.cnt ?? 0,
  };
}
