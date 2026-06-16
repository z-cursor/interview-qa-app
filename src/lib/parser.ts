import { QAFormat, QASections } from '../types';
import { cleanText } from '../utils/format';

export interface ParsedQA {
  title: string;
  question: string;
  answer: string;
  sections: QASections;
  format: QAFormat;
  tags: string[];
}

/**
 * MD QA 解析器
 *
 * 支持格式：
 *   agent   — ### Q1: title + 题目解析/题目讲解/示例答案
 *   restful — ## N.N + **Q:** + 追问点
 *   ammo    — ### heading + inline Q&A
 *   simple  — ## heading + inline Q&A (README 风格)
 */

// ── Public API ──

export function parseMarkdownToQAs(mdContent: string): ParsedQA[] {
  const blocks = splitBlocks(mdContent);
  const qas: ParsedQA[] = [];

  for (const block of blocks) {
    // 复合格式：父标题 + 多个 ### 子问题 → 拆分为独立题目
    if (isCompoundBlock(block)) {
      const expanded = expandCompoundBlock(block);
      qas.push(...expanded);
      continue;
    }

    const qa = parseBlock(block);
    if (qa) qas.push(qa);
  }

  return qas;
}

export function countQuestions(mdContent: string): number {
  return parseMarkdownToQAs(mdContent).length;
}

// ── Block splitting ──

function splitBlocks(content: string): string[] {
  // 归一化换行符（Windows \r\n / 旧 Mac \r → Unix \n），
  // 否则导入的 .md 文件 \r\n 会导致 \n---\n 切割失败。
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const bodyStart = findBodyStart(lines);
  const body = lines.slice(bodyStart).join('\n');

  // 按 --- 分割（容忍行尾空白，兼容 ---- 等多短线变体）
  const rawBlocks = body.split(/\n-{3,}[ \t]*\n/);
  const merged: string[] = [];

  for (const block of rawBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    // 短块且不以 QA 标记开头 → 合并到上一个
    if (trimmed.length < 50 && !isQAStart(trimmed) && merged.length > 0) {
      merged[merged.length - 1] += '\n---\n' + trimmed;
    } else {
      merged.push(trimmed);
    }
  }

  return merged;
}

function findBodyStart(lines: string[]): number {
  let fallback = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 直接命中 ## 或 ### → 立即返回
    if (/^#{2,3}\s+/.test(line) && !/^#\s+/.test(line)) return i;
    // h1 标题行 → 跳过，但记录位置作为 fallback
    if (/^#\s+/.test(line) && !/^#{2,}\s+/.test(line)) {
      if (fallback === 0) fallback = i + 1;
      continue;
    }
    // --- 分隔符 → 记录后面的位置作为 fallback，继续找更优的 ## 起点
    if (line === '---' && i > 0) {
      fallback = i + 1;
      continue;
    }
  }
  return fallback;
}

function isQAStart(text: string): boolean {
  return /^###\s+Q\d+\s*[:：]/m.test(text) ||
    /\*\*Q\s*[:：]/.test(text) ||
    /^#{2,3}\s+/.test(text);
}

// ── Compound block detection ──

/**
 * 检测是否为复合格式：一个父标题 + 多个 ### 子问题。
 *
 * 支持两种父格式：
 *   A) ## 父标题 + ### 子问题（原始文件）
 *       ## 1.2 PAT 令牌安全存储
 *       ### 为什么要可逆加密？
 *       {answer}
 *       ### 部分唯一索引解决什么问题？
 *       {answer}
 *   B) ### Q: 父标题 + **答案** 内嵌 ### 子问题（broken unified）
 *       ### Q: PAT 令牌安全存储
 *       **答案**：
 *       ### 为什么要可逆加密？
 *       {answer}
 *       ### 部分唯一索引解决什么问题？
 *       {answer}
 */
