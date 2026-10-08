---
name: xxl-ai-desk
description: 在 XXL-AI 本地版（Desk 桌面客户端，xxl-ai-desk，Electron + Vue3 + Pi + SQLite/Drizzle 三进程架构）下新增或改造业务模块。当任务涉及修改 xxl-ai-desk/src/main（services/db/agent/ipc）、xxl-ai-desk/src/shared、xxl-ai-desk/src/preload 或 xxl-ai-desk/src/renderer/src（stores/modules/components/i18n）时加载本技能。
---

# XXL-AI Desk · 本地版（桌面客户端）开发 Skill

目标：把 XXL-AI 的 **本地版 `xxl-ai-desk`**（Electron + Vue3 + Pi + SQLite/Drizzle）当作脚手架，规范、快速地新增/改造一个本地业务能力。本 Skill 覆盖「需求确认 → 数据结构 → 主进程 → 渲染进程 → i18n → 验证」全流程，含落位清单、代码骨架与校验清单。

> ⚠️ **与云版区分**：本 Skill 只服务 **本地版（Desk）**。云版（`xxl-ai-api` + `xxl-ai-ui`，Spring Boot + Vue3 Web）请加载 `xxl-ai` Skill。二者**完全独立**、互不依赖：Desk 不连 MySQL / Redis / Milvus，无平台菜单/角色权限体系。

## 何时使用

- 在 `xxl-ai-desk` 下新增或改造一个本地业务能力（典型为「本地 CRUD + IPC 通道 + 界面」）。
- 只新增主进程能力（service + IPC + 共享类型）而不动界面时，取「主进程落位」一节。
- 新增 Agent 内置工具、文件沙箱能力、终端 / 文件 / 浏览器面板能力时，取「Agent 运行时」一节。
- 改造对话 / 会话 / 供应商 / 项目 / 设置等既有模块时，按对应落位清单增量修改。

## 前置：三进程架构与工程结构速览

```
┌────────────────────────────────────────────────────────────┐
│ Renderer（Vue3 + Element Plus，无 Node 直连）               │
│  stores(Pinia) · modules(pages) · components · i18n         │
└───────────────▲────────────────────────────────────────────┘
                │ contextBridge（preload 暴露 window.desk.*）
┌───────────────┴────────────────────────────────────────────┐
│ Main（Electron 主进程，Node / CJS）                          │
│  ipc.ts（通道网关） · services/*（业务） · db/*（SQLite）    │
│  agent/runtime.ts（托管运行时进程 + 越界审批弹窗）           │
└───────────────┬────────────────────────────────────────────┘
                │ utilityProcess + parentPort 结构化消息
┌───────────────▼────────────────────────────────────────────┐
│ Agent 运行时进程（utilityProcess，Node / CJS）              │
│  agent/host.ts · tools.ts · sandbox.ts · models.ts · worker │
└────────────────────────────────────────────────────────────┘
```

```
xxl-ai-desk/
├── electron.vite.config.ts              ← 三进程构建配置（主进程双入口：index + agent/worker）
├── electron-builder.yml                 ← 打包配置
└── src/
    ├── main/                            ← 主进程（Node）
    │   ├── index.ts                     ← 入口：窗口 / 生命周期（app.whenReady → 初始化数据库 → 预置供应商 → 注册 IPC → 建窗）
    │   ├── ipc.ts                        ← 全部 IPC handler 注册（网关；薄编排）
    │   ├── security.ts                   ← API Key 本地编解码（safeStorage）
    │   ├── db/
    │   │   ├── schema.ts                 ← Drizzle 表结构（业务实体）
    │   │   └── index.ts                  ← better-sqlite3 初始化 + DDL + 迁移
    │   ├── services/{module}Service.ts   ← 业务服务（CRUD / 编排）＝「business」
    │   │   └──（settings/provider/session/project/fs/fsWatch/terminal/openWith/storage）
    │   └── agent/                        ← 运行时支撑＝「harness」
    │       ├── runtime.ts                ← 主进程侧托管 utilityProcess + 审批转发
    │       ├── worker.ts                 ← 运行时进程入口（parentPort 消息循环）
    │       ├── host.ts                   ← 会话级 Agent 缓存 + 事件流
    │       ├── tools.ts                  ← 内置工具装配（按 Plan/Build 模式）
    │       ├── sandbox.ts                ← 文件沙箱 guardPath + 越界白名单
    │       ├── models.ts                 ← 供应商 → Pi Models 构建
    │       └── approval.ts               ← 越界审批（原生对话框）
    ├── preload/
    │   ├── index.ts                      ← contextBridge 暴露 window.desk（白名单）
    │   └── index.d.ts                    ← window.desk 类型声明
    ├── shared/
    │   ├── ipc.ts                        ← 主/预加载/渲染共享 DTO + IPC 常量 + DeskApi 接口
    │   └── agentProtocol.ts              ← 主进程 ⇄ 运行时进程协议
    └── renderer/src/                     ← 渲染进程（Vue3）
        ├── api/index.ts                  ← `export const api = window.desk` 统一入口
        ├── stores/{module}.ts            ← Pinia store（状态 + 调用 api）
        ├── modules/{module}/pages/*.vue  ← 页面
        ├── components/*.vue              ← 共享组件（Sidebar/MessageItem/ChatComposer/panel/*）
        ├── composables/*.ts              ← 组合式函数
        ├── types/index.ts                ← 渲染进程 UI 类型（UiMessage/MessagePart/ToolCallState）
        ├── router/index.ts               ← Hash 路由（新增页面需登记路由）
        └── i18n/locales/{zh,en}.json     ← 文案（`t()` 引用）
```

