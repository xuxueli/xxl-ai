---
name: xxl-ai-desk
description: 在 XXL-AI 本地版（Desk 桌面客户端，xxl-ai-desk，Electron + Vue3 + Pi + SQLite/Drizzle 三进程架构）下新增或改造业务模块。当任务涉及修改 xxl-ai-desk/src/modules（shared/main/preload/renderer/worker/i18n）、xxl-ai-desk/src/common、xxl-ai-desk/src/main、xxl-ai-desk/src/preload 或 xxl-ai-desk/src/renderer/src/shell 时加载本技能。
---

# XXL-AI-Desk · 本地版开发 Skill

Desk 是 **Electron + Vue3 + Pi + SQLite/Drizzle** 的三进程桌面应用；本 Skill 定义其**代码架构、约束原则与落位方式**。

> 仅适用于本地版 `xxl-ai-desk`。云版（`xxl-ai-api` + `xxl-ai-ui`）请加载 `xxl-ai` Skill，二者互不依赖。

## 1. 代码结构

### 1.1 三进程

| 进程 | 入口 | 职责 | 边界 |
|---|---|---|---|
| Renderer | `src/renderer/src` | 界面、Pinia 状态、模块业务 | 只经 `@common/renderer/api` 访问能力，无 Node / FS / DB |
| Main | `src/main/index.ts` | 窗口、IPC / DB / i18n 装配、`desk-file` 协议 | 业务在 `modules/*/main`；唯一 `getDb()` 出口在 `common/main/db`；不直接执行 Agent 会话 |
| Worker | `src/modules/agent/worker/worker.ts`（utilityProcess） | Agent 会话、工具、MCP、技能沙箱 | 不访问 DB 与主进程内部，只经 `modules/agent/shared/agentProtocol.ts` |

```
Renderer ──preload 白名单（DeskApi）──▶ Main ──utilityProcess + parentPort──▶ Worker
```

### 1.2 目录（与代码一致）

```
src/
├── common/                         # 一级公共：跨域、无业务规则
│   ├── shared/                     # 跨进程纯 TS：contracts/(pagination·quickAction)、fileTypes、providerUrl、runtimeLog、appInfo、i18n
│   ├── main/                       # 主进程基础设施：db(getDb) / config/paths / utils(http·logger·pathGuard·ttlCache·directoryWatcher·localFileRoots) / ipc
│   └── renderer/                   # 渲染公共：api(window.desk) / components(CodeEditor·MarkdownBlock) / composables / config / styles / types / utils
├── modules/                        # 单领域模块：一个域一个目录
│   ├── platform/                   # shared · main · preload · i18n（系统外壳 / 更新 / 运行时环境 / 本地文件协议）
│   ├── appCenter/                  # shared · main · preload · renderer · i18n（内置应用注册 / 安装启用 / 市场）
│   ├── apps/{appId}/               # 子应用：shared · main · preload · renderer · i18n（如 apps/note）
│   ├── settings/                   # shared · main · preload · renderer · i18n
│   ├── provider/                   # shared · main · preload · renderer
│   ├── project/                    # shared · main · preload · renderer · i18n
│   ├── chat/                       # shared · main · preload · renderer · i18n
│   ├── agent/                      # shared · main · preload · worker · renderer · i18n
│   ├── mcp/                        # shared · main · preload · worker · renderer
│   ├── skill/                      # shared · main · preload · worker · renderer
│   ├── file/                       # shared · main · preload · worker · renderer
│   ├── git/                        # shared · main · preload · renderer · i18n
│   ├── terminal/                   # shared · main · preload · renderer
│   ├── browser/                    # shared · main · preload · worker · renderer
│   ├── diagnostics/                # shared · main · preload · renderer
│   ├── toolPanel/                  # renderer（仅壳：Tab / 宽度 / 宿主） · i18n
│   └── plugin/                     # renderer（仅壳：扩展中心 / builtin） · i18n
├── main/                           # 主进程入口壳：index.ts · ipc.ts(聚合) · db.ts(聚合) · i18n.ts(聚合)
├── preload/                        # 预加载入口壳：index.ts(聚合) · deskApi.ts(类型聚合) · index.d.ts
└── renderer/src/
    ├── main.ts · App.vue · env.d.ts
    └── shell/                      # 应用外壳
        ├── layout/                 # Navbar / Sidebar / AppMain / PanelResizer
        ├── router/index.ts         # 路由组合根：直接装配各模块 pages
        ├── config/nav.ts
        ├── composables/            # useAppBootstrap / useSessionLifecycle / useQuickAction
        ├── stores/layout.ts
        └── i18n/index.ts           # 渲染层词条组合根
```

项目根 `resources/` 存放应用级静态资源（`icon.png` 同时用于 electron-builder 安装包图标与 `extraResources` 注入）；渲染层经 `@resources/*` 引用，不放在 `renderer/src` 内。

模块内部构成（统一模板）：

```
modules/{domain}/
├── shared/     contracts.ts · ipc.ts · api.ts · index.ts
├── main/       service.ts|{domain}Service.ts · runtime.ts · discover.ts · schema.ts · ddl.ts · seed.ts · ipc.ts · index.ts（按域取用）
├── preload/    index.ts
├── worker/     tools.ts · client.ts · index.ts（仅 Agent 相关域）
├── i18n/       zh.json · en.json（仅需要领域词条的模块）
└── renderer/   pages/ · components/ · composables/ · utils/ · store.ts|store/ · index.ts
```

### 1.2.1 `common` 与 `modules` 的定义（硬约束）

顶层目录固定为 `src/common`（跨域公共）和 `src/modules`（领域模块）；不新增其它顶层分层，也不在 `modules` 下再嵌套框架层或业务层。

| 层 | 定义 | 判断标准 |
|---|---|---|
| `common` | 跨域公共层：被 **2 个及以上领域** 复用、且 **不含任何单一领域业务规则** 的代码 | 只被依赖，不依赖业务；只有 1 个域使用就不进 `common` |
| `modules` | 领域模块层：一个业务域 / 职责域的**完整纵向切片**，拥有该域的权威实现、数据与公共接口 | 一个模块 = 一个变更理由；同一职责域只能有一个归属模块 |

