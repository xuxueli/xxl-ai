---
name: xxl-ai-desk
description: 在 XXL-AI 本地版（Desk 桌面客户端，xxl-ai-desk，Electron + Vue3 + Pi + SQLite/Drizzle 三进程架构）下新增或改造业务模块。当任务涉及修改 xxl-ai-desk/src/main（services/db/agent/ipc）、xxl-ai-desk/src/shared、xxl-ai-desk/src/preload 或 xxl-ai-desk/src/renderer/src（stores/modules/components/i18n）时加载本技能。
---

# XXL-AI-Desk · 本地版开发 Skill

Desk 是 **Electron + Vue3 + Pi + SQLite/Drizzle** 的三进程桌面应用；本 Skill 定义其**代码架构、约束原则与落位方式**。

> 仅适用于本地版 `xxl-ai-desk`。云版（`xxl-ai-api` + `xxl-ai-ui`）请加载 `xxl-ai` Skill，二者互不依赖。

## 1. 代码结构

### 1.1 三进程

| 进程 | 入口 | 职责 | 边界 |
|---|---|---|---|
| Renderer | `src/renderer/src` | 界面、Pinia 状态、模块业务 | 只经 `@renderer/api` 访问能力，无 Node / FS / DB |
| Main | `src/main/index.ts` | 窗口、IPC 网关、`services/*` 业务、host 运行时托管、`desk-file` 协议 | 唯一 `getDb()` 出口；不直接执行 Agent 会话 |
| Worker | `src/main/agent/worker/worker.ts`（utilityProcess） | Agent 会话、工具、MCP、技能沙箱 | 不访问 DB 与主进程内部，只经 `shared/agentProtocol.ts` |

```
Renderer ──preload 白名单（DeskApi）──▶ Main ──utilityProcess + parentPort──▶ Worker
```

### 1.2 目录（与代码一致）

```
src/
├── main/
│   ├── index.ts                入口：DB 初始化 → 种子 → 协议 → IPC → 建窗
│   ├── ipc.ts                  IPC 注册总入口（薄网关）
│   ├── config/paths.ts         数据目录 / DB 路径
│   ├── db/{schema,index}.ts    Drizzle 表结构 / DDL + 种子（仅全新安装）
│   ├── utils/                  pathGuard · http · ttlCache
│   ├── services/*.ts           业务 CRUD 与编排（唯一 getDb 出口）
│   └── agent/
│       ├── host/               runtimeHost · approval · browserBridge · community/{mcpSo,skillsSh}Adapter · skills/githubInstaller
│       └── worker/             worker · session · sandbox · models · mcp/{client,naming,tools} · tools/{fs,shell,browser,general,skill,shared,index}
├── preload/index.ts            contextBridge 白名单（DeskApi）
├── shared/
│   ├── ipc.ts                  契约聚合 + IPC 常量 + DeskApi
│   ├── contracts/*.ts          按域 DTO（app/provider/project/session/chat/terminal/fs/shell/mcp/browser/skill）
│   ├── agentProtocol.ts        Main ⇄ Worker 协议
│   ├── i18n/{index.ts,locales/{zh,en}.json}   文案（渲染层 / 主进程 / worker 共用）
│   └── fileTypes.ts · defaults.ts · history.ts · providerUrl.ts · browserUrl.ts · appInfo.ts
└── renderer/src/
    ├── api/index.ts            唯一能力入口：export const api = window.desk
    ├── components/             跨模块通用件（MarkdownBlock / icons，纯展示、无业务依赖）
    ├── layout/                 布局域：index.vue + components/ + utils/
    │   ├── components/         统一经 components/index.ts 导出
    │   │   ├── Navbar/         顶部导航栏
    │   │   ├── Sidebar/        左侧栏：index / SidebarRail / SidebarContent / SidebarMenu / SidebarHeader / SidebarRow
    │   │   ├── AppMain/        主内容区：RouterView
    │   │   └── PanelResizer/   面板尺寸拖拽原语
    │   └── utils/              布局域单消费者工具（persistedWidth）
    ├── composables/            跨模块组合式函数（useAppBootstrap / usePanelResize / useSessionLifecycle / useQuickAction）
    ├── utils/                  无 Vue / 组件依赖的纯工具（ipcError / shortcut / localFileUrl）
    ├── stores/*.ts             根 store（project/settings/toolPanel/mcp/skill/chatUi/layout/browserSession）
    │   ├── stores/chat/        会话域拆分：index / stream / messageMapping / lastSession
    │   └── stores/toolPanel/  工具面板拆分：index / state / storage / panel / fileExplorer / gitPanel / terminalTabs
    ├── modules/{chat,toolPanel,plugin,settings}/
    ├── i18n/index.ts           装配 shared 文案 + t()
    ├── config/nav.ts           板块 ↔ 路由 ↔ 标题 ↔ 子菜单（唯一导航来源）
    ├── router/index.ts         Hash 路由（直接 import 模块 pages）
    ├── styles/{tokens,index}.scss   设计令牌 / 全局样式
    └── types/index.ts          全局基础类型
```

