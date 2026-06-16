import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, BorderRadius, FontSize } from '../lib/theme';

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export interface HeadingInfo {
  text: string;
  level: number;
  y: number;
}

export interface MarkdownRendererRef {
  /** 滚动到指定标题 */
  scrollToHeading: (index: number) => void;
  /** 强制刷新标题注册（TOC 打开时调用） */
  refreshHeadings: () => void;
  /** 滚动到指定 Y 位置（滚动条拖拽用） */
  scrollTo: (y: number) => void;
}

interface MarkdownRendererProps {
  content: string;
  type?: 'question' | 'answer';
  /** 注册标题列表（用于外部 TOC） */
  onHeadingsRegister?: (headings: HeadingInfo[]) => void;
  /** 内容区最大高度（编辑器预览模式用）。不设则自适应。 */
  maxHeight?: number;
  /** 滚动事件回调（用于外部滚动条同步） */
  onScroll?: (e: any) => void;
  /** 内容尺寸变化回调 */
  onContentSizeChange?: (w: number, h: number) => void;
}

type Block =
  | { type: 'heading'; level: number; text: string; headingIndex: number }
  | { type: 'paragraph'; segments: InlineSegment[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'bullet'; items: InlineSegment[][]; level: number }
  | { type: 'orderedList'; items: InlineSegment[][]; level: number; start: number }
  | { type: 'taskList'; items: { checked: boolean; segments: InlineSegment[] }[]; level: number }
  | { type: 'blockquote'; segments: InlineSegment[] }
  | { type: 'table'; headers: string[]; rows: InlineSegment[][][] }
  | { type: 'hr' }
  | { type: 'footnotes'; items: { id: string; text: string }[] }
  | { type: 'imageBlock'; alt: string; url: string };  // 独立图片段落

type InlineSegment =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string; children?: InlineSegment[] }
  | { type: 'code'; text: string }
  | { type: 'italic'; text: string; children?: InlineSegment[] }
  | { type: 'link'; text: string; url: string }
  | { type: 'image'; alt: string; url: string }
  | { type: 'strikethrough'; text: string }
  | { type: 'footnoteRef'; id: string };

// ═══════════════════════════════════════════
// Block Parsing
// ═══════════════════════════════════════════

interface ParseResult {
  blocks: Block[];
  footnotes: { id: string; text: string }[];
}

function parseDocument(text: string): ParseResult {
  // 正规化换行
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const blocks: Block[] = [];
  const footnoteDefs: { id: string; text: string }[] = [];
  let headingCounter = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 脚注定义 [^n]: text — 必须在文档末尾
    const fnMatch = line.trim().match(/^\[\^(\d+)\]:\s+(.+)/);
    if (fnMatch && i > lines.length - 20) {
      footnoteDefs.push({ id: fnMatch[1], text: fnMatch[2].trim() });
      i++;
      continue;
    }

    // 代码块 ```
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', language: lang, text: codeLines.join('\n') });
      continue;
    }

    // 水平线 ---, ***, ___
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Heading # ## ### ...
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const idx = headingCounter++;
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
        headingIndex: idx,
      });
      i++;
      continue;
    }

    // 独立图片段落 ![alt](url)（独占一行）
    const soloImgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (soloImgMatch) {
      blocks.push({ type: 'imageBlock', alt: soloImgMatch[1], url: soloImgMatch[2] });
      i++;
      continue;
    }

    // Table: |...|
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const table = parseTable(lines, i);
      if (table) {
        blocks.push(table.block);
        i = table.nextIndex;
        continue;
      }
    }

    // Task list: - [ ] / - [x] / * [ ] ...
    const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)/);
    if (taskMatch) {
      const indent = taskMatch[1].length;
      const level = Math.floor(indent / 2);
      const checked = taskMatch[2].toLowerCase() === 'x';
      const items = parseTaskItems(lines, i);
      blocks.push({ type: 'taskList', items, level });
      i = skipListLines(lines, i);
      continue;
    }

    // Ordered list: 1. / 2) / 1. )
    const orderedMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)/);
    if (orderedMatch) {
      const indent = orderedMatch[1].length;
      const level = Math.floor(indent / 2);
      const start = parseInt(orderedMatch[2], 10);
      const { items } = parseOrderedItems(lines, i, level);
      blocks.push({ type: 'orderedList', items, level, start });
      i = skipListLines(lines, i);
      continue;
    }

    // Bullet list: - * +
    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const level = Math.floor(indent / 2);
      const { items } = parseBulletItems(lines, i, level);
      blocks.push({ type: 'bullet', items, level });
      i = skipListLines(lines, i);
      continue;
    }

    // Blockquote >
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '')) {
        if (lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        }
        i++;
        if (
          i < lines.length &&
          lines[i].trim() === '' &&
          (i + 1 >= lines.length || !lines[i + 1].trim().startsWith('>'))
        ) {
          i++;
          break;
        }
      }
      blocks.push({ type: 'blockquote', segments: parseInline(quoteLines.join('\n')) });
      continue;
    }

    // Paragraph (default)
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', segments: parseInline(paraLines.join('\n')) });
    }
  }

  // 添加脚注 block
  if (footnoteDefs.length > 0) {
    blocks.push({ type: 'footnotes', items: footnoteDefs });
  }

  return { blocks, footnotes: footnoteDefs };
}

