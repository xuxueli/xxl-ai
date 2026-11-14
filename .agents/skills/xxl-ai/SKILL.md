---
name: xxl-ai
description: 在 XXL-AI 前后端分离模式（xxl-ai-api 端口 8080 + xxl-ai-ui 端口 3000，Element Plus + TypeScript）下新增或改造业务模块。当任务涉及修改 xxl-ai-api/src/main/java/com/xxl/ai/api/business、平台菜单/权限注册（xxl-ai-api 下 framework/constant/enums/XxlRoleEnum.java）或 xxl-ai-ui/src/modules 时加载本技能。
---

# XXL-AI · 前后端分离模式开发 Skill

目标：把 XXL-AI 的 `xxl-ai-api` + `xxl-ai-ui` 当作脚手架，规范、快速地新增/改造一个业务模块。本 Skill 覆盖「建表 → 后端 → 前端 → 菜单/权限 → 验证」全流程，含落位清单、代码骨架与校验清单。

## 何时使用

- 前后端分离，前端是 Vue3（Element Plus + TS）。
- 需要新增一个带列表页的业务模块（标准 CRUD）。
- 只需要动后端接口而不动前端时，同样适用（取「后端落位」一节）。

## 前置：工程结构速览

```
xxl-ai-api/src/main
├── java/com/xxl/ai/api/framework/         ← 平台内置：controller/{system,base}、service(+impl)、mapper、
│                                            model/{entity,dto,adaptor}、constant/{enums,consts}、
│                                            web/{xxlsso,xxllog,error}、annotation/config/util
├── java/com/xxl/ai/api/business/{module}/ ← 新增业务（功能完备；同名业务一级化，多业务按 {module}/{business} 聚合）
├── java/com/xxl/ai/api/business/harness/  ← 运行时支撑层（llm/chat/rag/mcp/skill/supplier），无 controller
├── resources/mapper/framework/…           ← 平台 Mapper XML
└── resources/mapper/business/{module}/    ← 业务 Mapper XML（按模块平铺，文件名标识业务）
xxl-ai-ui/src
├── modules/framework/{domain}/{module}/   ← 平台内置模块（auth/system/dashboard/…，pages+api+types 同模块聚合）
├── modules/business/{module}/             ← 业务模块（pages/ + api/ + types/；模块内共享件可加 components/、composables/）
└── types/index.ts                         ← 全局基础类型（Response/PageModel/PageQuery…）
```

> 🔒 business / harness 边界见下文「business / harness 边界」；命名、注释、依赖版本见 `AGENTS.md`「通用约定」。

## 环境与命令

前置：JDK 17+、Maven 3.6+、Node 22+、MySQL 8、Redis（RAG 向量化另需 Milvus）。

```bash
# 初始化数据库：执行 doc/db/tables_xxl_ai.sql（连接字符集要求见「标准流程」的 SQL 执行规范）

# 本地启动（连接配置见 xxl-ai-api/src/main/resources/application.properties，默认 admin/123456）
cd xxl-ai-api && mvn spring-boot:run      # 8080
cd xxl-ai-ui && npm i && npm run dev      # 3000（代理 /api → 8080）
cd xxl-ai-sample && mvn spring-boot:run    # 8091（可选）

# 构建与部署（前端产物内嵌 api，单包单端口）
cd xxl-ai-ui && npm i && npm run build && npm run sync:dist && cd ..
mvn clean package -Dmaven.test.skip=true
java -jar xxl-ai-api/target/xxl-ai-api-*.jar          # http://localhost:8080
cd docker && docker compose up -d --build              # 或起 docker 栈
```

- 前端为 **Hash 路由**（`/#/xxx`），无需服务端回退；生产 `VITE_APP_BASE_API` 为空、接口在根路径。
- `xxl-ai-api` / `xxl-ai-sample` 的 Dockerfile 均为 `ADD target/*.jar`：compose 构建前必须完成模块打包，只跑 `-pl xxl-ai-api` 会让 sample 镜像报 `lstat .../target: no such file`。

## business / harness 边界