function isCompoundBlock(block: string): boolean {
  // 情况 A：以 ## 开头 + ### 子标题（原始文件格式）
  if (/^##\s+/.test(block) && !/^###\s+Q\d*\s*[:：]/.test(block)) {
    const subMatches = block.match(/^###\s+(?!Q\d*\s*[:：]).+$/gm);
    return subMatches !== null && subMatches.length >= 1;
  }

  // 情况 A2：不以 ## 开头但包含 ## 领域标题 + ### 子标题
  //   （如 # 一级标题 → ## 领域 → ### 问题 的三级结构）
  if (!/^##\s+/.test(block) && /^##\s+/m.test(block)) {
    const subMatches = block.match(/^###\s+(?!Q\d*\s*[:：]).+$/gm);
    return subMatches !== null && subMatches.length >= 1;
  }

  // 情况 B：以 ### Q: 开头，且 **答案** 区域内嵌 ### 子标题
  if (/^###\s+Q\d*\s*[:：]/.test(block) && /\*\*答案\*\*/.test(block)) {
    const answerIdx = block.search(/\*\*答案\*\*[:：]?\s*\n/);
    if (answerIdx < 0) return false;
    const answerBody = block.slice(answerIdx);
    const subMatches = answerBody.match(/^###\s+.+$/gm);
    return subMatches !== null && subMatches.length >= 1;
  }

  return false;
}

/**
 * 将复合块拆分为多个独立 ParsedQA。
 *
 * 支持两种父格式（由 isCompoundBlock 保证传入的 block 是合法的）：
 *   A) ## 父标题 + ### 子问题（原始文件）
 *   B) ### Q: 父标题 + **答案** 内嵌 ### 子问题（broken unified）
 *
 * - 父标题作为 question 前缀
 * - 每个 ### 子标题作为一道独立题目
 * - ### 之后到下一个 ###（或块尾）的内容作为答案
 */
function expandCompoundBlock(block: string): ParsedQA[] {
  let parentTitle = '';

  // 尝试匹配 ## 父格式（可能在 block 开头或中间）
  const parentMatch2 = block.match(/^##\s+(.+)$/m);
  // 尝试匹配 ### Q: 父格式
  const parentMatch3 = block.match(/^###\s+Q\d*\s*[:：]\s*(.+)$/m);

  if (parentMatch2) {
    parentTitle = parentMatch2[1].trim().replace(/^[\d.]+[\s.]+/, '');
  } else if (parentMatch3) {
    parentTitle = parentMatch3[1].trim();
  }

  // 确定正文起点
  let body: string;
  if (parentMatch3) {
    // 情况 B：从 **答案** 后开始切分
    const answerIdx = block.search(/\*\*答案\*\*[:：]?\s*\n/);
    if (answerIdx < 0) return [];
    body = block.slice(answerIdx).replace(/^\*\*答案\*\*[:：]?\s*\n+/, '');
  } else {
    // 情况 A / A2：从第一个 ### 开始切分（跳过 ## 父标题行之前的内容）
    const firstHash3 = block.search(/^###\s+/m);
    if (firstHash3 < 0) return [];
    body = block.slice(firstHash3);
  }

  // 按 ### 分割
  const sections = body.split(/^###\s+/m).filter(s => s.trim());

  const qas: ParsedQA[] = [];
  const tags: string[] = [];
  if (parentTitle) {
    tags.push(...extractTags(parentTitle, block));
  }

  for (const section of sections) {
    const lines = section.split('\n');
    const subTitle = lines[0].trim();
    let answer = lines.slice(1).join('\n').trim();

    if (!subTitle) continue;

    // 情况 B：answer 尾部可能带有 **考察点**/**追问**，截断
    const metaCut = answer.search(/\n\*\*(?:考察点|追问)\*\*/);
    if (metaCut > 0) {
      answer = answer.slice(0, metaCut).trim();
    }

    // 构造 question：父标题 + 子标题
    const question = parentTitle
      ? `**${parentTitle}** — ${subTitle}`
      : subTitle;

    // 尝试从 ### 标题中检测更多 tags
    const titleTags = extractTags(subTitle, answer);
    const allTags = [...new Set([...tags, ...titleTags])];

    qas.push({
      title: cleanText(subTitle),
      question: cleanText(question),
      answer: cleanText(answer),
      sections: {},
      format: 'unified' as QAFormat,
      tags: allTags,
    });
  }

  return qas;
}

// ── Format detection ──

function detectFormat(text: string): QAFormat {
  // 统一格式优先
  if (/^###\s+Q\s*[:：]/m.test(text) && /\*\*答案\*\*[:：]/.test(text)) return 'unified';
  if (/^###\s+Q\d+\s*[:：]/m.test(text)) return 'agent';
  if (/\*\*Q\s*[:：]/.test(text)) return 'restful';
  if (/^#{2,3}\s+/.test(text)) return 'ammo';
  return 'unknown';
}

// ── Main parse ──

function parseBlock(block: string): ParsedQA | null {
  const format = detectFormat(block);
  if (format === 'unknown') return null;

  const title = extractTitle(block, format);
  const sectionParts = splitSections(block);
  const question = extractQuestion(block, format, sectionParts);
  const answer = extractAnswer(block, format, sectionParts);
  const sections = extractSections(sectionParts);
  const tags = extractTags(title, block);

  if (!title && !question) return null;
  // 即使 answer 为空也保留（simple 格式可能没有明确答案）

  return {
    title: cleanText(title),
    question: cleanText(question || title),
    answer: cleanText(answer || ''),
    sections,
    format,
    tags,
  };
}

// ── Title extraction ──

function extractTitle(text: string, format: QAFormat): string {
  switch (format) {
    case 'unified': {
      const m = text.match(/^###\s+Q\s*[:：]\s*(.+)/m);
      return m ? m[1].trim().slice(0, 80) : '';
    }
    case 'agent': {
      const m = text.match(/^###\s+Q\d+\s*[:：]\s*(.+)/m);
      return m ? m[1].trim() : text.split('\n')[0].slice(0, 80);
    }
    case 'restful': {
      // **Q: title**
      const m = text.match(/\*\*Q\s*[:：]\s*(.+?)\*\*/);
      if (m) return m[1].trim();
      // alt: Q: title (no closing ** on same line)
      const m2 = text.match(/\*\*Q\s*[:：]\s*\*\*\s*\n?\s*(.+)/);
      return m2 ? m2[1].trim().split('\n')[0].slice(0, 80) : '';
    }
    case 'ammo':
    case 'simple': {
      const m = text.match(/^#{2,3}\s+(.+)/m);
      if (m) return m[1].trim().replace(/^[\d.]+[\s.]+/, '').slice(0, 80);
      return text.split('\n')[0].slice(0, 80);
    }
    default:
      return text.split('\n')[0].slice(0, 80);
  }
}

// ── Question extraction ──

function extractQuestion(text: string, format: QAFormat, parts: Record<string, string>): string {
  switch (format) {
    case 'unified': {
      // Q 标题后的内容，到 **答案** 之前
      const m = text.match(/^###\s+Q\s*[:：].+\n([\s\S]*?)(?=\*\*答案\*\*[:：])/);
      return m ? m[1].trim() : '';
    }
    case 'agent': {
      // ### Q1: title 后面的内容，直到 题目解析/题目讲解/示例答案
      const m = text.match(/^###\s+Q\d+\s*[:：].+\n([\s\S]*?)(?=\*\*(?:题目解析|题目讲解|考察点|面试官更想听|示例答案)\*\*)/);
      return m ? m[1].trim() : '';
    }
    case 'restful': {
      // Q 文本后面的内容（作为题目背景），到答案之前
      const withoutQ = text.replace(/\*\*Q\s*[:：]\s*.+?\*\*\s*\n?/, '').trim();
      // 去掉追问点部分
      const followUpIdx = withoutQ.search(/\*\*追问点\*\*/);
      if (followUpIdx > 0) return withoutQ.slice(0, followUpIdx).trim();
      return withoutQ;
    }
    case 'ammo':
    case 'simple': {
      // heading 后的所有内容
      const m = text.match(/^#{2,3}\s+.+\n([\s\S]*)/);
      return m ? m[1].trim() : text;
    }
    default:
      return text;
  }
}

// ── Answer extraction ──

function extractAnswer(text: string, format: QAFormat, parts: Record<string, string>): string {
  switch (format) {
    case 'unified': {
      // **答案**： 之后的内容，到 **考察点**/**追问** 或文件尾
      const m = text.match(/\*\*答案\*\*[:：]?\s*\n?([\s\S]*?)(?=\n\*\*(?:考察点|追问)\*\*|$)/);
      return m ? m[1].trim() : '';
    }
    case 'agent': {
      // 取 示例答案，退而 题目讲解
      if (parts['示例答案']) return parts['示例答案'];
      if (parts['题目讲解']) return parts['题目讲解'];
      // fallback: 取 _head 中最后一段
      return '';
    }
    case 'restful': {
      // RESTful 格式的"答案"就是 Q 和 追问点 之间的全部内容
      // 直接用 raw text 提取，不受 splitSections 影响
      const withoutQ = text.replace(/\*\*Q\s*[:：]\s*.+?\*\*\s*\n?/, '').trim();

      // 截断到 追问点（如果存在）
      const followUpIdx = withoutQ.search(/\*\*追问点\*\*/);
      let answer = followUpIdx > 0 ? withoutQ.slice(0, followUpIdx).trim() : withoutQ;

      // 去掉尾部 --- 分隔符
      answer = answer.replace(/\n---\s*$/, '').trim();

      return answer;
    }
    case 'ammo':
    case 'simple': {
      // 整个 block 就是 Q&A，无明确分隔
      // 取除去 heading 后的内容作为答案
      const m = text.match(/^#{2,3}\s+.+\n([\s\S]*)/);
      return m ? m[1].trim() : text;
    }
    default:
      return '';
  }
}

// ── Section splitting (for metadata extraction only) ──

const SECTION_KEYS = [
  '题目解析', '题目讲解', '考察点', '面试官更想听', '追问点', '示例答案',
  '核心原理', '核心概念',
];

function splitSections(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  // 只按明确的元数据 key 分割，不按普通粗体分割
  const regex = new RegExp(
    `\\*\\*(${SECTION_KEYS.join('|')})\\*\\*[:：]?\\s*`,
    'g'
  );

  let lastIndex = 0;
  let lastKey = '_head';
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const key = match[1].trim();
    result[lastKey] = (result[lastKey] || '') + text.slice(lastIndex, match.index);
    lastKey = key;
    lastIndex = match.index + match[0].length;
  }

  // 剩余部分
  if (lastKey && lastIndex < text.length) {
    result[lastKey] = (result[lastKey] || '') + text.slice(lastIndex);
  }
  if (!result._head) {
    result._head = '';
  }

  return result;
}

function extractSections(parts: Record<string, string>): QASections {
  const trim = (s?: string) => {
    if (!s) return undefined;
    const t = cleanText(s);
    return t.length > 0 ? t : undefined;
  };

  return {
    analysis: trim(parts['题目解析']),
    keyPoints: trim(parts['考察点']),
    interviewerWants: trim(parts['面试官更想听']),
    followUp: trim(parts['追问点']),
  };
}

// ── Tags ──

function extractTags(title: string, _text?: string): string[] {
  const tags: string[] = [];
  // 同时从 title 和 text 中检测标签
  const searchText = [title, _text].filter(Boolean).join(' ').toLowerCase();

  if (/agent|智能体|multi.agent|tool.use/i.test(searchText)) tags.push('Agent');
  if (/rag|检索|向量|embedding/i.test(searchText)) tags.push('RAG');
  if (/prompt|提示词/i.test(searchText)) tags.push('Prompt');
  if (/llm|大模型|transformer|gpt/i.test(searchText)) tags.push('LLM');
  if (/api|rest|http|fastapi|接口/i.test(searchText)) tags.push('API');
  if (/python|django|flask/i.test(searchText)) tags.push('Python');
  if (/架构|设计|系统/i.test(searchText)) tags.push('架构');
  if (/优化|性能|cache|缓存/i.test(searchText)) tags.push('性能');
  if (/安全|加密|令牌|token/i.test(searchText)) tags.push('安全');
  if (/ml|机器学习|梯度|训练|模型/i.test(searchText)) tags.push('ML');

  return [...new Set(tags)];
}