/** 检测是否为新 block 的起始 */
function isBlockStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('```') ||
    /^[-*_]{3,}\s*$/.test(trimmed) ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.test(trimmed) ||
    /^(\s*)[-*+]\s+\[([ xX])\]\s+/.test(trimmed) ||  // task list
    /^(\s*)\d+[.)]\s+/.test(trimmed) ||                // ordered list
    /^(\s*)[-*+]\s+/.test(trimmed) ||                   // bullet list
    trimmed.startsWith('>') ||
    (trimmed.startsWith('|') && trimmed.endsWith('|')) ||
    /^\[\^(\d+)\]:\s+/.test(trimmed)                     // footnote def
  );
}

/** 跳过列表行（包括续行），返回下一条非列表行索引 */
function skipListLines(lines: string[], start: number): number {
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (
      /^(\s*)[-*+]\s+/.test(line) ||
      /^(\s*)\d+[.)]\s+/.test(line)
    ) {
      i++;
      continue;
    }
    // 续行：以空格/tab 开头且不是 block start
    if (/^\s{2,}/.test(line) && !isBlockStart(line)) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

/** 解析 task list items */
function parseTaskItems(
  lines: string[],
  start: number,
): { checked: boolean; segments: InlineSegment[] }[] {
  const items: { checked: boolean; segments: InlineSegment[] }[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const m = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)/);
    if (!m) break;
    items.push({
      checked: m[2].toLowerCase() === 'x',
      segments: parseInline(m[3].trim()),
    });
    i++;
  }
  return items;
}

/** 解析 ordered list items（同层级） */
function parseOrderedItems(
  lines: string[],
  start: number,
  level: number,
): { items: InlineSegment[][] } {
  const items: InlineSegment[][] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const m = line.match(/^(\s*)(\d+)[.)]\s+(.+)/);
    if (!m) break;
    const indent = m[1].length;
    const itemLevel = Math.floor(indent / 2);
    if (itemLevel !== level) break;
    items.push(parseInline(m[3].trim()));
    i++;
  }
  return { items };
}

/** 解析 bullet list items（同层级） */
function parseBulletItems(
  lines: string[],
  start: number,
  level: number,
): { items: InlineSegment[][] } {
  const items: InlineSegment[][] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const m = line.match(/^(\s*)[-*+]\s+(?!\[[ xX]\])(.+)/);
    if (!m) break;
    const indent = m[1].length;
    const itemLevel = Math.floor(indent / 2);
    if (itemLevel !== level) break;
    items.push(parseInline(m[2].trim()));
    i++;
  }
  return { items };
}