| 层 | 职责 | 边界 |
|---|---|---|
| `business/{module}` | 业务编排（校验、空间归属、状态回写、DTO 组装）+ 全部对外入口 | 自带 controller，路径 `/{module}[/{business}]` |
| `business/harness` | 运行时能力（模型构建/对话执行、对话生成 worker + 队列/结果流/SSE、MCP、RAG、技能沙箱、供应商探测） | **不定义任何 `@RestController`**、不校验空间归属、不新增元数据表 |

```
business/harness
├── llm       LlmModelFactory、LlmChatTool
├── chat      ChatStreamTool（任务队列 + 生成消费 + 结果流 + SSE 转发）
├── rag       RagTool（向量化/检索/清理/Advisor）
├── mcp       McpClientTool、McpToolFactory
├── skill     SkillToolFactory（物化 + 执行沙箱）
└── supplier  SupplierApiTool（供应商 HTTP 探测）
```

判定一句话：是业务编排（校验归属、读写业务状态、组装返回）→ `business/{module}` 的 Service；只是它调用的底层能力（HTTP、SDK、模型、向量库、进程沙箱、SSE/队列）→ `harness`。

- **单向依赖**：业务 Service/Controller 直接注入 harness 工具类。示例：`AgentServiceImpl`→`SkillToolFactory#evict`、`KnowledgeDocServiceImpl`/`KnowledgeBaseServiceImpl`→`RagTool`、`SupplierServiceImpl`→`SupplierApiTool`、`McpServiceImpl`→`McpClientTool`、`ChatService`→`ChatStreamTool`。
- **允许反向读元数据**：harness 可按 ID 经 business 的 Mapper/Service 读配置，但不把 CRUD 挪进 harness。
- **禁止项**：`business/{module}` 不得新增 `client/rag/tool/stream` 等运行时子包，不得直接依赖 spring-ai / Milvus / MCP SDK / Redis；harness 不得新增 controller 与元数据表。
- **命名**：harness 内新增能力优先 `XxxTool` / `XxxClient` / `XxxFactory`。
- **例外**：`harness/chat/ChatStreamTool` 按 uuid 复校 Agent 并回填消息，属对话域运行时的既定行为。运行时接口 URL 保持不变，前端 `api/` 无需改动。

## 标准流程

0. **需求落盘（先建立）**：先按「需求落盘（xxl-ai-spec）」一节在项目根 `xxl-ai-spec/{yyyyMMdd}-{business}/` 创建需求子目录，随后确认的需求结论、方案、SQL 全部落入该目录（见下文专属章节）。
1. **需求确认（第一步，必须）**：接到任务先不写代码，主动向用户确认需求细节，用户确认后再执行。至少确认：模块与业务命名（`{module}/{business}`）及目录归属；核心字段、状态/枚举下拉、是否需文件上传/富文本等特殊组件；页面形态（标准 CRUD / 详情页 / 多页签，仅动后端时则不动前端）；菜单+按钮+角色授权是否一并处理；验证范围与启动端口（api 8080 / vue 3000）。确认结果即时回填到子目录 `方案.md`。
2. **建表**：按「数据库约定」建 `xxl_ai_*` 表，SQL 脚本写入该需求子目录（如 `{business}-table.sql`、`{business}-init.sql`）。
3. **生成或手写代码**：平台内置代码生成器已下线，缺省由 AI 按模板直生等价代码落位（后端 6 件套 + 前端 vue3 文件），落位细则见下方「后端落位清单 / 前端落位清单」。
4. **落位**：业务一级化——后端 Java 落 `business/{module}`（同名业务；多业务模块在模块下再分 `{business}`），Mapper XML 落 `resources/mapper/business/{module}/`；前端业务模块聚合落 `modules/business/{module}/`（pages/index.vue + api/index.ts + types/index.ts）。
5. **菜单/权限**：在 `XxlRoleEnum#buildRoleResources` 对应角色分支追加菜单(type=1)；页面按钮 `v-hasPermi` 复用菜单权限标识（需按钮级细粒度时再追加 type=2 按钮资源）。
6. **验证**：按「校验清单」分组执行（先设计原则，再后端 / 前端 / 权限 / 边界，最后联调）；起 `xxl-ai-api`(8080) + `xxl-ai-ui`(3000，代理 /api→8080)，确认菜单可见、CRUD 可用、权限生效；验证结果回填 `方案.md`。

