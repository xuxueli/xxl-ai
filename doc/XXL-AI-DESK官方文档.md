## 《AI应用开发平台XXL-AI》【本地版（Desk）】

[![Actions Status](https://github.com/xuxueli/xxl-ai/workflows/Java%20CI/badge.svg)](https://github.com/xuxueli/xxl-ai/actions)
[![GitHub release](https://img.shields.io/github/release/xuxueli/xxl-ai.svg)](https://github.com/xuxueli/xxl-ai/releases)
[![GitHub stars](https://img.shields.io/github/stars/xuxueli/xxl-ai)](https://github.com/xuxueli/xxl-ai/)
[![License](https://img.shields.io/badge/license-GPLv3-blue.svg)](http://www.gnu.org/licenses/gpl-3.0.html)
[![donate](https://img.shields.io/badge/%24-donate-ff69b4.svg?style=flat-square)](https://www.xuxueli.com/page/donate.html)

[TOCM]

[TOC]

## 一、简介

### 1.1 概述

> 一个本地优先、开箱即用的 AI Agent 桌面客户端。

XXL-AI Desk 是 XXL-AI 的**本地版（桌面端 / 客户端版本）**：面向个人的本地工作台，围绕本机项目目录提供对话、文件读写、终端命令、文件 / 浏览器侧边任务等能力。安装即用、离线可用，数据仅落本地 SQLite。

> 与「云版（Web / 服务端版本）」的定位、特性与差异对比，参见《XXL-AI官方文档》第四章「云版 vs 本地版」。

### 1.2 特性

- **本地优先的桌面 Agent 工作台（重点）**

- 1、跨平台一键安装：基于 Electron + Vue3 + TypeScript 构建，支持 mac / win / linux，开箱即用、离线可用；
- 2、项目即工作区：项目 1:1 强绑定本地磁盘目录，会话归属项目，Agent 直接在本机工程上干活；
- 3、本地数据自治：单文件 SQLite（better-sqlite3 + Drizzle），数据不出本机，运行时数据目录可自定义；

- **Plan / Build + 本地系统能力，让 Agent 真能干活（亮点）**

- 4、Plan / Build 双模式：Plan 只读安全探索、Build 全量读写落地改造，随会话持久化，默认 Build；
- 5、项目目录沙箱：文件操作限定当前项目目录，越界弹原生对话框「允许本次 / 本会话允许 / 拒绝」，支持会话级白名单；
- 6、直达工作现场：终端面板（node-pty + xterm）、文件面板（目录树 + 编辑 + 预览，跟随本地变更）、浏览器面板（多标签 `webview`）；

- **执行过程全程可视（亮点）**

- 7、时间线渲染：助手消息按**片段发生顺序**交错呈现思考 → 工具 → 正文，不再是「思考堆一起、结果一次性吐出」；
- 8、工具调用可视化：独立成行展示动作 / 参数 / 状态 / 实时耗时，可展开入参与结果；
- 9、流式对话：思考过程折叠、Markdown 实时渲染、GitHub 风格代码高亮（语言标签 + 复制）；

- **多供应商接入与工程化底座**

- 10、多供应商模型：兼容 OpenAI 协议（OpenCodeGo / Ollama / Deepseek / 智谱GLM 等），支持 `{session}` 请求头占位，首次启动预置四个供应商；
- 11、运行时进程隔离：Pi（`pi-ai` + `pi-agent-core`）运行于独立 `utilityProcess`，主进程仅做 IPC 网关与越界审批，长会话 / 工具重活不阻塞 UI；
- 12、个性化与国际化：应用名称 / Slogan / 自定义指令，浅色（默认）/ 深色主题，中 / 英双语。

### 1.3 环境

- NodeJs：22+

### 1.4 与其它模块的关系

**完全独立**：不依赖、不连接 `xxl-ai-api` / `xxl-ai-ui` / `xxl-ai-sample`，不访问其 MySQL / Redis / Milvus。拥有独立的依赖、构建与发布流程，可脱离仓库单独使用。

## 二、快速开始

### 2.1 安装依赖

```bash
cd xxl-ai-desk
npm install                                   # 一次性完成：postinstall 自动下载 Electron 二进制 + 重建原生模块
```

补充说明：
- `postinstall` 已串行执行 `install-electron`（下载 Electron 二进制并写入 `node_modules/electron/path.txt`）、`electron-builder install-app-deps`（重建 better-sqlite3 / node-pty）与 `scripts/fix-node-pty-perms.cjs`。
- 仅当使用 `--ignore-scripts` 安装、或下载失败（`npm run dev` 报 `Electron uninstall`）时，才需补执行：

```bash
npx install-electron                          # 补下载 Electron 二进制（等价于 node node_modules/electron/install.js）
npx electron-builder install-app-deps         # 补重建原生模块
```

### 2.2 开发与构建

```bash
npm run dev                                   # 开发模式（HMR）
npm run type-check                            # 主进程 + 渲染进程类型检查
npm run build                                 # 类型检查 + 三进程构建
npm run pack                                  # 免安装打包（当前平台）
npm run build:mac | build:win | build:linux   # 打包对应平台安装包
```

启动顺序：`app.whenReady → 初始化数据库 → 预置供应商 → 注册 IPC → 创建窗口`；单实例锁防止多开争库。

### 2.3 首次使用

1. 首次启动自动预置 **OpenCodeGo / Ollama / Deepseek / 智谱GLM** 四个供应商（与云版种子一致），并默认选中首个；
2. 进入 **设置 → 模型供应商** 新增或修改供应商（详见 3.2）；
3. 在 **设置 → 常规** 配置主题 / 语言，在 **设置 → 个性化** 配置名称 / Slogan / 自定义指令；
4. 新建项目并选择本地目录，回到对话页即可开始聊天。

## 三、操作指南

> 本章按 **供应商 → 项目 → 对话 → 侧边任务 → 设置** 的顺序说明本地版使用方式。

### 3.1 界面总览

- 左侧**会话栏**（可折叠为窄图标栏）：项目分组 + 会话列表，底部为新建对话、设置、折叠 / 展开；
- 右侧**内容区**：顶栏（标题 + 模型切换）、消息流、输入框（Composer）；
- 右侧**侧边任务面板**：文件 / 浏览器面板，可放大占满正文区、拖拽宽度；
- 对话页右下可展开**终端面板**。

### 3.2 配置模型供应商

进入 **设置 → 模型供应商** 新增 / 修改供应商：

- 名称：如 `DeepSeek`；
- 接口地址：OpenAI 兼容端点（如 `https://api.deepseek.com/v1`，裸地址自动补 `/v1`）；
- API Key：本地存储；
- 请求 Header：可选 JSON 对象，value 支持 `{session}` 占位符，对话时替换为当前会话 ID（如 OpenCode 使用 `{"x-opencode-session":"{session}"}`）；
- 模型列表：每行一个模型 ID，如 `deepseek-chat`。

### 3.3 项目与会话

- 侧栏「项目」区维护本地项目：项目 1:1 强绑定本地磁盘目录，可新建（目录选择）、重命名、删除（级联删除会话）、在文件管理器中显示；
- 会话必须归属某项目，新建对话需先选择项目；侧栏按项目分组会话，支持搜索、重命名、删除与排序；
- 首条消息即时生成会话标题；生成中切换会话再切回不丢内容（会话级生成缓存）。

### 3.4 对话与模式

- 输入框左侧提供 **Plan / Build 模式选择器**（随会话持久化，默认 Build）：
    - **Plan（只读）**：仅装配只读工具（`read_file` / `list_directory` / `glob_files` / `search_files` / `get_current_time`）；
    - **Build（读写）**：在只读基础上追加 `write_file` / `edit_file` / `run_command`；
- 文件工具统一限定当前项目目录，越界操作弹原生对话框，可选「允许本次 / 本会话允许 / 拒绝」；
- 助手消息按**片段发生顺序**渲染时间线（思考 → 工具 → 正文交错），思考运行中实时展开、完成后收起；工具调用独立成行，展示动作、参数、状态与耗时，点击可展开入参 / 结果；
- 代码块为 GitHub 风格（语言标签 + 复制），接入语法高亮。

### 3.5 侧边任务与终端

- **侧边任务面板**：工具菜单含 **文件** 与 **浏览器** 两个面板，支持放大占满正文区、拖拽宽度；
    - **文件面板**：项目目录树（懒加载 / 过滤）+ 代码编辑（行号、高亮、`⌘/Ctrl+S` 保存）+ 预览，随本地文件变更自动刷新，支持「打开所在文件夹 / 用指定应用打开」；
    - **浏览器面板**：内嵌 `webview`，多标签、前进 / 后退 / 刷新、地址栏搜索兜底、系统浏览器打开；
- **终端面板**：基于 node-pty + xterm，支持终端命令行操作。

### 3.6 设置与数据

- **设置 → 常规**：主题、语言即时生效；**设置 → 个性化**：配置应用名称、Slogan、自定义指令（作为新对话系统指令）；
- **数据目录**：默认位于系统 userData 下的 `xxl-ai-desk.sqlite`，可在设置中查看 / 浏览 / 打开 / 修改，修改后重启生效；
- 会话 / 消息 / 供应商 / 项目 / 设置均落本地 SQLite，API Key 本地存储。

### 3.7 快捷键

| 快捷键 | 功能 |
|---|---|
| `⌘/Ctrl + P` | 打开文件面板 |
| `⌘/Ctrl + T` | 打开浏览器面板 |
| `⌘/Ctrl + S` | 保存文件面板当前编辑内容 |

## 四、总体设计

### 4.1 技术选型

| 维度 | 方案 |
|---|---|
| 桌面框架 | Electron 44 + electron-vite 5 |
| 前端 | Vue 3 + TypeScript + Element Plus |
| Agent 运行时 | **Pi**（`@earendil-works/pi-ai` + `pi-agent-core`），独立 `utilityProcess` |
| 本地存储 | better-sqlite3 + Drizzle ORM（SQLite 单文件） |
| 内容渲染 | markdown-it + DOMPurify + highlight.js |
| 终端 | node-pty + xterm |
| 打包分发 | electron-builder（mac / win / linux） |

### 4.2 三进程架构

```
┌────────────────────────────────────────────────────────────┐
│ Renderer（Vue3 + Element Plus，无 Node 直连）               │
│  会话列表 · 对话流 · Composer · 设置 · 侧边任务面板          │
└───────────────▲────────────────────────────────────────────┘
                │ contextBridge（preload 暴露 window.desk.*）
┌───────────────┴────────────────────────────────────────────┐
│ Main（Electron 主进程，Node / CJS）                          │
│  窗口/生命周期 · IPC 网关 · SQLite(Drizzle) 持久化           │
│  Agent 运行时管理 · 越界审批弹窗 · 文件/终端/浏览器服务       │
└───────────────┬────────────────────────────────────────────┘
                │ utilityProcess + parentPort 结构化消息
┌───────────────▼────────────────────────────────────────────┐
│ Agent 运行时进程（utilityProcess，Node / CJS）              │
│  Pi Runtime（pi-agent-core + pi-ai）                         │
│  多供应商 LLM · Agent 循环 · 工具调用 · 文件沙箱 · 事件流     │
└────────────────────────────────────────────────────────────┘
```

- **安全**：`contextIsolation: true`、`nodeIntegration: false`；渲染层仅经 preload 白名单 IPC 访问能力；
- **运行时隔离**：Pi 运行时独立运行在 `utilityProcess`，主进程只做 IPC 网关与审批弹窗，LLM 流式与工具重活不占用主进程事件循环；
- **越界审批**：运行时进程内的文件沙箱无法弹窗，经 `parentPort` 发 `approval-request` 给主进程，由主进程弹原生对话框后回传结果。

### 4.3 本地数据模型（SQLite）

| 表 | 说明 |
|---|---|
| `desk_project` | 本地项目（`id / name / path / add_time / update_time`，路径 1:1 唯一） |
| `desk_session` | 会话（`id / title / provider_id / model_id / system_prompt / mode / project_id / add_time / update_time`） |
| `desk_message` | 消息（`id / session_id / seq / role / content / data / add_time`，`data` 为 Agent 原始消息 JSON） |
| `desk_provider` | 供应商（`name / base_url / api_key / headers / models / enabled / sort`） |
| `desk_setting` | 设置（`key / value`） |

- 旧库兼容：`PRAGMA table_info` 检测缺列后 `ALTER TABLE` 补齐（SQLite 无 `ADD COLUMN IF NOT EXISTS`）；
- 运行时数据目录默认 `app.getPath('userData')/xxl-ai-desk.sqlite`，可自定义（`userData/desk-config.json`），修改后重启生效。

### 4.4 工程结构

```
xxl-ai-desk/
├── electron.vite.config.ts        # 三进程构建配置
├── electron-builder.yml           # 打包配置
└── src/
    ├── main/                      # 主进程（Node）
    │   ├── index.ts               # 入口：窗口 / 生命周期
    │   ├── ipc.ts                 # IPC 路由（含 chat:send 编排）
    │   ├── security.ts            # API Key 本地编解码
    │   ├── db/                    # SQLite + Drizzle（schema / 初始化 / 迁移）
    │   ├── agent/                 # Pi 运行时：runtime / worker / models / tools / sandbox / host
    │   └── services/              # settings / provider / session / project / fs / watch / terminal
    ├── preload/index.ts           # contextBridge 暴露 window.desk
    ├── shared/ipc.ts              # 主/预加载/渲染共享类型
    └── renderer/src/              # 渲染进程（Vue3）
        ├── components/            # Sidebar / MessageItem / ChatComposer / TerminalPanel / panel/*
        ├── stores/                # settings / chat / layout / project
        ├── modules/               # chat / settings 页面
        ├── i18n/                  # zh / en 文案
        └── styles/                # 设计令牌与全局样式
```

### 4.5 安全设计

- **文件沙箱**：所有文件工具经统一 `guardPath` 闸门，路径规范化（解析软链接）后限定当前项目目录；
- **越界审批**：越界操作由主进程弹原生对话框，可选「允许本次 / 本会话允许 / 拒绝」，会话级白名单记入内存；
- **模式隔离**：Plan 模式不装配写 / 命令工具，从工具层面限制只读；
- **进程隔离**：渲染进程无 Node 能力，运行时进程无 Electron 能力，敏感能力（密钥、原生弹窗）留在主进程。

## 五、云版 vs 本地版

XXL-AI 提供两种交付形态，二者同源同品牌、能力互补，可按团队规模与使用场景独立选用，也可组合使用：

- **云版（Web / 服务端版本）**：由 `xxl-ai-api` + `xxl-ai-ui` 组成，B/S 架构、浏览器访问，面向团队的多用户 AI Agent 平台，强调统一管理、权限治理与一键发布；
- **本地版（Desk 桌面端 / 客户端版本）**：`xxl-ai-desk`，基于 Electron + Vue3 + Pi 的跨平台桌面客户端，本地优先、开箱即用，面向个人的本地工作台，强调对本机项目与系统能力的直接操作。

### 5.1 版本定位一览

| 项 | 云版（Web / 服务端） | 本地版（Desk 桌面端） |
|---|---|---|
| 仓库模块 | `xxl-ai-api` + `xxl-ai-ui`（Monorepo，含 `xxl-ai-sample`） | `xxl-ai-desk`（独立子工程） |
| 产品形态 | B/S Web 应用，浏览器访问（开发 `:3000`，部署 `:8080` 单包） | C/S 桌面应用，Electron 一键安装（mac / win / linux） |
| 运行位置 | 服务器（集群可水平扩展） | 用户本机（单机本地优先） |
| 服务对象 | 多用户 / 多业务空间（Tenant）团队 | 单用户本地工作台 |
| 与其它模块关系 | 依赖 MySQL / Redis / Milvus | **零依赖**：不连 api / ui / sample 及其 MySQL / Redis / Milvus |


### 5.2 云版（Web / 服务端）详细文档

本章仅聚焦两版的定位、特性与差异对比，云版能力（Agent 编排 / RAG / MCP / SKILL / 发布 / 流式对话 / 权限体系）等详细内容，统一参见《XXL-AI官方文档.md》：

- 文档：`doc/XXL-AI官方文档.md`
- 源码：`xxl-ai-api` + `xxl-ai-ui`

## 六、版本更新日志

略，见 云版（Web / 服务端版本）详细文档。

## 七、其他

### 7.1 项目贡献
欢迎参与项目贡献！比如提交PR修复一个bug，或者新建 [Issue](https://github.com/xuxueli/xxl-ai/issues/) 讨论新特性或者变更。

### 7.2 用户接入登记
更多接入的公司，欢迎在 [登记地址](https://github.com/xuxueli/xxl-ai/issues/1 ) 登记，登记仅仅为了产品推广。

### 7.3 开源协议和版权
产品开源免费，并且将持续提供免费的社区技术支持。个人或企业内部可自由的接入和使用。

- Licensed under the GNU General Public License (GPL) v3.
- Copyright (c) 2015-present, xuxueli.

---
### 捐赠
无论金额多少都足够表达您这份心意，非常感谢 ：）      [前往捐赠](https://www.xuxueli.com/page/donate.html )_