`common` 收录范围：

- 跨进程契约原语：`contracts/pagination` / `contracts/quickAction`；
- 跨域纯函数 / 常量：`appInfo` / `fileTypes` / `providerUrl` / `runtimeLog`；
- 主进程基础设施：`db(getDb)` / `config/paths` / `utils` / `ipc`；
- 渲染公共能力：`api(window.desk)` / 公共组件 / 公共 composables / 布局常量 / 设计令牌 / 公共 i18n。

`common` 禁止收录：

- 领域 DTO、领域 service、领域 store、领域页面、领域表结构、领域默认值 / 校验 / 状态机；
- 只被 1 个模块使用的工具或组件；
- 以「跨进程共用」为理由把领域契约放进 `common`（跨进程 ≠ 公共）。

`modules` 内部构成：

- `shared/`：本域 DTO、IPC 通道、Api 类型；
- `main/`：本域权威实现（service / runtime / schema / ddl / seed / ipc）；
- `preload/`：本域 DeskApi 片段；
- `renderer/`：本域页面、组件、store、composables、utils；
- `worker/`：可选，本域 Worker 工具 / 客户端；
- `i18n/`：可选，本域 zh/en 词条。

判定顺序：

1. 只有 1 个领域使用 → 放该 `modules/{domain}`。
2. 被 ≥2 个领域使用，且无业务规则 → 放 `common`。
3. 跨进程使用但属于单一领域 → 放 `modules/{domain}/shared`。
4. 同一逻辑出现第二份实现 → 先定唯一归属，再让调用方走公共入口。
5. 不确定时先按领域归属，禁止默认丢进 `common`。

命名要求：`common` 内不出现领域名（`mcp` / `skill` / `chat` / `file` 等）；`modules` 目录名使用领域或壳名词，禁止 `utils` / `shared` / `common` / `manager` 等泛化名。

### 1.3 分层与依赖（硬约束）

| 层 | 允许依赖 | 禁止 |
|---|---|---|
| `common/shared` | 无（纯 TS / 常量 / 契约原语） | Node / Electron / Vue / DOM / `@modules/*` |
| `common/main` | `common/shared` · Node / Electron 基础设施 | `common/renderer` · `@modules/*` |
| `common/renderer` | `common/shared` · Vue / DOM | `common/main` · `@modules/*` |
| `modules/*/shared` | `common/shared` | 进程实现、Vue、Node、其它模块内部文件 |
| `modules/*/main` | `common/{shared,main}` · 本模块 `shared/main` · 其它模块 `shared/main` 公共面 | `renderer` · `common/renderer` · 其它模块内部文件 |
| `modules/*/preload` | `common/shared` · 本模块 `shared` | 业务逻辑；暴露任意 Node 能力 |
| `modules/*/worker` | `common/shared` · 本模块 `shared/worker` · 其它模块 `shared/worker` 公共面 · Pi SDK | DB、`main`、`renderer`、主进程内部模块 |
| `modules/*/renderer` | `common/{shared,renderer}` · 本模块 `shared/renderer` · 其它模块 `shared/renderer` 公共面 | `main` · `worker` · `common/main` · 其它模块内部文件 |
| `src/main|preload|renderer` 入口壳 | 各模块公共面（仅装配） | 承载领域规则、SQL、状态机 |

判定（按本节约束人工评审）：
- `common/*` import `@modules/*` → 违规；`renderer` 出现 `@main` / `@preload` / `@common/main` / `@common/worker` → 违规；`worker` import `@main` → 违规。
- 跨模块引用只允许 `@modules/{domain}/{shared,main,preload,renderer,worker,i18n}` 公共入口；禁止内部文件（`i18n` 语言包与组合根装配除外）。
- 渲染层出现 `window.desk`（除 `common/renderer/api/index.ts`）、`fs`、`child_process` → 违规。
- 同一职责域在两个模块各有一份实现 → 违规；先确定唯一归属，再让调用方改走其公共入口。
- 组合根（`src/main/index.ts`、`src/main/ipc.ts`、`src/main/db.ts`、`src/main/i18n.ts`、`src/preload/index.ts`、`src/preload/deskApi.ts`、`src/renderer/src/main.ts`、`shell/router`、`shell/i18n`）是唯一允许同时装配多个模块的位置。

补充：
- **唯一持久化出口**：`getDb()` 只在 `common/main/db`；各域 `main/schema.ts` 定义表，`main/ddl.ts` 提供建表片段，`src/main/db.ts` 聚合。
- **运行时门面**：需要运行时能力时，`modules/{domain}/main/*` 编排 → agent 运行时 → worker；`modules/agent/worker` 提供沙箱与工具注册助手。
- **基础设施独立**：路径解析在 `common/main/config/paths.ts`；`db` 不反向依赖任何领域模块。
- **本地文件访问**：渲染层一律经 `common/renderer/utils/localFileUrl.ts#toLocalFileUrl()` 转 `desk-file://`，禁止 `file://`；新增文件类型需同步 `common/shared/fileTypes.ts` 与 `index.html` 的 CSP（`img-src` / `media-src`）。
- **IPC 三段式**：`modules/{domain}/shared/ipc.ts` 通道 → `main/ipc.ts` 注册 → `preload/index.ts` 暴露；`src/main/ipc.ts`、`src/preload/index.ts` 只聚合。
- **i18n**：公共词条在 `common/shared/i18n/locales`，领域词条在 `modules/{domain}/i18n/{zh,en}.json`；主进程由 `src/main/i18n.ts`、Worker 由 `modules/agent/worker/i18n.ts`、渲染层由 `shell/i18n/index.ts` 合并后注册。编辑器 / 主题等跨域共用词条放 `common/shared/i18n`。
- **目录监听**：file / note 共用 `common/main/utils/directoryWatcher.ts#DirectoryWatcher`；各域只做 IPC 边界校验与回调注入，禁止再各写一份 `fs.watch` 逻辑。
- **本地文件协议放行**：各域通过 `common/main/utils/localFileRoots.ts#registerLocalFileRoot` 登记允许根；`modules/platform` 只做协议 / Range / 路径校验，不感知 project、note 等具体域。
- **应用设置面板**：appCenter renderer 提供 `appSettings` 注册表；渲染层装配处登记「appId → 设置组件」，appCenter 不反向 import 子应用。
- **跨域数据**：禁止跨模块读取 `main/schema`；跨域统计 / 级联改为调用所属域 `main/index.ts` 导出的 service 函数。

