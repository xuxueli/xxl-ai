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

- 1、XX
- 2、XX

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
    - tables_xxl_ai.sql      ：建库 + 全量框架表 + 种子数据【必须】
```

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

（内容整理中……）

## 四、新增业务模块

（内容整理中……）

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
│   ├── db/                                    # 数据库初始化SQL脚本目录
│   │   ├── tables_xxl_ai.sql                  # 建库 + 框架表 + 种子数据（含菜单图标）【必须】
│   │   └── plugin/                            # 扩展插件 SQL 脚本（AI 模型/对话 等）
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
│       │   ├── framework/                     # 核心包：项目配置、系统管理、工具组件等
│       │   └── business/                      # 【扩展点】业务扩展包（可插拔）
│       └── resources/
│           ├── application.properties         # 主配置文件
│           ├── mapper/
│           │   ├── framework/                 # 核心 MyBatis 映射文件
│           │   └── {module}/{business}/       # 【扩展点】业务扩展 MyBatis 映射文件
│           └── i18n/                          # 国际化资源文件
│
└── xxl-ai-ui/                               # 【前后端分离】前端UI服务（3000）
    ├── package.json                           # 前端依赖配置
    ├── vite.config.ts                         # Vite构建配置
    ├── Dockerfile                             # 容器构建配置
    └── src/
        ├── main.ts                            # 入口文件
        ├── modules/                           # 模块自包含目录（页面/接口/类型聚合）
        │   ├── framework/                     # 平台内置模块（authz/system/tool/dashboard…）
        │   └── business/                      # 【扩展点】业务模块
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

- 后端：`xxl-ai-api`（8090），承载 登录鉴权、RBAC 权限、系统管理、代码生成 等全部后端能力；
- 前端：`xxl-ai-ui`（3000），基于 Vue3 + Element Plus + TypeScript，DB 菜单 url 驱动、零路由改动；
- 协作形态：前后端独立迭代、可独立部署（Docker 或 Nginx + Jar），团队分工协作最顺滑。

前后端共享：数据库表结构、RBAC 权限模型、登录鉴权（XXL-SSO）、系统管理能力、代码生成器与开发 SKILL 规范。

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
- 需要强权限校验（RBAC 按钮级）的接口，配合业务权限标识二次校验（见 5.3）。

### 5.4、统一响应与交互规范

- 统一返回结构 `Response{ code、msg、data }`（`com.xxl.tool.response.Response`），code 200 表示成功；
- 分页统一返回 `Response<PageModel>`；分页入参统一 `offset`、`pagesize`；
- 接口路径规范：`/{module}/{business}/pageList|load|insert|delete|update`，业务接口统一 `@RequestMapping("/{module}/{business}")` + `@XxlSso` 鉴权；
- 前端取值约定：`response.data`（成功数据）、`response.data.data`（列表）、`response.data.total`（总数）；
- Mapper XML 中显式配置字段映射（resultMap），`add_time` / `update_time` 写入用 `NOW()`。

### 5.5、业务扩展与菜单零路由

新增业务模块遵循“平台核心不动、业务可插拔”的扩展原则：

- 平台核心：`framework` 包仅承载平台内置能力（登录、权限、系统管理、工具等），不承载具体业务；
- 业务扩展：新增业务一律落位到 `business/{module}` 包（后端）、`resources/mapper/{module}/{business}/`（Mapper XML）；
- 菜单零路由：平台菜单由枚举 `XxlRoleEnum` 定义（各角色资源列表 static 代码块初始化），新建页面文件后在对应角色 static 资源列表追加菜单项（`url` 配置为 `/module/business`）即可，前端 `loadView` 自动映射页面，全程无需改动路由代码；
- 模块/业务命名：两级命名 `{module}/{business}`，`{module}` 为业务模块域（对应后端包 `business.{module}`、权限前缀 `{module}:*`，可聚合多个业务页），`{business}` 为具体业务页/实体名（对应 Controller 与菜单 url）；
- 前后端落位对照：

```
后端   Controller  business/{module}/{business}               （com.xxl.ai.api.business.{module}.{business}）
后端   Mapper XML  resources/mapper/{module}/{business}/
前端   页面        src/modules/business/{module}/{business}/pages/index.vue
前端   接口封装    src/modules/business/{module}/{business}/api/index.ts
前端   类型        src/modules/business/{module}/{business}/types/index.ts
菜单   XxlRoleEnum 角色 static 资源列表（type=0/1/2，url 驱动零路由改动）
```

### 5.6、AI + Skill 辅助开发设计

为让 AI 编程助手也能产出平台级规范代码，仓库在 `.agents/skills/` 内置 开发 SKILL，作为 AI 的“项目内专业规范”：

```
.agents/skills/
└── xxl-ai/SKILL.md            # 开发 Skill（name: xxl-ai）
```

每个 SKILL 均内置如下内容，保证 AI 产物与人工/生成器产物等价：

- 工程结构速览与通用规范引用；
- 后端落位清单（实体 / Mapper / Service / Controller 件套、包路径、方法顺序、分页与校验约定）；
- 前端落位清单（types/api/pages）与列表页代码骨架；
- 菜单权限 SQL 模板与「校验清单」；
- 参考样例文件绝对路径。

工作原理：AI 编程助手检测到任务时自动加载 SKILL，按 “建表 → 后端 → 前端 → 菜单权限 → 验证” 标准流程直生代码并落位，最后按校验清单自检交付。SKILL 缺省策略为按内置代码生成模板直生等价代码，同时提示用户可到后台走生成器，两种产出完全一致、可无缝切换。详见 “4.1 方式一：AI + SKILL 驱动开发”。

## 六、版本更新日志

### 版本 v0.0.1 Release Notes[2026-09-04]
- 1、【初始化】XXL-AI 基于 XXL-Boot v2.1.1（前后端分离 Vue 模式）初始化成立，项目更名为 XXL-AI；
- 2、【工程】构建 后端 `xxl-ai-api`（8090）与 前端 `xxl-ai-ui`（3000）双工程，数据库统一托管 `xxl_ai`；
- 3、【能力】内置 安全登录（XXL-SSO）、权限管控、系统管理、端到端代码生成、AI + SKILL 加速开发 等平台能力；
- 4、【部署】随带 Docker Compose 一键部署栈（mysql + redis + api + ui）；
- 5、【扩展】预留 AI 插件扩展：AI 模型管理、Chat 对话、知识库 等（`doc/db/plugin` 插件 SQL，依赖 spring-ai）。

### 版本 v0.0.2 Release Notes[ING]
- 待续。

### TODO LIST
- 1、AI项目独立：
  - 模块：
    - Model配置：Model配置管理，支持多Model类型，包括：基础模型、文本模型、视觉模型...等；支持多模型供应商，包括：Ollama、OpenAI...等。
    - Chat对话：Chat对话管理，支持自定义Prompt、Model参数；支持历史对话消息持久化，保留历史对话记忆；可基于此支持多场景，包括：智能客服、聊天助手...等；
    - 知识库：知识库管理，支持知识库管理、索引、检索等；支持多知识库类型，包括：Text、Word、PDF、图片...等；
    - WorkFlow定义：WorkFlow定义管理，支持工作流及Agent/模型的编排定义；工作流执行及日志记录，支持分布式工作流执行以及执行日志记录；
    - Agent生图：文生图、图生图；生图流程设计，支持集成多模型供应商；
    - Agent生视频：文生视频、图生视频；支持集成多模型供应商；
  - Chat对话增强；
    - 前端SSE交互；
    - 对话记忆控制；
    - 代码重构，多模块可扩展设计；
  - 生图Agent：生图流程设计，集成本地Vision模型；


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