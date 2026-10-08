# XXL-AI 脚手架使用与开发规范

以 XXL-AI 为脚手架开发业务，请先明确自己的运行模式，再按对应 Skill 的标准流程作业。

## 一、项目概览

XXL-AI 是 AI应用开发平台，采用 Monorepo 统一托管「后端服务」与「前端工程」，可一键构建部署。

| 模块 | 说明 |
|---|---|
| `xxl-ai-api` | 后端 API（Spring Boot），端口 8080，SSO 登录态存 Redis；部署期前端产物内嵌于此，单包单端口对外 |
| `xxl-ai-ui` | Vue3 前端（Element Plus + TypeScript + Vite），开发端口 3000（Hash 路由） |
| `xxl-ai-sample` | 示例 MCP 服务（spring-ai MCP Server 注解式 `@McpTool`，Streamable HTTP），端口 8091 |
| `doc/db` | 数据库初始化脚本（`xxl_ai`：用户/配置/审计日志等框架表与种子数据） |
| `docker` | 一键部署栈（mysql + redis + milvus(etcd/minio/attu) + api(内嵌前端) + sample） |

通用依赖：`xxl-tool`（工具与统一响应，经 `xxl-sso-core` 传递）、`xxl-sso`（登录鉴权，注解 `@XxlSso`）、MyBatis（Mapper + XML）、MySQL、Redis、spring-ai（OpenAI 兼容模型 / Milvus 向量库 / MCP SDK）。

## 二、 Skill 速查

本项目按交付形态提供两个 Skill：云版 `xxl-ai`（`.agents/skills/xxl-ai/SKILL.md`，服务 `xxl-ai-api` + `xxl-ai-ui`）与本地版 `xxl-ai-desk`（`.agents/skills/xxl-ai-desk/SKILL.md`，服务 Electron 桌面客户端 `xxl-ai-desk`），分别描述对应模式「新增/改造一个业务模块」的完整落位与模板；本项目已内置可复现的执行环境会自动发现并加载匹配的 Skill。启动项目前先看第三节，写代码前先加载对应模式的 Skill。

## 三、快速开始

前置环境：JDK 17+、Maven 3.6+、Node 22+、MySQL 8、Redis（RAG 向量化另需 Milvus）。

### 3.1 初始化数据库

```sql
-- 建库 + 全量框架表 + 种子数据（角色/菜单由 XxlRoleEnum 枚举定义，无需资源表）
source doc/db/tables_xxl_ai.sql;
```

数据库连接配置在 `xxl-ai-api/src/main/resources/application.properties`（默认 `jdbc:mysql://127.0.0.1:3306/xxl_ai`，root）。默认账号 `admin` / `123456`。

### 3.2 本地启动

```bash
# 后端 API（Redis 需先启动；RAG 向量化另需 Milvus）
cd xxl-ai-api && mvn spring-boot:run     # 8080

# 前端（本地代理 /api → 8080）
cd xxl-ai-ui && npm i && npm run dev     # 3000

# 示例 MCP 服务（可选，供「MCP管理」连通测试联调）
cd xxl-ai-sample && mvn spring-boot:run     # 8091
```

或一键 docker 部署栈（含 mysql + redis + milvus + api(内嵌前端，8080 直接访问) + sample，**需先构建各模块 jar**）：

```bash
# 1、构建前端并同步产物：npm run build 构建 dist，npm run sync:dist 清理并复制到 xxl-ai-api 静态资源目录
cd xxl-ai-ui && npm i && npm run build && npm run sync:dist && cd ..
# 2、全量构建：api 打包含前端的内嵌 jar；同时生成 sample 等模块 jar（镜像各自打包其 target jar）
mvn clean package -Dmaven.test.skip=true
# 3、启动部署栈
cd docker && docker compose up -d --build
```

