<p align="center">
    <img src="https://www.xuxueli.com/project/static/xxl-job/images/xxl-logo.jpg" width="150">
    <h3 align="center">XXL-AI</h3>
    <p align="center">
        XXL-AI, an AI Agent development platform.
        <br>
        <a href="https://www.xuxueli.com/xxl-ai/"><strong>-- Home Page --</strong></a>
        <br>
        <br>
        <a href="https://github.com/xuxueli/xxl-ai/actions">
            <img src="https://github.com/xuxueli/xxl-ai/workflows/Java%20CI/badge.svg" >
        </a>
        <a href="https://github.com/xuxueli/xxl-ai/releases">
            <img src="https://img.shields.io/github/release/xuxueli/xxl-ai.svg" >
        </a>
        <a href="https://github.com/xuxueli/xxl-ai/">
            <img src="https://img.shields.io/github/stars/xuxueli/xxl-ai" >
        </a>
        <a href="http://www.gnu.org/licenses/gpl-3.0.html">
            <img src="https://img.shields.io/badge/license-GPLv3-blue.svg" >
        </a>
        <a href="https://www.xuxueli.com/page/donate.html">
            <img src="https://img.shields.io/badge/%24-donate-ff69b4.svg?style=flat-square" >
        </a>
    </p>
</p>


## Introduction

XXL-AI is an AI Agent development platform delivered in two forms — **Cloud** (web / server) and **Desk** (desktop client). They share one brand with complementary capabilities, and can be used independently or combined.

- **Cloud**: a B/S multi-user AI Agent platform for teams, focusing on unified management, RBAC governance and one-click publishing.
- **Desk**: a cross-platform, local-first desktop client for individuals, focusing on direct operations on local projects and system capabilities.

XXL-AI 是一个「**云本结合**」的 AI Agent 开发平台，提供两种同源同品牌、能力互补的交付形态，可按团队规模与使用场景独立选用，也可组合使用：

- **云版**（Web / 服务端）：B/S 架构、面向团队的多用户 AI Agent 平台，强调统一管理、权限治理与一键发布；
- **本地版**（Desk 桌面端）：跨平台桌面客户端，本地优先、开箱即用，面向个人的本地工作台，强调对本机项目与系统能力的直接操作。

XXL-AI 云版支持 Agent 编排、多供应商、标准化扩展「MCP + SKILL + RAG」与工程化底座，可快速构建并一键发布 Agent；现已开放源代码，开箱即用。


