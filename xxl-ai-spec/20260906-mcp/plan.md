# MCP 管理优化开发方案（mcp）

> 需求目录：`xxl-ai-spec/20260906-mcp/` | 日期：2026-09-06

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8090 + xxl-ai-ui 3000） |
| 模块/业务命名 | `mcp`（同名一级），包 `com.xxl.ai.api.business.mcp` |
| 核心字段与业务规则 | 配置完整兼容 MCP 官方格式：http(url+headers) / sse(url+headers) / stdio(command+args+env+cwd)；配置落 `config` JSON，平铺列(名称/类型/地址)保持列表与兼容 |
| 状态/枚举下拉 | `McpTypeEnum` 扩容 `0=Streamable HTTP / 1=SSE / 2=stdio` |
| 特殊组件 | MCP 表单分「远程/本地进程」双形态编辑；连通性测试 |
| 页面形态 | 标准 CRUD 列表页（备注多行；社区查询/安装已下线） |
| 出码方式 | AI 按模板直生等价代码 |
| 关键决策 | 官方 MCP Java SDK（io.modelcontextprotocol.sdk:mcp:2.0.1，内含 JDK HttpClient 版 http/sse/stdio transport）；Agent 绑定沿用 `mcp_ids` CSV；运行时真实工具调用（tools/list → 合并 OpenAI tools → llm tool_calls 循环 → tools/call） |
| 验证范围 | 编译 + 联调（stdio/http 配置、test 连通、Agent 工具调用） |

## 二、数据库设计
表：`xxl_ai_mcp`（增量）
| 字段 | 类型 | 说明 | 备注 |
|---|---|---|---|
| config | TEXT | 完整MCP配置(JSON) | 权威字段：`{"transport":"http\|sse\|stdio","url":"...","headers":{},\|"command":"npx","args":[],"env":{},"cwd":""}` |
| url | VARCHAR(200) | 服务地址 | 改为可空（stdio 无 url） |
| type | TINYINT | 0=HTTP、1=SSE、2=stdio | 存量 0/1 兼容 |

存量迁移：按 `type/url/headers` 回填 `config`。SQL 脚本：`mcp-table.sql`（增量）；新库已同步进 `doc/db/tables_xxl_ai.sql`（预设 11 条 MCP 种子：本地时钟/天气查询/计算器/日志信息查询 4 条远程用例（http/sse）、系统信息查询/随机数生成 2 条 stdio 本地 mock、社区流行 Top5 MCP（stdio））。

联调辅助：`mock-server/mcp-mock-server.mjs` 零依赖模拟 Streamable HTTP / SSE 服务（19001-19004 端口，启动 `node mock-server/mcp-mock-server.mjs`）；`mock-server/mcp-stdio-mock.mjs` 模拟 stdio 子进程（用例 system/random）。均用于保证「连接测试」与 Agent 工具调用本机可跑通；http/sse/stdio 协议细节对齐官方 Java MCP SDK 2.0.1。

## 三、菜单 / 授权
- MCP 菜单（`/mcp`、perm `mcp:default`）与既有按钮已注册（`XxlRoleEnum` ADMIN/USER），无需新增；测试按钮复用 `mcp:default`。
- 落盘：`mcp-table.sql`（无菜单 SQL）。

## 四、后端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| pom | 父 + `xxl-ai-api` | 引 `io.modelcontextprotocol.sdk:mcp:2.0.1`（含 mcp-core + mcp-json-jackson3，transport 基于 JDK HttpClient） |
| `Mcp.java` / `McpDTO.java` | business/mcp/model/ | 增 `config` 字段 |
| `McpTypeEnum` | business/mcp/enums/ | 增 `STDIO(2, "stdio")` |
| `McpMapper.xml` | resources/mapper/business/mcp/ | resultMap/Base_Column_List/insert/update 增 config 读写 |
| `McpService(+Impl)` | business/mcp/service/ | insert/update：Gson 校验 config 合法性并按类型回写平铺列；增 `test`（连通性测试，镜像 supplier testConnect） |
| `McpConnectDTO`（新） | business/mcp/model/dto/ | `{connectable, toolCount, elapsedMs, message}` |
| `McpClient`（新） | business/common/client/ | 官方 SDK：config→transport（stdio=StdioClientTransport/ProcessBuilder；http=HttpClientStreamableHttpTransport；sse=HttpClientSseClientTransport，自定义 headers）；`listTools`（内存缓存：serverId+config 指纹）；`callTool`；`test`；超时/异常兜底 |
| `LLMClient` | business/common/client/ | 增非流式 function calling `chat(messages, tools)` → `ChatResult{content, toolCalls}`；消息/工具体转 Map |
| `McpChatTool`（新） | business/agent/conv/model/ | 工具规格/工具调用结果封装（OpenAI 形态） |
| `AgentAccessService` | business/agent/conv/service/ | 绑定 mcp_ids → `listTools` 合并 OpenAI tools（名字加 mcp 前缀防冲突）→ 工具循环（≤8 轮）：chat → tool_calls → callTool → 回填 tool 消息 → 最终答案 SSE 流出；异常降级为提示 |
| `McpController` | business/mcp/controller/ | 增 `/mcp/test`（perm `mcp:default`） |

接口：`/mcp/pageList|insert|delete|update`、`/mcp/test`、`/mcp/listBySpace`

## 五、前端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `types/index.ts` | modules/business/mcp/ | `Mcp` 增 `config`（url 可空）；`McpConnectResult` |
| `api/index.ts` | modules/business/mcp/ | 增 `mcpTest(id)` |
| `pages/index.vue` | modules/business/mcp/ | 表单按 type 分「远程(HTTP/SSE)=url+headers(JSON)」/「本地进程(stdio)=command+args+env+cwd」；提交组 config 并回填平铺列；操作列/表单增「测试连接」；类型下拉自动带 stdio |
| i18n | locales/{zh,en}.json | `business.mcp.*` 补 test/command/args/env/cwd/远程配置/本地进程等，zh/en 成对 |

## 六、验证结果 / 变更记录
- [x] 需求结论确认并回填第一节
- [x] 表结构（config 列 / url 可空 / type=stdio）已同步到 `doc/db/tables_xxl_ai.sql` 并落 5 条预设 MCP 种子
- [x] 后端 `mvn -q compile` 通过
- [x] 前端 vue-tsc / eslint 通过
- [ ] 联调：stdio（npx 本地进程）/ http / sse 配置与 test 连通；config 非法/缺 command 校验拦截；Agent 绑定多 MCP 真实工具调用并回流；存量数据列表兼容
- [ ] 变更记录（2026-09-06 实施 MCP 配置完整格式兼容 + Agent 运行时工具调用）