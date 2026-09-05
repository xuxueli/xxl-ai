# AI 业务中台开发方案（AI 业务六模块 + 业务空间）

> 需求目录：`xxl-ai-spec/20260905-ai-biz/` | 日期：2026-09-05

## 一、需求相关

| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8090 + xxl-ai-ui 3000） |
| 模块/业务命名 | 同名模块一级化：supplier（供应商+模型）、mcp、skill、agent（+conv）、space；knowledge/base+doc 保持双层；包 `com.xxl.ai.api.business.{module}` |
| 菜单 | 5 个一级菜单插在首页(100)与系统管理(200)之间：供应商110、MCP120、SKILL130、知识库140、Agent150；业务空间挂系统管理下(199)；admin+user 均可见 |
| 状态/枚举下拉 | 业务枚举放 `business/*/enums`（实现 `EnumTool.IEnum`）：SupplierTypeEnum/ModelTypeEnum/McpTypeEnum/PublishStatusEnum/DocStatusEnum |
| 特殊组件 | Agent 对话页 SSE 流式、Markdown 渲染；知识文档 txt/md 上传或粘贴；MCP/Skill 社区查询弹窗 |
| 页面形态 | 各模块标准 CRUD 列表页；知识库含独立文档页（隐藏菜单路由）；Agent 含公开免登录对话页 |
| 出码方式 | AI 按模板直生等价代码 |
| 关键决策 | 空间隔离（header `xxl-space-id`，admin 直通全部空间）；Milvus 入 docker-compose；Agent SSE+RAG；opencodego 占位可编辑；社区地址进 xxl_ai_config 默认 mcp.so |
| 验证范围 | 编译 + xl-ai-api/xxl-ai-ui 联调 |

## 二、数据库设计

脚本：`ai-biz-table.sql`（11 表）、`ai-biz-init.sql`（种子），同步 `doc/db/tables_xxl_ai_business.sql`

| 表 | 关键字段 | 说明 |
|---|---|---|
| xxl_ai_space | id/name/code(i_code)/status/remark | 业务空间 |
| xxl_ai_user_space | user_id/space_id(i_user_space) | 用户-空间关联 |
| xxl_ai_supplier | space_id/name/code/type(0LLM/1嵌入/2通用)/base_url/api_key/status | 供应商 |
| xxl_ai_supplier_model | supplier_id/name/model/type(0对话/1嵌入)/status | 供应商模型 |
| xxl_ai_mcp | space_id/name/type(0sse/1http)/url/headers/description/source/source_url/status | MCP 服务 |
| xxl_ai_skill | space_id/name/description/content/version/source/source_url/status | Skill |
| xxl_ai_knowledge_base | space_id/name/description/embed_supplier_id/embed_model_id/chunk_size/chunk_overlap/top_k/status | 知识库 |
| xxl_ai_knowledge_doc | space_id/base_id/name/content/chunk_count/status(0未处理/1已向量化/2失败) | 知识文档 |
| xxl_ai_agent | space_id/name/intro/model_supplier_id/model_id/system_prompt/kb_ids/mcp_ids/skill_ids/publish_status/uuid/status | Agent |
| xxl_ai_agent_conv | agent_uuid/visitor_id/title | Agent 对话 |
| xxl_ai_agent_msg | conv_id/role/content | 对话消息 |

公共字段 `id/add_time/update_time`（NOW()）、状态 TINYINT、唯一索引 `i_` 前缀；

种子：默认空间 default；预设供应商 deepseek/glm/opencodego(占位) 及其模型；社区地址配置（system.mcp.community.url / system.skill.community.url）。

## 三、菜单 / 授权

- 菜单（type=1）与按钮（type=2）全部注册进 `XxlRoleEnum` 的 ADMIN_RESOURCES 与 USER_RESOURCES static 列表（系统管理三菜单仅 admin，保持不变）。
- 新增 `resHidden()` 帮助方法支持隐藏菜单（知识文档 `/knowledge/base/doc`）。
- 按钮 permission：`{module}:{business}:add|edit|remove`；agent:publish。资源 id 规划：7~13 菜单、14~35 按钮。
- 授权：加入静态资源列表即对该角色可见，无需数据库授权；无 SQL 落盘。

## 四、后端改造

