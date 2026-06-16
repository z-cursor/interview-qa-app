# 面试题库 App — 项目上下文

@AGENTS.md

## 项目概述

**面试语音练习 App** — React Native (Expo) 手机应用。将 MD 格式的面试题库变为交互式刷题工具，支持录音回答、回放自检、揭晓答案。

## 技术栈

| 层 | 选型 | 版本 |
|---|---|---|
| 框架 | React Native / Expo SDK | 56 |
| 语言 | TypeScript (strict) | ~6.0 |
| 导航 | @react-navigation (bottom tabs + native stack) | 7.x |
| 录音 | expo-audio (AudioRecorder + AudioPlayer) | 56.0.11 |
| 存储 | expo-sqlite (SQLite) | 56.x |
| 文件 | expo-file-system/legacy | 56.x |
| 导入 | expo-document-picker | 56.x |
| 资产 | expo-asset | 56.x |
| 图标 | @expo/vector-icons (Ionicons) | — |
| 状态管理 | zustand | 5.x |
| 构建 | EAS Build (云端) | — |

## 项目结构

```
interview-qa-app/
├── App.tsx                      # 入口：导航 + 预加载 + Splash
├── app.json                     # Expo 配置 (plugins, permissions)
├── eas.json                     # EAS 构建配置
├── metro.config.js              # .md 文件作为 asset
├── scripts/
│   └── convert-md.mjs           # MD 格式转换脚本
├── assets/data/
│   ├── *_unified.md             # 统一格式题库 (9个, 170题)
│   └── *.md                     # 原始格式题库 (保留参考)
└── src/
    ├── types/index.ts           # QAItem, Deck, StudySession 类型
    ├── lib/
    │   ├── parser.ts            # MD QA 解析器 (5种格式)
    │   ├── database.ts          # SQLite CRUD (decks, qa_items, records)
    │   ├── preload.ts           # 首次启动加载预置题库
    │   └── theme.ts             # 暗色主题常量
    ├── hooks/
    │   └── useRecorder.ts       # 录音+回放 hook (expo-audio)
    ├── store/useStore.ts        # Zustand 状态管理
    ├── screens/
    │   ├── HomeScreen.tsx       # 题库列表
    │   ├── StudyScreen.tsx      # 刷题页 (核心)
    │   ├── ViewerScreen.tsx     # MD 原文查看
    │   └── ImportScreen.tsx     # 导入 MD 文件
    ├── components/
    │   ├── DeckCard.tsx         # 题库卡片
    │   ├── QuestionCard.tsx     # 题目卡片
    │   ├── VoiceRecordButton.tsx # 录音按钮 + 回放
    │   ├── AnswerSheet.tsx      # 答案面板
    │   ├── ProgressHeader.tsx   # 顶部进度条
    │   ├── MarkdownRenderer.tsx # 自研 MD 渲染器
    │   └── EmptyState.tsx       # 空状态
    └── utils/
        ├── uuid.ts              # UUID 生成 (Math.random)
        ├── shuffle.ts           # Fisher-Yates 洗牌
        └── format.ts            # 文本工具
```

## 核心数据流

```
MD文件 → parser.ts → QAItem[] → SQLite → Zustand → React 组件
                                        ↓
                                   answer_records
                                   (录音文件路径 + 揭晓状态)
```

## MD 统一格式

```markdown
---

### Q: {题目标题}

{题目正文 — 可选}

**答案**：
{完整答案}

**考察点**：
{考察点}

**追问**：
{追问内容}

---
```

## 开发工作流

```bash
# 本地开发
npx expo start                    # 启动 Metro Dev Server
# 手机安装 dev APK → 连接 exp://IP:8081 → 热更新

# 构建
eas build --platform android --profile development  # 开发版 APK
eas build --platform android --profile preview      # 预览版 APK
```

## 构建配置 (eas.json)

```json
{
  "build": {
    "development": { "developmentClient": true, "android": { "buildType": "apk" } },
    "preview": { "android": { "buildType": "apk" } }
  }
}
```

## App 权限

- `RECORD_AUDIO` — 录音
- 文件读取 — 导入 MD 题库

## 关键文件速查

| 要改什么 | 文件 |
|---|---|
| 题目解析逻辑 | `src/lib/parser.ts` |
| 录音功能 | `src/hooks/useRecorder.ts` |
| 刷题页布局 | `src/screens/StudyScreen.tsx` |
| 录音按钮UI | `src/components/VoiceRecordButton.tsx` |
| 数据库操作 | `src/lib/database.ts` |
| 预置题库列表 | `src/lib/preload.ts` |
| 主题颜色 | `src/lib/theme.ts` |
| MD 格式转换 | `scripts/convert-md.mjs` |

## 开发原则

- Expo SDK 56 文档: https://docs.expo.dev/versions/v56.0.0/
- 写任何 Expo API 代码前先查版本化文档，API 可能在 SDK 56 中已变更
- 录音使用 expo-audio，不是 expo-av（后者有 Kotlin 兼容问题）
- 文件系统用 `expo-file-system/legacy` 导入
- 不用 uuid 包（RN 无 crypto），用 `src/utils/uuid.ts` 的纯 JS 实现
- 暗色主题，颜色统一从 `src/lib/theme.ts` 引用

## 问题记录