> ⚠️ **SQL 执行规范（强制，防乱码）**：写/执行任何含中文的 SQL（建表、菜单/权限初始化、联调造测试数据 INSERT 等）前，必须确保连接字符集为 utf8mb4，否则中文 `COMMENT`/表名/`INSERT` 数据落库会乱码。本项目 MySQL 跑在 docker 容器（容器名 `xxl-ai-mysql`，docker-compose 定义），服务端已配置 utf8mb4，但 CLIENT 侧 CLI 默认连接字符集是 **latin1**，必须显式指定 utf8mb4，例如：

```bash
# docker 容器内执行（容器名 xxl-ai-mysql，密码见 docker/.env 的 MYSQL_ROOT_PASSWORD）
docker exec -i xxl-ai-mysql mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" xxl_ai < xxx.sql

# 宿主机 mysql 客户端执行
mysql --default-character-set=utf8mb4 -h127.0.0.1 -P3306 -uroot -p xxl_ai < xxx.sql
```

## 需求落盘（xxl-ai-spec）

每个需求在项目根目录 `xxl-ai-spec/` 下生成一个需求子目录，把执行中产出的「方案 + SQL」沉淀其中，便于追溯与复用：

1. **目录命名**：`xxl-ai-spec/{yyyyMMdd}-{business}/`（同日多个需求用业务名区分，如 `20260830-product`）。
2. **方案**：`方案.md`，一份完整开发方案文档，须覆盖「需求相关 / 数据库设计 / 菜单·授权 / 后端改造 / 前端改造 / 验证结果」六大块，按下方「plan.md 模板」生成骨架后随实现同步回填；
3. **SQL**：建表 SQL 与菜单/权限 SQL 一并落盘（如 `{business}-table.sql`、`{business}-init.sql`），作为本需求专属脚本；如需进总库初始化，再同步一份到 `doc/db/`。

执行全程保持该目录与实现同步：先建目录落方案骨架 → 建表写 SQL → 落位实现 → 验证后回填结论。

### plan.md 模板

```markdown
# {业务名}开发方案（{module}/{business}）

> 需求目录：`xxl-ai-spec/{yyyyMMdd}-{business}/` | 日期：{yyyy-MM-dd}

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8080 + xxl-ai-ui 3000） |
| 模块/业务命名 | `{module}`（同名业务一级化；多业务模块为 `{module}/{business}`），包 `com.xxl.ai.api.business.{module}` |
| 核心字段与业务规则 | 字段清单 + 必填/唯一/模糊搜索规则 |
| 状态/枚举下拉 | 无 / 枚举 `{XxxEnum}`（business/{module}/{business}/enums） |
| 特殊组件 | 无 / Editor 富文本 / ImageUpload 图片上传 |
| 页面形态 | 标准 CRUD / 详情页 / 多页签 |
| 出码方式 | AI 按模板直生等价代码 |
| 验证范围 | 编译验证 or 起 api+vue 联调 |

## 二、数据库设计
表：`xxl_ai_{business}`
| 字段 | 类型 | 说明 | 备注 |
|---|---|---|---|
| id | BIGINT | 主键自增 | 框架约定 |
| {field} | {type} | {说明} | {必填/模糊/唯一/下拉} |
| add_time | DATETIME | 新增时间 | NOW() |
| update_time | DATETIME | 更新时间 | NOW() |

索引/约束：`i_` 前缀唯一索引（如有）。
状态枚举取值：`{code-title}`（存 `xxl_ai_*` 之外用框架枚举）。
SQL 脚本：`{business}-table.sql`

## 三、菜单 / 授权
- 菜单（type=1）：`{名称}` permission=`{module}:default`（同名业务）或 `{module}:{business}`（多业务） url=`/{module}` 或 `/{module}/{business}`，在 `XxlRoleEnum#buildRoleResources` 对应角色分支追加
- 按钮：默认复用所属菜单权限标识（`{module}:default` / `{module}:{business}`），前端 `v-hasPermi` 直接引用，无需单独注册；仅当需要按钮级细粒度管控时再追加 type=2 资源
- 授权：在 `buildRoleResources` 对应角色分支（如 `if (role == XxlRoleEnum.ADMIN)`）追加即对该角色可见，无需数据库授权
- 落盘：`{business}-init.sql`（仅建表/种子数据；菜单走枚举注册）