### 1.4 模块边界与职责收拢（硬约束）

- **一个功能 = 一个模块**：service、契约、IPC、preload、store、页面/组件、文案、SQL、需求目录同属该模块。
- **职责域单一归属（收拢）**：同一职责域的数据读写、校验、归一、默认值、派生、编排与运行时状态，只在该域模块内实现；其它模块只能经其公共入口调用，禁止复制或降级重写。例：会话删除级联与运行时清理只在会话 service，面板只调入口。
- **跨进程归属**：同一域跨进程存在是允许的，但权威规则只在主进程 `modules/{domain}/main/*`；渲染层只保留展示态与交互态，禁止复制业务校验、默认值与状态机。
- **最小暴露面**：模块 `index.ts` 只导出调用方真实使用的 DTO / 行为入口；内部行结构、常量、辅助函数、子组件、缓存实现一律不导出，没有调用方就不导出。
- **不向调用方泄漏实现**：跨模块只传契约 DTO 与行为结果，不暴露表结构、SQL、内部协议、第三方 SDK 类型与缓存键。
- **单向依赖**：调用方向只能是「使用方 → 被复用模块」，禁止双向 / 循环依赖；共享逻辑下沉到真正低层（`common/shared` 或 `common/renderer`），不靠模块互引打补丁。
- **模块自包含**：页面放 `pages/`（页内弹窗内联）、模块内共享件放 `components/`、组合式函数放 `composables/`、纯函数放 `utils/`、跨模块出口放 `index.ts`。
- **components 纯净**：`common/renderer/components` 只放跨模块展示组件，禁止依赖 store、api、`@modules/*`；统一目录 + `index.vue` + barrel。
- **shell 受控依赖**：`renderer/src/shell` 可组合模块公共入口，禁止引用模块内部文件；shell 不承载领域规则。
- **外壳不承载域逻辑**：`shell/layout`、顶栏、路由与页面壳不实现域的默认值、校验、派生与状态流转，只装配模块公共入口。
- **跨模块只走公共面**：模块 `shared/main/preload/renderer/worker` 的 `index.ts`；禁止 import 其它模块内部文件；`i18n` 仅由组合根读取。路由挂载页面是组合根行为，可引用模块 `pages/`。
- **重构以收拢为默认动作**：发现同职责散落时，先定唯一归属模块 → 实现迁入 → 调用方改走公共入口 → 删除副本；禁止「新写一份、旧的不动」。
- **收拢不等于提前泛化**：归属唯一针对同一职责域；跨域相似但边界不同的实现可保留，抽象仍按 `AGENTS.md` 的「第三次」原则。
- **上移条件**：`components / composables / utils` 被 **2 个及以上模块**使用才上移到 `common/renderer` 对应目录。
- **目录规模**：模块单个进程子目录 ≤20 个文件；超限按子业务拆分（参考 `mcp/worker`、`skill/main/github`）。
- **禁止桶文件**：`utils.ts / common.ts / helpers.ts / manager.ts` 不得承载多领域逻辑，文件名必须表达领域语义。
- **会话级 UI 状态**：跨面板/跨页面的会话态放 `modules/toolPanel/renderer/store`（以及 file/git/terminal 子域 store）与 `createSessionScopedStorage`，不放组件局部或全局单例。
- **闭环检验**：改一个功能应只动「模块目录 + 其契约 + 调用方」；若要动 3 个以上模块，先重划边界。
- **适配器扩展**：多实现场景用「接口 + 注册表」，新增实现只加文件、不改调用方。

### 1.5 落位速查

落位前先判定职责域：一个需求涉及多个域时按域拆到各自模块，不新建「跨域公共模块」；域内实现只落在归属模块。

| 新增内容 | 落位 |
|---|---|
| 领域 DTO / 通道 / Api 类型 | `modules/{domain}/shared/{contracts,ipc,api}.ts` |
| 跨域纯函数 / 常量（分页、快捷动作、文件类型、URL 归一） | `common/shared/*.ts` |
| 跨进程布局常量（窗口最小宽度、顶栏高度） | `common/shared/*.ts`，主进程与渲染层共用 |
| 主进程业务与编排 | `modules/{domain}/main/*.ts` |
| 内置应用注册 / 安装启用 / 配置 | `modules/appCenter/{shared,main,preload,renderer}`（`desk_app_setting`） |
| 子应用（如笔记） | `modules/apps/{appId}/`，路由 `/apps/{appId}` |
| 平台能力（外壳 / 更新 / 运行时 / 文件协议） | `modules/platform/{shared,main,preload}` |
| 应用设置面板注册 | `modules/appCenter/renderer/appSettings.ts` + `shell/appSettings.ts` 装配 |
| 目录监听（file / note 等） | `common/main/utils/directoryWatcher.ts#DirectoryWatcher`，域内只做 IPC 校验与回调 |
| 跨模块编辑器 / Markdown 组件 | `common/renderer/components/{CodeEditor,MarkdownBlock}/` |
| Agent 配置 / 项目长期记忆 | `modules/agent/main/{agentService,agentMemoryService,seed}.ts`（`desk_agent`；记忆随 `desk_project.memory*` 保存） |
| 领域运行时门面 / 审批 / 社区抓取 | `modules/{domain}/main/*`（Agent 运行时在 `modules/agent`） |
| Agent 工具 / 会话 / MCP | `modules/{agent,mcp,skill,file,browser}/worker/*` |
| IPC 注册 | `modules/{domain}/main/ipc.ts`，由 `src/main/ipc.ts` 聚合 |
| preload 能力片段 | `modules/{domain}/preload/index.ts`，由 `src/preload/index.ts` 聚合 |
| DeskApi 类型聚合 | `src/preload/deskApi.ts` |
| 渲染能力入口 | `common/renderer/api/index.ts` |
| 跨模块组件 | `common/renderer/components/{Name}/index.vue` |
| 布局骨架 / 区域组件 | `renderer/src/shell/layout/{,components/}` |
| 跨模块组合式函数 / 纯工具 | `common/renderer/{composables,utils}` |
| 模块页面 / 模块内组件 | `modules/{domain}/renderer/{pages,components}` |
| 模块壳级宿主（跨路由常驻） | `modules/{domain}/renderer/components/hosts/` |
| 模块状态 | `modules/{domain}/renderer/store.ts`（复杂域用 `store/`） |
| 公共文案 | `common/shared/i18n/locales/{zh,en}.json` |
| 领域文案 | `modules/{domain}/i18n/{zh,en}.json` |
| 颜色 / 尺寸令牌 | `common/renderer/styles/tokens.scss` |

