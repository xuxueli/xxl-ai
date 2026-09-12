# 供应商请求附属 Header 配置方案（supplier）

> 需求目录：`xxl-ai-spec/20260912-supplier-header/` | 日期：2026-09-12

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8090 + xxl-ai-ui 3000） |
| 模块/业务命名 | 改造既有 `supplier`（供应商管理），不新增菜单 |
| 需求背景 | OpenCode Go 供应商要求 `x-opencode-session` 会话头且 session 按会话稳定；GLM等后续也可能要求类似 header |
| 核心方案 | 供应商可配置任意请求附属 Header（JSON 数组 key/value）；value 支持 `{session}` 占位符，LLM 请求时按会话动态替换 |
| 出码方式 | 手写改造 |
| 验证范围 | 后端 `mvn -q compile` + 前端 eslint/build |

## 二、数据库设计
表：`xxl_ai_supplier` 增加列
| 字段 | 类型 | 说明 | 备注 |
|---|---|---|---|
| headers | VARCHAR(2000) | 请求附属Header（JSON 数组 `[{"key","value"}]`） | value 可含 `{session}` 占位符，请求时按会话替换；会话场景外跳过带占位符 header |

SQL 脚本：`supplier-header.sql`
- OpenCodeGo 种子：`[{"key":"x-opencode-session","value":"{session}"}]`

## 三、菜单 / 授权
- 无新增菜单/按钮，沿用 `supplier:default`

## 四、后端改造
| 文件 | 要点 |
|---|---|
| `Supplier.java`/`SupplierDTO.java`/`SupplierAdaptor.java` | 增加 `headers` 字段并双向映射 |
| `SupplierMapper.xml` | resultMap / Base_Column_List / insert / update 增加 `headers` |
| `SupplierRuntime.java` | 增加 `List<Map<String,String>> headers` |
| `SupplierServiceImpl.java` | `parseHeaders()` 解析 JSON；`loadRuntime` 下发 headers；insert/update 校验 JSON 格式；`requestTest` 附带静态 headers |
| `LLMClient.java` | `chatStream/chat/embedding` 增加 `headers` 参数；`doPost` 附加配置 header，`{session}` 占位替换为 sessionId（为空跳过）；移除硬编码 `x-opencode-session` |
| `AgentAccessService.java` | sessionId 恒按会话生成 `xxl-ai-conv-{convId}`，删除 `isOpenCodeGo` 域名检测；传递 runtime headers |
| `KnowledgeDocServiceImpl.java` | embedding 调用携带 runtime headers |

## 五、前端改造
| 文件 | 要点 |
|---|---|
| `types/supplier.ts` | `Supplier` 增加 `headers?: string` |
| `pages/index.vue` | 表单增加「请求附属Header」textarea（JSON 数组），提交时 `JSON.parse` 校验 |
| `i18n zh/en` | 新增 `business.supplier.headers` / `headersPlaceholder` / `headersFormat` |

## 六、验证结果 / 变更记录
- [x] 后端 `mvn -q compile` 通过
- [x] 前端 build / eslint 通过
- [ ] OpenCodeGo 携带 x-opencode-session（{session}→会话ID）请求成功，错误 400 消失（待联调）
- [ ] 变更记录：2026-09-12 供应商新增 headers 配置，LLM 请求按配置附带 header 并动态注入会话标识