| 文件 | 位置 | 要点 |
|---|---|---|
| 公共支撑 | business/common/{util,client,vector} | SpaceTool 空间校验；LLMClient(OpenAI兼容,SSE/嵌入)；TextChunkUtil 分片；MilvusTool 集合/写入/检索；CommunityClient 社区 |
| {Xxx} 六件套 | business/{module}/{business}/ | entity/dto/adaptor + Mapper(+xml) + Service(+Impl) + Controller，`@XxlSso(permission)`、offset/pagesize、ids[] |
| space | business/space/ | CRUD + listByUser（TopBar 数据源） |
| supplier | business/supplier/ | 供应商 CRUD + 模型（同级 controller/service/mapper，前端 pages/index + model 页） |
| mcp | business/mcp/ | CRUD + communitySearch + installFromCommunity |
| skill | business/skill/ | CRUD + communitySearch + saveFromCommunity |
| knowledge | business/knowledge/base/ + doc/ | base CRUD + 向量参数；doc CRUD + vectorize + base/search(检索) |
| agent | business/agent/ + conv/ | 管理 CRUD + publish/unpublish；公开 `@XxlSso(login=false)` 免鉴权 conv(load/create/list/send SSE) |
| 用户管理 | framework/controller/service/mapper | UserDTO.spaceIds + user_space 关联读写，XxxSso under `/system/user` |
| 框架配置 | application.properties, pom.xml | excluded.paths += /agent/access/**；milvus 连接；milvus-sdk-java 依赖 |
| docker | docker-compose.yml / .env | 新增 milvus+etcd+minio；api PARAMS 注入 milvus uri；挂载业务初始化 SQL |

接口一览：
- `/supplier/{pageList|load|insert|delete|update}`、`/supplier/model/*`
- `/mcp/*`、`/mcp/communitySearch|installFromCommunity`
- `/skill/*`、`/skill/communitySearch|saveFromCommunity`
- `/knowledge/base/*`（含 `/knowledge/base/search`）、`/knowledge/doc/*`（含 `/knowledge/doc/vectorize`、`/knowledge/doc/upload`）
- `/agent/*`、`/agent/publish|unpublish`、`/agent/conv/load|convCreate|convList|send`
- `/space/*`、`/space/listByUser`

## 五、前端改造

| 文件 | 位置 | 要点 |
|---|---|---|
| space | modules/business/space/ | 标准 CRUD 列表页 |
| supplier | modules/business/supplier/ | 供应商列表 + pages/model.vue 模型页（公用 api/types） |
| mcp | modules/business/mcp/ | 列表 + 社区查询弹窗(搜索→安装落库/删除) |
| skill | modules/business/skill/ | 列表 + 社区查询弹窗(保存/删除) |
| knowledge | modules/business/knowledge/base/ + doc/ | base 列表(向量参数) + doc 页(上传/粘贴/向量化/检索预览) |
| agent | modules/business/agent/ | 配置列表 + 发布/取消 + 访问URL复制 |
| agent chat | modules/business/agent/chat/index.vue | 公开路由 `/agent/chat/:uuid` 免登录；左侧多对话、右侧 SSE 流式；visitorId(localStorage) |
| 平台改造 | router 白名单、store/modules/space.ts、Navbar/SpaceSelect.vue、utils/request.ts 注入 xxl-space-id | 空间切换刷新 |
| 用户管理 | framework/system/user/ | 新增/编辑多选授权空间 |
| i18n | locales/{zh,en}.json | 新增 `business.*` 节点，zh/en 成对 |

## 六、验证结果 / 变更记录

- [x] 需求结论确认并回填第一节
- [x] 建表 SQL 执行通过，字段与实体一致（11 表 + 种子数据已在 xxl_ai 库生效）
- [x] XxlRoleEnum 菜单已注册且 /getRouters 终端可见（顺序：首页→供应商/MCP/SKILL/知识库/Agent→系统管理(业务空间→用户/配置/日志)→帮助中心，知识文档隐藏路由生效）
- [x] 后端 `mvn -q compile` 通过
- [x] 前端 vue-tsc / eslint / vite build 通过
- [x] 联调（后端 8090 + mysql/redis/milvus 容器已起）：
  - 登录（临时关闭验证码）→ 菜单下发正确
  - 空间隔离：无 xxl-space-id 头 → "请选择业务空间"；无效空间 → "业务空间不存在"；有效空间 → 正确数据
  - 供应商页/模型接口正常，种子供应商（deepseek/glm/opencodego）+ 模型可见
  - MCP 社区查询外部不可达时友好降级；Skill 社区未配置时友好提示
  - 知识库/文档 CRUD 正常；向量化流程触发真实嵌入接口（无 Key 时 401 友好失败、文档置失败态，配 Key 后即可入 Milvus）
  - Agent 发布生成 UUID → 公开 `/agent/access/load` 免登录可访问；convCreate/convList/msgList 正常（visitorId 隔离）；SSE send 流式返回、错误路径友好且用户消息已落库
  - 用户管理新增/编辑授权空间接口连通（loadSpaceIds 正常）
- [ ] 真实模型/嵌入 Key 配置后的端到端向量化 + Agent 对话（供应商 BaseURL/Key 由管理员在页面配置）
- 变更记录：2026-09-05 方案落盘；同日完成建表、后端 6 模块 + 公共支撑、前端 6 模块 + 平台改造（空间切换器/公开对话页/用户多空间授权）、i18n、docker(milvus 栈)、编译与联调验证。

---

- 关联需求子目录：space/supplier/mcp/skill/knowledge/agent 合并于本目录（同一集成需求，共享空间隔离与公共支撑）。
- 校验清单见 `.agents/skills/xxl-ai/SKILL.md`。