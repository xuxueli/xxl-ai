# XXL-AI Desk

> AI Agent 桌面客户端 —— 基于 **Electron + Vue3 + Pi** 构建，独立于 XXL-AI 其他模块。

XXL-AI Desk 是一个本地优先的桌面 Agent 客户端：内置多供应商模型接入、流式对话、工具调用可视化，并预留 SKILL / MCP / 知识库 / 记忆等能力。UI 参考 ChatGPT Desktop、Claude Desktop 等成熟 Agent 产品。

## 技术选型（已确认）

| 维度 | 方案 |
|---|---|
| 桌面框架 | Electron 44 + **electron-vite** |
| 前端 | Vue 3 + TypeScript + **Element Plus** + Pinia + Vue Router + vue-i18n |
| Agent 运行时 | **Pi**（`@earendil-works/pi-ai` + `@earendil-works/pi-agent-core`），主进程内嵌 SDK |
| 本地存储 | **better-sqlite3 + Drizzle ORM**（SQLite 单文件） |
| 密钥安全 | Electron `safeStorage`（系统钥匙串加密） |
| 打包分发 | electron-builder（mac / win / linux）+ electron-updater |
| 图标 | lucide-vue-next；Markdown：markdown-it + DOMPurify |

> 需求来源与完整选型过程见 `../xxl-ai-spec/20261002-desk/plan.md`。

## 与其它模块的关系

**完全独立**：不依赖、不连接 `xxl-ai-api` / `xxl-ai-ui` / `xxl-ai-sample`，不访问其 MySQL / Redis / Milvus。拥有独立的依赖、构建与发布流程，可脱离仓库单独使用。

## 目录结构

```
xxl-ai-desk/
├── electron.vite.config.ts        # 三进程构建配置
├── electron-builder.yml           # 打包配置
└── src/
    ├── main/                      # 主进程（Node）
    │   ├── index.ts               # 入口：窗口 / 生命周期
    │   ├── ipc.ts                 # IPC 路由
    │   ├── security.ts            # safeStorage 密钥加解密
    │   ├── db/                    # SQLite + Drizzle（schema / 初始化）
    │   ├── agent/                 # Pi 运行时：models 构建 / tools / host 事件流
    │   └── services/              # settings / provider / session
    ├── preload/index.ts           # contextBridge 暴露 window.desk
    ├── shared/ipc.ts              # 主/预加载/渲染共享类型
    └── renderer/src/              # 渲染进程（Vue3）
        ├── components/            # Sidebar / MessageItem / ChatComposer / EmptyState
        ├── stores/                # settings / chat
        ├── modules/               # chat / settings 页面
        ├── i18n/                  # zh / en 文案
        └── styles/                # 设计令牌与全局样式
```

## 开发与构建

前置：Node 18+（建议 20+）。首次安装后需准备 Electron 二进制与原生模块：

```bash
cd xxl-ai-desk
npm install
node node_modules/electron/install.js        # 下载 Electron 二进制
npx electron-builder install-app-deps        # 重建 better-sqlite3（N-API）
```

常用命令：

```bash
npm run dev          # 开发模式（HMR）
npm run type-check   # 主进程 + 渲染进程类型检查
npm run build        # 类型检查 + 三进程构建
npm run pack         # 免安装打包（当前平台）
npm run build:mac    # 打包 macOS（dmg / zip）
npm run build:win    # 打包 Windows（nsis）
npm run build:linux  # 打包 Linux（AppImage / deb）
```

## 首次使用

1. 首次启动会自动预置 **OpenCodeGo / Ollama / Deepseek / 智谱GLM** 四个供应商（与平台种子一致）。
2. 进入 **设置 → 模型供应商** 新增或修改供应商：
   - 名称：如 `DeepSeek`
   - 接口地址：如 `https://api.deepseek.com/v1`（OpenAI 兼容端点；裸地址自动补 `/v1`）
   - API Key：供应商密钥（本地加密存储）
   - **请求Header**：可选 JSON 对象，value 可含 `{session}` 占位符，对话请求时自动替换为当前会话ID。例如 OpenCode 需要：`{"x-opencode-session":"{session}"}`
   - 模型列表：每行一个模型 ID，如 `deepseek-chat`
3. 在 **设置 → 通用** 选择默认模型；回到对话页即可开始聊天。
4. 对话支持流式输出、思考过程折叠、工具调用状态展示。

## 路线图

- [x] M1 脚手架 + 三进程 + ChatGPT 风格 UI 外壳
- [x] M2 多供应商 + 流式对话 + 会话持久化
- [ ] M3 SKILL 管理 + MCP 连接与工具管理
- [ ] M4 知识库 / 记忆（`sqlite-vec`）
- [ ] M5 自动更新与三平台签名分发
- [ ] M6 更多内置工具与 Artifacts 面板

## License

GPL-3.0，与 XXL-AI 一致。Copyright (c) 2015-present, xuxueli.