/** 解析 table */
function parseTable(
  lines: string[],
  startIdx: number,
): { block: Block; nextIndex: number } | null {
  const headerLine = lines[startIdx];
  if (startIdx + 1 >= lines.length) return null;

  const sepLine = lines[startIdx + 1];
  if (!/^\|[\s\-:|]+\|$/.test(sepLine.trim())) return null;

  const headers = headerLine
    .split('|')
    .filter((s) => s.trim() !== '')
    .map((s) => s.trim());
  const rows: InlineSegment[][][] = [];
  let i = startIdx + 2;

  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cells = lines[i]
      .split('|')
      .filter((s) => s.trim() !== '')
      .map((s) => parseInline(s.trim()));
    rows.push(cells);
    i++;
  }

  return {
    block: { type: 'table', headers, rows },
    nextIndex: i,
  };
}

// ═══════════════════════════════════════════
// Inline Parsing（递归）
// ═══════════════════════════════════════════

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];

  // 正则：按优先级排序 — ***bold+italic***, **bold**, *italic*, ~~strike~~, `code`, ![img], [link], [^fn]
  const regex =
    /(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(`(.+?)`)|(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|(\[\^(\d+)\])/g;

  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 前面的普通文本
    if (match.index > lastIdx) {
      segments.push({ type: 'text', text: text.slice(lastIdx, match.index) });
    }

    if (match[1]) {
      // ***bold+italic*** → bold 包裹 italic
      const inner = parseInline(match[2]);
      segments.push({
        type: 'bold',
        text: match[2],
        children: [{ type: 'italic', text: match[2], children: inner }],
      });
    } else if (match[3]) {
      // **bold** — 递归解析内容
      segments.push({ type: 'bold', text: match[4], children: parseInline(match[4]) });
    } else if (match[5]) {
      // *italic* — 递归解析内容
      segments.push({ type: 'italic', text: match[6], children: parseInline(match[6]) });
    } else if (match[7]) {
      // ~~strikethrough~~
      segments.push({ type: 'strikethrough', text: match[8] });
    } else if (match[9]) {
      // `code`
      segments.push({ type: 'code', text: match[10] });
    } else if (match[11]) {
      // ![image](url)
      segments.push({ type: 'image', alt: match[12], url: match[13] });
    } else if (match[14]) {
      // [link](url)
      segments.push({ type: 'link', text: match[15], url: match[16] });
    } else if (match[17]) {
      // [^n] footnote ref
      segments.push({ type: 'footnoteRef', id: match[18] });
    }

    lastIdx = match.index + match[0].length;
  }

  // 剩余文本
  if (lastIdx < text.length) {
    const remaining = text.slice(lastIdx);
    // 清理未匹配的 ** / * 标记（容错）
    segments.push({ type: 'text', text: remaining.replace(/\*\*/g, '') });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', text });
  }

  return segments;
}

// ═══════════════════════════════════════════
// Styles Factory
// ═══════════════════════════════════════════

