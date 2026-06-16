/**
 * 将现有混杂格式的 MD 题库转换为统一格式
 *
 * 用法: node scripts/convert-md.mjs <input.md> [output.md]
 *       node scripts/convert-md.mjs assets/data/   # 批量转换整个目录
 */

import fs from 'fs';
import path from 'path';

// ── 轻量解析器（纯 JS，无依赖） ──

function parseMd(content) {
  const blocks = content.split(/\n---\n/);
  const qas = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.length < 20) continue;

    // 检测复合格式：## 父标题 + ### 子问题 → 拆分为独立题目
    if (isCompoundBlock(trimmed)) {
      const expanded = expandCompoundBlock(trimmed);
      for (const qa of expanded) {
        if (qa && qa.title && qa.answer) {
          qas.push(qa);
        }
      }
      continue;
    }

    // 检测格式
    const isAgent = /^###\s+Q\d+\s*[:：]/m.test(trimmed);
    const isRestful = /\*\*Q\s*[:：]/.test(trimmed);
    const isHeading = /^#{2,3}\s+/.test(trimmed);

    if (!isAgent && !isRestful && !isHeading) continue;

    const qa = extractQA(trimmed, isAgent, isRestful);
    if (qa && qa.title && qa.answer) {
      qas.push(qa);
    }
  }

  return qas;
}

