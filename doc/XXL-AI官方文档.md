## 《AI应用开发平台 XXL-AI》

[![Actions Status](https://github.com/xuxueli/xxl-ai/workflows/Java%20CI/badge.svg)](https://github.com/xuxueli/xxl-ai/actions)
[![GitHub release](https://img.shields.io/github/release/xuxueli/xxl-ai.svg)](https://github.com/xuxueli/xxl-ai/releases)
[![GitHub stars](https://img.shields.io/github/stars/xuxueli/xxl-ai)](https://github.com/xuxueli/xxl-ai/)
[![License](https://img.shields.io/badge/license-GPLv3-blue.svg)](http://www.gnu.org/licenses/gpl-3.0.html)
[![donate](https://img.shields.io/badge/%24-donate-ff69b4.svg?style=flat-square)](https://www.xuxueli.com/page/donate.html)

[TOCM]

[TOC]

## 一、简介

### 1.1 概述

XXL-AI 是一个AI应用开发平台，其核心设计目标是开发迅速、学习简单、轻量级、易扩展。现已开放源代码，开箱即用。

### 1.2 特性

- 1、多模型供应商：统一接入 OpenAI 兼容协议（Deepseek、智谱GLM、Ollama、OpenCode 等），支持供应商与模型两级管理、连通性测试与远程模型导入；
- 2、RAG 知识库：知识库 + 文档管理，文档分片向量化入库（Milvus），对话时检索上下文自动注入；
- 3、MCP 工具：支持远程（Streamable HTTP）与本地（stdio）MCP 服务接入，工具自动装配给 Agent；
- 4、SKILL 技能：以 `SKILL.md` + 文件树沉淀领域知识与脚本，自动物化为 Agent 可执行的技能目录；
- 5、Agent 编排：模型 + 系统指令 + 知识库 + MCP + SKILL 组合为 Agent，一键发布为免登录公开访问地址；
- 6、流式对话：SSE 流式输出（思考过程 / 回复内容），基于 Redis Stream 无状态化，支持集群部署与断线 / 刷新续传；
- 7、空间隔离：多业务空间（Tenant）隔离数据，用户按空间授权，管理端与公开端共享权限体系；
- 8、平台底座：安全登录（XXL-SSO）、RBAC 菜单 / 按钮权限、系统管理（用户 / 配置 / 日志）、Docker Compose 一键部署。

### 1.3 下载

#### 文档地址

- [中文文档](https://www.xuxueli.com/xxl-ai/)

#### 源码仓库

| 源码仓库地址                                                                     | Release Download                                            |
|----------------------------------------------------------------------------------|-------------------------------------------------------------|
| [https://github.com/xuxueli/xxl-ai](https://github.com/xuxueli/xxl-ai)       | [Download](https://github.com/xuxueli/xxl-ai/releases)    |

#### 技术交流
- [社区交流](https://www.xuxueli.com/page/community.html)

### 1.4 环境
- Maven：3+
- Jdk：17+
- Mysql：8.0+
- NodeJs：18+（可选：前后端分离项目需要）
- Redis：7.0+（可选：前后端分离项目需要）

### 1.5 发展历程

于2019年中，整合 XXL-BOOT 中的AI插件模块，升级为独立的AI应用开发平台 XXL-AI。


## 二、快速入门

### 2.1 环境准备

- 后端：JDK 17+、Maven 3+、MySQL 8.0+、Redis 7.0+；
- 前端：Node.js 18+；

### 2.2 初始化数据库

下载项目源码并解压，获取 "数据库初始化SQL脚本" 并执行即可。数据库初始化SQL脚本 位置为:

```
/doc/db/
    - tables_xxl_ai.sql      ：建库 + 全量框架表 + 业务表 + 种子数据【必须】
```

说明：脚本首行包含 `SET NAMES utf8mb4;`，请以支持 utf8mb4 的客户端执行，避免中文注释与种子数据乱码（MySQL CLI 默认连接字符集为 latin1）。

### 2.3 源码编译

项目为 Monorepo 仓库，后端服务 与 前端工程 维护在同一个代码仓库中，通过不同目录模块隔离维护。解压源码，按 Maven 格式将源码导入 IDE，使用 Maven 编译即可，源码结构如下：

```
- xxl-ai/
    - xxl-ai-api              ：【前后端分离】后端API服务
    - xxl-ai-ui               ：【前后端分离】前端UI服务
```

编译方式：
- 后端模块：仓库根目录执行 `mvn clean package -Dmaven.test.skip=true`，一键编译全部 Maven 模块；
- 前端模块：进入 `xxl-ai-ui` 目录执行 `npm install` 安装依赖。



### 2.4 方式一：人工部署

- 部署项目：xxl-ai-api + xxl-ai-ui
- 项目说明：前后端分离模式，后端 API 与前端 UI 独立部署、独立运行。

#### 步骤一：启动后端服务

后端配置文件地址：

```
/xxl-ai/xxl-ai-api/src/main/resources/application.properties
```

配置内容说明（数据库配置，与 ”2.2 初始化数据库“ 章节初始化的数据库保持一致）：

```
### xxl-ai, datasource。 数据库配置
spring.datasource.url=jdbc:mysql://127.0.0.1:3306/xxl_ai?useUnicode=true&characterEncoding=UTF-8&autoReconnect=true&serverTimezone=Asia/Shanghai
spring.datasource.username=root
spring.datasource.password=root_pwd
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

### xxl-ai, redis。 缓存配置（前后端分离项目依赖，用于登录态存储等）
spring.data.redis.host=localhost
spring.data.redis.port=6379
spring.data.redis.database=0
spring.data.redis.password=
```

补充说明：
- 后端服务默认端口为 `8090`，可通过 `server.port` 调整；
- 前后端分离项目依赖 Redis，部署前需确保 Redis 服务可用。

后端启动方式：

```
cd /xxl-ai/xxl-ai-api
mvn spring-boot:run     # 启动后服务监听 http://localhost:8090
```

#### 步骤二：前端环境配置

配置文件地址（按环境区分，位于前端工程根目录）：

```
/xxl-ai/xxl-ai-ui/.env.development   # 开发环境
/xxl-ai/xxl-ai-ui/.env.staging       # 预发布环境
/xxl-ai/xxl-ai-ui/.env.production    # 生产环境
```

配置内容说明：

```
# 前端端口号
VITE_APP_PORT=3000

# 后端API地址
VITE_API_URL=http://localhost:8090
# 后端路由前缀
VITE_APP_BASE_API='/api'
```

补充说明：
- `VITE_API_URL`：后端 API 服务地址，开发模式下由 Vite 代理转发，生产模式下由前端 Web 服务器（如 Nginx）反向代理；
- `VITE_APP_BASE_API`：后端路由前缀，默认 `/api`，前端请求会统一添加此前缀，代理或反向代理时需将其移除并转发至后端服务。

#### 步骤三：部署前端项目（本地开发）

开发模式下，进入前端目录，安装依赖并启动即可：

```
cd /xxl-ai/xxl-ai-ui
npm install
npm run dev
```

启动后访问 `http://localhost:3000`，开发服务器会将 `/api` 前缀的请求自动代理至 `VITE_API_URL` 指定的后端服务。

#### 步骤四：部署前端项目（生产）

生产模式下，构建产物后部署至 Web 服务器（如 Nginx），并配置反向代理转发 API 请求：

```
npm run build             # 构建产物输出至 dist 目录
```

Nginx 反向代理配置示例：

```
server {
    listen       3000;
    server_name  localhost;

    # 前端静态资源
    root  /usr/share/nginx/html;
    index index.html;

    # 单页应用路由支持（前端 History 模式）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端API反向代理
    location /api/ {
        proxy_pass   http://127.0.0.1:8090/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

项目部署完成后，可通过如下地址及账号进行登录。
- 访问地址：http://localhost:3000 （按实际部署配置调整）
- 默认登录账号："admin/123456"

### 2.5 方式二：Docker Compose 部署

支持 Docker Compose 一键部署：

```
// 第一步：前往仓库目录，并构建项目
cd ./xxl-ai
mvn clean package -Dmaven.test.skip=true

// 第二步：进入 docker 目录，自定义 .env 配置（如修改 MYSQL_PATH 配置设置 Mysql 数据持久化目录）
cd ./docker/
cat .env

// 第三步：启动/停止项目
docker compose up -d
docker compose down
```


## 三、操作指南

启动后端（8090）与前端（3000）后，访问 `http://localhost:3000`，使用默认账号 `admin/123456` 登录。以下按“从零搭建一个可对话 Agent”的顺序说明。

### 3.1 登录与空间切换

- 登录页输入账号 / 密码与验证码（验证码开关由系统配置 `system.login.captcha.enabled` 控制）；
- 登录态基于 XXL-SSO 存于 Redis，支持集群部署共享；登录后默认进入仪表盘；
- 顶部导航提供**空间切换器**：管理员可见全部空间，普通用户仅见已授权空间；切换后请求自动携带 `xxl-space-id` 请求头，业务数据按空间隔离。

### 3.2 配置供应商与模型

- 「供应商管理」新增供应商：填写名称、接口地址（OpenAI 兼容 `base_url`）、API Key，可选请求 Header（value 支持 `{session}` 占位，用于按会话透传）；
- 保存后可执行「连通性测试」；进入「模型管理」可拉取远程模型列表批量导入，或手工新增；模型类型区分 **对话 / 嵌入**；
- 对话模型用于 Agent 对话，嵌入模型用于知识库向量化。

### 3.3 创建知识库并向量化

- 「知识库管理」新增知识库：选择向量化供应商与嵌入模型，设置分片大小 / 重叠 / 检索数量；
- 进入知识库的「文档管理」，粘贴或上传（txt / md）文档，执行「向量化」写入 Milvus，状态变为「已向量化」；
- 支持文档检索测试；向量化后的知识库可在 Agent 中绑定，对话时自动检索并注入上下文。

### 3.4 配置 MCP 服务

- 「MCP管理」新增服务：远程选择 Streamable HTTP 并填写 URL / Headers；本地选择 stdio 并填写 `command / args / env / cwd`；
- 保存后可「测试」连通性并查看工具列表；MCP 工具可在 Agent 中绑定启用。

### 3.5 编写 SKILL

- 「SKILL管理」新增技能：自动播种固定骨架 `SKILL.md` + `scripts/` + `reference/`（`SKILL.md` 与两个目录为固定节点，禁止删除 / 改名 / 移动）；
- 在「内容」页以文件树 + Markdown 编辑维护技能内容，支持新增目录 / 文件、重命名、移动；
- 技能内容变更会刷新 SKILL 更新时间，Agent 下次使用时自动重新物化到本地技能目录。

### 3.6 创建并发布 Agent

- 「Agent管理」新增 Agent：选择对话模型、编写系统指令，绑定知识库 / MCP / SKILL（均支持多选）；
- 保存后「发布」，系统生成访问 UUID（未发布 / 停用的 Agent 不可公开访问）；
- 管理端可查看该 Agent 的访客对话与消息记录。

### 3.7 访问对话（公开端）

- 发布后通过公开地址 `/chat/{uuid}` 访问（免登录），页面自动创建 / 切换会话，输入问题即时流式返回；
- 支持思考过程折叠展示、Markdown 实时渲染；
- 生成中刷新页面或网络中断会自动断点续传，不丢失已生成内容（原理见 5.5）。

## 四、功能模块

略

## 五、总体设计

### 5.1、Monorepo 仓库

项目采用 Monorepo 仓库模式，将 后端服务 与 前端工程 维护在同一个代码仓库中，通过不同目录模块隔离维护，统一版本管理与依赖管理，便于协同开发与一键构建。

- 后端统一通过 Maven 父工程管理，根目录 `pom.xml` 集中维护模块依赖版本（如 SpringBoot、Mybatis、MySQL、XXL-SSO 等），子模块 `xxl-ai-api` 继承使用；
- 前端模块 `xxl-ai-ui` 独立通过 npm 管理依赖（Vue3/Vite/ElementPlus/TypeScript），与后端 Maven 工程解耦；
- `doc/db` 集中管理数据库初始化脚本（建库 + 全量框架表 + 种子数据单文件初始化）；
- `.agents/skills` 集中管理 开发 SKILL（xxl-ai），为 AI 辅助开发提供平台级规范。

仓库目录结构如下：

```
xxl-ai/
│
├── pom.xml                                    # 父工程Maven配置：统一管理模块及依赖版本
├── README.md                                  # 项目说明与快速开始
├── AGENTS.md                                  # 开发规范与 Skill 使用指南
├── .agents/skills/                            # 【AI 开发 SKILL 目录】
│   └── xxl-ai/SKILL.md                        # 开发 Skill（name: xxl-ai）
│
├── doc/                                       # 文档目录
│   ├── db/                                    # 数据库脚本目录
│   │   ├── tables_xxl_ai.sql                  # 建库 + 框架表 + 业务表 + 种子数据【必须】
│   └── XXL-AI官方文档.md                      # 官方文档
│
├── docker/                                    # Docker Compose 编排目录（mysql + redis + api + ui）
│   ├── docker-compose.yml                     # 一键部署编排
│   ├── .env                                   # 部署环境变量
│   └── nginx.conf                             # 前端 Nginx 配置（反向代理 /api）
│
├── xxl-ai-api/                              # 【前后端分离】后端API服务（8090）
│   ├── pom.xml                                # Maven配置（继承父工程）
│   ├── Dockerfile                             # 容器构建配置
│   └── src/main/
│       ├── java/com/xxl/ai/api/
│       │   ├── XxlAiApiApplication.java       # 启动类
│       │   ├── framework/                     # 平台内置：系统管理、登录鉴权、审计日志、工具组件等
│       │   └── business/                      # 业务扩展包：space/supplier/knowledge/mcp/skill/agent/chat/llm
│       └── resources/
│           ├── application.properties         # 主配置文件
│           ├── mapper/
│           │   ├── framework/                 # 核心 MyBatis 映射文件
│           │   └── business/{module}/           # 【扩展点】业务扩展 MyBatis 映射文件（按模块平铺）
│           └── i18n/                          # 后端国际化资源（message_{zh_CN,zh_TC,en}.properties）
│
└── xxl-ai-ui/                               # 【前后端分离】前端UI服务（3000）
    ├── package.json                           # 前端依赖配置
    ├── vite.config.ts                         # Vite构建配置
    ├── Dockerfile                             # 容器构建配置
    └── src/
        ├── main.ts                            # 入口文件
        ├── modules/                           # 模块自包含目录（页面/接口/类型聚合）
        │   ├── framework/                     # 平台内置模块（auth/system/dashboard/help/common）
        │   └── business/                      # 业务模块（space/supplier/knowledge/mcp/skill/agent/chat）
        ├── composables/                       # 组合式函数（usePageParams/useEnumOption 等）
        ├── components/                        # 通用组件（RightToolbar/Pagination/Editor 等）
        ├── directive/                         # 自定义指令（v-hasPermi/v-hasRole）
        ├── i18n/                              # 文案中心（locales/{zh,en}.json）
        ├── layout/ · router/                  # 布局与路由
        ├── store/                             # 状态管理
        ├── utils/                             # 工具类
        ├── types/                             # 全局基础类型类型
        └── default-settings.ts                # 全局配置
```

补充说明：
- 构建：后端模块在仓库根目录执行 `mvn clean package` 即可一键编译全部 Maven 模块；前端模块进入 `xxl-ai-ui` 目录执行 `npm install`、`npm run dev` 即可本地启动；
- 部署：前后端分离模式部署 `xxl-ai-api` + `xxl-ai-ui`；
- 扩展：新增业务模块时，可在各模块 `business` 扩展包中开发，并配套放置 Mapper 映射文件、模板文件及配置文件。

### 5.2、前后端分离运行模式

XXL-AI 采用 前后端分离：后端 API 与前端 UI 独立部署、独立运行，共享同一套数据库与权限体系：

```
┌───────────────────────────────────────────────┐
│               XXL-AI Monorepo                 │
├───────────────────────────────────────────────┤
│             前后端分离                  │
│   xxl-ai-api + xxl-ai-ui                      │
│                                               │
│  后端：SpringBoot + MyBatis + XXL-SSO + Redis │
│  前端：Vue3 + ElementPlus + TypeScript        │
│                                               │
│  端口：8090 / 3000（Redis 依赖，独立部署）     │
└───────────────────────────────────────────────┘
```

- 后端：`xxl-ai-api`（8090），承载 登录鉴权、RBAC 权限、系统管理、AI 运行时（模型 / RAG / MCP / SKILL）等全部后端能力；
- 前端：`xxl-ai-ui`（3000），基于 Vue3 + Element Plus + TypeScript，菜单由后端下发、`loadView` 自动映射页面、零路由改动；
- 协作形态：前后端独立迭代、可独立部署（Docker 或 Nginx + Jar），团队分工协作最顺滑。

前后端共享：数据库表结构、空间与 RBAC 权限模型、登录鉴权（XXL-SSO）、系统管理能力、统一响应规范与开发 SKILL 规范。

### 5.3、安全登录验证

项目进行安全的登录验证防护设计，基于 XXL-SSO 登录认证体系（依赖 `com.xuxueli:xxl-sso-core`），支持集群部署与 SSO 单点登录集成。针对需要登录验证的接口，统一使用 XXL-SSO 提供的 `@XxlSso` 注解进行鉴权（登录态校验通过后自动注入登录用户）：

```
// 1、业务接口统一加 @XxlSso，鉴权通过后自动注入登录态
@XxlSso
@RequestMapping("/system/message/pageList")
public Response<PageModel<MessageDTO>> pageList(...) { ... }
```

登录态说明：
- 登录后登录态（token）存于 Redis（`xxl_sso_user:` keyprefix），支持集群部署共享；
- 未登录访问受保护接口时，XXL-SSO 拦截并返回统一登录失效提示；
- 需要强权限校验（RBAC 按钮级）的接口，配合业务权限标识二次校验（前端 `v-hasPermi`）；

### 5.4、AI + Skill 辅助开发设计

为让 AI 编程助手也能产出平台级规范代码，仓库在 `.agents/skills/` 内置 开发 SKILL，作为 AI 的“项目内专业规范”：

```
.agents/skills/
└── xxl-ai/SKILL.md            # 开发 Skill（name: xxl-ai）
```

每个 SKILL 均内置如下内容，保证 AI 产物符合平台规范：

- 工程结构速览与通用规范引用；
- 后端落位清单（实体 / Mapper / Service / Controller 件套、包路径、方法顺序、分页与校验约定）；
- 前端落位清单（types/api/pages）与列表页代码骨架；
- 菜单 / 按钮权限注册模板（`XxlRoleEnum` 枚举资源）与「校验清单」；
- 参考样例文件绝对路径。

工作原理：AI 编程助手检测到任务时自动加载 SKILL，按 “建表 → 后端 → 前端 → 菜单权限 → 验证” 标准流程直生代码并落位，最后按校验清单自检交付。（平台内置代码生成器已下线，统一以 SKILL 直生等价代码。）

### 5.5、流式对话（SSE）技术方案

Agent 公开对话（`/chat/**`）采用 SSE 流式交互。为支持多节点集群部署与断线续传，生成与下发完全解耦：**web 节点只负责“接收请求 + 转发结果”，LLM 生成由 worker 消费 Redis Stream 任务异步完成**，任一节点均可服务任一连接，无需粘性会话。

整体链路：

```
POST /chat/send
  └─ 请求节点：校验会话 → 落库用户消息 + 助手占位 → XADD 任务 → XREAD 结果流转发 SSE
                                   │
                        Redis Stream 任务队列（消费组）
                                   ▼
                 worker（任意节点，可独立扩容）：执行 LLM → XADD 结果流
                                   │
                                   ▼
           SSE 转发（任意节点）XREAD → 事件带 id → 客户端；断线走 /chat/resume 续传
```

组件划分（按层）：

| 层 | 组件 | 职责 |
|---|---|---|
| 接入 | `ChatController` | 仅路由透传：元数据接口走 `ChatService`，`/chat/send`、`/chat/resume` 走 `ChatStreamService` |
| 应用 | `ChatService` | 会话元数据 CRUD + 会话校验（Agent 就绪/对话归属，单一校验源） |
| 编排 | `ChatStreamService` | 发送/续传编排：校验会话 → 落库用户消息+助手占位 → 投递任务 → 委托转发 |
| 存储 | `ChatStreamStore` | Redis Stream 纯存储层：任务队列（消费组/超时认领）+ 结果流（追加/读取/TTL） |
| 生成 | `ChatGenerator` | 生成 worker（`SmartLifecycle` 托管线程）：消费任务 → LLM → 结果流 → 回填消息（status=1/2） |
| 转发 | `ChatSseForwarder` | 有界转发线程池 + 结果流 XREAD → SSE（心跳/容错，任意节点可转发） |
| 生成引擎 | `LlmAgentChatService` | 模型编排：装配上下文/工具/RAG，流式增量经回调输出（与传输层解耦） |
| 存储 | Redis Stream + MySQL | 任务队列 `xxl:ai:chat:tasks`、结果流 `xxl:ai:chat:result:{msgId}`、消息表 `xxl_ai_chat_msg` |

组件流转关系（正向发送）：

```
前端 handleSend
  └─ agentSendStream → ChatController.send → ChatStreamService.send
       ├─ submit：校验 + 落用户消息(status=1) + 助手占位(status=0) → XADD 任务
       └─ forward(emitter, msgId) → XREAD 结果流 → SSE(stream/thinking/message/ping/[DONE])

内置 worker 线程（消费组）
  └─ XREADGROUP 任务 → generate → LlmAgentChatService.chat(agent, runtime, history, content, onThinking, onContent)
       └─ 增量回调 → appendResult(msgId, ...)（并本地累积，供失败回填）
       └─ finally：updateAssistant(msgId, 内容, status=1) + appendResult([DONE]) + ack
```

组件流转关系（断线 / 刷新续传）：

```
前端 selectConv → 发现 assistant.status=0
  └─ resumeGenerating(msg.id)
       └─ ChatController.resume → ChatStreamService.resume(msgId, lastEventId)
            └─ forward → 从断点 XREAD 结果流继续 → SSE
```

组件依赖关系：

```
Controller ──> ChatService（元数据 / 校验）
           └─> ChatStreamService（发送 / 续传编排）
ChatStreamService ──> ChatService（Agent/对话校验）+ ChatMsg/ChatConvMapper + ChatStreamStore + ChatSseForwarder
ChatStreamStore   ──> Redis Stream（任务队列 / 结果流）
ChatGenerator     ──> ChatStreamStore + ChatService + LlmAgentChatService（增量写结果流）
ChatSseForwarder  ──> ChatStreamStore（XREAD 转发）
```

> 一句话：**对话域收敛在 `business/chat`**——`ChatStreamService` 只做发送/续传编排，Redis 存取在 `ChatStreamStore`、生成在 `ChatGenerator`、转发在 `ChatSseForwarder`；`ChatService` 管会话元数据与校验，`LlmAgentChatService` 经回调输出增量、与传输层解耦，`msgId`（助手占位主键）同时标识消息与结果流。

SSE 事件协议：

| 事件 | 数据 | 说明 |
|---|---|---|
| `stream` | `msgId` | 连接建立即下发（助手消息ID，即结果流标识），客户端据此断线续传 |
| `thinking` | 思考过程增量 | 推理模型 `reasoning_content`，多行内容由前端按 SSE 规范还原 |
| `message` | 回复内容增量 | Markdown 文本增量 |
| `ping` | `ping` | 空闲心跳，防止网关/浏览器空闲断开 |
| `message` | `[DONE]` | 结束标志 |
| `message` | `__ERROR__xxx` | 错误提示，随后结束 |

接口与续传：

- `POST /chat/send?uuid&visitorId&convId&content`：落库用户消息 + 助手占位后投递任务并转发；
- `POST /chat/resume?msgId&lastEventId`：从结果流 `lastEventId` 之后继续转发，不重新生成；
- `xxl_ai_chat_msg` 增加 `status`（0-生成中、1-完成、2-失败）：发送即落助手占位，**其主键 `id` 复用为结果流标识**（1:1，无需额外 stream 字段），worker 结束时回填内容与状态。刷新页面后，前端发现 `status=0` 的助手消息即据消息ID自动续传并展开思考区，生成结果不丢失。

集群与可靠性要点：

- **无状态转发**：结果流存于 Redis，任意节点可转发，节点重启/扩缩容不影响在途生成；
- **至少一次消费**：消费组保证任务不重复消费；worker 宕机后，超时未确认任务由其他节点在启动时认领（认领空闲阈值须大于单次生成最长耗时，避免误抢在途任务）；
- **连接容错**：转发线程池满时回退“服务繁忙”；单个 Redis 读取抖动退避重试，连续失败才中断，客户端可再续传；
- **保留窗口**：结果流按 TTL（默认 600s，每追加片段续期）保留，供断线/刷新续传；
- **生成不受连接影响**：客户端断开后 worker 仍会完成生成并落库，重新进入对话可直接读取。

相关配置（`application.properties`）：

```
xxl-ai.agent.stream.timeout=180000   # 单连接/单次生成最长时长(ms)
xxl-ai.chat.stream.ttl=600           # 结果流保留时长(s)，即断线/刷新可续传的时间窗
xxl-ai.chat.worker.count=2           # 单节点生成并发数
xxl-ai.chat.sse.max=64               # 单节点 SSE 转发最大并发连接数
```

其余为内部实现细节，已写死/派生、不再暴露配置，避免误配：

- XREAD 阻塞窗口固定 `5000ms`、单次批量 `50` 条；
- SSE 线程池核心数 = `sse.max / 8`、队列容量 = `sse.max * 4`；
- 宕机任务认领阈值 = `agent.stream.timeout + 60s`（确保大于单次生成最长耗时，不误抢在途任务）。

> 注意：阻塞窗口固定 5s，`spring.data.redis.timeout`（默认 10s）须大于它，否则阻塞读会抛 `RedisCommandTimeoutException`。

### 5.6、业务数据模型与空间隔离

数据库 `xxl_ai`，统一约定：表名前缀 `xxl_ai_`、字段下划线命名、`id` 主键自增、`add_time` / `update_time` 公共字段、状态字段 `TINYINT`（0-正常 / 1-停用）、全表 `utf8mb4`、唯一索引 `i_` 前缀、所有字段带 `COMMENT`；初始脚本 `doc/db/tables_xxl_ai.sql`（建库 + 全量表 + 种子数据，`SET NAMES utf8mb4`）。

表按域分组：

| 域 | 表 | 说明 |
|---|---|---|
| 平台 | `xxl_ai_user`、`xxl_ai_config`、`xxl_ai_log` | 用户、系统配置、审计日志 |
| 空间 | `xxl_ai_space`、`xxl_ai_user_space` | 业务空间、用户-空间授权 |
| 供应商 | `xxl_ai_supplier`、`xxl_ai_supplier_model` | 供应商、模型（对话 / 嵌入） |
| 知识库 | `xxl_ai_knowledge_base`、`xxl_ai_knowledge_doc` | 知识库、文档（向量化状态） |
| MCP | `xxl_ai_mcp` | MCP 服务配置 |
| SKILL | `xxl_ai_skill`、`xxl_ai_skill_file` | 技能、技能文件树 |
| Agent | `xxl_ai_agent`、`xxl_ai_chat_conv`、`xxl_ai_chat_msg` | Agent、对话、消息 |

**空间隔离**：除平台表外，业务表均带 `space_id`；管理端当前空间由请求头 `xxl-space-id` 传入，后端按空间过滤；管理员可见全部空间，普通用户按 `xxl_ai_user_space` 授权。公开对话端以 Agent 的 `uuid` + 访客 `visitorId` 隔离会话。所有关联均为应用层维护（无数据库外键）。

**权限模型**：平台菜单 / 按钮由枚举 `XxlRoleEnum#buildRoleResources` 按角色定义（已下线资源 / 角色关联表），角色 `admin` / `user`；新增页面在对应角色分支追加即可、无需改路由与数据库，浏览器按钮权限用 `v-hasPermi`。

### 5.7、AI 运行时与工具装配

- **模型工厂 `LlmModelFactory`**：按供应商配置程序化构建 OpenAI 兼容的 `OpenAiChatModel` / `OpenAiEmbeddingModel`（`spring.ai.model.*=none` 关闭自动装配），按「供应商 + 模型 + 会话」LRU 缓存，Header value 支持 `{session}` 占位；
- **对话编排 `LlmAgentChatService`**：装配「系统指令 + 历史消息 + 当前提问 + 工具 + RAG Advisor」，经 `ChatClient` 流式对话，思考过程（`reasoningContent`）与回复内容经回调增量输出；
- **RAG `RagService` / `VectorStoreFactory`**：每知识库对应一个 Milvus 集合 `kb_base_{baseId}`（COSINE / FLAT），文档分片向量化写入，检索经 `QuestionAnswerAdvisor` 自动注入上下文；
- **MCP `McpToolFactory`**：`McpClient` 基于官方 Java MCP SDK（stdio / Streamable HTTP），将 MCP 工具转换为 spring-ai `ToolCallback`；
- **SKILL `SkillToolFactory`**：将 DB 技能文件树物化为 `{skill.root}/agent_{agentId}/{skillName}/`，构建 `SkillsTool` 及配套 shell / 文件执行工具（bash、Read/Write/Edit、Glob、Grep、List），技能内容变更按更新时间指纹自动重建；
- **工具装配顺序**：`buildTools` 依次装配 MCP 工具 + Skill 工具 + 执行工具，统一以 `Object` 列表随请求传入，spring-ai 自动解析注册。

## 六、版本更新日志

### 版本 v1.0.0 Release Notes[ING]
- 1、【初始化】XXL-AI 基于 XXL-Boot v2.1.1（前后端分离 Vue 模式）初始化成立，项目更名为 XXL-AI；
- 2、【工程】构建 后端 `xxl-ai-api`（8090）与 前端 `xxl-ai-ui`（3000）双工程，数据库统一托管 `xxl_ai`；
- 3、【能力】内置 安全登录（XXL-SSO）、RBAC 权限管控、空间隔离、系统管理、AI + SKILL 加速开发 等平台能力；
- 4、【部署】随带 Docker Compose 一键部署栈（mysql + redis + api + ui）；
- 5、【AI 底座】基于 spring-ai 2.0.1：OpenAI 兼容模型工厂、Milvus 向量库（RAG）、官方 MCP SDK、Skill 工具；全部表随 `doc/db/tables_xxl_ai.sql` 初始化。
- 6、【功能】新增：空间管理、供应商/模型管理、知识库/文档管理、MCP管理、SKILL管理、Agent管理；
- 7、【功能】Chat 流式对话 SSE 无状态化改造：Redis Stream 任务队列解耦生成与下发，支持集群部署、断线/刷新续传（详见 5.5）；
- 8、【功能】Agent 消息占位与生成状态：助手消息落占位（生成中/完成/失败），消息ID复用为结果流标识，支持刷新页面自动续传；
- 9、【设计】Skill 本地文件简化：目录按 `agent_{agentId}/{skillName}` 物化，变更指纹简化为 `技能ID:更新时间`，变更时整目录重建；

### TODO LIST

- 1、AI 能力增强：
  - WorkFlow 定义：工作流及 Agent/模型编排定义、执行与日志、分布式执行；
  - 知识库：多类型文档（Word / PDF / 图片）解析与向量化；
  - Agent 生图：文生图 / 图生图，支持集成多模型供应商；
  - Agent 生视频：文生视频 / 图生视频，支持集成多模型供应商；
  - 生图 Agent：生图流程设计，集成本地 Vision 模型；
  - Chat 对话增强：对话记忆控制、多模态输入；
- 2、已完成（v0.0.1）：
  - 多模型供应商与模型管理（连通性测试、远程模型导入）；
  - 知识库 + 文档向量化（Milvus RAG，检索注入）；
  - MCP 接入（远程 Streamable HTTP / 本地 stdio）与工具装配；
  - SKILL 技能文件树与本地物化（SkillsTool + 执行工具）；
  - Agent 编排（模型 + 指令 + 知识库 + MCP + SKILL）与一键发布公开访问；
  - 前端 SSE 交互（流式、思考过程折叠、Markdown 渲染、断线 / 刷新续传）；
  - 空间隔离与用户授权；


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
无论金额多少都足够表达您这份心意，非常感谢 ：）      [前往捐赠](https://www.xuxueli.com/page/donate.html )