> 注意：`xxl-ai-api` 与 `xxl-ai-sample` 的 Dockerfile 均为 `ADD target/*.jar`，故 compose 构建前必须完成对应模块打包；只跑 `-pl xxl-ai-api` 会导致 sample 镜像构建报 `lstat .../target: no such file`。

### 3.3 合并部署（前端内嵌进 API，单包单端口）

开发期前后端分开启动；部署期前端产物内嵌进 API jar，单进程单端口（8080）同时提供页面与接口：

```bash
# 1、构建前端并同步产物：npm run build 构建 dist，npm run sync:dist 清理并复制到 xxl-ai-api 静态资源目录
cd xxl-ai-ui && npm i && npm run build && npm run sync:dist && cd ..
# 2、打包含前端的内嵌 jar
mvn clean package
java -jar xxl-ai-api/target/xxl-ai-api-*.jar   # 访问 http://localhost:8080
```

- 前端路由为 **Hash 模式**（`/#/xxx`），无需服务端 SPA 回退；生产 `VITE_APP_BASE_API` 为空、接口拍平到根路径，开发仍走 `/api` + Vite 代理。
- Docker 打包复用 `xxl-ai-api/Dockerfile`（`ADD target/xxl-ai-api-*.jar`），故需先执行上面的前端构建与 `mvn package`，生成内含前端的 jar。

## 四、工程结构与业务代码落位

### 4.1 后端（xxl-ai-api）

框架代码按分层分包，根包 `com.xxl.ai.api`：

```
com/xxl/ai/api/framework
├── controller/{system,base}                 /* 接口入口，只做参数接收与校验 */
├── service/  +  service/impl/               /* 业务逻辑：接口 + 实现 */
├── mapper                                   /* 数据访问接口 */
├── model/{entity,dto,adaptor}               /* 实体 / 展示DTO / 实体转DTO */
├── constant/{enums,consts}                  /* 枚举与常量 */
├── web/{xxlsso,xxllog,error}                /* 登录态、审计日志、错误页 */
├── annotation · config · util               /* 注解、配置、工具 */
```

**新增业务一律落 `business/{module}` 模块包**（同名业务一级化，可聚合多个业务；`framework` 仅属于平台内置能力，不要塞业务）：

- 后端 `com.xxl.ai.api.business.{module}`（controller/service/mapper/model/enums 子包），业务同名时直接一级目录（如 `business/skill`、接口 `/skill`），多业务模块按 `/{module}/{business}` 组织（如 `business/supplier` 聚合供应商+模型、`business/knowledge` 聚合知识库+文档）；`mapper/{module}/...` 遵循模块级约定。
- 前端 `src/modules/business/{module}/`（pages/api/types 子目录聚合），与后端包名一致；接口路径 `/{module}`（同名）或 `/{module}/{business}`（多业务）。

> ⚠️ **业务目录囊括全部操作入口**：`business/{module}` 是**功能完备**的业务模块——包含该模块**全部 CRUD 与其对外操作入口**（controller/service/mapper/model 齐全，非元数据操作也在本模块暴露 controller 入口）；`business/harness` 只是服务于各业务模块的**底层支撑**，**无自己的 controller**。细则见 **4.3 harness 支撑层**。

Mapper XML 对应：`resources/mapper/framework/...`（平台内置）与 `resources/mapper/business/{module}/`（业务 Mapper XML 按模块平铺于该目录，文件名标识业务，前缀 `business/` 与后端 `business` 根包一致）。

### 4.2 前端（xxl-ai-ui）

模块化统一管理：全部模块按「模块自包含」落位 `src/modules`，顶级用 `framework/`（平台内置：auth/system/dashboard/help/…）与 `business/`（项目业务）隔离；同一模块的页面、接口、类型以 `pages/`、`api/`、`types/` 三个子目录聚合维护，模块内共享的组件/组合式函数可另置 `components/`、`composables/`。