项目根 `resources/` 存放应用级静态资源（`icon.png` 同时用于 electron-builder 安装包图标与 `extraResources` 注入）；渲染层经 `@resources/*` 引用，不放在 `renderer/src` 内。

模块目录构成（按实际）：

```
modules/chat/        pages/ · components/ · composables/ · utils/ · index.ts
modules/toolPanel/  components/{hosts,git,browser,file,terminal}/ · composables/ · utils/ · index.ts
modules/plugin/      pages/ · components/ · utils/ · builtin/{pages,catalog.ts} · mcp/{pages,components}/ · skill/{pages,components}/
modules/settings/    pages/ · components/ · index.ts
```

### 1.3 分层与依赖（硬约束）

| 层 | 允许依赖 | 禁止 |
|---|---|---|
| `services/*` | `db` · `config` · `main/utils` · `shared/*` · `agent/host` 门面 · 其它 service（编排） | import `agent/worker/*`；自写协议 / SDK；在 `ipc.ts` 写业务 |
| `agent/host/*` | electron · `services/*`（读配置 / 导入）· `shared/*` | 定义 `ipcMain` handler；直接写业务表 |
| `agent/worker/*` | `shared/*`（含 `agentProtocol`）· Pi 官方 SDK · `electron-log` | 访问 DB、`services/*`、主进程内部模块；做业务校验 |
| `ipc.ts` | `services/*` · `agent/host` 门面 | 业务编排、状态清理、连接管理、SQL |
| `preload` | `shared/ipc`（DeskApi 契约） | 业务逻辑；暴露任意 Node 能力 |
| `renderer/layout` | `@renderer/{components,composables,utils,stores,config}` · 模块公共 `index.ts` | 模块内部文件；直接 `window.desk`、`node:` |
| `renderer/components` | `@shared/*` · `@renderer/{composables,utils,i18n}` | `stores/*`、`api`、`modules/*` |
| `renderer/modules` | `@renderer/api` · 本模块内部 · `@shared/*` · `@renderer/{components,composables,utils,stores}` · 其它模块公共 `index.ts` | 其它模块内部文件；直接 `window.desk`、`node:` |

判定：
- `services` import `agent/worker` → 违规；`agent/*` 出现 `getDb()` / DDL → 违规。
- renderer 里出现 `window.desk`（除 `api/index.ts`）、`fs`、`child_process` → 违规。
- 跨模块引用只允许：模块 `index.ts` 导出、对应 store、全局 `components/composables/utils`。
- 同一职责域在两个模块各有一份实现 → 违规；先确定唯一归属，再让调用方改走其公共入口。

补充：
- **唯一持久化出口**：`getDb()` 只在 `services/*`；`agent/*` 可经 service 读配置，不写业务表。
- **运行时门面**：需要运行时能力时，`services/*RuntimeService.ts` 编排 → `agent/host` 门面 → worker。
- **基础设施独立**：路径解析在 `config/paths.ts`；`db` 不反向依赖 `services`。
- **本地文件访问**：渲染层一律经 `utils/localFileUrl.ts#toLocalFileUrl()` 转 `desk-file://`，禁止 `file://`；新增文件类型需同步 `shared/fileTypes.ts` 与 `index.html` 的 CSP（`img-src` / `media-src`）。
- **存量偏差**（新增代码按上表执行，改到旧文件时顺手收敛）：
  - `agent/host/skills/githubInstaller.ts` 直接 import `services/skillImportService`、`skillLimits`（方向反了，目标下沉 `shared/`）。
  - `agent/worker/sandbox.ts` 直接 import `main/utils/pathGuard`（目标下沉 `shared/`）。
  - `ipc.ts` 部分 handler 含会话运行时清理与 `resetAgents()`（目标改由 service 提供统一入口）。
  - `composables/useHighlight.ts` 同时服务 Markdown 与文件查看器；`useContentLink` 依赖 `api.shell`，两者暂留全局；Markdown 专属的 `useMarkdown` / `useCodeBlock` / `sanitize` 已收进 `components/MarkdownBlock/`。

### 1.4 模块边界与职责收拢（硬约束）

