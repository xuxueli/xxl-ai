# XXL-AI 脚手架使用与开发规范

以 XXL-AI 为脚手架开发业务，请先明确自己的运行模式，再按对应 Skill 的标准流程作业。

## 一、项目概览

XXL-AI 是AI应用开发平台，采用 Monorepo 统一托管「后端服务」与「前端工程」，可一键构建部署。

| 模块 | 说明 |
|---|---|
| `xxl-ai-api` | 后端 API（Spring Boot 纯 API），端口 8090，SSO 登录态存 Redis |
| `xxl-ai-ui` | Vue3 前端（Element Plus + TypeScript + Vite），端口 3000 |
| `doc/db` | 数据库初始化脚本（`xxl_ai`：用户/配置/审计日志等框架表与种子数据） |
| `docker` | 一键部署栈（mysql + redis + api + ui） |

通用依赖：`xxl-tool`（工具与统一响应）、`xxl-sso`（登录鉴权，注解 `@XxlSso`）、MyBatis（Mapper + XML）、MySQL、Redis。

## 二、运行模式与 Skill 速查

| 运行模式 | 组成 | 什么时候用 | 加载 Skill |
|---|---|---|---|
| Vue 分离 | `xxl-ai-api` + `xxl-ai-ui` | 前后端分离，前端用 Vue3 | `xxl-ai-vue` |

Skill 位于 `.agents/skills/xxl-ai/SKILL.md`，描述了「新增/改造一个业务模块」的完整落位与模板；本项目已内置可复现的执行环境会自动发现并加载匹配的 Skill。启动项目前先看第三节，写代码前先加载 Skill。

## 三、快速开始

前置环境：JDK 17+、Maven 3.6+、Node 18+、MySQL 8、Redis。

### 3.1 初始化数据库

```sql
-- 建库 + 全量框架表 + 种子数据（角色/菜单由 XxlRoleEnum 枚举定义，无需资源表）
source doc/db/tables_xxl_ai.sql;
```

数据库连接配置在 `xxl-ai-api/src/main/resources/application.properties`（默认 `jdbc:mysql://127.0.0.1:3306/xxl_ai`，root）。默认账号 `admin`。

### 3.2 本地启动

```bash
# 后端 API（Redis 需先启动）
cd xxl-ai-api && mvn spring-boot:run     # 8090

# 前端 Vue（本地代理 /api → 8090）
cd xxl-ai-ui && npm i && npm run dev     # 3000
```

或一键 docker 部署栈：

```bash
cd docker && docker compose up -d --build
```

## 四、工程结构与业务代码落位

### 4.1 后端（xxl-ai-api）

框架代码按分层分包，根包 `com.xxl.ai.api`：

```
com/xxl/ai/api/framework
├── controller/{system,base}                 /* 接口入口，只做参数接收与校验 */
├── service/  +  service/impl/               /* 业务逻辑：接口 + 实现 */
├── mapper/system                            /* 数据访问接口 */
├── model/{entity,dto,adaptor}               /* 实体 / 展示DTO / 实体转DTO */
├── constant/{enums,consts}                  /* 枚举与常量 */
├── web/{xxlsso,xxllog,error}                /* 登录态、审计日志、错误页 */
├── annotation · config · util               /* 注解、配置、工具 */
```

**新增业务一律落 `business/{module}/{business}` 双层镜像包**（`framework` 仅属于平台内置能力，不要塞业务）：

- 前端 `src/modules/business/{module}/{business}/`（pages/api/types）与后端 `com.xxl.ai.api.business.{module}.{business}`（controller/service/mapper/model/enums 子包）**双层镜像**，业务后缀与接口路径 `/{module}/{business}` 一致；首个模块按对应 Skill 模板直生等价代码落位。

Mapper XML 对应：`resources/mapper/framework/...`（平台内置）与 `resources/mapper/{module}/{business}/`（业务，与前/后端目录镜像）。

### 4.2 前端 Vue（xxl-ai-ui）

模块化统一管理：全部模块按「模块自包含」落位 `src/modules`，顶级用 `framework/`（平台内置：auth/system/dashboard/help/…）与 `business/`（项目业务）隔离；同一模块的页面、接口、类型按 `pages/`、`api/`、`types/` 三个子目录聚合维护。

```
src
├── modules/{framework|business}/{domain}/{module}/   /* 模块自包含目录 */
│   ├── pages/                    /* 页面 + 页内组件（index.vue、data.vue、XxxFormModal.vue…） */
│   ├── api/                      /* 接口封装（index.ts，同目录聚合） */
│   └── types/                    /* 类型定义（index.ts，同目录聚合） */
├── composables                   /* usePageParams / useEnumOption / useFormReset */
├── i18n                          /* 文案中心：locales/{zh,en}.json（JSON 数据纯存储，t() 引用） */
├── components / directive / utils / store   /* 平台公共层（框架与业务共用） */
└── types/index.ts                /* 全局基础类型（Response/PageModel/PageQuery…） */
```