## 2. 代码约束

> **[硬]** 违反打回；**[软]** 为评审阈值，超限需说明理由。
> 取值参考：ESLint `max-lines`、SonarQube 默认阈值、Vue 官方风格指南、Node.js 最佳实践。

### 2.1 契约与数据 [硬]

- 跨进程只传 `modules/{domain}/shared/contracts.ts` 的 DTO；禁止 `any` / 匿名对象穿透 IPC。
- 通道命名 `desk:{module}:{action}`，定义在 `modules/{domain}/shared/ipc.ts`；时间统一 ISO；DTO 布尔由 INTEGER 归一。
- 只传可结构化克隆的纯数据：不传 Error、类实例、Vue 响应式代理；必要时深拷贝。
- **单一数据源**：同一配置只有一处权威存储；派生字段保存时统一重生，不允许两处并存。
- **写库结构必须合法**：写入前保证下游可消费；历史脏数据在读取边界归一化。
- 结构变更两处同步：`modules/{domain}/main/schema.ts` 与 `modules/{domain}/main/ddl.ts`（仅面向全新安装，不做旧库迁移）。
- 敏感值不落明文、不进日志；列表脱敏，编辑态才解密。
- **SQLite 无外键级联**：删除父记录（项目 / 会话 / 消息 / 终端）必须由所属 service 手动级联并清理运行时，禁止依赖数据库约束。
- **会话双绑定**：`desk_session.project_id / agent_id` 均为数字且创建后不可修改；新建会话必须同时选择项目与 Agent，运行时按会话 `agent_id` 读取系统指令、SKILL、MCP 与内置工具开关，禁止把能力配置再冗余存进会话。
- **Agent 是能力编排实体**：`desk_agent` 保存指令、`skill_ids / mcp_ids` 与工具分类开关；会话装配只能取 Agent 已选资源，Agent 保存后由 `agent/main/ipc.ts` 清理绑定会话运行时，下一轮重新装配。
- **项目记忆按项目维度**：`desk_project.memory_enabled` 控制注入，记忆正文与游标随 `desk_project` 行保存；记忆内容变更后清理项目下会话运行时，禁止在会话表另存一份记忆。
- **上下文分项只存会话级**：`desk_session.context_breakdown` 是唯一来源，`desk_message.data` 只保存 Pi 原始消息；分项为估算值，删除消息时清空，下一轮重新采集，禁止把 UI 派生字段塞回消息对象。
- **跨进程文案**：主进程 / worker 的用户可见错误用 `common/shared/i18n` 的 `translate(language, 'runtime.*')`；新增文案禁止硬编码中文（存量待收敛）。

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

- **单一数据源**：JS 侧尺寸只取 `common/renderer/config/layout.ts#LAYOUT`，CSS 侧取 `common/renderer/styles/tokens.scss`；同一尺寸在两处出现时，改动必须同步，并在注释标注权威方。
- **跨进程共享尺寸**（窗口最小宽度、顶栏高度等）下沉 `common/shared/`，主进程直接引用常量计算，禁止写魔法数（如窗口 `minWidth`）。
- **布局不变量**（2026-11 基线）：
  - 图标栏 44px；按需独立于顶栏高度，不共用同一 token；
  - 子菜单：默认 240px、最小 150px、最大由会话区约束；
  - 工具面板：默认视口 50%、最小 150px；文件工具展开目录树时最小 300px；
  - 会话区：最小 400px，任一面板拖动 / 窗口缩放都必须成立；
  - 文件树：默认 240px、最小 150px；文件正文：最小 150px；
  - 窗口最小宽度需满足上述最小值之和（当前 44 + 150 + 300 + 400 = 894，取 900）。
- **工具面板宽度约定**：`0` 表示「自动按视口比例」，正数表示用户自定义像素；复位回到自动，不要写死旧默认值。
- **约束只在 `common/renderer/config/layout.ts` 推导**：`sidebarWidthMax` / `toolPanelWidthMax` / `toolPanelMinWidth` 为纯函数；composable 只做 store 读写与响应式装配，组件内禁止重复硬编码 min/max。
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
4. **主进程落位**：`modules/{domain}/main/*.ts` + `shared/contracts|ipc|api` + `preload/index.ts`；需要运行时再加 `main/runtime.ts` 与 `worker/*` 实现。
5. **渲染进程落位**：`modules/{domain}/renderer` 的 store + 页面/组件 + routes + 文案。
6. **验证**：按 §7 执行（`type-check` → `build` → 端到端）；完成后清理测试数据并恢复用户状态。

`方案.md` 最小结构：需求结论 / 数据库设计 / 后端改动 / 前端改动 / 验证结果。

## 4. 落位清单

### 4.1 领域模块 6 件套（业务 `Widget` → `widget`）