```
src
├── modules/{framework|business}/{domain}/{module}/   /* 模块自包含目录 */
│   ├── pages/                    /* 页面 + 页内组件（index.vue、model.vue、doc.vue…，弹窗内联于页面） */
│   ├── api/                      /* 接口封装（index.ts，同目录聚合） */
│   ├── types/                    /* 类型定义（index.ts，同目录聚合） */
│   ├── components/               /* 可选：模块内共享组件（如 chat/MarkdownView.vue） */
│   └── composables/              /* 可选：模块内组合式函数（如 chat/useChatStream.ts） */
├── composables                   /* usePageParams / useEnumOption / useFormReset */
├── i18n                          /* 文案中心：locales/{zh,en}.json（JSON 数据纯存储，t() 引用） */
├── components / directive / utils / store   /* 平台公共层（框架与业务共用） */
└── types/index.ts                /* 全局基础类型（Response/PageModel/PageQuery…） */
```

- 平台内置示例：`src/modules/framework/auth/`（登录：pages/login.vue + api/）、`src/modules/framework/system/user/`、`src/modules/framework/system/log/`（pages/index.vue + api/ + types/）、`src/modules/framework/dashboard/`（pages/index.vue + api/）等。
- 业务新增示例：`src/modules/business/{module}/`（pages/index.vue + api/index.ts + types/index.ts，弹窗内联于列表页），与后端 `com.xxl.ai.api.business.{module}` 对齐；多业务模块在模块内聚合（如 `supplier` 下 pages 分 index.vue 与 model.vue、`knowledge` 下分 base/ 与 doc/）。

### 4.3 harness 支撑层（模型与 Agent harness 统一归口）

分层定位（**两条铁律**）：

1. **`business/{module}` 是功能完备的业务模块**：包含全部 CRUD 与**全部对外操作入口**（controller/service/mapper/model 齐全），业务编排（校验、空间归属、状态回写、DTO 组装）一律留在这里。
2. **`harness` 是运行时支撑层**：收敛模型构建/对话执行、对话生成 worker（任务队列 + 结果流 + SSE 转发）、MCP/向量库/技能沙箱等运行时能力；**不定义 Controller、不做空间归属校验**，业务 CRUD 仍留 `business/{module}`（`harness/chat/ChatStreamTool` 按 uuid 复校 Agent 并回填消息，是对话域运行时的既定例外）。

```
com/xxl/ai/api/business/harness          ← 运行时支撑层：无 controller（对外操作入口仍在 business）
├── llm         LlmModelFactory（对话/嵌入模型构建）、LlmChatTool（单轮流式对话执行，内嵌 ChatText） */
├── chat        ChatStreamTool（对话生成 worker：任务队列 + 生成消费 + 结果流 + SSE 转发） */
├── rag         RagTool（向量化/检索/清理/Advisor，内聚 Milvus + 分片） */
├── mcp         McpClientTool（连接/传输 + 列举/调用/连通测试；内嵌 McpToolInfo/McpConnectResult/McpToolDetail）、McpToolFactory（MCP 工具回调） */
├── skill       SkillToolFactory（技能物化+执行沙箱） */
└── supplier    SupplierApiTool（供应商 HTTP 探测工具） */
```

**边界判定（一句话）**：这段逻辑是不是「业务编排」（校验归属、读写业务状态、组装返回）？是 → 留 `business/{module}` 的 Service；它调用的**底层调用/执行能力**（HTTP、SDK、模型、向量库、进程沙箱、对话流队列/SSE）→ 落 `harness`。

