# 面试题库 App v2.0 — Spec

## 1. 信息架构

```
Tab: 文件                     Tab: 题库                    FAB (全局)
┌─────────────────┐    ┌─────────────────────┐     ┌──────────┐
│ 搜索/筛选        │    │ 统计 bar (可折叠)     │     │ 📄 新建 MD │
│ 文件列表          │    │ 🔍 搜索框             │     │ 📥 导入 MD │
│  ├─ 笔记.md      │    │ Deck 卡片列表         │     └──────────┘
│  ├─ QA题库.md 🏷 │    │  ├─ 点击 → 刷题      │
│  └─ ...          │    │  └─ 长按 → 查看原文   │
│                  │    │                      │
│ 空状态: 引导 FAB  │    │ 刷题页: 题+录音+答案  │
└─────────────────┘    └─────────────────────┘
```

- 旧"导入"Tab → FAB / 文件列表菜单
- 旧"我的"Tab → 题库 Tab 顶部统计 bar
- 文件 Tab 是入口首页

## 2. 文件管理

### 存储模型
- 方案 C: 内部沙箱编辑 + 导出分享
- 文件存 `FileSystem.documentDirectory/files/*.md`
- 录音存 `FileSystem.documentDirectory/recordings/{qa-item-id}.m4a`
- 导出通过系统 Share Sheet

### 文件操作
- 点击 → 打开分屏编辑器
- 长按 → 弹出菜单：
  - **文件操作**: 重命名 / 复制 / 导出 .md / 删除
  - **题库操作**: 导入到题库 / 从题库移除 / 重置进度
- 删除文件 → 确认弹窗 → 一并删除 deck + qa_items + answer_records + 录音
- FAB (浮动按钮) → 新建 MD 文件 / 导入 MD 文件
- 排序: 修改时间降序

### 文件↔题库映射 (方案 C)
- 手动首次"导入到题库"建立 `files.deck_id` 关联
- 关联后每次编辑保存 → 自动重新解析 → 更新 qa_items
- 未关联文件为纯笔记，不出现在题库 Tab
- 编辑后解析到 0 题 → 保留旧题目，顶部显示警告"解析到 0 题，题库未更新"

### 重命名/删除 Deck 同步
| 场景 | 行为 |
|---|---|
| 重命名文件 | Deck 名称同步更新，题目数据不变 |
| 删除文件 | 确认后删除文件+deck+qa+录音 |
| 取消关联 | 删 deck+qa+录音，保留文件，deck_id=null |
| 导出再导入 | 视为新文件，不自动关联旧 deck |

## 3. 数据库 Schema

```sql
-- 新增
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  deck_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 变更
ALTER TABLE decks ADD COLUMN file_id TEXT;

-- raw_files 表保留仅作迁移遗留兼容
```

首次迁移: raw_files → 写出 MD → 创建 files 行 → 回写 decks.file_id

## 4. MD 编辑器

### 布局 (方案 B + C)
- 分屏: 上半源码 TextInput，下半实时预览
- 键盘弹出 → 预览折叠为窄条 ("预览已收起")
- 键盘收起 → 恢复 50/50
- 源码侧: L2 快捷工具栏 (输入辅助按钮，键盘上方)

### 功能
- L2 Toolbar: `**B**` `*I*` `` ` `` `- List` `# H` `1. OL` `[link]` `![img]`
- 自动保存: debounce 1-2s 写入内部存储
- 顶部状态指示器: "已保存 ✓" / "保存中…"
- 无需手动点"保存"按钮

### 渲染器 (P0+P1+P2 全量)
- P0: 有序列表、嵌套列表、粗体/斜体内嵌链接
- P1: 图片 `![alt](url)`、删除线 `~~text~~`
- P2: 任务列表 `- [ ]` / `- [x]`、脚注 `[^1]`
- 标题树导航: 右下角浮动 ☰ FAB → Bottom Sheet → 点标题跳转
- 锚点实现: onLayout 注册 Y 偏移量 → scrollTo

## 5. 主题

### 切换 (方案 C)
- 默认跟随系统 `Appearance.getColorScheme()`
- 文件 Tab 顶栏 🌙/☀️ 图标手动覆盖
- 三态: system / light / dark

### 迁移路径
- 旧: `import { Colors } from '../lib/theme'` (硬编码暗色)
- 新: `const { colors } = useTheme()` (ThemeContext 注入)
- 两套色板: `darkColors` (当前值) / `lightColors` (明色对应)
- ~15 个文件需要迁移

### 明色基调
- bg: `#FAFAFA` / card: `#FFFFFF` / input: `#F0F0F0`
- text: `#1A1A1A` / secondary: `#666666` / muted: `#999999`
- accent: `#C68400` / accentLight: `#E09E00` / accentDark: `#8B5E00`

## 6. 题库 Tab

- 保留现有 Deck 卡片列表 + 统计头部
- 新增搜索框: 跨 deck 按标题/标签搜索题目
- 统计 bar: 总进度% + 题库数 + 已刷数，可折叠
- 刷题页: 保持现有流程 (录音+回放+笔记+揭晓答案)
- 录音功能不变 (方案 A，不加间隔重复/历史对比)
- 编辑页预览中不需要录音按钮

## 7. 预置示例
- 仅保留 `AI应用开发-技术栈面试弹药库.md` 一个示例文件
- 标记为 🧪 只读示例
- 首次安装写入 `documents/files/`
- 用户可删除

## 8. 解析格式
- 以 `AI应用开发-技术栈面试弹药库.md` 格式为准
- `## + ###` → 拆分为独立 Q&A (已修好)
- `#` 层级忽略，平铺在一个 deck 内
- 各种原始格式 (agent/restful/ammo) 继续兼容

## 9. 启动流程
- Splash 保持当前 spinner (不增加进度文字)
- 首次: 创建目录 → 写入示例 → 解析 → 加载主界面
- 后续: 检查目录存在 → 加载主界面

## 10. 技术要点
- Expo SDK 56 react-navigation 7.x
- expo-file-system/legacy
- Zustand 状态管理
- ThemeContext + useTheme hook
- 所有组件从硬编码 Colors → useTheme()
- 键盘监听: Keyboard.addListener → 动态调整预览区高度
- ScrollView onLayout 注册标题锚点