```
modules/widget/
├── shared/
│   ├── contracts.ts          WidgetDTO 等跨进程契约
│   ├── ipc.ts                WIDGET_IPC 通道常量
│   ├── api.ts                WidgetApi 类型
│   └── index.ts              本域公共契约出口
├── main/
│   ├── schema.ts             Drizzle 表结构
│   ├── ddl.ts                建表片段
│   ├── widgetService.ts      CRUD / 编排；经 common/main/db#getDb()
│   ├── ipc.ts                registerWidgetIpc(ipc)
│   └── index.ts              主进程公共出口
├── preload/index.ts          widgetApi 片段
└── renderer/
    ├── pages/index.vue
    ├── components/
    ├── store.ts              （复杂域用 store/）
    └── index.ts              渲染层公共出口
```

```ts
/* shared/ipc.ts */
export const WIDGET_IPC = {
  list: 'desk:widget:list',
  save: 'desk:widget:save',
  remove: 'desk:widget:remove'
} as const

/* shared/api.ts */
export interface WidgetApi {
  list(): Promise<WidgetDTO[]>
  save(dto: Partial<WidgetDTO>): Promise<WidgetDTO>
  remove(id: string): Promise<void>
}
```

```ts
/* main/widgetService.ts：行 → DTO、list/save/delete；save 以 onConflictDoUpdate 幂等写入 */
import { getDb } from '@common/main/db'
import { widgetTable } from './schema'

export function saveWidget(input: Partial<WidgetDTO>): WidgetDTO {
  const db = getDb()
  const now = new Date().toISOString()
  const id = input.id || randomUUID()
  const existing = db.select().from(widgetTable).where(eq(widgetTable.id, id)).get()
  const record = {
    id,
    name: input.name ?? existing?.name ?? '',
    enabled: (input.enabled ?? (existing ? existing.enabled === 1 : true)) ? 1 : 0,
    addTime: existing?.addTime ?? now,
    updateTime: now
  }
  db.insert(widgetTable).values(record)
    .onConflictDoUpdate({ target: widgetTable.id, set: record }).run()
  return toDTO(record)
}
```

```ts
/* main/ipc.ts：只注册与转发；运行时失效/清理在 service 内完成 */
export function registerWidgetIpc(ipc: IpcContext): void {
  ipc.handle(WIDGET_IPC.list, () => listWidgets())
  ipc.handle(WIDGET_IPC.save, (_e, dto: Partial<WidgetDTO>) => saveWidget(dto))
  ipc.handle(WIDGET_IPC.remove, (_e, id: string) => deleteWidget(id))
}
```

```ts
/* preload/index.ts */
export const widgetApi: WidgetApi = {
  list: () => ipcRenderer.invoke(WIDGET_IPC.list),
  save: (dto) => ipcRenderer.invoke(WIDGET_IPC.save, dto),
  remove: (id: string) => ipcRenderer.invoke(WIDGET_IPC.remove, id)
}
```

组合根：`src/main/ipc.ts` 调 `registerWidgetIpc(ipc)`；`src/main/db.ts` 聚合 `WIDGET_DDL`；`src/preload/index.ts` 把 `widgetApi` 挂到 `DeskApi.widget`；`src/preload/deskApi.ts` 增加 `widget: WidgetApi`。

### 4.2 渲染层 4 件套

| 文件 | 位置 | 说明 |
|---|---|---|
| store | `modules/{domain}/renderer/store.ts`（复杂域用 `store/`） | Pinia；只经 `api.{module}` 访问能力 |
| 页面/组件 | `modules/{domain}/renderer/{pages,components}` | 模块自包含 |
| 路由 | `renderer/src/shell/router/index.ts` | 组合根直接装配模块 `pages/`；子菜单路由按 `shell/config/nav.ts` 生成 |
| 文案 | `modules/{domain}/i18n/{zh,en}.json` | 公共词条走 `common.*`；领域词条放本域，zh/en 成对 |

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

- 能力访问统一 `import { api } from '@common/renderer/api'`；禁止直接 `window.desk`。
- 引用优先别名：`@common/*`、`@modules/*`、`@renderer/*`；禁止 3 层以上 `../`。
- 模块对外只经 `shared/main/preload/renderer/worker` 的 `index.ts` 暴露；跨模块禁止内部文件。
- 组件 PascalCase；文案规范（`t()`、zh/en 成对、`common.*` 复用、插值）以 `AGENTS.md`「国际化」为准。
- 落位、模块边界与目录语义见 §1.2–§1.5，此处不重复。

## 5. 界面外壳

```
shell/layout/index.vue（app-wrapper，纵向）
├─ Navbar        全局顶栏（固定最顶部，整体 -webkit-app-region: drag）
└─ app-body（横向）
   ├─ Sidebar     SidebarRail（常驻图标栏）+ SidebarContent（可折叠/可拖拽内容区）
   │              └─ SidebarContent：ChatSidebarPanel（首页）/ SidebarMenu（插件、设置）
   └─ AppMain     正文（RouterView）
```