function isCompoundBlock(text) {
  // 必须以 ## 开头（非 ###），有 ### 子标题
  if (!/^##\s+/.test(text)) return false;
  const subMatches = text.match(/^###\s+.+$/gm);
  return subMatches !== null && subMatches.length >= 1;
}

function expandCompoundBlock(text) {
  const parentMatch = text.match(/^##\s+(.+)/m);
  const parentTitle = parentMatch
    ? parentMatch[1].trim().replace(/^[\d.]+[\s.]+/, '')
    : '';

  const firstHash3 = text.search(/^###\s+/m);
  if (firstHash3 < 0) return [];

  const body = text.slice(firstHash3);
  const sections = body.split(/^###\s+/m).filter(s => s.trim());

  const qas = [];
  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0].trim();
    const content = lines.slice(1).join('\n').trim();

    if (!title || title.length < 2) continue;

    let answer = content;
    let keyPoints = '';
    let followUp = '';

    // 提取子节中的元数据
    keyPoints = extractSection(section, '考察点') || '';
    followUp = extractSection(section, '追问点') || '';

    // 截断 answer 到元数据标记之前
    const metaCut = answer.search(/\n\*\*(?:考察点|追问)\*\*/);
    if (metaCut > 0) {
      answer = answer.slice(0, metaCut).trim();
    }

    // 构造 question：父标题 + 子标题
    const question = parentTitle
      ? `${parentTitle} — ${title}`
      : title;

    // 清理
    const cleanTitle = title.replace(/[*_#]/g, '').trim();
    const cleanAnswer = cleanBody(answer);
    const cleanKeyPoints = cleanBody(keyPoints);
    const cleanFollowUp = cleanBody(followUp);

    if (!cleanTitle || cleanTitle.length < 2) continue;
    if (!cleanAnswer || cleanAnswer.length < 5) continue;

    qas.push({
      title: cleanTitle,
      question: question,
      answer: cleanAnswer,
      keyPoints: cleanKeyPoints,
      followUp: cleanFollowUp,
    });
  }
  return qas;
}

function extractQA(text, isAgent, isRestful) {
  let title = '';
  let question = '';
  let answer = '';
  let keyPoints = '';
  let followUp = '';

  if (isAgent) {
    // ### Q1: title
    const titleM = text.match(/^###\s+Q\d+\s*[:：]\s*(.+)/m);
    title = titleM ? titleM[1].trim() : '';

    // 题目正文：Q 行到 题目解析/题目讲解/示例答案
    const qM = text.match(/^###\s+Q\d+\s*[:：].+\n([\s\S]*?)(?=\*\*(?:题目解析|题目讲解|考察点|面试官更想听|示例答案)\*\*)/);
    question = qM ? qM[1].trim() : '';

    // 答案：示例答案 > 题目讲解
    answer = extractSection(text, '示例答案') || extractSection(text, '题目讲解') || '';
    keyPoints = extractSection(text, '考察点') || '';
    followUp = extractSection(text, '追问点') || '';
  } else if (isRestful) {
    // **Q: title**
    const titleM = text.match(/\*\*Q\s*[:：]\s*(.+?)\*\*/);
    title = titleM ? titleM[1].trim() : '';

    // 题目 = Q 行后面的内容，到 追问点 之前
    const withoutQ = text.replace(/\*\*Q\s*[:：]\s*.+?\*\*\s*\n?/, '').trim();
    const followIdx = withoutQ.search(/\*\*追问点\*\*/);
    if (followIdx > 0) {
      question = withoutQ.slice(0, followIdx).trim();
      followUp = extractSection(text, '追问点') || '';
    } else {
      question = withoutQ;
    }
    // For RESTful, the answer IS the text between Q and 追问点 (same as question body)
    answer = question;
    question = title;
  } else {
    // Heading format (simple ## or ###)
    const titleM = text.match(/^#{2,3}\s+(.+)/m);
    title = titleM ? titleM[1].trim().replace(/^[\d.]+[\s.]+/, '') : '';
    const qM = text.match(/^#{2,3}\s+.+\n([\s\S]*)/);
    answer = qM ? qM[1].trim() : text;
    keyPoints = extractSection(text, '考察点') || '';
    followUp = extractSection(text, '追问点') || '';
  }

  // 清理
  title = title.replace(/[*_#]/g, '').trim();
  answer = cleanBody(answer);
  keyPoints = cleanBody(keyPoints);
  followUp = cleanBody(followUp);

  if (!title || title.length < 2) return null;
  if (!answer || answer.length < 5) return null;

  return { title, question: question || title, answer, keyPoints, followUp };
}

function extractSection(text, key) {
  const regex = new RegExp(`\\*\\*${key}\\*\\*[:：]?\\s*\\n?([\\s\\S]*?)(?=\\n\\*\\*|$)`, 'i');
  const m = text.match(regex);
  return m ? m[1].trim() : '';
}

function cleanBody(text) {
  return text
    .replace(/\n---\s*$/, '')   // 尾部 ---
    .replace(/[*_]{2,}/g, '')   // 残留粗体标记
    .trim();
}

// ── 输出统一格式 ──

function toUnified(qas) {
  const lines = [];
  lines.push('# 面试题库（统一格式）\n');

  for (let i = 0; i < qas.length; i++) {
    const qa = qas[i];
    lines.push('---');
    lines.push('');
    lines.push(`### Q: ${qa.title}`);
    lines.push('');

    if (qa.question && qa.question !== qa.title) {
      lines.push(qa.question);
      lines.push('');
    }

    lines.push('**答案**：');
    lines.push('');
    lines.push(qa.answer);
    lines.push('');

    if (qa.keyPoints) {
      lines.push('**考察点**：');
      lines.push('');
      lines.push(qa.keyPoints);
      lines.push('');
    }

    if (qa.followUp) {
      lines.push('**追问**：');
      lines.push('');
      lines.push(qa.followUp);
      lines.push('');
    }
  }

  lines.push('---\n');
  return lines.join('\n');
}

// ── Main ──

function convertFile(inputPath, outputPath) {
  console.log(`Converting: ${inputPath}`);
  const content = fs.readFileSync(inputPath, 'utf-8');
  const qas = parseMd(content);
  console.log(`  Found ${qas.length} QAs`);

  if (qas.length === 0) {
    console.log('  Skipping (no QAs found)');
    return 0;
  }

  const unified = toUnified(qas);
  const outPath = outputPath || inputPath.replace(/\.md$/, '_unified.md');
  fs.writeFileSync(outPath, unified, 'utf-8');
  console.log(`  → ${outPath}`);
  return qas.length;
}

// 处理参数
const input = process.argv[2];
if (!input) {
  console.error('Usage: node convert-md.mjs <input.md|directory>');
  process.exit(1);
}

if (fs.statSync(input).isDirectory()) {
  const files = fs.readdirSync(input).filter(f => f.endsWith('.md') && !f.includes('_unified'));
  let total = 0;
  for (const file of files) {
    total += convertFile(path.join(input, file), path.join(input, file.replace('.md', '_unified.md')));
  }
  console.log(`\nTotal: ${total} QAs converted`);
} else {
  convertFile(input, process.argv[3]);
}
