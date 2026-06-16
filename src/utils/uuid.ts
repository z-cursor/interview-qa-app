/**
 * 生成 UUID v4（纯 JS 实现，无外部依赖，React Native 兼容）
 * 使用 Math.random()，不依赖 crypto API
 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
