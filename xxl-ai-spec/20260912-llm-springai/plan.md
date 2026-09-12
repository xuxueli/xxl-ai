# LLM 运行时 Spring AI 化改造方案（business/llm）

> 需求目录：`xxl-ai-spec/20260912-llm-springai/` | 日期：2026-09-12

## 一、需求相关

| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8090 + xxl-ai-ui 3000） |
| 模块/业务命名 | `llm`（LLM 运行时包 `com.xxl.ai.api.business.llm`），承担对话/工具/Skill/RAG 全部运行时编排；现有 `agent/skill/mcp/knowledge/supplier/chat` 仅保留元数据 CRUD |
| 核心诉求 | 消灭"野路子"手写 HTTP LLM 调用，改用最新 Spring AI 2.0.1（Chat/Embedding 模型、@Tool/工具回调、MCP、RAG VectorStore+Advisor），Skill 采用 spring-ai-agent-utils `SkillsTool`（SKILL.md 知识格式） |
| 页面形态 | 前端页面不变（`/chat` 对话页、`/knowledge` 管理页），仅后端重构运行时 |
| 出码方式 | 手写落位 + 编译驱动（API 以 Maven 拉包后 jar/javap 校验为准） |
| 验证范围 | 后端 `mvn -q compile` 通过；接口自测可选 |

## 二、依赖引入

在 `xxl-ai-api/pom.xml`（根 pom 已声明 spring-ai.version=2.0.1 与 milvus/mcp 版本管理）追加：

- `org.springframework.ai:spring-ai-starter-model-openai`：Chat + Embedding（OpenAI 兼容，含 Deepseek/GLM/Ollama /v1 前缀处理）
- `org.springframework.ai:spring-ai-vector-store-milvus`：Milvus VectorStore（换用 spring-ai 官方 schema 与相似度检索）
- `org.springframework.ai:spring-ai-advisors`：RAG Advisor（QuestionAnswerAdvisor / VectorStoreRetriever）
- `org.springaicommunity:spring-ai-agent-utils:0.12.0`：SkillsTool 技能系统（SKILL.md + YAML frontmatter）
- 移除手写 milvus SDK 直连依赖冲突风险（保留/对齐 spring-ai-milvus-store 传递依赖）

## 三、LLM 运行时落位（全新 business/llm）

```
com.xxl.ai.api.business.llm
├── client/LlmModelFactory.java     # 按 SupplierRuntime 构建 OpenAiChatModel / OpenAiEmbeddingModel（base-url/apiKey/customHeaders/model/temperature）
├── tool/
│   ├── SkillToolFactory.java       # DB Skill → spring-ai-agent-utils SkillsTool（物化为 SKILL.md，按指纹缓存）
│   └── McpToolFactory.java         # DB MCP 服务工具 → Spring AI ToolCallback[]（FunctionToolCallback 桥接，复用 McpClient）
├── rag/
│   ├── VectorStoreFactory.java     # 按 xxl-ai.milvus.* 构建 MilvusVectorStore（集合按 space/base 隔离）
│   └── RagService.java             # 向量化（分片→嵌入→写库）、向量检索、删除（按 docId）
└── service/LlmChatService.java     # Agent 对话编排：ChatClient + 工具 + RAG Advisor + SSE 流式（thinking/message/DONE）
```

## 四、存量改造与删减

| 文件 | 处置 |
|---|---|
| `business/common/client/LLMClient.java` | **删除**（由 spring-ai 模型替代） |
| `business/common/vector/MilvusTool.java` | **删除**（由 spring-ai MilvusVectorStore 替代） |
| `business/chat/model/AgentMcpTool.java` | **删除**（手工 OpenAI tools 装配由 spring-ai 工具回调替代） |
| `business/chat/service/AgentAccessService.java` | 保留对话/消息 CRUD（load/conv*/msg*），对话生成编排移交 `llm/service/LlmChatService` |
| `business/knowledge/doc/.../KnowledgeDocServiceImpl` | CRUD/上传保留；向量化、检索、删除向量改调 `llm/rag/RagService` |
| `business/knowledge/base/.../KnowledgeBaseServiceImpl` | 删除知识库时向量清理改调 `RagService` |
| `business/common/client/McpClient.java`、`business/common/util/TextChunkUtil.java` | 保留（传输层/分片基础能力，被 llm 包复用） |

## 五、Skill 方案（spring-ai-agent-utils 调研结论）

- 引入 `org.springaicommunity:spring-ai-agent-utils`（v0.12.0，要求 Spring AI 2.0.0+，满足 2.0.1）。
- `SkillsTool`（`org.springaicommunity.agent.tools.SkillsTool`）基于 `SKILL.md` + YAML frontmatter（`name`/`description`），以单个 `Skill` ToolCallback 注册进 ChatClient，模型按语义匹配触发，触发后注入完整技能内容。
- 本项目 Skill 元数据在 DB（`xxl_ai_skill`：name/description/version/status），运行时按 Agent 装配的技能列表物化为 `SKILL.md` 文件（临时目录 `{tmp}/xxl-ai/skills/{spaceId}/{skillName}/SKILL.md`），再 `SkillsTool.builder().addSkillsDirectory(...)`；按技能组成指纹缓存复用。
- 合并冲突：Skill 名作 frontmatter `name`（下划线化），description 直接使用 DB 描述。
- 与 mcp/rag 工具并列经 `.defaultToolCallbacks(...)` 注册，由 Spring AI `ToolCallingAdvisor` 统一驱动。

