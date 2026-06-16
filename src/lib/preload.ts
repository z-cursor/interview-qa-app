import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { uuidv4 } from '../utils/uuid';
import { Deck, FileInfo } from '../types';
import { parseMarkdownToQAs } from './parser';
import {
  getDatabase, insertDeck, insertQAItems, getAllDecks,
  getAllFiles, insertFile, updateDeckFileId, migrateRawFilesToFiles,
} from './database';

const PRESET_FILE_NAME = 'AI应用开发-技术栈面试弹药库.md';
const PRESET_ASSET_NAME = 'AI应用开发-技术栈面试弹药库_unified.md';

/** 预置题库文件清单 — v2.0 仅保留 1 个示例 */
const PRESET_FILES: { name: string; module: number }[] = [
  {
    name: PRESET_ASSET_NAME,
    module: require('../../assets/data/AI应用开发-技术栈面试弹药库_unified.md'),
  },
];

const FILES_DIR = `${FileSystem.documentDirectory}files/`;

/** 刷新预置文件的解析数据（修复旧 parser 遗留的错误数据） */
async function refreshPresetData(
  existingDecks: Deck[],
  existingFiles: FileInfo[],
): Promise<void> {
  const db = getDatabase();

  for (const file of PRESET_FILES) {
    try {
      // 优先通过 name 匹配，退而通过 PRESET_FILE_NAME 匹配
      let fileInfo = existingFiles.find(f => f.name === PRESET_FILE_NAME);
      if (!fileInfo) {
        // 兜底：files 表可能存储了与 PRESET_ASSET_NAME 同名的记录
        fileInfo = existingFiles.find(f => f.name === file.name);
      }
      if (!fileInfo) {
        console.warn(`[Preload] 未找到预置文件 ${PRESET_FILE_NAME}，跳过刷新`);
        continue;
      }

      // 读取磁盘上的文件内容
      const filePath = `${FILES_DIR}${fileInfo.path}`;
      let content: string;
      try {
        content = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } catch {
        console.warn(`[Preload] 读取 ${fileInfo.path} 失败，跳过刷新`);
        continue;
      }

      if (!content || content.trim().length === 0) {
        console.warn(`[Preload] ${fileInfo.path} 内容为空，跳过刷新`);
        continue;
      }

      // 用最新 parser 重新解析
      const qas = parseMarkdownToQAs(content);
      if (qas.length === 0) {
        console.warn(`[Preload] ${fileInfo.path} 未解析到题目，跳过刷新`);
        continue;
      }

      // 找到关联的 deck（优先通过 fileId，退而通过 name）
      let deck = existingDecks.find(d => d.fileId === fileInfo!.id);
      if (!deck) {
        // 兜底：deck 的 fileId 可能为 null（旧数据），改用 deck.fileName 匹配
        deck = existingDecks.find(d =>
          d.isPreset && d.fileName === PRESET_FILE_NAME
        );
      }
      if (!deck) {
        console.warn(`[Preload] 未找到预置题库，跳过刷新`);
        continue;
      }

      // 获取旧 QA items（用于保留 ID 以维持 answer_records 关联）
      const oldItems = db.getAllSync<{ id: string; sort_order: number }>(
        'SELECT id, sort_order FROM qa_items WHERE deck_id = ? ORDER BY sort_order',
        [deck.id]
      );

      // 按 sort_order 匹配新旧 items，保留旧 ID
      const items = qas.map((qa, idx) => {
        const oldItem = oldItems.find(o => o.sort_order === idx);
        return {
          id: oldItem?.id ?? uuidv4(),  // 保留旧 ID 以维持 answer_records 关联
          deckId: deck.id,
          source: PRESET_FILE_NAME,
          title: qa.title,
          question: qa.question,
          answer: qa.answer,
          sections: qa.sections,
          tags: qa.tags,
          sortOrder: idx,
        };
      });

      db.withTransactionSync(() => {
        // 删掉超出新 QA 数量的旧 items（其 answer_records 会被 CASCADE 清理）
        if (oldItems.length > items.length) {
          for (let i = items.length; i < oldItems.length; i++) {
            const oldId = oldItems[i]?.id;
            if (oldId) {
              db.runSync('DELETE FROM qa_items WHERE id = ?', [oldId]);
            }
          }
        }

        // Upsert QA items（保留旧 ID 的记录会被 UPDATE，新的是 INSERT）
        for (const item of items) {
          const exists = oldItems.some(o => o.id === item.id);
          if (exists) {
            db.runSync(
              `UPDATE qa_items SET title = ?, question = ?, answer = ?, sections = ?, tags = ?
               WHERE id = ?`,
              [item.title, item.question, item.answer,
               JSON.stringify(item.sections), JSON.stringify(item.tags), item.id]
            );
          } else {
            db.runSync(
              `INSERT INTO qa_items (id, deck_id, source, title, question, answer, sections, tags, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [item.id, item.deckId, item.source, item.title, item.question, item.answer,
               JSON.stringify(item.sections), JSON.stringify(item.tags), item.sortOrder]
            );
          }
        }

        // 更新 deck item_count
        db.runSync('UPDATE decks SET item_count = ? WHERE id = ?', [items.length, deck.id]);
      });

      console.log(`[Preload] ✅ 刷新 ${PRESET_FILE_NAME}: ${qas.length} 题（保留 ${Math.min(oldItems.length, items.length)} 条答题记录）`);
    } catch (err) {
      console.warn(`[Preload] 刷新 ${file.name} 失败:`, err);
    }
  }
}

/** 检查并加载预置题库（仅首次运行） */
export async function preloadPresetDecks(): Promise<number> {
  // v2.0: 先迁移旧 raw_files 数据 → files 表
  try {
    const migrated = await migrateRawFilesToFiles();
    if (migrated > 0) {
      console.log(`[Preload] 已迁移 ${migrated} 个旧文件`);
    }
  } catch (err) {
    console.warn('[Preload] 迁移 raw_files 失败（非致命）:', err);
  }

  // 确保 files 目录存在
  try {
    await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });
  } catch {}

  // 确保 recordings 目录存在
  const recordingsDir = `${FileSystem.documentDirectory}recordings/`;
  try {
    await FileSystem.makeDirectoryAsync(recordingsDir, { intermediates: true });
  } catch {}

  // 检查是否已加载过预置文件
  const existingDecks = getAllDecks();
  const hasPresets = existingDecks.some(d => d.isPreset);
  const existingFiles = getAllFiles();
  const presetFileExists = existingFiles.some(f => f.name === PRESET_FILE_NAME);

  if (hasPresets && presetFileExists) {
    // 即使预置文件已存在，也重新解析以修复旧 parser 的数据问题
    console.log('[Preload] 预置文件已存在，刷新解析数据…');
    await refreshPresetData(existingDecks, existingFiles);
    return existingDecks.filter(d => d.isPreset).length;
  }

  if (hasPresets && !presetFileExists) {
    // 边缘情况：decks 表有预置题库但 files 表无记录（如迁移失败或手动清理）
    // 尝试重建 files 记录并从磁盘重新解析
    console.log('[Preload] 预置题库存在但文件记录缺失，尝试重建…');
    const deck = existingDecks.find(d => d.isPreset);
    const filePath = `${FILES_DIR}${PRESET_FILE_NAME}`;
    const fileExistsOnDisk = await FileSystem.getInfoAsync(filePath).then(i => i.exists).catch(() => false);

    if (fileExistsOnDisk && deck) {
      // 磁盘文件存在 → 创建 files 记录并刷新
      const fileId = uuidv4();
      const now = Date.now();
      insertFile({
        id: fileId,
        name: PRESET_FILE_NAME,
        path: PRESET_FILE_NAME,
        deckId: deck.id,
        createdAt: now,
        updatedAt: now,
      });
      updateDeckFileId(deck.id, fileId);
      console.log('[Preload] 已重建文件记录，开始刷新…');
      const updatedFiles = getAllFiles();
      const updatedDecks = getAllDecks();
      await refreshPresetData(updatedDecks, updatedFiles);
      return updatedDecks.filter(d => d.isPreset).length;
    }

    // 磁盘文件也不存在 → 回退到首次加载流程（从 asset 重新写入）
    // 先清理旧预置 deck 以避免重复（CASCADE 会清理关联的 qa_items + answer_records）
    console.log('[Preload] 磁盘文件也不存在，清理旧数据后从 asset 重新加载…');
    for (const d of existingDecks) {
      if (d.isPreset) {
        try {
          getDatabase().runSync('DELETE FROM decks WHERE id = ?', [d.id]);
        } catch {}
      }
    }
  }

  console.log('[Preload] 首次启动，加载预置示例文件...');
  let loaded = 0;

  for (const file of PRESET_FILES) {
    try {
      // 从 asset module 加载文件内容
      const asset = await Asset.fromModule(file.module).downloadAsync();
      const content = await FileSystem.readAsStringAsync(asset.localUri!, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (!content || content.trim().length === 0) {
        console.warn(`[Preload] ${file.name} 内容为空，跳过`);
        continue;
      }

      // 解析 QA
      const qas = parseMarkdownToQAs(content);
      if (qas.length === 0) {
        console.warn(`[Preload] ${file.name} 未解析到题目，跳过`);
        continue;
      }

      // 写入磁盘
      const filePath = `${FILES_DIR}${PRESET_FILE_NAME}`;
      await FileSystem.writeAsStringAsync(filePath, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // 创建 files 行
      const fileId = uuidv4();
      const now = Date.now();
      const fileInfo: FileInfo = {
        id: fileId,
        name: PRESET_FILE_NAME,
        path: PRESET_FILE_NAME,
        deckId: null, // 先创建 file，再回填
        createdAt: now,
        updatedAt: now,
      };

      // 创建题库
      const deckId = uuidv4();
      const deck: Deck = {
        id: deckId,
        name: PRESET_FILE_NAME.replace(/\.md$/i, ''),
        fileName: PRESET_FILE_NAME,
        isPreset: true,
        itemCount: qas.length,
        completedCount: 0,
        createdAt: now,
        fileId, // 关联 file
      };

      // 回填 file.deckId
      fileInfo.deckId = deckId;

      // 入库
      getDatabase().withTransactionSync(() => {
        insertFile(fileInfo);
        insertDeck(deck);
        insertQAItems(
          qas.map((qa, idx) => ({
            id: uuidv4(),
            deckId,
            source: PRESET_FILE_NAME,
            title: qa.title,
            question: qa.question,
            answer: qa.answer,
            sections: qa.sections,
            tags: qa.tags,
            sortOrder: idx,
          }))
        );
      });

      loaded++;
      console.log(`[Preload] ✅ ${PRESET_FILE_NAME}: ${qas.length} 题`);
    } catch (err) {
      console.error(`[Preload] ❌ ${file.name}:`, err);
    }
  }

  console.log(`[Preload] 完成，共加载 ${loaded} 个文件`);
  return loaded;
}