- **操作入口全部在 business**：`business/{module}` 各模块自带完整 controller/service/mapper/model，所有对外接口入口（含非元数据操作）都在本模块的 Controller 暴露，路径不变。harness **不定义任何 `@RestController`**。
- **business → harness 单向依赖**：业务 Service/Controller 需要底层能力时**直接注入 harness 的工具类**，例如：
  - `AgentServiceImpl`（删 Agent 清理沙箱）→ `harness.skill.SkillToolFactory#evict`；
  - `KnowledgeDocServiceImpl`（向量化/检索/清向量）→ `harness.rag.RagTool`；
  - `KnowledgeBaseServiceImpl`（删库/换嵌入模型清向量与失效缓存）→ `harness.rag.RagTool`；
  - `SupplierServiceImpl`（连通测试/拉远程模型）→ `harness.supplier.SupplierApiTool`；
  - `McpServiceImpl`（连通测试/删释放连接）→ `harness.mcp.McpClientTool`；
  - `ChatService`（business/chat/service，对话发送/续传入口）→ `harness.chat.ChatStreamTool`（对话生成 worker：任务队列/结果流/SSE 转发 + 生成编排，内部经 `harness.llm.LlmChatTool`、`harness.mcp.McpToolFactory`、`harness.skill.SkillToolFactory`、`harness.rag.RagTool`）。
- **harness 允许反向读取 business 元数据**：harness 运行时按 ID 经 business 的 Mapper/Service 读取配置（如 `AgentMapper`、`KnowledgeBaseMapper`、`SupplierService`），属预期依赖，不把 CRUD 挪进 harness。
- **判归 harness 的典型工具**：模型构建与对话执行、对话生成 worker / 任务队列 / 结果流 / SSE 转发、MCP 连接与调用、向量库读写与检索、技能物化与终端/文件沙箱、供应商 HTTP 探测。
- **反向约束**：`harness` **不得定义 Controller、不得新增元数据表**；空间归属校验与业务 CRUD 仍留 `business/{module}`（`harness/chat/ChatStreamTool` 属对话域运行时例外）；`business/{module}` 不得再新增 `client/rag/tool/stream` 等运行时子包，也不得直接依赖 spring-ai / Milvus / MCP SDK / Redis 等运行时组件（一律经 harness）。

> 术语澄清：`harness` 承载运行时支撑（模型/对话执行/对话生成 worker/任务队列/结果流/SSE 转发/工具/RAG/MCP/技能沙箱）；对外操作入口仍在 `business/{module}`，harness 不定义任何 `@RestController`。harness 内新增能力优先命名 `XxxTool` / `XxxClient` / `XxxFactory`。

### 4.4 菜单零路由改动约定

平台菜单由枚举 `XxlRoleEnum` 定义（各角色资源列表由 `buildRoleResources(role)` 统一构建，已下线 `xxl_ai_resource`/`xxl_ai_role_res` 表），**新增页面无需动路由代码**：

- Vue：界面文件 `modules/{framework|business}/{domain}/{module}/pages/{xxx}(/index).vue` 建好后，登录后由 `/getRouters` 按当前用户角色下发菜单资源构建动态路由；`url` 同时充当路由 path 与前端组件定位 key，前端 `loadView` 按 `modules/` 下相对路径（自动剥离 `framework/`/`business/` 与 `pages/` 段）映射对应页面（如 `/system/user` → `modules/framework/system/user/pages/index.vue`）。
- 新增平台菜单：在 `XxlRoleEnum#buildRoleResources` 对应角色分支中追加 `Resource` 项（`url` 指向页面路径），即可对该角色可见、无需改路由与数据库。

## 五、新功能开发标准流程

1. **建表**：数据库新建 `xxl_ai_*` 业务表（规范见 6.5）。
2. **生成/手写代码**：按对应 Skill 模板直接生成等价代码。
3. **落位与权限**：按对应 Skill 落位后端/前端文件；在 `XxlRoleEnum#buildRoleResources` 对应角色分支追加菜单/按钮项。
4. **联调验证**：起后端 + 前端，验证菜单可见、CRUD 可用、权限生效。
5. **规范复核**：对照第六节规范与 Skill 内「校验清单」过一遍再提交。

> 标准动作在开发前加载对应模式 Skill：云版 `xxl-ai`、本地版（Desk）`xxl-ai-desk`。

## 六、代码规范