## 四、后端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `{Business}.java` | business/{module}/model/ | 实体驼峰；Date 字段 @JsonFormat |
| `{Business}Mapper.java` | business/{module}/mapper/ | insert/delete/update/load/pageList/pageListCount |
| `{Business}Mapper.xml` | resources/mapper/business/{module}/ | resultMap 显式映射；add/update_time 用 NOW()；查询 <if> 动态拼条件 |
| `{Business}Service.java` | business/{module}/service/ | 方法顺序 pageList/load/insert/delete/update |
| `{Business}ServiceImpl.java` | business/{module}/service/impl/ | StringTool 校验，失败 Response.ofFail |
| `{Business}Controller.java` | business/{module}/controller/ | 全 @XxlSso；分页 offset/pagesize；删除 @RequestBody List<Long> |

接口：`/{module}/pageList|load|insert|delete|update`（多业务模块为 `/{module}/{business}/...`）

## 五、前端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `types/index.ts` | modules/business/{module}/ | 实体+Query(pageNum/pageSize)+ListQuery |
| `api/index.ts` | modules/business/{module}/ | list/get/add/del/update，Promise<Response<PageModel<T>>> |
| `pages/index.vue` | modules/business/{module}/ | 三段式；usePageParams 转 offset/pagesize；按钮 v-hasPermi |

