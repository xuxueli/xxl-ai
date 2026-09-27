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

XXL-AI is an AI Agent development platform, easy to learn, easy to use, AI-driven, production-ready, and ready to use out of the box. It supports flexible orchestration of "models + instructions + knowledge base + MCP tools + SKILL skills" to quickly build and publish Agents with one click.

XXL-AI 是一个AI Agent 开发平台，易学易用、AI 驱动、可生产落地、开箱即用。支持灵活编排「模型 + 指令 + 知识库 + MCP 工具 + SKILL 技能」，快速构建并一键发布Agent。


## Documentation
- [中文文档](https://www.xuxueli.com/xxl-ai/)


## Communication
- [社区交流](https://www.xuxueli.com/page/community.html)


## Features

- **Agent 编排与发布（重点）**

- 1、Agent 编排：模型 + 系统指令 + 知识库 + MCP + SKILL 组合为 Agent，各类资源均支持多选绑定；
- 2、一键发布：发布后生成 UUID 公开访问地址（`/chat/{uuid}`，免登录），管理端可查看该 Agent 的访客对话与消息记录；
- 3、多模型供应商：统一接入 OpenAI 兼容协议（Deepseek、智谱GLM、Ollama、OpenCode 等），支持供应商与模型两级管理、连通性测试与远程模型导入；
- 4、流式对话：SSE 流式输出（思考过程 / 回复内容），基于 Redis Stream 无状态化，支持集群部署与断线 / 刷新续传；

- **MCP + Skill + RAG，让 Agent 真能干活**

- 5、RAG 知识库：知识库 + 文档管理，文档分片向量化入库（Milvus），对话时检索上下文自动注入；
- 6、MCP 工具：支持远程（Streamable HTTP）与本地（stdio）MCP 服务接入，工具自动装配给 Agent，另附示例 MCP 服务 `xxl-ai-sample-mcp`；
- 7、SKILL 技能：以 `SKILL.md` + 文件树沉淀领域知识与脚本，自动物化为 Agent 可执行的技能目录；

- **工程化底座，支持稳定上线**

- 8、空间隔离：多业务空间（Tenant）隔离数据，用户按空间授权，管理端与公开端共享权限体系；
- 9、账号安全：基于 XXL-SSO 登录认证，登录态（token）存于 Redis，支持集群部署与 SSO 集成；
- 10、权限管控：基于 RBAC 的菜单 / 按钮级权限，动态菜单下发、零路由改动；
- 11、系统管理：用户、系统配置、审计日志在线管理；
- 12、一键部署：随带 Docker Compose 一键部署栈（mysql + redis + milvus + api + sample-mcp + ui）；

- **研发与架构**

- 13、Monorepo + 前后端分离：一套仓库统一托管 后端 API 与 前端 UI，统一版本与依赖管理，前后端独立部署、独立迭代；
- 14、AI + SKILL 驱动：内置开发 SKILL，AI 编程助手一键加载，按平台规范直生业务代码并落位，显著加速业务开发；
- 15、响应式 UI 与国际化：Vue3 + Element Plus + TypeScript，提供中文 / 英文两种语言；
- 16、可扩展架构：标准分层分包、业务模块自包含，模型 / 对话 / RAG / MCP / SKILL 运行时统一收口支撑层；


## 快速开始

前置环境：JDK 17+、Maven 3.6+、Node 18+、MySQL 8、Redis（RAG 向量化另需 Milvus）。

```bash
# 1. 初始化数据库
source doc/db/tables_xxl_ai.sql;                    # 建库 + 框架表 + 业务表 + 种子数据

# 2. 启动后端 API（Redis 需先启动）
cd xxl-ai-api && mvn spring-boot:run                # 8090

# 3. 启动前端
cd xxl-ai-ui && npm i && npm run dev                # 3000（代理 /api → 8090）
```

或一键 Docker 部署栈（默认账号 admin）：

```bash
cd docker && docker compose up -d --build
```

模块说明：

| 模块 | 说明 |
|---|---|
| `xxl-ai-api` | 后端 API（Spring Boot），端口 8090，SSO 登录态存 Redis |
| `xxl-ai-ui` | Vue3 前端（Element Plus + TypeScript + Vite），端口 3000 |
| `xxl-ai-sample-mcp` | 示例 MCP 服务（spring-ai `@McpTool`，Streamable HTTP），端口 8091 |
| `doc/db` | 数据库初始化脚本（`xxl_ai`，含框架表与业务表） |
| `docker` | 一键部署栈（mysql + redis + milvus + api + sample-mcp + ui） |


## Contributing
Contributions are welcome! Open a pull request to fix a bug, or open an [Issue](https://github.com/xuxueli/xxl-ai/issues/) to discuss a new feature or change.

欢迎参与项目贡献！比如提交PR修复一个bug，或者新建 [Issue](https://github.com/xuxueli/xxl-ai/issues/) 讨论新特性或者变更。


## 接入登记
更多接入的公司，欢迎在 [登记地址](https://github.com/xuxueli/xxl-ai/issues/1 ) 登记，登记仅仅为了产品推广。


## Copyright and License
This product is open source and free, and will continue to provide free community technical support. Individual or enterprise users are free to access and use.

- Licensed under the GNU General Public License (GPL) v3.
- Copyright (c) 2015-present, xuxueli.

产品开源免费，并且将持续提供免费的社区技术支持。个人或企业内部可自由的接入和使用。


## Donate
No matter how much the amount is enough to express your thought, thank you very much ：）     [To donate](https://www.xuxueli.com/page/donate.html )

无论金额多少都足够表达您这份心意，非常感谢 ：）      [前往捐赠](https://www.xuxueli.com/page/donate.html )