- **一个功能 = 一个模块**：service、契约、IPC、preload、store、页面/组件、文案、SQL、需求目录同属该模块。
- **职责域单一归属（收拢）**：同一职责域的数据读写、校验、归一、默认值、派生、编排与运行时状态，只在该域模块内实现；其它模块只能经其公共入口调用，禁止复制或降级重写。例：会话删除级联与运行时清理只在会话 service，面板只调入口。
- **跨进程归属**：同一域跨进程存在是允许的，但权威规则只在主进程 `services/*`；渲染层只保留展示态与交互态，禁止复制业务校验、默认值与状态机。
- **最小暴露面**：模块 `index.ts` 只导出调用方真实使用的 DTO / 行为入口；内部行结构、常量、辅助函数、子组件、缓存实现一律不导出，没有调用方就不导出。
- **不向调用方泄漏实现**：跨模块只传契约 DTO 与行为结果，不暴露表结构、SQL、内部协议、第三方 SDK 类型与缓存键。
- **单向依赖**：调用方向只能是「使用方 → 被复用模块」，禁止双向 / 循环依赖；共享逻辑下沉到真正低层（`shared/` 或全局 `utils`），不靠模块互引打补丁。
- **模块自包含**：页面放 `pages/`（页内弹窗内联）、模块内共享件放 `components/`、组合式函数放 `composables/`、纯函数放 `utils/`、跨模块出口放 `index.ts`。
- **components 纯净**：`renderer/src/components` 只放跨模块展示组件，禁止依赖 `stores/*`、`api`、`modules/*`；统一目录 + `index.vue` + barrel。
- **layout 受控依赖**：`layout` 可组合模块公共 `index.ts`，禁止引用模块内部文件。
- **外壳不承载域逻辑**：`layout`、顶栏、路由与页面壳不实现域的默认值、校验、派生与状态流转，只装配模块公共入口。
- **跨模块只走公共面**：模块 `index.ts`、store、全局 `components/composables/utils`；禁止 import 其它模块的 `pages/`、内部 `components/`、内部 `utils/`。唯一例外是路由挂载页面（无 `index.ts` 的 `plugin` 只由路由引用 `pages/`）。
- **重构以收拢为默认动作**：发现同职责散落时，先定唯一归属模块 → 实现迁入 → 调用方改走公共入口 → 删除副本；禁止「新写一份、旧的不动」。
- **收拢不等于提前泛化**：归属唯一针对同一职责域；跨域相似但边界不同的实现可保留，抽象仍按 `AGENTS.md` 的「第三次」原则。
- **上移条件**：`components / composables / utils` 被 **2 个及以上模块**使用才上移到 `renderer/src` 对应目录。
- **目录规模**：单个模块目录 ≤20 个文件；超限按子业务拆分（参考 `plugin/mcp`、`plugin/skill`）。
- **禁止桶文件**：`utils.ts / common.ts / helpers.ts / manager.ts` 不得承载多领域逻辑，文件名必须表达领域语义。
- **会话级 UI 状态**：跨面板/跨页面的会话态放 `stores/toolPanel/` 与 `createSessionScopedStorage`，不放组件局部或全局单例。
- **闭环检验**：改一个功能应只动「模块目录 + 其契约 + 调用方」；若要动 3 个以上模块，先重划边界。
- **适配器扩展**：多实现场景用「接口 + 注册表」，新增实现只加文件、不改调用方。

### 1.5 落位速查

落位前先判定职责域：一个需求涉及多个域时按域拆到各自模块，不新建「跨域公共模块」；域内实现只落在归属模块。

| 新增内容 | 落位 |
|---|---|
| 跨进程 DTO / IPC 常量 / DeskApi | `shared/contracts/*.ts` + `shared/ipc.ts` |
| 跨进程纯函数 / 常量（如文件类型、URL 归一） | `shared/*.ts` |
| 跨进程布局常量（窗口最小宽度、顶栏高度） | `shared/*.ts`，主进程与渲染层共用 |
| 主进程业务与编排 | `main/services/{module}Service.ts` |
| 主进程运行时门面 / 审批 / 社区抓取 | `main/agent/host/*` |
| Agent 工具 / 会话 / MCP | `main/agent/worker/*` |
| IPC 注册 | `main/ipc.ts`（只转发） |
| 渲染能力入口 | `renderer/src/api/index.ts` |
| 跨模块组件 | `renderer/src/components/{Name}/index.vue`，统一从 `components/index.ts` 导出 |
| 布局骨架 / 区域组件 | `renderer/src/layout/{,components/}` |
| 跨模块组合式函数 / 纯工具 | `renderer/src/{composables,utils}` |
| 模块页面 / 模块内组件 | `renderer/src/modules/{module}/{pages,components}` |
| 模块壳级宿主（跨路由常驻） | `renderer/src/modules/{module}/components/hosts/` |
| 模块状态 | `renderer/src/stores/{module}.ts`（复杂域用 `stores/{module}/`） |
| 文案 | `shared/i18n/locales/{zh,en}.json` |
| 颜色 / 尺寸令牌 | `renderer/src/styles/tokens.scss` |