- 2026-06-10 FAB悬浮窗展开后点击+号无法收起：遮罩onResponderRelease在Fabric RN 0.76不可靠 → 改用onTouchEnd+closeGateRef防回弹。见 src/components/FAB.tsx:67-82
- 2026-06-10 FAB点击新建文件不收起但导入文件有效：onTouchEnd(原生)先关菜单→PanResponder(JS)后看到expandedRef=false→调用open()回弹 → closeGateRef上锁阻止toggle重开。见 src/components/FAB.tsx:56
- 2026-06-10 MD解析##被当作问题：findBodyStart遇#和---提前截断→body从h1开始→isCompoundBlock漏检 → 跳过h1/---继续找首个##/###。见 src/lib/parser.ts:73-92
- 2026-06-10 录音文件被OS清理：临时URI在stopRecording后可能被回收 → 复制到documents/recordings/持久化。见 src/hooks/useRecorder.ts:180-196
- 2026-06-11 MD编辑器击键自动保存卡顿：每1.5s写磁盘+解析MD+更新DB → 改为手动保存按钮+30s空闲保存+切预览保存+返回保存。见 src/screens/MDEditorScreen.tsx:85-108
- 2026-06-11 FAB展开后遮罩onTouchEnd不触发：内层Animated.View截获触摸 → 改用Pressable onPress+pointerEvents=none。见 src/components/FAB.tsx:176-193
- 2026-06-11 FAB子按钮opacity=0仍拦截主按钮触摸：缺pointerEvents → 收起时设为none。见 src/components/FAB.tsx:202-208
- 2026-06-11 FAB动画视觉不更新：useNativeDriver在setState re-render时native节点断开 → 改用JS驱动(useNativeDriver:false)。见 src/components/FAB.tsx:63-77
- 2026-06-11 导入文件Q1/Q2合并为一道：splitBlocks未归一化\r\n → \n---\n切割失败 → 开头加\r\n→\n归一化+正则改/\n-{3,}[ \t]*\n/。见 src/lib/parser.ts:50-55
- 2026-06-11 编辑器滑动弹键盘：TextInput在ScrollView内滑动起始即获焦点 → isScrollDragging控制pointerEvents开关。见 src/screens/MDEditorScreen.tsx:364-369
- 2026-06-11 编辑模式TOC空列表：MarkdownRenderer未挂载headings无来源 → useEffect从raw content解析标题。见 src/screens/MDEditorScreen.tsx:217-228
- 2026-06-11 编辑模式TOC跳转失败：TextInput无scrollTo API → 加回ScrollView用scrollRef.scrollTo({y:lineIdx*22})。见 src/screens/MDEditorScreen.tsx:240-257
- 2026-06-11 预览模式TOC跳转Y偏移为0：headingYs未清空+100ms太短 → content变化清空+500ms fallback+refreshHeadings()。见 src/components/MarkdownRenderer.tsx:684-736
- 2026-06-11 FAB悬浮球移除：新建/导入移入文件Tab header工具栏 → App.tsx去FAB挂载+FileListScreen加toolRow。见 App.tsx:150, src/screens/FileListScreen.tsx:227-241
- 2026-06-11 编辑模式TOC跳转+滑动+卡顿：①TOC跳转→headingLineIdxRef存行号→设光标+focus()触发TextInput原生精确滚动；②滑动→TextInput scrollEnabled原生处理（天然区分滑动/点击）；③卡顿→标题解析500ms防抖（避免每击键split+regex全文扫描）。见 src/screens/MDEditorScreen.tsx:220-266
- 2026-06-11 移除目录树改用滚动进度条：TOCSheet+目录按钮删除 → 新建ScrollProgressBar组件（右侧滚动指示器+标题标记点+拖拽跳转，React.memo避免重复渲染）。见 src/components/ScrollProgressBar.tsx, src/screens/MDEditorScreen.tsx
- 2026-06-11 编辑卡顿彻底修复：TextInput从受控(value)改为非受控(defaultValue) → onChangeText仅更新contentRef不调setContent → 每击键不再触发全组件树重渲染 → 工具栏insert/wrap改用setNativeProps直接操作原生层 → 标题解析在onChangeText中防抖触发（不依赖content state）。见 src/screens/MDEditorScreen.tsx:140-170
- 2026-06-11 编辑模式滚动不动：TextInput style含flex:1被ScrollView约束为视口高度 → 内容永不溢出无法滚动 → 去flex:1改动态minHeight:Math.max(viewportHeight,400)。见 src/screens/MDEditorScreen.tsx:576
- 2026-06-11 双滚动条：原生ScrollView指示器(灰)+ScrollProgressBar(黄)同时显示 → 编辑+预览两处ScrollView加showsVerticalScrollIndicator={false}。见 src/screens/MDEditorScreen.tsx, src/components/MarkdownRenderer.tsx
- 2026-06-11 预览模式缺滚动条：MarkdownRenderer无滚动事件出口 → 新增onScroll/onContentSizeChange props → MDEditorScreen预览分支包裹View+ScrollProgressBar overlay。见 src/components/MarkdownRenderer.tsx:48-49, src/screens/MDEditorScreen.tsx
- 2026-06-11 编辑模式无法滚动（最终修复）：ScrollView包TextInput但TextInput高度被约束 → 用TextInput.onContentSizeChange显式设height:Math.max(textContentHeight,viewportHeight) → 内容超出视口→ScrollView可滚+ScrollBar可拖拽。见 src/screens/MDEditorScreen.tsx:414-435
- 2026-06-11 滚动条简化：去掉标题灰色标记点（md文件格式不统一时标记不准确）→ 只保留黄色位置thumb → ScrollProgressBar去headings/mutedColor props。见 src/components/ScrollProgressBar.tsx
- 2026-06-11 DB迁移bug：CREATE TABLE decks漏file_id列 → checkNeedsV2Migration在表不存在时返回false → ALTER TABLE被跳过 → insertDeck失败 → CREATE TABLE补file_id + 表创建后二次检测兜底。见 src/lib/database.ts:26-35,92-100
