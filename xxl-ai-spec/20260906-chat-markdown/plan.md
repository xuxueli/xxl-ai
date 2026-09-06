# Agent 对话流式 Markdown 渲染修复方案（chat）

> 需求目录：`xxl-ai-spec/20260906-chat-markdown/` | 日期：2026-09-06

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8090 + xxl-ai-ui 3000） |
| 模块/业务命名 | `chat`（Agent 公开访问对话页，免登录，`/chat/:uuid`） |
| 问题现象 | 实时对话时模型返回的 Markdown 不渲染/错乱（如整段被 `##` 标题化），刷新页面后正常 |
| 根因 1 | 流式回调直接改本地 `assistantMsg` 原始对象（`content += chunk`），绕过 Vue 响应式代理，视图不随每个 SSE chunk 重渲染，停留旧快照 |
| 根因 2 | SSE 组装丢换行：Spring `SseEmitter` 将含换行的 chunk 拆成多条 `data:` 行，旧 `readStream` 逐行追加且 trim/跳空行，`\n\n` 段落分隔丢失，整段拼成单行（`## 标题…正文` 全部成标题）；刷新走 DB 完整内容故正常 |
| 出码方式 | AI 直改等价代码（纯前端修复，无建表/菜单） |
| 验证范围 | eslint + vue-tsc + Node 模拟 SSE 帧还原校验 |

## 二、数据库设计
无（不涉及建表/数据变更）。

## 三、菜单 / 授权
无（不新增菜单/权限）。

## 四、后端改造
无（后端 SSE 编排无需改动，可保留）。

## 五、前端改造
文件：`xxl-ai-ui/src/modules/business/chat/index.vue`（另有 `Navbar/index.vue`、`utils/menu.ts`、i18n）

| 位置 | 要点 |
|---|---|
| `handleSend()` | `assistantMsg` push 后记录 `assistantIdx`；流式回调改经响应式代理累加（`messages.value[assistantIdx].content/reasoning += chunk`），触发视图逐 chunk 重渲染 |
| `readStream()` | 按 SSE 事件组帧重写：同一事件内多条 `data:` 行累积，空行（事件结束）时以 `\n` 连接统一派发；不 trim 保留空行/缩进；兼容 `\r\n`/`\r`；保留 `[DONE]`/`__ERROR__` 结束语义；流结束兜底派发残留 |
| `renderMarkdown()` | marked 局部 Renderer 自定义代码块：注入 `.code-block`（语言标签 + 复制按钮 + `<pre><code class="language-x">`），内容经 `escapeHtml` 转义后注入（防非法标签被 DOMPurify 误删），`marked.parse(...,{renderer})` 不污染全局 |
| `handleCopyCode()` | 代码块复制：v-html 注入按钮无法绑 Vue 事件，`onMounted` 在 chat-body 挂事件委托，点击取 `<code>` textContent 复制并提示 |
| 滚动交互 | `.chat-main` 包裹 `chat-body`（相对定位）；`nearBottom` 监听滚动（阈值 80px）：用户上翻时显示右下角「回到底部」按钮且流式不强制吸底，贴近底部自动跟随；按钮点击走 `smoothScrollBottom`（rAF + easeOutCubic，260ms，快而顺滑），流式跟随瞬时吸底 |
| 布局 | `.agent-chat-page` 限高 `100vh/100dvh` + `overflow:hidden`，左侧 `conv-panel` 固定宽（260px + `flex-shrink:0` + 独立滚动），右侧 `chat-body` 独立竖向滚动、横向隐藏 |
| 提示一致性 | `questionRequired` 与 `newChatAlready` 统一 `ElMessage.warning` |
| `<style scoped>` | `.assistant .msg-bubble .msg-content :deep(...)`：代码块浅色主题（`#f6f8fa` 底 + `.code-header` 语言/复制）、行内 code 浅灰、标题 h1-h6 字号层级、列表/引用/表格/分隔线/图片/链接 |
| 删除菜单搜索 | `Navbar/index.vue` 移除 `<HeaderSearch>`（顶栏放大镜）入口与 import；删除 `HeaderSearch.vue`；`utils/menu.ts` 删除 `MenuSearchItem`/`resolveMenuSearchItems`（含 `isHttp` 引用）；i18n 删除 `layout.search` 文案块 |

实时拼装的 content 与后端落库的 `fullText.toString()` 逐字节一致（Node 模拟 Spring `SseUtils` 分帧 + 新 readStream 还原验证：`equals original chunk = true`）。

## 六、验证结果 / 变更记录
- [x] 需求确认：纯前端流式渲染修复，确认根因（响应式绕开 + SSE 换行丢失）
- [x] Node 模拟 `## 《观星者》\n\n今夜…` 全链路还原，实时内容与原始 chunk 完全一致
- [x] 前端 eslint 通过（`npx eslint src/modules/business/chat/index.vue` 等）
- [x] 前端 vue-tsc 通过（`npx vue-tsc --noEmit -p tsconfig.json`）
- [ ] 联调：真实对话流式期间 Markdown（标题/代码块/表格/列表）实时渲染正确，与刷新展示一致；代码块浅色+复制可用；“回到底部”按钮上翻出现、点击快速吸底；顶栏菜单搜索已移除
- [ ] 变更记录（2026-09-06 修复 chat 流式 Markdown 渲染：响应式累加 + SSE 换行还原 + 渲染样式整体优化 + 回到底部交互 + 移除顶栏菜单搜索）