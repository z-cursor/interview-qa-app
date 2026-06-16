# Handoff — 面试题库 App v2.2

Expo SDK 56 | 2026-06-11

## Context
MD 面试题库 + 语音练习 RN App。2-tab（文件/题库），支持 MD 编辑、解析、录音自检。
本次会话：移除目录树 → 滚动进度条 + 彻底修复编辑卡顿。

## Current State
- `npx tsc --noEmit` 零错误
- **编辑器架构**：ScrollView + 非受控 TextInput (`defaultValue` 替代 `value`)
- **滚动**：TextInput 默认 `pointerEvents="none"` → ScrollView 接收全部手势 → 滚动流畅
- **编辑**：ScrollView 检测 tap → `setInputActive(true)` → TextInput `pointerEvents="auto"` + `focus()` → 键盘弹出
- **键盘关闭**：ScrollView `keyboardDismissMode="on-drag"` 滑动收起 → `onBlur` → `setInputActive(false)`
- **非受控 TextInput**：`onChangeText` 仅更新 `contentRef`，不调 `setContent` → 每击键不触发全组件树重渲染 → 编辑**顺滑**
- **工具栏**：insert/wrap 通过 `setNativeProps({text})` 直接操作原生层，无需走 React 状态
- **标题解析**：`onChangeText` 中 500ms 防抖触发，使用 `contentRef.current` 文本，不依赖 content state
- **滚动进度条**：`ScrollProgressBar` 组件（右侧 3px 轨道 + 标题标记点 + 位置 thumb），支持拖拽跳转，`React.memo` 避免高频重渲染
- **ScrollView 追踪**：`onScroll` + `onContentSizeChange` → 进度条实时更新
- **TOC 目录树已完全移除**：TOCSheet 组件、目录按钮、tocVisible 状态、handleSelectHeading / handleHeadingsRegister 回调均已删除
- 所有改动 **未在真机验证**

## Key Files

- `src/screens/MDEditorScreen.tsx` — MD 编辑器。ScrollView + 非受控 TextInput + ScrollProgressBar。`afterTextChange` 统一处理保存状态 + 标题防抖解析。
- `src/components/ScrollProgressBar.tsx` — 滚动进度条（新增）。`React.memo` 包裹，手势响应 `onResponderGrant/Move`，通过 `locationY` 计算比例。
- `src/lib/parser.ts` — `splitBlocks` 开头归一化 `\r\n` → `\n`，`---` 分割正则 `/\n-{3,}[ \t]*\n/`。
- `src/components/MarkdownRenderer.tsx` — 预览模式渲染。标题 onLayout 注册 + 500ms fallback + `refreshHeadings()`。
- `src/components/EditorToolbar.tsx` — 编辑工具栏（heading/bold/italic/code 插入+包裹）。
- `src/screens/FileListScreen.tsx` — 文件 Tab 页。Header 含新建/导入按钮。

## Architecture Decisions

### 非受控 TextInput 原理
```
defaultValue={content}  ← 仅挂载时读取一次
onChangeText → contentRef.current = text  ← 不调 setContent
            → afterTextChange(text) → 保存状态 + 标题解析(防抖)
```
- 击键不触发 React 状态更新 → 无全树重渲染 → 编辑顺滑
- 切换到预览 → `setContent(contentRef.current)` 同步 state
- 工具栏操作 → `setNativeProps({text})` 直接写原生，不走 React

### 滚动进度条 vs TOC
- TOC：需要 Modal + 标题列表 + 点击回调，多步操作
- 滚动条：直接可见，拖拽即跳转，零操作步骤
- 标题标记点提供结构参考（类似 Cursor minimap）

## Pending / Unverified
- 编辑模式滚动流畅度
- 滚动进度条拖拽跳转准确性
- 编辑模式 tap-to-edit（键盘弹出）
- 键盘滑动收起
- 非受控 TextInput 工具栏插入文本正确性
- 标题标记点比例准确性（基于行号比率，长行换行有偏差）
- 文件页新建/导入按钮功能
- 预览模式渲染
- 导入文件 \r\n 解析正确性
- 明暗主题所有页面视觉

## How to Resume
1. `npx expo start` + `adb reverse tcp:8081 tcp:8081` 连接设备
2. 验证滚动条：打开含多标题 .md → 编辑模式 → 右侧应显示滚动进度条（标题标记点 + 位置 thumb）→ 拖拽进度条 → 内容跟随跳转
3. 验证编辑流畅度：编辑模式输入文字 → 不应有卡顿感
4. 验证工具栏：编辑模式点 B/I/H 按钮 → 文本正确插入或包裹
5. 验证模式切换：编辑 → 预览 → 编辑 → 内容保持最新
6. 验证键盘：编辑模式滑动 → 键盘不弹出；点击文本 → 键盘弹出；滑动 → 键盘收起

## Notes
- 滚动条 `contentHeight` 来自 `onContentSizeChange`（实测像素），`scrollOffset` 来自 `onScroll`（60fps 节流至 32）
- 进度条 thumb 位置 = `scrollOffset / (contentHeight - viewportHeight) * (trackHeight - thumbHeight)`
- 标题标记点水平位置 `h.ratio` 基于**行号比率**，未考虑长行换行——结构参考够用，精确定位需真机实测后调整
- `React.memo` 保证 ScrollProgressBar 只在 contentHeight/viewportHeight/scrollOffset/headings 变化时重渲染
- `setNativeProps({text})` 不触发 React onChangeText，避免反馈循环