- **术语边界**：`layout` 指应用外壳；`nav` 指导航；`sidebar` 指左侧整列；`rail` 指图标栏；`panel` 只指正文内可调整尺寸的面板（工具/终端/文件/浏览器）；`shell` 只用于操作系统 shell（`api.shell`、`desk:shell:*`）。
- **导航单一来源**：板块 ↔ 入口路径 ↔ 顶栏标题 ↔ 子菜单项均在 `renderer/src/shell/config/nav.ts`（`NAV_SECTIONS` / `SECTION_ENTRY` / `SECTION_ICON`）。新增板块需同步：`nav.ts`、`SidebarRail` 按钮、路由与正文页。
- **顶栏**：左侧依次为首页图标（纯展示标识，不提供跳转与浮层）与软件名称（`appName` 优先、回落 `app.name`），其后为板块图标 + 标题/操作，标题随路由（首页=会话标题，插件=「插件」，设置=「系统设置」，应用页=应用名称）；软件名称与标题间的细线仅在有标题时展示；交互控件 `no-drag`。顶栏标题只做展示，不重复会话重命名 / 删除等侧栏已有操作。
- **子菜单**：标题 18px/600，条目 14px/400，选中项 600 + 浅底；不展示 Logo；图标栏常驻。切换板块时子菜单直接跳变并默认展开，只有重复点击当前板块按钮才播放折叠 / 展开动画。
- **布局不承载域逻辑**：域内逻辑下沉 `modules/{domain}/renderer`；`SidebarContent` 是唯一装配侧栏域内容的位置。
- **布局不承载启动逻辑**：`App.vue` 只组装外壳；全局快捷键、设置/项目/会话初始化、会话生命周期与更新检查在 `shell/composables/useAppBootstrap.ts`。
- **面板宽度约束**：左侧子菜单栏与右侧工具面板均按像素持久化；子菜单栏最小 150px，工具面板最小 150px（文件工具展开目录树时 300px），二者上限都要为会话区保留 400px。
- **工具面板统一入口**：文件 / Git / 终端 / 浏览器均为右侧工具面板的 Tab，顺序为文件、Git、终端、浏览器；开发者模式追加「诊断」Tab，关闭后回退文件面板。
- **面板交互统一复用**：拖拽用 `common/renderer/composables/usePanelResize.ts` + `shell/layout/components/PanelResizer/index.vue`；左侧栏宽度走 `shell/stores/layout.ts`，工具面板宽度、文件树宽度等会话级尺寸走 `modules/toolPanel/renderer/store`（按会话持久化）；文件树与文件内容之间的拖拽复用 `PanelResizer`。
- **共享选中态归属域**：跨「子菜单 ↔ 页面」的选中态放所属域 store（如 `modules/settings/renderer/store` 的 `activeTab`），不塞进 `layout`。
- **配色分层**：`--desk-chrome-bg`（顶栏+图标栏）> `--desk-panel-bg`（子菜单栏）> `--desk-bg`（正文）；不加分隔线，仅「子菜单栏 ↔ 正文」保留 1px `--desk-border`。
- **尺寸令牌**：`--desk-header-height`、`--desk-rail-width`、`--desk-sidebar-width`、`--desk-terminal-height`、`--desk-panel-header-height`；JS 侧尺寸统一取 `common/renderer/config/layout.ts#LAYOUT`；自绘 SVG 统一 `.desk-svg-icon`，尺寸由使用处覆盖。
- **字体层级**：文字统一使用 `--desk-font-{xs,sm,base,md,lg,xl}`，图标字号使用 `--desk-icon-md`；禁止在组件内新增绝对 px 字号。

### 5.1 应用中心与内置应用

- `modules/appCenter`：内置应用注册表（`shared/registry.ts`）、安装 / 启用 / 配置（`desk_app_setting`）、我的应用 / 应用市场页面。安装与启用分离：安装决定是否出现在「我的应用」，启用决定是否出现在图标栏。
- 子应用统一放 `modules/apps/{appId}/`，路由 `/apps/{appId}`；子应用之间、外壳与子应用之间只经各自 `index.ts` 公共入口交互。
- 应用自身页面（如 `/apps/note`）**不渲染外壳子菜单**，图标栏右侧直接是应用功能；管理页（我的应用 / 应用市场）仍保留「应用中心」子菜单。
- 图标栏应用入口按注册表顺序追加，与固定入口用分隔线隔开；无启用应用时整条分隔线不渲染。顶栏标题取当前应用名称。
- 应用设置面板：appCenter renderer 维护 `appSettings` 注册表，渲染层装配处（`shell/appSettings.ts`）按 `appId` 登记设置组件；新增应用不修改 appCenter 页面，也不产生 appCenter → 子应用的反向依赖。
- 平台能力模块为 `modules/platform`（原 `modules/app`）：系统外壳、更新、运行时环境与 `desk-file` 协议机制。
- **内置「笔记」参考实现**：
  - 目录树只展示目录与 `.md`，根级 `resource` 与隐藏项不展示；
  - 目录树实时监听复用 `common/main/utils/directoryWatcher.ts`（按已展开目录非递归监听，50ms 去抖），渲染层只重载变更目录；
  - 笔记渲染层 `store` 负责监听生命周期（`bindWatcher` / `unbindWatcher`），组件只处理 UI；
  - 工具栏为三段式：左树开关、中视图切换、右查找/插图/主题/文章目录；文章目录为浮动面板，仅再次点击图标关闭；
  - 编辑器主题与文件工具共用 `EDITOR_THEME_STORAGE_KEY`（`common/renderer/components/CodeEditor/editorThemes.ts`）。

## 6. Agent 运行时

新增 Agent 能力落 `src/modules/agent/`，按进程归属落位；工具/会话扩展不需要新 IPC，只有新增跨进程能力才动 `modules/agent/shared/agentProtocol.ts` 与各模块 `main/ipc.ts` / `preload/index.ts`。

