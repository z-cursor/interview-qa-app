/** 截断文本，按字符数 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

/** 从文件名推断题库名（去掉扩展名和路径） */
export function deckNameFromFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.md$/i, '');
  // 最多 30 字
  return base.slice(0, 30);
}

/** 格式化时间戳为可读日期 */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 清理文本首尾空格和多余换行 */
export function cleanText(text: string): string {
  return text.replace(/[\r\n]{3,}/g, '\n\n').trim();
}