## 分层铁律（Desk 版「business / harness」边界）

云版用 `business/{module}` + `business/harness` 分层；Desk 版对应关系如下，**两条铁律同样适用**：

| 云版 | Desk 版 | 职责 |
|---|---|---|
| `business/{module}`（功能完备，含 Controller） | `src/main/services/{module}Service.ts` | 业务 CRUD 与编排（校验、级联、DTO 组装）；**唯一持久化出口** |
| `business/harness`（无 Controller） | `src/main/agent/*` | 运行时支撑：模型构建、对话执行、工具装配、文件沙箱、进程托管；**不做业务 CRUD** |
| `@RestController` | `src/main/ipc.ts` | 对外操作入口（IPC handler）；薄网关，委托 service / runtime |
| `@XxlSso` + `Response` | `src/shared/ipc.ts` 的 `IPC` 常量 + DTO | 契约（通道名 + 出入参类型） |
| —— | `src/preload/index.ts` | 白名单暴露 `window.desk.*` |

判定（一句话）：这段逻辑是不是「业务编排」（校验、读写业务状态、组装返回）？是 → 落 `src/main/services`；它调用的**底层调用/执行能力**（HTTP、模型 SDK、进程、文件沙箱、终端 PTY、对话流）→ 落 `src/main/agent` 或独立 service。

- **service 只做业务与持久化**：所有 `getDb()` 调用集中在 `services/*`；`agent/*` 不得直接建表/改业务数据（可经 service 读取配置，如 `getProvider` 属预期依赖）。
- **ipc.ts 是网关**：只做参数透传、必要编排（如 `chat:send`）、错误兜底；不写业务规则。
- **渲染进程无 Node 能力**：一切能力经 `window.desk.*`；新增能力必须同时改 `shared/ipc.ts`（类型 + 通道常量 + DeskApi）与 `preload/index.ts`。
- **逆向约束**：`agent/*` 不定义 IPC handler；`services/*` 不直接依赖 `electron` 之外的渲染/运行时实现（需要主进程能力 —— 对话框、shell、窗口 —— 由 `ipc.ts` 编排注入）。

## 标准流程

0. **需求落盘（先建立）**：按「需求落盘（xxl-ai-spec）」在项目根 `xxl-ai-spec/{yyyyMMdd}-{business}/` 创建需求子目录，确认结论、方案、SQL 全部落入该目录。
1. **需求确认（第一步，必须）**：接到任务先不写代码，主动向用户确认需求细节，用户确认后再执行。至少确认：模块/能力命名；数据字段与唯一/校验规则；是否涉及主进程系统能力（对话框 / shell / 终端 / 文件）；页面形态（新增页面 / 改造既有页面 / 仅主进程）；三进程改动范围；验证范围（`type-check` / `build` / `dev` 联调）。确认结果即时回填 `方案.md`。
2. **数据结构**：新增表 → 同时更新 `db/schema.ts`（Drizzle）与 `db/index.ts` 的 `DDL`（新库直建）与 `migrate()`（旧库 `ensureColumn`/`dropColumn`）；SQL 脚本落需求子目录（如 `{business}-table.sql`）。
3. **主进程落位**：按「主进程落位清单」产出 `services/{module}Service.ts` + `ipc.ts` handler + `shared/ipc.ts` 契约 + `preload` 暴露。
4. **渲染进程落位**：按「渲染进程落位清单」产出 store / 页面 / 组件，并在 `router` 登记页面（如需）。
5. **i18n**：用户可见文案同步写入 `i18n/locales/{zh,en}.json`（zh/en 成对），页面 `t('key')` 引用。
6. **验证**：`npm run type-check`（主 + 渲染两侧）通过；`npm run build` 通过；必要时 `npm run dev` 联调菜单/CRUD/系统能力；结果回填 `方案.md`。