| 需求 | 落位 | 要点 |
|---|---|---|
| Agent 配置 | `modules/agent/main/{agentService,seed}.ts` | `desk_agent` 保存名称 / 指令 / SKILL / MCP / 工具分类；默认内置 Agent 禁删，被会话占用禁删 |
| 项目记忆 | `modules/agent/main/agentMemoryService.ts` + `modules/agent/worker/memory.ts` | 记忆随 `desk_project` 行保存，按 `memory_enabled` 注入；生成与消费解耦 |
| 会话压缩 | `modules/chat/main/sessionSummaryService.ts` + `modules/agent/worker/summary.ts` | 摘要存 `desk_session.summary*`；无摘要 / 上下文 ≥80% / 摘要后轮次 ≥20 时异步压缩 |
| 上下文分项 | `modules/agent/worker/session.ts` + `modules/chat/main/sessionService.ts` | 每次响应用估算值（CJK 1 token/字、其余 4 字符/token）回传；存 `desk_session.context_breakdown`，每轮更新，删除消息时清空 |
| 内置工具 | `modules/{file,browser,agent,skill}/worker/*` | `createBuiltinToolEntries()` 用 `Type.Object` 定义 `AgentTool`；只读工具常驻，写 / 命令类需「工作区内修改」及以上权限；是否进入「内置工具」页见 §6.1 |
| 文件类工具 | `modules/file/worker/*` + `modules/agent/worker/sandbox.ts` | 必须先过 `guardPath({ sessionId, rootDir, target, action, tool, permissionMode, trustedRoots })`，越界返回拦截错误 |
| 越界审批 | `modules/agent/worker/{sandbox,hitl}.ts` + `modules/agent/main/host/interaction.ts` | worker 经 `parentPort` 发 `interaction-request`，主进程转渲染层在输入框位置内联展示审批面板（按会话隔离），回传 `allow`（可 `remember`）/ `deny` |
| MCP | `modules/mcp/worker/*` | 使用 Pi 官方 `@earendil-works/pi-mcp`；工具转换 `toLlmContent` + `Type.Unsafe` + `signal`；只装配 Agent 选中的服务 |
| 会话装配 | `modules/agent/worker/session.ts` | 会话级 Agent 缓存 + 事件流 + 工具合并；systemPrompt = Agent 指令 + 长期记忆 + 会话摘要 + SKILL 索引 + 权限/工具约束 |
| 工具注册表 | `modules/agent/worker/tools/index.ts` | 按 `ToolGroup` 聚合工厂，`createBuiltinToolEntries()` 统一按权限 / 开关过滤并裁剪输出；`toolkit.ts` 提供 `ALL_PERMISSIONS` / `WRITE_PERMISSIONS` / `describe` / `toolError` / `createGuard` |
| 协议 | `modules/agent/shared/agentProtocol.ts` | 改 `HostEvent`/`WorkerRequest` 需同步 worker.ts、session.ts、runtimeHost.ts |
| 模型 | `modules/agent/worker/models.ts` | `normalizeBaseUrl`、`buildModels`、`{session}` 占位替换 |

工具结果 `content` 为文本块数组；失败用 `isError: true`。新增工具必须自测越界拦截与「仅可查看」权限下不可见。

### 6.1 内置工具目录的产品边界（硬约束）

「扩展中心 → 内置工具」是**产品能力目录**，不是 `modules/agent/worker/tools` 注册表的镜像。收录项须同时满足：

1. 由客户端自身提供，不是外部 MCP / 插件动态接入；
2. 是独立能力，不是其它功能的内部实现（如 `read_skill` 仅服务 SKILL）；
3. 用户可理解、可能需要管理（开关 / 权限档位）；
4. 不与已有管理页重复（MCP → MCP 页，SKILL → SKILL 页）。

判定顺序：**先问用户是否应在此页看到并管理，再看代码里有没有。**

- 展示：`fs` / `shell` / `browser` / `general` / `interaction` 等客户端核心能力；
- 不展示：MCP 工具、`read_skill` 等插件内部工具、仅服务单一业务模块的辅助 Tool；
- 分类与工具清单按产品白名单维护，不按工具工厂输出自动展开。

### 6.2 沙箱与信任边界 [硬]

- **权限档位优先**：`read-only` 全局可读、禁止写 / 命令；`workspace-write` 全局可读，仅项目目录与系统临时目录可直接写，其它写入走越界审批；`full-access` 全局读写。
- **信任域**：会话项目目录（读 / 写 / 命令）与技能库 `{dataDir}/skills`（读 / 写 / 命令，完全信任）；`workspace-write` 下项目目录与系统临时目录属于直接放行范围，其它越界写入走审批。
- **敏感路径兜底**：系统目录与用户凭据目录（`~/.ssh` 等）即使 `full-access` 也不允许写入，由 `protectedPathOf` 统一拦截。
- **技能库读取权限 ≠ 技能启用状态**：
  - 技能库整库永远可读（含未启用技能、技能根目录列举），不得弹审批；
  - 「启用」只决定提示词注入与 `read_skill` 是否可用（使用权限）；
  - 禁止用「是否启用」限制 `read_file` / `list_directory` / 技能库读取。
- **技能根目录由主进程每轮下发**（`RunAgentInput.skillsDir`）；工具侧禁止自行推断或拼接技能目录。
- **越界审批只走统一闸门**：`guardPath` → `hitl` → 主进程 → 渲染层；新增文件 / 命令工具必须复用 `createGuard` / `guardPath`，禁止自写路径判断。
- **`run_command` 的路径识别只防误操作，不是安全边界**：动态展开（`$VAR`、命令替换）、解释器（`python -c`、`sh -c`）无法覆盖；不要为它叠加脆弱的「只读命令白名单」或其它启发式解析。
- **会话信任粒度**：`sessionTrusted` 仅在 `workspace-write` 的越界审批中生效，为会话级全量放行；后续扩展必须收敛为「目录 + 动作」粒度，避免一次授权放大到全部读写命令。

### 6.2.1 人机交互展示与生命周期 [硬]

- **内联而非弹窗**：权限审批与 `ask_user` 统一占用输入框位置展示（`InteractionPanel`），不再使用全局模态对话框；`App.vue` 不挂交互宿主。
- **按会话隔离**：交互队列按 `sessionId` 分组，只展示当前会话的请求；其它会话的请求留在各自队列，切回时再展示，禁止跨会话抢占输入区。
- **标题与配色固定**：权限审批标题固定「权限审批申请」、淡红色系；`ask_user` 标题固定「用户确认」、黄色系；两类共用同一卡片布局。
- **多问题**：`ask_user` 支持 `questions` 数组（1~10 个），由 worker 逐题发起并回传；契约使用 `round` / `total`，渲染层在左下角展示 `1/N`。
- **取消只走显式路径**：用户终止、删除会话、运行时重置 / 退出才取消交互；运行期间后台摘要、长期记忆或配置刷新触发的 `evict` 必须延后到本轮结束（`runtimeHost.pendingEvictions`），禁止取消正在等待的审批。
- **清理闭环**：会话删除 / 级联删除后同时清理交互队列；新增交互类型必须复用同一队列与卡片，不再新建弹窗。

### 6.3 Agent 配置与会话绑定 [硬]