## 2. 代码约束

> **[硬]** 违反打回；**[软]** 为评审阈值，超限需说明理由。
> 取值参考：ESLint `max-lines`、SonarQube 默认阈值、Vue 官方风格指南、Node.js 最佳实践。

### 2.1 契约与数据 [硬]

- 跨进程只传 `shared/contracts/{domain}.ts` 的 DTO；禁止 `any` / 匿名对象穿透 IPC。
- 通道命名 `desk:{module}:{action}`；时间统一 ISO；DTO 布尔由 INTEGER 归一。
- 只传可结构化克隆的纯数据：不传 Error、类实例、Vue 响应式代理；必要时深拷贝。
- **单一数据源**：同一配置只有一处权威存储；派生字段保存时统一重生，不允许两处并存。
- **写库结构必须合法**：写入前保证下游可消费；历史脏数据在读取边界归一化。
- 结构变更两处同步：`db/schema.ts` 与 `db/index.ts` 的 `DDL`（仅面向全新安装，不做旧库迁移）。
- 敏感值不落明文、不进日志；列表脱敏，编辑态才解密。
- **SQLite 无外键级联**：删除父记录（项目 / 会话 / 消息 / 终端）必须由 service 手动级联并清理运行时，禁止依赖数据库约束。
- **跨进程文案**：主进程 / worker 的用户可见错误用 `shared/i18n` 的 `translate(language, 'runtime.*')`；新增文案禁止硬编码中文（存量待收敛）。

### 2.2 运行时与资源 [硬]

- **生命周期闭环**：创建/连接 → 缓存复用 → 失效重建（配置变更）→ 释放（重置/退出）；`close` 幂等。
- **超时 + 取消**：连接、请求、工具调用、命令执行均支持超时与 `AbortSignal`；终止后不得继续执行。
- **失败隔离**：单个外部服务失败只跳过自身并记录可定位日志，不阻断主流程。
- **副作用集中**：配置变更后的缓存失效（如 `resetAgents()`）在一个入口统一完成。
- **官方方案优先**：有官方/上游 SDK 或推荐接入方式时禁止自写协议。例：MCP 使用 `@earendil-works/pi-mcp`；模型/Agent 使用 `@earendil-works/pi-ai`、`pi-agent-core`。

### 2.3 UI 与样式 [硬]

- 颜色/尺寸只用 tokens；组件样式 scoped；全局选择器（`:global`、`:has`、`body ...`）必须写明影响面并验证。
- 弹层统一 `append-to-body`，并处理 `-webkit-app-region` 拖拽区，避免关闭按钮点击被窗口拖动吞掉。
- 列表/表格复用统一规范（字号、列宽、操作按钮间距），禁止各页面自行一套。

### 2.4 可读性与规模 [软]

- 命名、注释、类型与死代码规范以 `AGENTS.md`「通用约定」为准；本节只列 Desk 规模阈值。
- 早返回代替深层嵌套；边界处禁止 `any`，强制转换必须紧邻注释说明原因。

| 对象 | 阈值 | 依据 |
|---|---|---|
| 函数 | ≤50 行（硬告警 200）；参数 ≤4（硬告警 10）；嵌套 ≤3；认知复杂度 ≤15 | SonarQube |
| Vue 组件 | ≤1000 行；页面 SFC ≤1000 行 | Vue 风格指南 |
| service | ≤1000 行 / 导出方法 ≤15 | 模块宽度控制 |
| 单文件 TS | ≤1000 行 | ESLint `max-lines` |

超限必须回答：**能否按职责拆出新文件/新模块？**

### 2.5 反例（真实踩坑）

- 配置模块直接连接 MCP / 实现协议 → 配置与运行时耦合。
- 失败轮次写入缺字段的消息 → 下一轮 `message.content is not iterable`。
- 全局 `:has(.el-overlay)` → 顶栏拖拽永久失效。
- 加载遮罩未限制定位上下文 → 抽屉关闭按钮被遮罩吞点击。
- 只做程序化点击测试 → 漏掉真实窗口拖拽区问题。

### 2.6 布局与尺寸 [硬]