## 六、验证结果 / 变更记录
- [ ] 需求结论确认并回填第一节
- [ ] 建表 SQL 执行通过，字段与实体一致
- [ ] XxlRoleEnum 菜单/按钮已注册且终端可见
- [ ] 后端 `mvn -q compile` 通过
- [ ] 前端 vue-tsc / eslint 通过
- [ ] 联调：菜单可见、CRUD/搜索可用、无权限按钮隐藏、空参数友好提示
- [ ] 变更记录（本次改动时间与说明）
```

## 后端落位清单（6 件套）

以业务 `Demo`、模块 `demo` 为例，包名 `com.xxl.ai.api.business.demo`（同名业务一级化）：

| 文件 | 位置 | 说明 |
|---|---|---|
| `Demo.java` | `java/.../business/demo/model/Demo.java` | 实体，字段驼峰 |
| `DemoMapper.java` | `java/.../business/demo/mapper/DemoMapper.java` | insert/delete/update/load/pageList/pageListCount |
| `DemoMapper.xml` | `resources/mapper/business/demo/DemoMapper.xml` | resultMap 显式映射；`add_time/update_time` 用 `NOW()` |
| `DemoService.java` / `DemoServiceImpl.java` | `java/.../business/demo/service/(impl/)` | 方法顺序 `pageList/load/insert/delete/update` |
| `DemoController.java` | `java/.../business/demo/controller/DemoController.java` | `@RestController @RequestMapping("/demo")`，全 `@XxlSso` |

**直生入口**：按下方「后端落位清单」六文件骨架（controller/service/service_impl/mapper/mapper.xml/entity）直接产出准确等价代码与落位路径。

后端要点：

- Controller 分页方法签名：`int offset(默认0)`、`int pagesize(默认10)` + 查询参数，返回 `Response<PageModel<XxxDTO/Entity>>`。
- 统一返回 `Response{ code, msg, data }`（`com.xxl.tool.response.Response`），code 200 成功；Java set/get 不折叠，使用正常方法体。
- 参数校验用 `StringTool/RegexTool/CollectionTool`，失败 `Response.ofFail("提示")`；唯一性校验库中查一遍再插。
- DTO 时间展示转字符串（`DateTool.formatDateTime`），用 Adaptor 完成 entity→dto。
- 接口路径**全小写**：`/{module}/pageList|load|insert|delete|update`（多业务模块为 `/{module}/{business}/...`）。**参数通道约定**：结构化实体与集合（insert/update 的 DTO、delete 的 `List<Long>`）一律走 JSON 请求体（后端 `@RequestBody`、前端 `data`）；仅简单标量、分页与查询条件走 URL 参数（后端 `@RequestParam`、前端 `params`）。

## 数据库约定

- 表名前缀 `xxl_ai_`；字段下划线命名，Java 属性驼峰。
- 公共字段 `id`（自增主键）、`add_time`、`update_time`；状态字段 `TINYINT`（0 正常 / 1 停用类）。
- 唯一索引 `i_` 前缀；字段一律 `COMMENT`；枚举取值不建表，优先用框架枚举（见「枚举下拉」）。
- 状态类下拉优先选择框/单选；`add_time` / `update_time` 写入用 `NOW()`。
- 所有 `.sql` 首行含 `SET NAMES utf8mb4;`。

## 前端落位清单（3 文件）

| 文件 | 位置 | 说明 |
|---|---|---|
| types | `src/modules/business/{module}/types/index.ts` | `Xxx` 实体 + `XxxQuery`(pageNum/pageSize 表单形态) + `XxxListQuery = ListQuery<XxxQuery>` |
| api | `src/modules/business/{module}/api/index.ts` | `request({url:'/{module}/pageList',params:...})` |
| view | `src/modules/business/{module}/pages/index.vue` | 三段式列表页 |

页面（列表页及其内联弹窗，拆分子页如 `model.vue`、`doc.vue`、`conv.vue` 也放 `pages/`）放 `pages/`，接口放 `api/`，类型放 `types/`，三者同模块聚合、无 barrel 登记；全局基础类型（Response/PageModel/ListQuery…）统一从 `@/types` 引用。「框架」内置模块在 `modules/framework/`，业务禁止混入。

**i18n 落位**：通用规则见 `AGENTS.md`「国际化」；本节只规定本模式落位：文案 key 统一维护在 `src/i18n/locales/{zh,en}.json` **单一文件**内（按域名节点分区，如 `business.*`；`app` 前置 → 公共组 `common`/`modal`/`request`/`layout`/`components` → 平台业务组 `auth`/`system`/`dashboard`/`help`/`error` → 常规业务模块），zh/en 成对补。

### Vue 约定

- 组件 import 名与模板标签统一 PascalCase（`import NoticeDetailView` ↔ `<NoticeDetailView>`）。
- script 除基础 import 外按「ref data → fun → page init」三节组织，节顶注释 `/* --- {功能，前后33个-} --- */`。
- 响应式数据一律 `ref`，禁止 `reactive` 与 `toRefs(data)` 解构；按用途收敛为对象：`queryParams`（搜索栏）、`table`（表格数据与状态）、`formState`（表单与校验规则）。
- 少写桥接：`defineModel('visible')` + 模板 `v-model` 直连；模板直接用 `props.row`，不建冗余 computed 别名。
- 通用能力复用 `@/composables/*`、`@/components`、`@/utils/modal`，禁止重复造轮子。

types 参考 `src/modules/framework/system/user/types/index.ts` 封口写法；api 参考 `src/modules/framework/system/user/api/index.ts`。

### index.vue 骨架（三段式，template 略）

```ts
<script setup lang="ts">
defineOptions({ name: 'Demo' })
import { listDemo, getDemo, addDemo, delDemo, updateDemo } from '../api'
import { useFormReset } from '@/composables/useFormReset'
import { usePageParams } from '@/composables/usePageParams'
import { useEnumOption } from '@/composables/useEnumOption'
import modal from '@/utils/modal'
import { t } from '@/i18n'
import { RightToolbar, Pagination } from '@/components'
import type { FormState, TableState } from '@/types'
import type { Demo, DemoQuery } from '../types'
import type { FormInstance } from 'element-plus'
import { ref } from 'vue'

const resetForm = useFormReset()

// --------------------------------- ref data ---------------------------------
const demoRef = ref<FormInstance>()            /* 编辑表单 ref */
const { DemoStatusEnum: statusOptions } = useEnumOption('DemoStatusEnum')

