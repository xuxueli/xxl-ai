# 示例 MCP 服务独立模块化方案（api-sample）

> 需求目录：`xxl-ai-spec/20260913-api-sample/` | 日期：2026-09-13

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 新增独立 Spring Boot 应用 `xxl-ai-api-sample`（纯 Server，端口 8091） |
| 模块/业务命名 | `xxl-ai-api-sample`，包 `com.xxl.ai.api.sample`，MCP 端点路径保持 `/sample/**` |
| 核心字段与业务规则 | 内嵌 Streamable HTTP MCP 服务：`/sample/clock/mcp`（get_current_time）、`/sample/calc/mcp`（calculator），由官方 MCP Java SDK 构建 |
| 页面形态 | 纯后端应用，无数据库、无前端 |
| 出码方式 | 从 `xxl-ai-api` 迁移 `business/sample/mcp` 代码并调整包名/端口 |
| 验证范围 | 根工程 `mvn -q compile` 通过；启动 8091 后 `/sample/**` 可连通 |

## 二、架构调整
- `xxl-ai-api`（8090）：**只作为 MCP 调用方**，删除内嵌示例服务代码（`business/sample/mcp`）。
- `xxl-ai-api-sample`（8091）：承载示例 MCP Server 功能，DB 种子中的示例端点 URL 由 `http://127.0.0.1:8090/sample/...` 改为 `http://127.0.0.1:8091/sample/...`。
- docker 一键部署栈新增 `xxl-ai-api-sample` 服务；根 pom `<modules>` 登记新模块。

## 三、文件变更清单
| 文件 | 变更 |
|---|---|
| `xxl-ai-api-sample/pom.xml` | 新增（parent xxl-ai；spring-boot-starter-web + mcp sdk） |
| `xxl-ai-api-sample/src/main/java/com/xxl/ai/api/sample/XxlAiApiSampleApplication.java` | 新增（启动类） |
| `xxl-ai-api-sample/src/main/java/com/xxl/ai/api/sample/mcp/SampleMcpServerConfig.java` | 新增（迁移） |
| `xxl-ai-api-sample/src/main/java/com/xxl/ai/api/sample/mcp/SampleMcpTool.java` | 新增（迁移） |
| `xxl-ai-api-sample/src/main/resources/application.properties` | 新增（server.port=8091） |
| `xxl-ai-api-sample/Dockerfile` | 新增 |
| `pom.xml` | `<modules>` 追加 `xxl-ai-api-sample` |
| `xxl-ai-api/.../business/sample/**` | 删除 |
| `doc/db/tables_xxl_ai.sql` | 示例端点 URL 8090 → 8091 |
| `docker/docker-compose.yml`、`docker/.env` | 新增 sample 服务 |

## 四、验证结果 / 变更记录
- [x] 根工程 `mvn -q compile` 通过（api 与 api-sample 均编译无错）
- [x] 8091 启动，`/sample/clock/mcp`（initialize 返回 serverInfo）与 `/sample/calc/mcp`（tools/call `1+2*3` → `7`）连通验证通过
- [x] 变更记录：2026-09-13 新建 `xxl-ai-api-sample`（8091），示例 MCP 服务独立部署；`xxl-ai-api` 只作调用方