const screenWidth = Dimensions.get('window').width;

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    // scroll
    scrollContent: {
      paddingBottom: Spacing.huge,
    },

    // paragraph
    paragraph: {
      color: c.textPrimary,
      fontSize: FontSize.md,
      lineHeight: 26,
      marginBottom: Spacing.md,
    },

    // heading
    h1: { color: c.textPrimary, fontSize: FontSize.title, fontWeight: '700', marginBottom: Spacing.md, marginTop: Spacing.lg, lineHeight: 34 },
    h2: { color: c.textPrimary, fontSize: FontSize.xl, fontWeight: '600', marginBottom: Spacing.md, marginTop: Spacing.md, lineHeight: 28 },
    h3: { color: c.accent, fontSize: FontSize.lg, fontWeight: '600', marginBottom: Spacing.sm, marginTop: Spacing.md, lineHeight: 26 },
    h4: { color: c.accent, fontSize: FontSize.md, fontWeight: '600', marginBottom: Spacing.sm, marginTop: Spacing.sm },
    h5: { color: c.accentLight, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.xs, marginTop: Spacing.sm },
    h6: { color: c.accentLight, fontSize: FontSize.xs, fontWeight: '600', marginBottom: Spacing.xs, marginTop: Spacing.xs },

    // code block
    codeBlock: {
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    codeText: {
      color: c.accentLight,
      fontSize: FontSize.sm,
      fontFamily: 'monospace',
      lineHeight: 20,
    },

    // inline code
    inlineCode: {
      backgroundColor: c.bgInput,
      color: c.accentLight,
      fontSize: FontSize.sm,
      fontFamily: 'monospace',
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 3,
    },

    // bold
    bold: { fontWeight: '700', color: c.accentLight },

    // italic
    italic: { fontStyle: 'italic' },

    // strikethrough
    strikethrough: {
      textDecorationLine: 'line-through',
      color: c.textMuted,
    },

    // link
    link: {
      color: c.info,
      textDecorationLine: 'underline',
    },

    // footnote ref (superscript)
    footnoteRef: {
      color: c.info,
      fontSize: FontSize.xs,
      lineHeight: FontSize.xs + 4,
    },

    // image
    image: {
      width: screenWidth - Spacing.lg * 2,
      height: 200,
      borderRadius: BorderRadius.sm,
      marginBottom: Spacing.md,
      backgroundColor: c.bgInput,
    },
    imageBlock: {
      alignSelf: 'stretch',
      marginBottom: Spacing.md,
    },

    // bullet list
    bulletList: { marginBottom: Spacing.sm },
    bulletItem: { flexDirection: 'row', marginBottom: Spacing.xs, alignItems: 'flex-start' },
    bulletMarker: { color: c.accent, fontSize: FontSize.md, marginRight: Spacing.sm, lineHeight: 24, width: 14 },
    bulletText: { color: c.textPrimary, fontSize: FontSize.md, lineHeight: 24, flex: 1 },

    // ordered list
    orderedList: { marginBottom: Spacing.sm },
    orderedItem: { flexDirection: 'row', marginBottom: Spacing.xs, alignItems: 'flex-start' },
    orderedMarker: { color: c.accent, fontSize: FontSize.md, marginRight: Spacing.sm, lineHeight: 24, width: 24, textAlign: 'right' as const, fontWeight: '600' },
    orderedText: { color: c.textPrimary, fontSize: FontSize.md, lineHeight: 24, flex: 1 },

    // task list
    taskList: { marginBottom: Spacing.sm },
    taskItem: { flexDirection: 'row', marginBottom: Spacing.xs, alignItems: 'flex-start' },
    taskCheckbox: {
      width: 18,
      height: 18,
      borderRadius: 3,
      borderWidth: 1.5,
      marginRight: Spacing.sm,
      marginTop: 3,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    taskCheckboxChecked: {},
    taskCheckboxUnchecked: {},
    taskCheckmark: { color: c.textInverse, fontSize: 10, fontWeight: '700' },
    taskText: { color: c.textPrimary, fontSize: FontSize.md, lineHeight: 24, flex: 1 },
    taskTextChecked: { color: c.textMuted, textDecorationLine: 'line-through' },

    // blockquote
    blockquote: {
      backgroundColor: c.micIdle,
      borderLeftColor: c.accent,
      borderLeftWidth: 3,
      paddingLeft: Spacing.md,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.md,
      borderRadius: 2,
    },
    blockquoteText: {
      color: c.textSecondary,
      fontSize: FontSize.md,
      lineHeight: 24,
    },

    // table
    tableContainer: { marginBottom: Spacing.md, borderRadius: BorderRadius.sm, overflow: 'hidden' },
    tableRow: { flexDirection: 'row' },
    tableRowAlt: { backgroundColor: c.borderLight + '30' },
    tableHeaderCell: {
      padding: Spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
      minWidth: 80,
      backgroundColor: c.micIdle,
    },
    tableHeaderText: { color: c.accent, fontWeight: '700', fontSize: FontSize.sm },
    tableCell: { padding: Spacing.sm, borderWidth: 1, borderColor: c.border, minWidth: 80 },
    tableCellText: { color: c.textPrimary, fontSize: FontSize.sm },

    // hr
    hr: { height: 1, backgroundColor: c.border, marginVertical: Spacing.lg },

    // footnotes section
    footnotesSection: {
      marginTop: Spacing.lg,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    footnotesTitle: {
      color: c.textSecondary,
      fontSize: FontSize.sm,
      fontWeight: '600',
      marginBottom: Spacing.sm,
    },
    footnoteItem: {
      flexDirection: 'row',
      marginBottom: Spacing.xs,
    },
    footnoteId: {
      color: c.info,
      fontSize: FontSize.xs,
      marginRight: Spacing.xs,
      lineHeight: 20,
    },
    footnoteText: {
      color: c.textSecondary,
      fontSize: FontSize.sm,
      lineHeight: 20,
      flex: 1,
    },
  });
}