const queryParams = ref<DemoQuery>({ pageNum: 1, pageSize: 10, status: -1, name: undefined })

const table = ref<TableState<Demo>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

const formState = ref<FormState<Demo>>({ visible: false, title: '', form: {}, rules: { name: [{ required: true, message: t('demo.nameRequired'), trigger: 'blur' }] } })

// --------------------------------- fun ---------------------------------
function getList() {
  table.value.loading = true
  const params = usePageParams(queryParams)()   // pageNum/pageSize → offset/pagesize
  listDemo(params).then((response) => {
    table.value.list = response.data.data        // 列表
    table.value.total = response.data.total      // 总数
    table.value.loading = false
  })
}
function reset() { formState.value.form = { id: undefined, name: undefined, status: 0 }; resetForm('demoRef') }
function handleQuery() { queryParams.value.pageNum = 1; getList() }
function resetQuery() { resetForm('queryRef'); handleQuery() }
function handleSelectionChange(selection: Demo[]) { table.value.ids = selection.map(i => i.id as number); table.value.single = selection.length !== 1; table.value.multiple = !selection.length }
function handleAdd() { reset(); formState.value.visible = true; formState.value.title = t('common.titleAdd') }
function handleUpdate(row: any) { reset(); const id = row?.id ?? table.value.ids[0]; if (id == null) return; getDemo(id).then(r => { formState.value.form = r.data; formState.value.visible = true; formState.value.title = t('common.titleEdit') }) }
function handleDelete(row: any) { const ids = row?.id ?? table.value.ids; if (ids == null || (Array.isArray(ids) && ids.length === 0)) return; modal.confirm(t('demo.confirmDelete', [ids])).then(() => delDemo(ids)).then(() => { getList(); modal.msgSuccess(t('common.deleteSuccess')) }).catch(() => {}) }
function submitForm() { demoRef.value!.validate(valid => { if (!valid) return; (formState.value.form.id != null ? updateDemo(formState.value.form) : addDemo(formState.value.form)).then(() => { modal.msgSuccess(formState.value.form.id != null ? t('common.updateSuccess') : t('common.addSuccess')); formState.value.visible = false; getList() }) }) }

// --------------------------------- page init ---------------------------------
getList()
</script>
```

- 模板：搜索表单（`queryParams`）、`<el-table>` + 操作列用 `v-hasPermi="['demo:default']"`（多业务为 `['demo:demo']`）、`<Pagination>`、`<el-dialog :title="formState.title" v-model="formState.visible">` + `@/components` 的 Editor/ImageUpload 等按需引入。**列表页完整样例看 `src/modules/framework/system/config/pages/index.vue`、`src/modules/framework/system/user/pages/index.vue`。**
- `getList()` 一律经 `usePageParams(queryParams)()` 转 `offset/pagesize`；从 `response.data.data / response.data.total` 取值。

## 菜单 / 权限注册（枚举资源，替代原资源表）

平台菜单/按钮已下线 `xxl_ai_resource`/`xxl_ai_role_res`，改为在 `framework/constant/enums/XxlRoleEnum.java#buildRoleResources(role)` 中按角色装配 `Resource` 项注册（公共区段各角色共享，角色专属项放入对应 `if (role == ...)` 分支）：

```java
// 菜单（type=1：url 同时充当路由 path 与 modules/ 组件定位 key；permission 即按钮权限标识）
resources.add(res(7, 2, "Demo管理", ResourceTypeEnum.MENU, "demo:demo", "/demo/demo", "", 210));

// 仅某角色可见：放入对应角色分支
if (role == ADMIN) {
    resources.add(res(9, 0, "仅管理员", ResourceTypeEnum.MENU, "admin:only", "/admin/only", "", 400));
}
```

要点：资源 id 全局唯一、parentId 指向父目录/菜单；在 `buildRoleResources` 中追加（公共区段或角色分支）即对对应角色可见。业务页面按钮默认用菜单 permission（`{module}:default` / `{module}:{business}`）做 `v-hasPermi`，无需单独注册按钮资源；仅当需要按钮级细粒度时，再追加 type=2 资源（`ResourceTypeEnum.BUTTOM`，parentId 指向所属菜单）。页面由 `loadView` 按 `url` 自动映射，**无需改路由**；平台内置枚举/资源一律不动 `business` 包。