### 6.1 通用约定

- 使用中文沟通、中文注释。
- 命名：类名大驼峰、变量/方法小驼峰；命名表达真实语义，避免无意义单字母与拼音；常量全大写 + 下划线。
- 布尔属性不使用 `isXxx` 前缀命名，避免与 getter 冲突。
- 注释覆盖 Java 与前端文件：文件顶部一行功能描述，间隔一行加 `@author 作者 yyyy-mm-dd`；方法注释用 `/* xxx */` 多行；属性注释在右侧 `/* xxx */` 垂直对齐；方法内部分支逻辑也需注释；已有注释需符合上述要求。
- 避免过度设计，注重复用、易理解、易维护；同一类场景保持同一套实现方案。

### 6.2 后端分层与接口规范

- 分层职责清晰：Controller 参数接收与校验、Service 业务逻辑、Mapper 数据访问，不跨层越权。
- `business/{module}` 为功能完备业务模块（全部 CRUD + 对外操作入口，controller/service/mapper/model 齐全）；`business/harness` 为底层支撑（无 controller，只被上层调用）。运行时实现落 harness，**操作入口仍由业务 Controller 暴露**，细则见 **4.3 harness 支撑层**。
- 接口路径「模块前缀 + 动词式后缀」：`/system/log/pageList`、`/load`、`/insert`、`/delete`、`/update`。
- 业务接口统一 `@RequestMapping("/{module}")`（同名业务）/ `@RequestMapping("/{module}/{business}")`（多业务） + `@XxlSso` 鉴权注解。
- Java set/get 方法不折叠，使用正常方法体。
- mapper XML 中显式配置字段映射（resultMap），`add_time`/`update_time` 写入用 `NOW()`。
- 参数校验使用工具类：`StringTool`、`RegexTool`、`CollectionTool` 等，返回 `Response.ofFail("提示")`。
- 业务方法模板顺序固定：`pageList / load / insert / delete / update`（见各 Controller）。

### 6.3 数据结构

- 后端统一返回 `Response{ code、msg、data }`（`com.xxl.tool.response.Response`），code 200 成功。
- 分页返回 `Response<PageModel>`；分页入参统一 `offset`、`pagesize`。
- 前端取值：`response.data`（成功数据）、`response.data.data`（列表）、`response.data.total`（总数），**不要直接拿返回值操作**。

### 6.4 前端 Vue 规范

- 组件 import 名称与模板标签统一 PascalCase（`import NoticeDetailView` 对应 `<NoticeDetailView>`）。
- script 除基础 import 外，按 “ref data → fun → page init” 三节组织，节顶注释为 `/* --- {功能，前后33个-} --- */`，参考 `modules/framework/system/user/pages/index.vue`。
- 响应式数据一律使用 `ref`，禁止 `reactive` 与 `toRefs(data)` 解构；逻辑相关数据收敛为对象：`queryParams`（搜索栏）、`table`（表格数据与状态）、`formState`（表单数据与规则）。
- 避免啰嗦写法：`defineModel('visible')` + 模板 `v-model` 直连，不用 props/emits/computed 桥接；模板直接用 `props.row`，不建冗余 computed 别名。
- 列表页固定套路：`getList()` 经 `usePageParams(queryParams)(产生 offset/pagesize` 后请求，从 `response.data.data / response.data.total` 赋值。
- 通用能力复用 `@/composables/*`、`@/components`（按需 import）、`@/utils/modal`，禁止重复造轮子。

### 6.5 数据库规范

- 表名前缀 `xxl_ai_`；字段下划线命名，Java 属性对应驼峰。
- 公共字段：`id`（主键自增）、`add_time`、`update_time`；状态字段用 `TINYINT`（0 正常 / 1 停用类）。
- 唯一索引命名 `i_` 前缀；字段一律 `COMMENT` 注释。
- 枚举类存 `xxl_ai_*` 之外的可选值：优先使用框架枚举（见 6.6），状态类下拉选项优先选择框/单选。