- **单一数据源**：JS 侧尺寸只取 `renderer/src/config/layout.ts#LAYOUT`，CSS 侧取 `styles/tokens.scss`；同一尺寸在两处出现时，改动必须同步，并在注释标注权威方。
- **跨进程共享尺寸**（窗口最小宽度、顶栏高度等）下沉 `shared/`，主进程直接引用常量计算，禁止写魔法数（如窗口 `minWidth`）。
- **布局不变量**（2026-11 基线）：
  - 图标栏 44px；按需独立于顶栏高度，不共用同一 token；
  - 子菜单：默认 240px、最小 150px、最大由会话区约束；
  - 工具面板：默认视口 50%、最小 150px；文件工具展开目录树时最小 300px；
  - 会话区：最小 400px，任一面板拖动 / 窗口缩放都必须成立；
  - 文件树：默认 240px、最小 150px；文件正文：最小 150px；
  - 窗口最小宽度需满足上述最小值之和（当前 44 + 150 + 300 + 400 = 894，取 900）。
- **工具面板宽度约定**：`0` 表示「自动按视口比例」，正数表示用户自定义像素；复位回到自动，不要写死旧默认值。
- **约束只在 `config/layout.ts` 推导**：`sidebarWidthMax` / `toolPanelWidthMax` / `toolPanelMinWidth` 为纯函数；composable 只做 store 读写与响应式装配，组件内禁止重复硬编码 min/max。
- **宽度约束双向成立**：面板上限要基于另一面板的实际宽度计算，不能只保证单侧。
- **默认值调整优先字段级归一化**：`STORAGE_VERSION` 升级会清空全部工具面板状态（宽度、展开态、选中文件），仅在结构不兼容时使用。

### 2.7 命名、去重与清理 [硬]

- **命名表达职责，拒绝泛化词**：模块、Store、类型、i18n 命名空间使用同一词根（如 `toolPanel` / `useToolPanelStore` / `ToolPanelTab` / `toolPanel.*`）；不用 `workspace`、`panel`、`manager` 等跨语义词承载单一职责。
- **同一能力只保留一个主入口**：侧栏 / 子菜单已有的操作，顶栏、详情页等外壳不重复实现；确需快捷入口时复用同一 action，不复制重命名 / 删除等逻辑。
- **同一职责不散落**：业务规则（校验、归一、默认值、状态流转、级联清理）全仓只有一处实现，其它位置调公共入口；发现第二份实现即按 §1.4 收拢，不追加「临时同步」注释。
- **导出即契约**：barrel / `index.ts` 的每个导出都要有真实调用方；无调用方的导出删除，内部实现不进入公共面。
- **不写不存在的兼容**：无真实存量数据或明确要求时，不做旧字段 / 旧前缀迁移；确需兼容时只在读取边界单点归一，并注明过期时间与移除条件。
- **删除功能要闭环**：组件、composable、barrel 导出、i18n 键、样式、CSS 类名、注释、文档与 Skill 同步删除；禁止留下无引用“孤岛文件”。
- **死代码只有两种处理**：接入使用，或删除。发现未被引用的组件时先确认是否为遗失功能，再决定接线还是移除。
- **清理校验**：重命名后全仓搜索旧词（含路径、类型、i18n key、CSS class、文档）；用 `tsc --noUnusedLocals --noUnusedParameters` 清理未使用导入 / 变量 / 参数。
- **描述精简**：Agent 工具描述只保留「做什么 + 默认行为 + 关键限制」，不堆叠实现细节与重复提示。

## 3. 开发流程

1. **需求确认（必须）**：模块命名、字段与校验、系统能力（对话框/shell/终端/文件）、页面形态、改动范围、验证范围；确认后写入需求目录的 `方案.md`。
2. **需求落盘**：`xxl-ai-spec/{yyyyMMdd}-{module}/` 建 `方案.md` 与建表 SQL（SQLite DDL）。
3. **数据结构**：按 §2.1 同步 `db/schema.ts` 与 `db/index.ts` 的 `DDL`。
4. **主进程落位**：`services/{module}Service.ts` + 契约 + IPC + preload；需要运行时再加 `{module}RuntimeService.ts` 与 `agent/*` 实现。
5. **渲染进程落位**：store + 页面/组件 + 路由 + 文案。
6. **验证**：按 §7 执行（`type-check` → `build` → 端到端）；完成后清理测试数据并恢复用户状态。

`方案.md` 最小结构：需求结论 / 数据库设计 / 后端改动 / 前端改动 / 验证结果。

## 4. 落位清单

### 4.1 主进程 6 件套（业务 `Widget` → `widget`）

| 文件 | 位置 | 说明 |
|---|---|---|
| `schema.ts` | `src/main/db/schema.ts` | `sqliteTable('desk_widget', {...})` |
| `index.ts` | `src/main/db/index.ts` | DDL 建表 + 内置种子（全新安装生效，不做旧库迁移） |
| `widgetService.ts` | `src/main/services/widgetService.ts` | CRUD/编排；唯一 `getDb()` 出口 |
| handler | `src/main/ipc.ts` | `ipcMain.handle(IPC.widget*, ...)`，薄网关 |
| 契约 | `src/shared/contracts/widget.ts` + `src/shared/ipc.ts` | DTO + `IPC.widget*` + `DeskApi.widget` |
| 暴露 | `src/preload/index.ts` | `widget: { list, save, remove }` |