- 平台内置示例：`src/modules/framework/auth/`（登录：pages/login.vue + api/）、`src/modules/framework/system/user/`、`src/modules/framework/system/log/`（pages/index.vue + api/ + types/）、`src/modules/framework/dashboard/`（pages/index.vue + api/）等。
- 业务新增示例：`src/modules/business/{module}/{business}/`（pages/index.vue + api/index.ts + types/index.ts + FormModal.vue），与后端 `com.xxl.ai.api.business.{module}.{business}` 双层镜像。

### 4.3 菜单零路由改动约定

平台菜单由枚举 `XxlRoleEnum` 定义（各角色资源列表 static 代码块初始化，已下线 `xxl_ai_resource`/`xxl_ai_role_res` 表），**新增页面无需动路由代码**：

- Vue：界面文件 `modules/{framework|business}/{domain}/{module}/pages/{xxx}(/index).vue` 建好后，登录后由 `/getRouters` 按当前用户角色下发菜单资源构建动态路由；`url` 同时充当路由 path 与前端组件定位 key，前端 `loadView` 按 `modules/` 下相对路径（自动剥离 `framework/`/`business/` 与 `pages/` 段）映射对应页面（如 `/system/user` → `modules/framework/system/user/pages/index.vue`）。
- 新增平台菜单：在 `XxlRoleEnum` 对应角色的 static 资源列表中追加 `Resource` 项（`url` 指向页面路径），即可对该角色可见、无需改路由与数据库。

## 五、新功能开发标准流程

1. **建表**：数据库新建 `xxl_ai_*` 业务表（规范见 6.5）。
2. **生成/手写代码**：按对应 Skill 模板直接生成等价代码。
3. **落位与权限**：按对应 Skill 落位后端/前端文件；在 `XxlRoleEnum` 对应角色 static 资源列表追加菜单/按钮项。
4. **联调验证**：起后端 + 前端，验证菜单可见、CRUD 可用、权限生效。
5. **规范复核**：对照第六节规范与 Skill 内「校验清单」过一遍再提交。

> 标准动作在开发前加载对应模式 Skill：`xxl-ai-vue`。

## 六、代码规范

### 6.1 通用约定

- 使用中文沟通、中文注释。
- 命名：类名大驼峰、变量/方法小驼峰；命名表达真实语义，避免无意义单字母与拼音；常量全大写 + 下划线。
- 布尔属性不使用 `isXxx` 前缀命名，避免与 getter 冲突。
- 注释覆盖 Java 与前端文件：文件顶部一行功能描述，间隔一行加 `@author 作者 yyyy-mm-dd`；方法注释用 `/* xxx */` 多行；属性注释在右侧 `/* xxx */` 垂直对齐；方法内部分支逻辑也需注释；已有注释需符合上述要求。
- 避免过度设计，注重复用、易理解、易维护；同一类场景保持同一套实现方案。

### 6.2 后端分层与接口规范

- 分层职责清晰：Controller 参数接收与校验、Service 业务逻辑、Mapper 数据访问，不跨层越权。
- 接口路径「模块前缀 + 动词式后缀」：`/system/log/pageList`、`/load`、`/insert`、`/delete`、`/update`。
- 业务接口统一 `@RequestMapping("/{module}/{business}")` + `@XxlSso` 鉴权注解。
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

- 登录鉴权：后端 `@XxlSso`；按钮权限标识 `{module}:{business}:add / edit / remove`。
- 前端权限：Vue `v-hasPermi="['{module}:{business}:add']"`（或 `v-hasRole="['admin']"`）。
- 下拉选项来源：
  - 业务枚举：在 `business/{module}/{business}/enums` 定义实现 `EnumTool.IEnum` 的枚举（平台内置枚举放 `framework/constant/enums`）；前端 `useEnumOption('XxxEnum')` 经 `/system/dict/loadEnumItem` 拉取（后端动态扫描 `com.xxl.ai` 根包内实现 `IEnum` 的枚举所在包，按枚举名解析，一次扫描后缓存并复用）；
- 菜单资源：平台菜单/按钮由 `XxlRoleEnum` 各角色 static 代码块定义（资源 `url` 充当路由 path 与组件定位 key；类型/状态/显隐沿用 `ResourceTypeEnum`/`ResourceStatuEnum`/`ResourceVisibleEnum`），登录按用户角色聚合下发。

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
- 作业细则、落位清单、模板骨架与校验清单在 `.agents/skills/xxl-ai/SKILL.md`。