## 需求落盘（xxl-ai-spec）

每个需求在项目根 `xxl-ai-spec/` 下生成一个需求子目录，把「方案 + SQL」沉淀其中：

1. **目录命名**：`xxl-ai-spec/{yyyyMMdd}-{business}/`（同日多需求用业务名区分，如 `20261007-desk-project`）。
2. **方案**：`方案.md`，按下方模板生成骨架随实现回填；
3. **SQL**：建表 SQL 落盘（如 `{business}-table.sql`，桌面端 SQLite DDL，随 `db/index.ts` 内置执行，不入总库）。

### plan.md 模板（Desk 版）

```markdown
# {能力名}开发方案（xxl-ai-desk）

> 需求目录：`xxl-ai-spec/{yyyyMMdd}-{business}/` | 日期：{yyyy-MM-dd}

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 本地版桌面端（`xxl-ai-desk`，Electron + Vue3 + Pi + SQLite） |
| 模块/能力命名 | `{module}`（主进程 `services/{module}Service` + 渲染 `stores/{module}` + 页面/组件） |
| 核心字段与业务规则 | 字段清单 + 必填/唯一/校验规则 |
| 系统能力 | 无 / 目录对话框 / shell 打开 / 终端 / 文件监听 |
| 页面形态 | 新增页面 / 改造既有页面 / 仅主进程 |
| 出码方式 | AI 按模板直生等价代码 |
| 验证范围 | `npm run type-check` / `npm run build` / `npm run dev` 联调 |

## 二、数据库设计
表：`desk_{business}`（SQLite，TEXT 主键 randomUUID）
| 字段 | 类型 | 说明 | 备注 |
|---|---|---|---|
| id | TEXT | 主键 | randomUUID |
| {field} | {TEXT/INTEGER} | {说明} | {必填/唯一/默认} |
| add_time | TEXT | 新增时间 | ISO |
| update_time | TEXT | 更新时间 | ISO |

索引/约束：`i_desk_{business}_xxx`。
迁移：新增列须同时更新 `db/index.ts` 的 `DDL` 与 `migrate()`。
SQL 脚本：`{business}-table.sql`

## 三、菜单 / 授权
桌面端无平台菜单/角色体系，无需注册。（如需页面入口，在 `router/index.ts` 登记路由。）

## 四、后端（主进程）改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `schema.ts` | src/main/db/ | 新增 Drizzle 表定义 |
| `index.ts` | src/main/db/ | DDL 建表 + migrate 补列/删列 |
| `{module}Service.ts` | src/main/services/ | CRUD + 业务编排；唯一 getDb 出口 |
| `ipc.ts` | src/main/ | 注册 `IPC.{module}*` handler |
| `shared/ipc.ts` | src/shared/ | DTO + `IPC` 常量 + `DeskApi.{module}` |
| `preload/index.ts` | src/preload/ | 暴露 `window.desk.{module}.*` |

## 五、前端（渲染进程）改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `stores/{module}.ts` | src/renderer/src/stores/ | Pinia store（状态 + 调用 api） |
| `modules/{module}/pages/index.vue` 或组件 | src/renderer/src/ | 页面/组件；`t()` 引用文案 |
| `router/index.ts` | src/renderer/src/ | 新增页面时登记路由（Hash） |
| `i18n/locales/{zh,en}.json` | src/renderer/src/i18n/ | 新增 `{module}.*` 文案（成对） |

## 六、验证结果 / 变更记录
- [ ] 需求结论确认并回填第一节
- [ ] DDL/migrate 与实体一致
- [ ] 主进程 `npm run type-check:node` 通过
- [ ] 渲染进程 `npm run type-check:web` 通过
- [ ] `npm run build` 通过
- [ ] i18n zh/en JSON 合法、文案成对
- [ ] 变更记录（本次改动时间与说明）
```

## 主进程落位清单（6 件套）

以业务 `Widget`、模块 `widget` 为例：