```ts
/* schema.ts */
export const widgetTable = sqliteTable('desk_widget', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  enabled: integer('enabled').notNull().default(1),
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
```

```ts
/* widgetService.ts：行 → DTO、list/save/delete；save 以 onConflictDoUpdate 幂等写入 */
function toDTO(row: WidgetRow): WidgetDTO {
  return { id: row.id, name: row.name, enabled: row.enabled === 1,
    addTime: row.addTime, updateTime: row.updateTime }
}
export function saveWidget(input: Partial<WidgetDTO>): WidgetDTO {
  const db = getDb()
  const now = new Date().toISOString()
  const id = input.id || randomUUID()
  const existing = db.select().from(widgetTable).where(eq(widgetTable.id, id)).get()
  const record = { id, name: input.name ?? existing?.name ?? '',
    enabled: (input.enabled ?? (existing ? existing.enabled === 1 : true)) ? 1 : 0,
    addTime: existing?.addTime ?? now, updateTime: now }
  db.insert(widgetTable).values(record)
    .onConflictDoUpdate({ target: widgetTable.id, set: record }).run()
  return toDTO(record)
}
```

```ts
/* ipc.ts：只注册与转发；运行时失效/清理在 service 内完成 */
ipcMain.handle(IPC.widgetList, () => listWidgets())
ipcMain.handle(IPC.widgetSave, (_e, dto: Partial<WidgetDTO>) => saveWidget(dto))
ipcMain.handle(IPC.widgetRemove, (_e, id: string) => deleteWidget(id))
```

```ts
/* shared/contracts/widget.ts + IPC/DeskApi 片段 */
export interface WidgetDTO { id: string; name: string; enabled: boolean; addTime: string; updateTime: string }
// IPC: widgetList: 'desk:widget:list' ...
```

### 4.2 渲染进程 4 件套

| 文件 | 位置 | 说明 |
|---|---|---|
| store | `src/renderer/src/stores/{module}.ts` | Pinia；只经 `api.{module}` 访问能力 |
| 页面/组件 | `src/renderer/src/modules/{domain}/{module}/{pages,components}` | 模块自包含 |
| 路由 | `src/renderer/src/router/index.ts` | 新页面登记（Hash） |
| 文案 | `src/shared/i18n/locales/{zh,en}.json` | 成对新增 |

```ts
export const useWidgetStore = defineStore('widget', () => {
  const widgets = ref<WidgetDTO[]>([])
  const loaded = ref(false)
  async function loadWidgets(): Promise<void> {
    widgets.value = await api.widget.list()
    loaded.value = true
  }
  async function removeWidget(id: string): Promise<void> {
    await api.widget.remove(id)
    widgets.value = widgets.value.filter((item) => item.id !== id)
  }
  return { widgets, loaded, loadWidgets, removeWidget }
})
```

要点：

- 能力访问统一 `import { api } from '@renderer/api'`；禁止直接 `window.desk`。
- 引用优先别名：`@renderer/*`、`@shared/*`；禁止 3 层以上 `../`。
- 组件 PascalCase；文案规范（`t()`、zh/en 成对、`common.*` 复用、插值）以 `AGENTS.md`「国际化」为准。
- 落位、模块边界与目录语义见 §1.2–§1.5，此处不重复。

## 5. 界面外壳

```
layout/index.vue（app-wrapper，纵向）
├─ Navbar        全局顶栏（固定最顶部，整体 -webkit-app-region: drag）
└─ app-body（横向）
   ├─ Sidebar     SidebarRail（常驻图标栏）+ SidebarContent（可折叠/可拖拽内容区）
   │              └─ SidebarContent：ChatSidebarPanel（首页）/ SidebarMenu（插件、设置）
   └─ AppMain     正文（RouterView）
```