- **Agent 是能力编排实体**：`desk_agent` 持有 `system_prompt`、`skill_ids`、`mcp_ids` 与五类内置工具开关；MCP / SKILL / 内置工具本身仍是独立域，Agent 只保存引用与开关。
- **会话创建即绑定**：新建会话必须选择项目与 Agent；`desk_session.agent_id` 创建后不可修改，运行时的指令、SKILL、MCP、内置工具全部按该 Agent 读取。
- **权限来源唯一**：`chat/main/chatService.ts` 只从会话绑定的 Agent 取能力，禁止再读全局工具开关或把配置复制到会话；Agent 缺失直接报 `runtime.agentMissing`。
- **实时生效**：Agent 保存后清理绑定会话的运行时缓存（`evictAgent`），长期记忆 / 记忆开关变更清理项目下会话运行时；摘要生成后清理当前会话运行时；下一轮重新装配，已发生消息不受影响。
- **删除约束**：默认内置 Agent（`builtin=1`）禁删；仍被会话引用的 Agent 禁删，并提示关联会话数。
- **项目记忆归属**：记忆随项目行保存（`desk_project.memory*`），由 `desk_project.memory_enabled` 控制是否注入；手动管理入口在「系统设置 → 项目」，不在 Agent 页另建一份。
- **新增 Agent 能力时**：契约加在 `modules/agent/shared/contracts.ts`，持久化加在 `agent/main/{schema,ddl,agentService}.ts`，装配只在 `chatService` / `worker/session` 消费，禁止在渲染层拼装系统提示。

## 7. 校验清单

- [ ] 需求目录 `xxl-ai-spec/{yyyyMMdd}-{module}/` 存在，`方案.md` 与 SQL 同步。
- [ ] 结构一致：`modules/{domain}/main/schema.ts` / `ddl.ts`，并由 `src/main/db.ts` 聚合。
- [ ] `common/main/db#getDb()` 是唯一持久化出口；`src/main/ipc.ts` / `src/main/db.ts` / `src/main/i18n.ts` / `src/preload/index.ts` / `shell/router` / `shell/i18n` 仅聚合；契约 / IPC 常量 / Api / preload 齐备。
- [ ] 依赖方向符合 §1.3；配置与运行时未耦合；运行时使用官方方案。
- [ ] 顶层目录保持 `src/common` + `src/modules`，未新增其它顶层分层或 `modules` 下的框架 / 业务嵌套层。
- [ ] 新增 `common` 内容满足「≥2 个领域使用且无业务规则」；`common` 内无领域名，单域逻辑未外溢。
- [ ] 领域文案在 `modules/{domain}/i18n`，公共词条在 `common/shared/i18n`，zh/en 成对。
- [ ] 同一职责域只有一处实现，跨模块仅经公共入口；`index.ts` 无未使用导出、无循环 / 双向依赖。
- [ ] 外壳、`src/main/ipc.ts`、调用方未承载域内校验 / 归一 / 默认值 / 级联清理。
- [ ] 新增/变更依赖为精确版本（无 `^` / `~` / 区间）；lock 当前被 `.gitignore` 忽略，如放开需同步提交。
- [ ] 通道 `desk:{module}:{action}`；时间 ISO；布尔归一。
- [ ] 会话已绑定项目与 Agent；能力只从 Agent 读取，Agent / 记忆变更后已清理关联会话运行时；默认与占用中的 Agent 未被删除。
- [ ] 上下文分项只存 `desk_session.context_breakdown`；`desk_message.data` 未被写入 UI 派生字段；删除消息后分项已清空。
- [ ] 渲染仅经 `api`；路由已登记；文案 `t()` / 主进程 `translate()` 且 zh/en 成对；无硬编码中文。
- [ ] 内置应用仅在 `appCenter` 注册表登记；安装 / 启用 / 配置统一走 `desk_app_setting`；应用页隐藏外壳子菜单、顶栏取应用名、启用后图标栏出现入口。
- [ ] 目录监听复用 `common/main/utils/directoryWatcher.ts`；渲染层只重载变更目录，页面对应 `bindWatcher` / `unbindWatcher`，退出时 `dispose` 清理。
- [ ] 侧栏导航：切换板块直接跳变并默认展开，只有重复点击当前板块才播放折叠动画；应用页直接收起，不播放动画。
- [ ] 「内置工具」仅收录客户端核心能力，未混入 MCP / SKILL 等插件内部工具。
- [ ] 人机交互按会话隔离并占用输入框位置；权限 / 用户确认标题与配色固定；多问题使用 `round` / `total`；后台 `evict` 已延后到本轮结束，未误取消审批。
- [ ] UI 复用 tokens/外壳/列表规范；弹层 append-to-body 且拖拽区可用；全局样式已验证影响面。
- [ ] 布局尺寸变更已同步 `common/renderer/config/layout.ts` 与 `common/renderer/styles/tokens.scss`；跨进程尺寸使用共享常量，无魔法数。
- [ ] 技能库读写不触发审批；`read_skill` 仍只认已启用技能；未新增脆弱的 shell 只读命令白名单。
- [ ] 资源生命周期闭环；超时/取消/失败隔离/进程无残留。
- [ ] `npm run type-check`、`npm run build` 通过；涉及 IPC/运行时完成端到端验证。
- [ ] 注释与命名符合既有风格；无死代码/调试残留/测试数据。

## 8. 参考实现

- 主进程：`modules/chat/main/chatService.ts`（编排）、`modules/chat/main/sessionService.ts`（CRUD + 级联）、`modules/agent/main/{agentService,agentMemoryService}.ts`、`modules/agent/main/host/runtimeHost.ts`
- 渲染：`modules/mcp/renderer/{pages,components}`（管理 + 发现）、`modules/chat/renderer/store/{index,stream}.ts`
- 内置应用：`modules/appCenter/**`（注册表 / 安装启用 / 市场）、`modules/apps/note/**`（目录树 / 编辑器 / 浮动目录 / 目录监听）
- 公共能力：`common/main/utils/directoryWatcher.ts`（目录监听）、`common/renderer/components/CodeEditor/`（编辑器与主题）
- 运行时：`modules/agent/worker/session.ts`、`modules/agent/worker/tools/index.ts`、`modules/agent/worker/toolkit.ts`
- 构建：`package.json`（`type-check` / `build` / `dev`）、`electron.vite.config.ts`