### 6.6 权限、枚举与字典

- 登录鉴权：后端 `@XxlSso`；按钮权限标识 `{module}:default`（多业务模块为 `{module}:{business}`）。
- 前端权限：Vue `v-hasPermi="['{module}:default']"`（同名业务）或 `v-hasPermi="['{module}:{business}']"`（或 `v-hasRole="['admin']"`）。
- 下拉选项来源：
  - 业务枚举：在 `business/{module}/enums`（多业务 `business/{module}/{business}/enums`）定义实现 `EnumTool.IEnum` 的枚举（平台内置枚举放 `framework/constant/enums`）；前端 `useEnumOption('XxxEnum')` 经 `/system/dict/loadEnumItem` 拉取（后端动态扫描 `com.xxl.ai` 根包内实现 `IEnum` 的枚举所在包，按枚举名解析，一次扫描后缓存并复用）；
- 菜单资源：平台菜单/按钮由 `XxlRoleEnum#buildRoleResources` 按角色定义（资源 `url` 充当路由 path 与组件定位 key；类型/状态/显隐沿用 `ResourceTypeEnum`/`ResourceStatuEnum`/`ResourceVisibleEnum`），登录按用户角色聚合下发。

### 6.7 国际化文案（i18n）

- 文案统一维护于 `src/i18n/locales/{zh,en}.json`（**单一文件**，JSON 数据纯存储不支持注释，按 `domain.module.token` 嵌套、按域名节点分区），业务页面/components/utils/layouts **一律 `import { t } from '@/i18n'` 引用，禁止硬编码中文**（中文注释除外）。
- 文件内模块顺序固定：`app`（应用级常量）前置，其次公共组 `common`/`modal`/`request`/`layout`/`components`，再次平台业务组 `auth`/`system`/`dashboard`/`help`/`error`，常规业务模块（`business.*` 等）放最后；新增模块按组插入、勿打乱既有顺序。
- 语言由 `default-settings.ts` 的 `language: 'zh' | 'en'` 配置控制，**不支持运行时切换**；element-plus 组件语言随该配置。
- key 复用约定：通用词（新增/修改/删除/搜索/重置/操作/状态/备注/全部/正常/停用/保存成功/删除成功…）统一走 `common.*`，`modal.*`（系统提示/确定/取消）、`request.*`（错误/超时提示）；模块特有词建 `{domain}.{module}.*`。新增文案必须 zh/en **成对**提交，缺失键回退中文再回退 key。
- 插值：`t('key', [v])`（占位 `{0}` 下标）或 `t('key', { name })`（占位 `{name}`），禁止字符串拼接。
- 后端下发的菜单名与 enum 标签不属于前端文案，不进 i18n 文件。

## 七、代码生成策略

- 平台内置代码生成器已下线（代码生成 / 表单构建 / 字典管理 不再提供）。
- Skill 缺省策略：AI 按模板直生等价代码落位（后端 6 件套、前端 vue3 文件、`-init.sql` 建表与种子数据），落位细则见 Skill；菜单/按钮授权统一走 `XxlRoleEnum` 枚举注册，不落 SQL。

## 八、验收与提交

- 后端：`mvn -q compile` 通过；接口用页面/接口工具自测（pageList/load/insert/update/delete、权限、空参数）。
- 前端：Vue `npm run build`（或 eslint）+ 菜单可见 + CRUD 正常。
- 提交：只提交任务相关文件，不提交 target/dist/node_modules 等产物；提交信息简洁符合仓库风格。

---

- 基础规范条款源参考：xxl-ai 现有 `xxl-ai-api`、`xxl-ai-ui` 各模块既有实现。
- 作业细则、落位清单、模板骨架与校验清单在 `.agents/skills/xxl-ai/SKILL.md`；模型与 Agent harness 运行时统一归口 `business/harness`（见 4.3）。