- **术语边界**：`layout` 指应用外壳；`nav` 指导航；`sidebar` 指左侧整列；`rail` 指图标栏；`panel` 只指正文内可调整尺寸的面板（工具/终端/文件/浏览器）；`shell` 只用于操作系统 shell（`api.shell`、`desk:shell:*`）。
- **导航单一来源**：板块 ↔ 入口路径 ↔ 顶栏标题 ↔ 子菜单项均在 `config/nav.ts`（`NAV_SECTIONS` / `SECTION_ENTRY` / `SECTION_ICON`）。新增板块需同步：`nav.ts`、`SidebarRail` 按钮、路由与正文页。
- **顶栏**：左侧依次为首页入口（回到对话模块新建对话页）与软件名称（`appName` 优先、回落 `app.name`），其后为板块图标 + 标题/操作，标题随路由（首页=会话标题，插件=「插件」，设置=「系统设置」）；软件名称与标题间的细线仅在有标题时展示；交互控件 `no-drag`。顶栏标题只做展示，不重复会话重命名 / 删除等侧栏已有操作。
- **子菜单**：标题 18px/600，条目 14px/400，选中项 600 + 浅底；不展示 Logo；点击当前板块按钮切换子菜单栏折叠/展开，图标栏常驻。
- **布局不承载域逻辑**：域内逻辑下沉 `modules/{module}`；`SidebarContent` 是唯一装配侧栏域内容的位置。
- **布局不承载启动逻辑**：`App.vue` 只组装外壳；全局快捷键、设置/项目/会话初始化、会话生命周期与更新检查在 `composables/useAppBootstrap.ts`。
- **面板宽度约束**：左侧栏与右侧工具面板均按像素持久化，最小 40px，最大保证会话区不低于 300px；拖拽统一走 `usePanelResize`（rAF 合并）与 `PanelResizer`。
- **工具面板统一入口**：文件 / Git / 浏览器 / 终端均为右侧工具面板的 Tab，顺序为文件、Git、终端、浏览器；不再保留底部独立终端面板。
- **面板交互统一复用**：拖拽用 `composables/usePanelResize.ts` + `layout/components/PanelResizer/index.vue`；左侧栏宽度走 `stores/layout.ts`，工具面板宽度、文件树宽度等会话级尺寸走 `stores/toolPanel/`（按会话持久化）；文件树与文件内容之间的拖拽复用 `PanelResizer`。
- **共享选中态归属域**：跨「子菜单 ↔ 页面」的选中态放所属域 store（如 `settings.activeTab`），不塞进 `layout`。
- **配色分层**：`--desk-chrome-bg`（顶栏+图标栏）> `--desk-panel-bg`（子菜单栏）> `--desk-bg`（正文）；不加分隔线，仅「子菜单栏 ↔ 正文」保留 1px `--desk-border`。
- **尺寸令牌**：`--desk-header-height`、`--desk-rail-width`、`--desk-sidebar-width`、`--desk-terminal-height`、`--desk-panel-header-height`；JS 侧尺寸统一取 `config/layout.ts#LAYOUT`；自绘 SVG 统一 `.desk-svg-icon`，尺寸由使用处覆盖。
- **字体层级**：文字统一使用 `--desk-font-{xs,sm,base,md,lg,xl}`，图标字号使用 `--desk-icon-md`；禁止在组件内新增绝对 px 字号。

## 6. Agent 运行时

新增 Agent 能力落 `src/main/agent/`，按进程归属落位；工具/会话扩展不需要新 IPC，只有新增跨进程能力才动 `shared/agentProtocol.ts` 与 `ipc.ts` / `preload`。

| 需求 | 落位 | 要点 |
|---|---|---|
| 内置工具 | `agent/worker/tools/{fs,shell,browser,general,skill}.ts` | `createBuiltinToolEntries()` 用 `Type.Object` 定义 `AgentTool`；只读工具常驻，写/命令类仅 build；是否进入「内置工具」页见 §6.1 |
| 文件类工具 | `agent/worker/tools/fs.ts` + `agent/worker/sandbox.ts` | 必须先过 `guardPath({ sessionId, rootDir, target, action, tool })`，越界返回拦截错误 |
| 越界审批 | `sandbox.ts` + `host/runtimeHost.ts` + `host/approval.ts` | worker 经 `parentPort` 发 `approval-request`，主进程弹窗回传 `once/session/deny` |
| MCP | `agent/worker/mcp/{client,tools}.ts` | 使用 Pi 官方 `@earendil-works/pi-mcp`；工具转换 `toLlmContent` + `Type.Unsafe` + `signal` |
| 会话装配 | `agent/worker/session.ts` | 会话级 Agent 缓存 + 事件流 + 工具合并 |
| 工具注册表 | `agent/worker/tools/shared.ts` | `ALL_MODES` / `BUILD_ONLY` / `describe` / `toolError` / `createGuard`；新增工具复用，不重复实现 |
| 协议 | `shared/agentProtocol.ts` | 改 `HostEvent`/`WorkerRequest` 需同步 worker.ts、session.ts、runtimeHost.ts |
| 模型 | `agent/worker/models.ts` | `normalizeBaseUrl`、`buildModels`、`{session}` 占位替换 |

工具结果 `content` 为文本块数组；失败用 `isError: true`。新增工具必须自测越界拦截与 Plan 模式不可见。

### 6.1 内置工具目录的产品边界（硬约束）