## Documentation
- [中文文档](https://www.xuxueli.com/xxl-ai/)


## Communication
- [社区交流](https://www.xuxueli.com/page/community.html)


## Features

### Cloud（云版）

- **Agent 编排与一键发布（核心亮点）**

- 1、Agent 编排：模型 + 系统指令 + 知识库 + MCP + SKILL 组合为 Agent，各类资源均支持多选绑定；
- 2、一键发布：发布后生成 UUID 公开访问地址，管理端可查看该 Agent 的访客对话与消息记录；
- 3、流式对话：SSE 流式输出（思考过程 / 回复内容），基于 Redis Stream 无状态化，支持集群部署与断线 / 刷新续传；

- **MCP + SKILL + RAG，让 Agent 真能干活（标准化扩展）**

- 4、RAG 知识库：知识库 + 文档管理，文档分片向量化入库（Milvus），对话时检索上下文自动注入；
- 5、MCP 工具：支持远程（Streamable HTTP）与本地（stdio）MCP 服务接入，工具自动装配给 Agent，另附示例 MCP 服务 `xxl-ai-sample`；
- 6、SKILL 技能：以 `SKILL.md` + 文件树沉淀领域知识与脚本，自动物化为 Agent 可执行的技能目录；

- **多供应商与工程化底座，支持稳定上线**

- 7、多模型供应商：统一接入 OpenAI 兼容协议（Deepseek、智谱GLM、Ollama、OpenCode 等），支持供应商与模型两级管理、连通性测试与远程模型导入（区分对话 / 嵌入模型）；
- 8、空间隔离：多业务空间（Tenant）隔离数据，用户按空间授权，管理端与公开端共享权限体系；
- 9、账号安全：基于 XXL-SSO 登录认证，登录态（token）存于 Redis，支持集群部署与 SSO 集成；
- 10、权限管控：基于 RBAC 的菜单 / 按钮级权限，动态菜单下发、零路由改动；
- 11、系统管理：用户、系统配置、审计日志在线管理；
- 12、一键部署：随带 Docker Compose 一键部署栈（mysql + redis + milvus + api + sample）；

- **研发与架构**

- 13、Monorepo + 前后端分离：一套仓库统一托管 后端 API 与 前端 UI，统一版本与依赖管理；开发期前后端独立启动，部署期前端产物内嵌进 API jar 单包单端口发布；
- 14、AI + SKILL 驱动：内置开发 SKILL，AI 编程助手一键加载，按平台规范直生业务代码并落位，显著加速业务开发；
- 15、响应式 UI 与国际化：Vue3 + Element Plus + TypeScript，提供中文 / 英文两种语言；
- 16、可扩展架构：标准分层分包、业务模块自包含，模型 / 对话 / RAG / MCP / SKILL 运行时统一收口支撑层；

### Desk（本地版）

- **本地优先的桌面 Agent 工作台（核心亮点）**

- 1、跨平台一键安装：基于 Electron + Vue3 + TypeScript 构建，支持 mac / win / linux，开箱即用、离线可用；
- 2、项目即工作区：项目 1:1 强绑定本地磁盘目录，会话归属项目，Agent 直接在本机工程上干活；
- 3、本地数据自治：单文件 SQLite（better-sqlite3 + Drizzle），数据不出本机，运行时数据目录可自定义；

- **Plan / Build + 本地系统能力，让 Agent 真能干活（亮点）**

- 4、Plan / Build 双模式：Plan 只读安全探索、Build 全量读写落地改造，随会话持久化，默认 Build；
- 5、项目目录沙箱：文件操作限定当前项目目录，越界弹原生对话框「允许本次 / 本会话允许 / 拒绝」，支持会话级白名单；
- 6、直达工作现场：终端面板（node-pty + xterm）、文件面板（目录树 + 编辑 + 预览，跟随本地变更）、浏览器面板（多标签 `webview`）；

- **执行过程全程可视（亮点）**

- 7、时间线渲染：助手消息按**片段发生顺序**交错呈现思考 → 工具 → 正文；
- 8、工具调用可视化：独立成行展示动作 / 参数 / 状态 / 实时耗时，可展开入参与结果；
- 9、流式对话：思考过程折叠、Markdown 实时渲染、GitHub 风格代码高亮（语言标签 + 复制）；

- **多供应商接入与工程化底座**

- 10、多供应商模型：兼容 OpenAI 协议（OpenCodeGo / Ollama / Deepseek / 智谱GLM 等），支持 `{session}` 请求头占位，首次启动预置四个供应商；
- 11、运行时进程隔离：Pi（`pi-ai` + `pi-agent-core`）运行于独立 `utilityProcess`，主进程仅做 IPC 网关与越界审批，长会话 / 工具重活不阻塞 UI；
- 12、个性化与国际化：应用名称 / Slogan / 自定义指令，浅色（默认）/ 深色主题，中 / 英双语。

## Development

于2026年6月，整合 XXL-BOOT 中的AI插件模块，升级为独立的 AI应用开发平台 XXL-AI。

于2026年9月，发布 1.0.0 版本，提供 Agent 编排、RAG 知识库、MCP 工具、SKILL 技能等核心功能，支持一键发布与流式对话。

## Contributing
Contributions are welcome! Open a pull request to fix a bug, or open an [Issue](https://github.com/xuxueli/xxl-ai/issues/) to discuss a new feature or change.

欢迎参与项目贡献！比如提交PR修复一个bug，或者新建 [Issue](https://github.com/xuxueli/xxl-ai/issues/) 讨论新特性或者变更。


## Contributing
更多接入的公司，欢迎在 [登记地址](https://github.com/xuxueli/xxl-ai/issues/1 ) 登记，登记仅仅为了产品推广。


## Copyright and License
This product is open source and free, and will continue to provide free community technical support. Individual or enterprise users are free to access and use.

- Licensed under the GNU General Public License (GPL) v3.
- Copyright (c) 2015-present, xuxueli.

产品开源免费，并且将持续提供免费的社区技术支持。个人或企业内部可自由的接入和使用。


## Donate
No matter how much the amount is enough to express your thought, thank you very much ：）     [To donate](https://www.xuxueli.com/page/donate.html )

无论金额多少都足够表达您这份心意，非常感谢 ：）      [前往捐赠](https://www.xuxueli.com/page/donate.html )