页面文件 `src/modules/business/{module}/pages/index.vue` 建好后前端 `loadView` 自动映射，**无需改路由**。

## 枚举下拉（可选）

业务模块枚举（含下拉）统一放 `business/{module}/{business}/enums`，实现 `EnumTool.IEnum(getCode/getTitle)`；`framework/constant/enums` 仅保留平台内置枚举，业务代码一律不侵入。后端 `/system/dict/loadEnumItem` 动态扫描 `com.xxl.ai` 根包内包含 IEnum 枚举的包（一次扫描后缓存），按枚举名解析；前端 `useEnumOption('XxxEnum')` 自动取 `{code,title}`（实现见 `src/composables/useEnumOption.ts`）。

## 校验清单

**顺序固定：先过「设计原则」，再按分组核对实现细节。设计原则不过，其余项一律视为未通过。**

### 设计原则（必查，对应 `AGENTS.md` §三）

- [ ] **DRY**：同一段逻辑出现第三次才抽公共实现；不存在为「将来复用」预建的抽象层。
- [ ] **KISS**：实现最直接，无假想需求；未新增非必要的接口 / 工厂 / 配置项 / 包装函数 / 扩展点。
- [ ] **单一职责**：一个类 / 方法 / 组件只有一个变更理由；编排、校验、运行时、渲染等边界未混在一起。
- [ ] **同类场景同一套方案**：优先复用已有工具 / 组件 / 模板；若另起一套，已说明旧方案为何不适用。
- [ ] 反向自查：本改动既无过度设计（抽象 / 分层 / 配置多余），也无重复实现（同一职责多处代码）。

### 需求与落盘

- [ ] 需求子目录 `xxl-ai-spec/{yyyyMMdd}-{business}/` 已创建，`方案.md`（六大块齐全）+ SQL 已落盘并同步。

### 后端与数据库

- [ ] `xxl-ai-api` 下 `mvn -q compile` 通过。
- [ ] Controller 全 `@XxlSso`，方法顺序 `pageList/load/insert/delete/update`，分页 `offset/pagesize`，XML resultMap + `NOW()`，校验 `Response.ofFail`。
- [ ] 防乱码：所有 `.sql` 首行有 `SET NAMES utf8mb4;`；执行连接字符集为 utf8mb4。

### 前端与 i18n

- [ ] types 三件齐（实体 / Query / ListQuery），同模块聚合、无 barrel 登记；api 封装 `Promise<Response<PageModel<T>>>`；列表页三段式 + `ref` 收敛 + `usePageParams`。
- [ ] 页面无硬编码中文（注释除外），`t('key')` 引用且 zh/en 文案已成对维护；通用词复用 `common.*`；语言配置取 `default-settings.ts` 的 `language`。

### 菜单与权限

- [ ] 菜单在 `XxlRoleEnum` 已注册；按钮 `v-hasPermi` 复用菜单权限标识（`{module}:default` / `{module}:{business}`）。

### 边界与运行时

- [ ] 业务模块功能完备，含全部 CRUD 与对外操作入口（controller 齐全）。
- [ ] 运行时实现统一落 `business/harness`，harness 无 controller、只被上层调用；业务侧未新增运行时子包或直接依赖 SDK；运行时接口 URL 不变。

### 联调与交付

- [ ] 注释与命名符合 `AGENTS.md`「通用约定」；无死代码 / 调试残留 / 测试数据。
- [ ] 联调：菜单可见、列表 / 新增 / 修改 / 删除 / 搜索可用、权限失效项按钮隐藏、空参数后端友好提示。

## 参考文件（绝对路径）

- 列表页规范样例：`xxl-ai-ui/src/modules/framework/system/user/pages/index.vue`
- API / 类型样例：`xxl-ai-ui/src/modules/framework/system/user/{api,types}/index.ts`
- 菜单 / 权限注册模板：见上文「菜单 / 权限注册（枚举资源，替代原资源表）」，按 `res()/ResourceTypeEnum` 追加即注册，无需改数据库与路由。