| 文件 | 位置 | 说明 |
|---|---|---|
| `schema.ts` | `src/main/db/schema.ts` | 新增 `sqliteTable('desk_widget', {...})` |
| `index.ts` | `src/main/db/index.ts` | DDL 增 `desk_widget` 表；新增列在 `migrate()` 用 `ensureColumn` |
| `WidgetService.ts` | `src/main/services/widgetService.ts` | CRUD/业务编排；唯一 `getDb()` 出口 |
| handler | `src/main/ipc.ts` | `ipcMain.handle(IPC.widgetList/Save/Remove, ...)` |
| 契约 | `src/shared/ipc.ts` | `WidgetDTO` + `IPC.widget*` 常量 + `DeskApi.widget` |
| 暴露 | `src/preload/index.ts` | `widget: { list, save, remove }` |

### schema.ts 骨架

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/* 组件表：{一句话说明} */
export const widgetTable = sqliteTable('desk_widget', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  enabled: integer('enabled').notNull().default(1),
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
```

### WidgetService.ts 骨架

```ts
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { widgetTable } from '../db/schema'
import type { WidgetDTO } from '../../shared/ipc'

type WidgetRow = typeof widgetTable.$inferSelect

/* 行记录 → DTO（enabled 由 INTEGER 归一到 boolean） */
function toDTO(row: WidgetRow): WidgetDTO {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

/* 列表（最近更新优先） */
export function listWidgets(): WidgetDTO[] {
  return getDb().select().from(widgetTable).all().map(toDTO)
    .sort((a, b) => b.updateTime.localeCompare(a.updateTime))
}

/* 新增或更新 */
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

/* 删除 */
export function deleteWidget(id: string): void {
  getDb().delete(widgetTable).where(eq(widgetTable.id, id)).run()
}
```

### ipc.ts handler 片段

```ts
ipcMain.handle(IPC.widgetList, () => listWidgets())
ipcMain.handle(IPC.widgetSave, (_event, dto: Partial<WidgetDTO>) => saveWidget(dto))
ipcMain.handle(IPC.widgetRemove, (_event, id: string) => deleteWidget(id))
```

> 若改动影响 Agent 运行时（如删除资源需清缓存），在 handler 内追加 `evictAgent(...)` / `resetAgents()`（参考 `provider.ts` / `session.ts` 的既有写法）。

### shared/ipc.ts 契约片段

```ts
/* 组件 DTO */
export interface WidgetDTO {
  id: string
  name: string
  enabled: boolean
  addTime: string
  updateTime: string
}

// IPC 常量表追加
export const IPC = {
  // ...
  widgetList: 'desk:widget:list',
  widgetSave: 'desk:widget:save',
  widgetRemove: 'desk:widget:remove'
} as const

// DeskApi 追加
export interface DeskApi {
  // ...
  widget: {
    list(): Promise<WidgetDTO[]>
    save(dto: Partial<WidgetDTO>): Promise<WidgetDTO>
    remove(id: string): Promise<void>
  }
}
```

> 通道命名统一 `desk:{module}:{action}`；DTO 时间统一 ISO 字符串（`new Date().toISOString()`）。

## 渲染进程落位清单

| 文件 | 位置 | 说明 |
|---|---|---|
| store | `src/renderer/src/stores/{module}.ts` | Pinia `defineStore`，暴露状态 + 方法（内部调 `api.{module}`） |
| 页面/组件 | `src/renderer/src/modules/{module}/pages/index.vue` 或 `components/` | 使用 store；文案 `t('key')` |
| 路由 | `src/renderer/src/router/index.ts` | 新增独立页面时登记（Hash 路由） |
| i18n | `src/renderer/src/i18n/locales/{zh,en}.json` | `{module}.*` 文案成对 |

### store 骨架

```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api'
import type { WidgetDTO } from '../../../shared/ipc'

/* 组件状态 */
export const useWidgetStore = defineStore('widget', () => {
  const widgets = ref<WidgetDTO[]>([])
  const loaded = ref(false)
  const enabled = computed(() => widgets.value.filter((item) => item.enabled))

  /* 加载列表 */
  async function loadWidgets(): Promise<void> {
    widgets.value = await api.widget.list()
    loaded.value = true
  }

  /* 保存并刷新列表 */
  async function saveWidget(dto: Partial<WidgetDTO>): Promise<WidgetDTO> {
    const saved = await api.widget.save(dto)
    widgets.value = await api.widget.list()
    return saved
  }

  /* 删除并刷新列表 */
  async function removeWidget(id: string): Promise<void> {
    await api.widget.remove(id)
    widgets.value = widgets.value.filter((item) => item.id !== id)
  }

  return { widgets, loaded, enabled, loadWidgets, saveWidget, removeWidget }
})
```

### 渲染进程要点

- 能力访问统一 `import { api } from '../api'` → `api.{module}.xxx()`；**禁止直接 `window.desk`**（`api/index.ts` 已是唯一入口）。
- 状态守卫：`ref` 收敛；跨进程传输前用 `JSON.parse(JSON.stringify(patch))` 深拷贝，避免 Vue 响应式代理无法结构化克隆（参考 `stores/settings.ts`）。
- 组件导入名与模板标签统一 PascalCase；用户可见文案一律 `t('key')`，禁止硬编码中文（注释除外）。
- i18n 单一来源 `i18n/locales/{zh,en}.json`（`vue-i18n` 组合式），语言由设置驱动（`setLanguage`，重启/切换后生效）；zh/en 成对提交。

## Agent 运行时（新增内置工具 / 沙箱能力）

新增 Agent 能力落在 `src/main/agent/`，**不改 IPC**：

| 需求 | 落位 | 要点 |
|---|---|---|
| 新增内置工具 | `agent/tools.ts` | 在 `createBuiltinTools()` 用 `Type.Object` 定义 `AgentTool`（`name/label/description/parameters/execute`）；只读工具入 `tools` 数组，写/命令类**仅 build 模式**追加 |
| 文件类工具 | `agent/tools.ts` + `agent/sandbox.ts` | 一律先经 `guardPath({ sessionId, rootDir, target, action, tool })` 闸门；越界返回 `toolError` 拦截说明，不得绕过沙箱直接读写 |
| 沙箱策略 | `agent/sandbox.ts` | 路径 `canonicalize`（解析软链接）；会话级白名单 `sessionAllowed` |
| 越界审批 | `agent/approval.ts` + `agent/runtime.ts` | 运行时进程经 `parentPort` 发 `approval-request`，主进程弹应用内/原生对话框后回传 `once/session/deny` |
| 协议变更 | `shared/agentProtocol.ts` | 新增 `HostEvent` / `WorkerRequest` 分支时同步 worker.ts、host.ts、runtime.ts |
| 供应商/模型 | `agent/models.ts` | `normalizeBaseUrl`、`buildModels`；`{session}` 占位替换 |

> 工具结果的 `content` 为文本块数组；错误用 `isError: true` 返回，UI 会标记为失败。新增工具务必自测越界拦截与 Plan 模式不可见。

## 校验清单

- [ ] 需求子目录 `xxl-ai-spec/{yyyyMMdd}-{business}/` 已创建，`方案.md`（六大块齐全）+ SQL 已落盘并同步。
- [ ] 数据结构：`db/schema.ts` 与 `db/index.ts` 的 `DDL`/`migrate()` 三处一致（新库直建 + 旧库迁移）。
- [ ] 主进程：`services/*Service.ts` 是唯一 `getDb()` 出口；`ipc.ts` 只做网关；`shared/ipc.ts` DTO + `IPC` 常量 + `DeskApi` 齐备；`preload` 已暴露。
- [ ] 通道命名 `desk:{module}:{action}`；返回时间统一 ISO；DTO 布尔由 INTEGER 归一。
- [ ] 渲染：store 经 `api.{module}` 访问能力、不直接 `window.desk`；新增页面已在 `router` 登记；文案 `t()` 引用且 zh/en 成对。
- [ ] i18n JSON 合法；语言由设置驱动，无硬编码中文（注释除外）。
- [ ] Agent 工具：文件类经 `guardPath`；写/命令工具仅 build 模式注册；越界拦截可复现。
- [ ] `npm run type-check:node` 与 `npm run type-check:web` 通过；`npm run build` 通过。
- [ ] 注释沿用 xxl-ai-desk 既有风格（文件顶部功能描述、方法与分支 `/* */`），与相邻文件保持一致。

## 参考文件（绝对路径）

- 主进程服务样例：`xxl-ai-desk/src/main/services/providerService.ts`、`projectService.ts`、`sessionService.ts`
- 数据库样例：`xxl-ai-desk/src/main/db/{schema.ts,index.ts}`
- IPC 契约与网关：`xxl-ai-desk/src/shared/ipc.ts`、`src/main/ipc.ts`、`src/preload/index.ts`
- Agent 运行时：`xxl-ai-desk/src/main/agent/{tools.ts,sandbox.ts,host.ts,runtime.ts,worker.ts}`、`src/shared/agentProtocol.ts`
- 渲染进程样例：`src/renderer/src/stores/{project.ts,settings.ts,chat.ts}`、`src/renderer/src/modules/settings/pages/index.vue`、`src/renderer/src/api/index.ts`
- 构建与命令：`xxl-ai-desk/package.json`（`type-check` / `build` / `dev`）、`electron.vite.config.ts`
- 官方文档：`doc/XXL-AI-DESK官方文档.md`