## 六、MCP 方案（spring-ai 工具回调）

- 传输层继续复用手写 `McpClient`（官方 MCP SDK 封装，DB 配置可动态连 http/sse/stdio，含 tools/list 缓存与连通测试）。
- 运行时把每个 MCP 服务暴露的工具（`McpToolInfo`：name/description/inputSchema）桥接为 Spring AI `FunctionToolCallback`（名称沿用 `mcp名__工具名` 去冲突），并入 ChatClient 工具集，由 spring-ai 执行调用（调用落地仍走 McpClient.callTool）。
- 不再手写 tool_calls 循环与 OpenAI tools 规格，统一交给 spring-ai。

## 七、RAG 方案（spring-ai VectorStore + Advisor）

- 用 spring-ai `MilvusVectorStore`（每个知识库一个实例，集合 `kb_space_{spaceId}_base_{baseId}`，内嵌 EmbeddingModel 来自知识库配置的嵌入供应商/模型）。
- 向量化：`TextChunkUtil`（保留）分片 → `Document` 组装 → `vectorStore.add(List<Document>)`（内部调用嵌入模型向量化）；删除按 `docId` 元数据过滤；检索用 `vectorStore.similaritySearch(...)`，返回 `{{text,docId,chunkIndex,score}}` 兼容原接口。
- 检索留后门（Agent 对话）：为每个知识库构建 `QuestionAnswerAdvisor`，在 ChatClient 请求级 `.advisors(...)` 注入，实现"标注方案"下标准 RAG 增强上下文。

## 八、接口路径与权限

- 保留：`/chat/*`（公开对话访问）、`/knowledge/doc/*`（管理端 CRUD/向量化/搜索）、`/knowledge/base/*`、`/mcp/*`、`/skill/*` 原路径与权限不动。
- 新增：`/llm/*` 运行时自测接口（可选，标注 `@XxlSso`）：`/gen`（模型对话）、`/search`（RAG 检索）、`/tools`（罗列 Agent 装配的工具）。
- 菜单/权限：无新增菜单（运行时不入菜单），仅接口鉴权沿用 `@XxlSso`。

## 九、验证 / 变更记录

- [x] `mvn -q compile` 通过（xxl-ai-api，clean compile BUILD SUCCESS）
- [x] 无 `LLMClient/MilvusTool/AgentMcpTool` 残留引用（已删除）
- [x] 启动验证：spring-ai 自动装配禁用（`spring.ai.model.*=none`），应用 8091 端口启动成功
- [x] 联调验证（真实模型 OpenAI 兼容网关）：
  - Agent `/chat/send` SSE 流式回复正常（thinking/message/[DONE]），会话/消息落库正确
  - MCP 工具经 spring-ai ToolCallingAdvisor 真实调用成功（Filesystem `list_directory`），工具名 ASCII 净化（`^[a-zA-Z0-9_-]+$`）适配
  - Skill 经 spring-ai-agent-utils `SkillsTool` 语义触发成功（code-review 技能）
  - RAG（MilvusVectorStore）联调未跑（本地暂无带文档的知识库数据；待补测）
- [x] 变更记录：2026-09-12 完成 spring-ai 运行时化改造（business/llm 全新包 + 存量运行路径迁移）
- [x] 变更记录：2026-09-12 初始化 SQL（doc/db/tables_xxl_ai.sql）补充 RAG 测试数据：知识库「产品使用手册」(id=1，嵌入模型=本地 Ollama qwen3-embedding 2/5) + 3 篇文档（登录与账号安全/API接入与鉴权/常见问题FAQ，status=0 未向量化），并绑定 Hi Agent kb_ids=1，开箱即可向量化/检索/知识问答联调

## 十、调研纪要

- Spring AI 2.0.1（根 pom `spring-ai.version` 已就绪）：官方 SDK openai-java；`OpenAiChatModel.builder().options(OpenAiChatOptions.builder()...apiKey()...baseUrl()...customHeaders())` 支持程序化多供应商；RAG 经 `QuestionAnswerAdvisor` + VectorStore（MilvusVectorStore 需 `initializeSchema=true`）；MCP 提供 client boot starter（属性驱动）+ MCP Annotations，本项目 MCP 服务为 DB 动态配置，采用「官方 MCP SDK 传输层(McpClient) + FunctionToolCallback 桥接」纳入 spring-ai 工具体系。
- `spring-ai-agent-utils`（org.springaicommunity，v0.12.0）：SkillsTool 以 SKILL.md 知识模块驱动（YAML frontmatter name/description），语义匹配触发，符合"完整知识 SKILL"诉求；本项目 Skill 为 DB 文件树，运行时物化为临时目录 SKILL.md 生态。
- 坑位记录：OpenAI 工具名须匹配 `^[a-zA-Z0-9_-]+$`（MCP 名含中文必须 ASCII slugify）；`spring-ai-model-openai` starter 会为未配置 api-key 的 audio/image 等模型报错，须禁用全部 `spring.ai.model.*` 自动装配；推理模型 `reasoningContent` 按流累积，SSE 下发需按「变化增量 + 去重」处理。