// ═══════════════════════════════════════════
// Heading Styles (array)
// ═══════════════════════════════════════════

function getHeadingStyle(c: ColorTokens, level: number) {
  const styles = createStyles(c);
  switch (level) {
    case 1: return styles.h1;
    case 2: return styles.h2;
    case 3: return styles.h3;
    case 4: return styles.h4;
    case 5: return styles.h5;
    default: return styles.h6;
  }
}

// ═══════════════════════════════════════════
// Component
// ═══════════════════════════════════════════

const MarkdownRenderer = forwardRef<MarkdownRendererRef, MarkdownRendererProps>(
  function MarkdownRenderer({ content, onHeadingsRegister, maxHeight, onScroll, onContentSizeChange }, ref) {
    const { colors } = useTheme();
    const scrollRef = useRef<ScrollView>(null);
    const headingYs = useRef<Map<number, number>>(new Map());
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

    const styles = useMemo(() => createStyles(colors), [colors]);

    // 解析文档
    const { blocks } = useMemo(() => {
      if (!content || content.trim().length === 0) {
        return { blocks: [], footnotes: [] };
      }
      return parseDocument(content);
    }, [content]);

    // 收集 heading block 数量
    const headingCount = useMemo(
      () => blocks.filter((b) => b.type === 'heading').length,
      [blocks],
    );

    // 内容变化时清空旧 headingYs
    useEffect(() => {
      headingYs.current.clear();
    }, [content]);

    // 注册标题 Y 位置
    const handleHeadingLayout = useCallback(
      (index: number, y: number) => {
        headingYs.current.set(index, y);
      },
      [],
    );

    // 收集并上报
    const reportHeadingsNow = useCallback(() => {
      if (!onHeadingsRegister) return;
      const result: HeadingInfo[] = [];
      for (const block of blocks) {
        if (block.type === 'heading') {
          const y = headingYs.current.get(block.headingIndex) ?? 0;
          result.push({ text: block.text, level: block.level, y });
        }
      }
      if (result.length > 0) {
        onHeadingsRegister(result);
      }
    }, [blocks, onHeadingsRegister]);

    // fallback 定时器：500ms 后无论是否全部 onLayout 都上报一次
    useEffect(() => {
      if (headingCount === 0) return;
      const timer = setTimeout(reportHeadingsNow, 500);
      return () => clearTimeout(timer);
    }, [reportHeadingsNow, headingCount]);

    // 暴露方法
    useImperativeHandle(ref, () => ({
      scrollToHeading: (index: number) => {
        const y = headingYs.current.get(index);
        if (y !== undefined && scrollRef.current) {
          scrollRef.current.scrollTo({ y: y - Spacing.lg, animated: true });
        }
      },
      /** 滚动条拖拽 → 直接滚到 Y */
      scrollTo: (y: number) => {
        scrollRef.current?.scrollTo({ y, animated: false });
      },
      /** TOC 打开时调用，确保标题信息最新 */
      refreshHeadings: () => {
        reportHeadingsNow();
      },
    }));

    // 图片加载失败处理
    const handleImageError = useCallback((url: string) => {
      setImageErrors((prev) => new Set(prev).add(url));
    }, []);

    // ── Render helpers ──

    function renderInline(seg: InlineSegment, key: string): React.ReactNode {
      switch (seg.type) {
        case 'bold':
          if (seg.children && seg.children.length > 0) {
            return (
              <Text key={key} style={styles.bold}>
                {seg.children.map((child, cIdx) => renderInline(child, `${key}-${cIdx}`))}
              </Text>
            );
          }
          return (
            <Text key={key} style={styles.bold}>
              {seg.text}
            </Text>
          );
        case 'italic':
          if (seg.children && seg.children.length > 0) {
            return (
              <Text key={key} style={styles.italic}>
                {seg.children.map((child, cIdx) => renderInline(child, `${key}-${cIdx}`))}
              </Text>
            );
          }
          return (
            <Text key={key} style={styles.italic}>
              {seg.text}
            </Text>
          );
        case 'code':
          return (
            <Text key={key} style={styles.inlineCode}>
              {seg.text}
            </Text>
          );
        case 'link':
          return (
            <Text key={key} style={styles.link}>
              {seg.text}
            </Text>
          );
        case 'image':
          // 行内图片
          if (imageErrors.has(seg.url)) {
            return (
              <Text key={key} style={styles.link}>
                {seg.alt || '[image]'}
              </Text>
            );
          }
          return (
            <Image
              key={key}
              source={{ uri: seg.url }}
              style={styles.image}
              resizeMode="contain"
              onError={() => handleImageError(seg.url)}
            />
          );
        case 'strikethrough':
          return (
            <Text key={key} style={styles.strikethrough}>
              {seg.text}
            </Text>
          );
        case 'footnoteRef':
          return (
            <Text key={key} style={styles.footnoteRef}>
              [{seg.id}]
            </Text>
          );
        case 'text':
        default:
          return <Text key={key}>{seg.text}</Text>;
      }
    }

    function renderBlock(block: Block, blockIdx: number): React.ReactNode {
      switch (block.type) {
        case 'heading': {
          const headingStyle = getHeadingStyle(colors, block.level);
          return (
            <Text
              key={blockIdx}
              style={headingStyle}
              onLayout={(e) => {
                handleHeadingLayout(block.headingIndex, e.nativeEvent.layout.y);
              }}
            >
              {block.text}
            </Text>
          );
        }

        case 'paragraph':
          return (
            <Text key={blockIdx} style={styles.paragraph}>
              {block.segments.map((seg, sIdx) => renderInline(seg, `p${blockIdx}-${sIdx}`))}
            </Text>
          );

        case 'code':
          return (
            <View key={blockIdx} style={styles.codeBlock}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.codeText} selectable>
                  {block.text}
                </Text>
              </ScrollView>
            </View>
          );

        case 'bullet': {
          const indent = block.level * Spacing.lg;
          return (
            <View key={blockIdx} style={[styles.bulletList, { marginLeft: indent }]}>
              {block.items.map((item, bIdx) => (
                <View key={bIdx} style={styles.bulletItem}>
                  <Text style={styles.bulletMarker}>•</Text>
                  <Text style={styles.bulletText}>
                    {item.map((seg, sIdx) =>
                      renderInline(seg, `bl${blockIdx}-${bIdx}-${sIdx}`),
                    )}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        case 'orderedList': {
          const indent = block.level * Spacing.lg;
          return (
            <View key={blockIdx} style={[styles.orderedList, { marginLeft: indent }]}>
              {block.items.map((item, oIdx) => (
                <View key={oIdx} style={styles.orderedItem}>
                  <Text style={styles.orderedMarker}>{block.start + oIdx}.</Text>
                  <Text style={styles.orderedText}>
                    {item.map((seg, sIdx) =>
                      renderInline(seg, `ol${blockIdx}-${oIdx}-${sIdx}`),
                    )}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        case 'taskList': {
          const indent = block.level * Spacing.lg;
          return (
            <View key={blockIdx} style={[styles.taskList, { marginLeft: indent }]}>
              {block.items.map((item, tIdx) => {
                const cbStyle = item.checked
                  ? [styles.taskCheckbox, styles.taskCheckboxChecked, { backgroundColor: colors.success, borderColor: colors.success }]
                  : [styles.taskCheckbox, styles.taskCheckboxUnchecked, { borderColor: colors.border }];
                return (
                  <View key={tIdx} style={styles.taskItem}>
                    <View style={cbStyle}>
                      {item.checked && <Text style={styles.taskCheckmark}>✓</Text>}
                    </View>
                    <Text style={[styles.taskText, item.checked && styles.taskTextChecked]}>
                      {item.segments.map((seg, sIdx) =>
                        renderInline(seg, `tk${blockIdx}-${tIdx}-${sIdx}`),
                      )}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        }

        case 'blockquote':
          return (
            <View key={blockIdx} style={styles.blockquote}>
              <Text style={styles.blockquoteText}>
                {block.segments.map((seg, sIdx) =>
                  renderInline(seg, `bq${blockIdx}-${sIdx}`),
                )}
              </Text>
            </View>
          );

        case 'table':
          return (
            <View key={blockIdx} style={styles.tableContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.tableRow}>
                    {block.headers.map((h, hIdx) => (
                      <View key={hIdx} style={styles.tableHeaderCell}>
                        <Text style={styles.tableHeaderText}>{h}</Text>
                      </View>
                    ))}
                  </View>
                  {block.rows.map((row, rIdx) => (
                    <View
                      key={rIdx}
                      style={[styles.tableRow, rIdx % 2 === 1 && styles.tableRowAlt]}
                    >
                      {row.map((cell, cIdx) => (
                        <View key={cIdx} style={styles.tableCell}>
                          <Text style={styles.tableCellText}>
                            {cell.map((seg, sIdx) =>
                              renderInline(seg, `t${blockIdx}-${rIdx}-${cIdx}-${sIdx}`),
                            )}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          );

        case 'hr':
          return <View key={blockIdx} style={styles.hr} />;

        case 'imageBlock': {
          if (imageErrors.has(block.url)) {
            return (
              <View key={blockIdx} style={styles.imageBlock}>
                <Text style={styles.link}>{block.alt || '[image]'}</Text>
              </View>
            );
          }
          return (
            <View key={blockIdx} style={styles.imageBlock}>
              <Image
                source={{ uri: block.url }}
                style={styles.image}
                resizeMode="contain"
                onError={() => handleImageError(block.url)}
              />
            </View>
          );
        }

        case 'footnotes':
          return (
            <View key={blockIdx} style={styles.footnotesSection}>
              <Text style={styles.footnotesTitle}>脚注</Text>
              {block.items.map((fn) => (
                <View key={fn.id} style={styles.footnoteItem}>
                  <Text style={styles.footnoteId}>[{fn.id}]</Text>
                  <Text style={styles.footnoteText}>{fn.text}</Text>
                </View>
              ))}
            </View>
          );

        default:
          return null;
      }
    }

    // 空内容
    if (blocks.length === 0) {
      return (
        <View style={{ padding: Spacing.lg }}>
          <Text style={{ color: colors.textMuted }}>暂无内容</Text>
        </View>
      );
    }

    return (
      <ScrollView
        ref={scrollRef}
        style={[{ flex: 1 }, maxHeight ? { maxHeight } : undefined]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        scrollEventThrottle={32}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
      >
        {blocks.map((block, idx) => renderBlock(block, idx))}
      </ScrollView>
    );
  },
);

export default MarkdownRenderer;