「插件 → 内置工具」是**产品能力目录**，不是 `agent/worker/tools` 注册表的镜像。收录项须同时满足：

1. 由客户端自身提供，不是外部 MCP / 插件动态接入；
2. 是独立能力，不是其它功能的内部实现（如 `read_skill` 仅服务 SKILL）；
3. 用户可理解、可能需要管理（开关 / 权限 / 适用模式）；
4. 不与已有管理页重复（MCP → MCP 页，SKILL → SKILL 页）。

判定顺序：**先问用户是否应在此页看到并管理，再看代码里有没有。**

- 展示：`fs` / `shell` / `browser` / `general` 等客户端核心能力；
- 不展示：MCP 工具、`read_skill` 等插件内部工具、仅服务单一业务模块的辅助 Tool；
- 分类与工具清单按产品白名单维护，不按工具工厂输出自动展开。

### 6.2 沙箱与信任边界 [硬]

- **信任域只有两个**：会话项目目录（读 / 写 / 命令）与技能库 `{dataDir}/skills`（读 / 写 / 命令，完全信任）；其它目录一律走越界审批。
- **技能库读取权限 ≠ 技能启用状态**：
  - 技能库整库永远可读（含未启用技能、技能根目录列举），不得弹审批；
  - 「启用」只决定提示词注入与 `read_skill` 是否可用（使用权限）；
  - 禁止用「是否启用」限制 `read_file` / `list_directory` / 技能库读取。
- **技能根目录由主进程每轮下发**（`RunAgentInput.skillsDir`）；工具侧禁止自行推断或拼接技能目录。
- **越界审批只走统一闸门**：`guardPath` → `hitl` → 主进程 → 渲染层；新增文件 / 命令工具必须复用 `createGuard` / `guardPath`，禁止自写路径判断。
- **`run_command` 的路径识别只防误操作，不是安全边界**：动态展开（`$VAR`、命令替换）、解释器（`python -c`、`sh -c`）无法覆盖；不要为它叠加脆弱的「只读命令白名单」或其它启发式解析。
- **会话信任粒度**：当前 `sessionTrusted` 为会话级全量放行；后续扩展必须收敛为「目录 + 动作」粒度，避免一次授权放大到全部读写命令。

## 7. 校验清单

- [ ] 需求目录 `xxl-ai-spec/{yyyyMMdd}-{module}/` 存在，`方案.md` 与 SQL 同步。
- [ ] 结构一致：`schema.ts` / `DDL`。
- [ ] `services/*` 是唯一 `getDb()` 出口；`ipc.ts` 仅网关；契约 / IPC 常量 / `DeskApi` / preload 齐备。
- [ ] 依赖方向符合 §1.3；配置与运行时未耦合；运行时使用官方方案。
- [ ] 同一职责域只有一处实现，跨模块仅经公共入口；`index.ts` 无未使用导出、无循环 / 双向依赖。
- [ ] 外壳、`ipc.ts`、调用方未承载域内校验 / 归一 / 默认值 / 级联清理。
- [ ] 新增/变更依赖为精确版本（无 `^` / `~` / 区间）；lock 当前被 `.gitignore` 忽略，如放开需同步提交。
- [ ] 通道 `desk:{module}:{action}`；时间 ISO；布尔归一。
- [ ] 渲染仅经 `api`；路由已登记；文案 `t()` / 主进程 `translate()` 且 zh/en 成对；无硬编码中文。
- [ ] 「内置工具」仅收录客户端核心能力，未混入 MCP / SKILL 等插件内部工具。
- [ ] UI 复用 tokens/外壳/列表规范；弹层 append-to-body 且拖拽区可用；全局样式已验证影响面。
- [ ] 布局尺寸变更已同步 `config/layout.ts` 与 `tokens.scss`；跨进程尺寸使用共享常量，无魔法数。
- [ ] 技能库读写不触发审批；`read_skill` 仍只认已启用技能；未新增脆弱的 shell 只读命令白名单。
- [ ] 资源生命周期闭环；超时/取消/失败隔离/进程无残留。
- [ ] `npm run type-check`、`npm run build` 通过；涉及 IPC/运行时完成端到端验证。
- [ ] 注释与命名符合既有风格；无死代码/调试残留/测试数据。

## 8. 参考实现

- 主进程：`services/chatService.ts`（编排）、`services/sessionService.ts`（CRUD + 级联）、`agent/host/runtimeHost.ts`
- 渲染：`modules/plugin/mcp/{pages,components}`（管理 + 发现）、`stores/chat/{index,stream}.ts`
- 运行时：`agent/worker/session.ts`、`agent/worker/tools/shared.ts`
- 构建：`package.json`（`type-check` / `build` / `dev`）、`electron.vite.config.ts`
