# 示例 MCP 服务独立模块化方案（api-sample · 注解式 @McpTool）

> 需求目录：`xxl-ai-spec/20260913-api-sample/` | 日期：2026-09-13 | 方案决策：**A：统一单端点 + Spring AI 注解式**

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 新增独立 Spring Boot 应用 `xxl-ai-api-sample`（纯 Server，端口 8091） |
| 模块/业务命名 | `xxl-ai-api-sample`，包 `com.xxl.ai.api.sample`，MCP 端点 `/sample/mcp` |
| 提供方式 | **Spring AI 注解式 MCP Server**：`@McpTool` + `spring-ai-starter-mcp-server-webmvc`，自动装配 Streamable HTTP（对比原官方 SDK 直写方式，后续加工具只加 `@McpTool` 方法） |
| 工具集 | `get_current_time`（本地时钟）、`calculator`（四则运算，自动 JSON Schema） |
| 页面形态 | 纯后端应用，无数据库、无前端 |
| 验证范围 | 根工程 `mvn -q compile`；8091 实跑 `initialize`/`tools/list`/`tools/call` |

## 二、架构调整
- `xxl-ai-api`（8090）：**只作为 MCP 调用方**，删除内嵌示例服务代码（`business/sample/mcp`）。
- `xxl-ai-api-sample`（8091）：承载示例 MCP Server，**单端点** `/sample/mcp` 聚合全部示例工具；DB 种子由双条（clock/calc 8090）收敛为单条 `http://127.0.0.1:8091/sample/mcp`。
- docker 一键部署栈新增 `xxl-ai-api-sample` 服务；根 pom `<modules>` 登记新模块。

## 三、注解式要点（Spring AI 2.0.1 / Boot 4.1.1）
- 依赖：`org.springframework.ai:spring-ai-starter-mcp-server-webmvc:2.0.1`（默认自动装配 webmvc + 注解扫描）。
- 工具 Bean：`@Component` 方法标 `org.springframework.ai.mcp.annotation.McpTool`，入参 `@McpToolParam(description=...)`，返回 String 自动转为文本内容。
- **必须明确声明** `spring.ai.mcp.server.protocol=streamable`（自动装配条件 `@ConditionalOnProperty` 需显式属性，默认值不触发，否则 webmvc 路由器不挂载 → 404）。
- 端点路径：`spring.ai.mcp.server.streamable-http.mcp-endpoint=/sample/mcp`。
- `application.properties` 为 ISO-8859-1，`instructions` 中文会乱码，用英文。

## 四、文件变更清单（相对第一版 SDK 方案）
| 文件 | 变更 |
|---|---|
| `xxl-ai-api-sample/pom.xml` | `io.modelcontextprotocol.sdk:mcp` → `spring-ai:sprig-ai-starter-mcp-server-webmvc` |
| `xxl-ai-api-sample/.../sample/mcp/SampleMcpTool.java` | 改写为 `@Component` + `@McpTool` 方法，删除手工 Schema/callHandler |
| `xxl-ai-api-sample/.../sample/mcp/SampleMcpServerConfig.java` | **删除**（交给自动装配） |
| `xxl-ai-api-sample/src/main/resources/application.properties` | 增加 `spring.ai.mcp.server.*` 配置 |
| `xxl-ai-api-sample/Dockerfile` | 保持（jar 名未变） |
| `doc/db/tables_xxl_ai.sql` | 双条端点 → 单条 `/sample/mcp` |
| `docker/docker-compose.yml`、`docker/.env` | 新增 sample 服务（`XXL_AI_API_SAMPLE_PORT=8091`） |
| `pom.xml` | `<modules>` 追加 `xxl-ai-api-sample` |
| `xxl-ai-api/.../business/sample/**` | 删除 |

## 五、验证结果 / 变更记录
- [x] 根工程 `mvn -q compile` 通过（api 与 api-sample 均编译无错）
- [x] 8091 实跑：`initialize` 返回 serverInfo（name=xxl-ai-api-sample），`tools/list` 自动列出 2 工具（含 `@McpToolParam` 生成的 inputSchema），`tools/call`：`(1+2)*3=9`、`get_current_time` 正常；`instructions` 英文无乱码
- [x] 变更记录：2026-09-13 新建 `xxl-ai-api-sample`（8091），示例 MCP 服务独立部署并切换为 Spring AI `@McpTool` 注解式单端点；`xxl-ai-api` 只作调用方