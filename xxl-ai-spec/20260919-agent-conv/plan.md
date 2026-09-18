# Agent 对话管理开发方案（agent/conv）

> 需求目录：`xxl-ai-spec/20260919-agent-conv/` | 日期：2026-09-19

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8090 + xxl-ai-ui 3000） |
| 模块/业务命名 | `agent` 模块聚合 `conv` 业务，包 `com.xxl.ai.api.business.agent`（平铺同名包，参照 supplier 聚合 model），接口 `/agent/conv` |
| 核心字段与业务规则 | 按 Agent 查看访客对话；列表支持 标题、访客ID 模糊查询；对话归属校验（Agent 空间 + UUID）；对话消息明细只读 |
| 状态/枚举下拉 | 无 |
| 特殊组件 | 右侧 Drawer 展示消息明细（含思考过程折叠、助手内容 Markdown 渲染） |
| 页面形态 | Agent管理列表行操作列新增「Agent对话」按钮 → 隐藏路由子页 `/agent/conv` 列表 + 明细抽屉 |
| 出码方式 | AI 按模板直生等价代码 |
| 验证范围 | `mvn -q compile` + 前端 `vue-tsc --noEmit` + eslint |
| 需求确认 | 承载形式=隐藏路由子页；明细=右侧抽屉；按钮=表格行操作列「修改」左侧 |

## 二、数据库设计
复用既有 `xxl_ai_agent_conv`（对话）、`xxl_ai_agent_msg`（消息）、`xxl_ai_agent`（Agent，取 `uuid`）三表，**无新增字段/无建表 SQL**。

- 关联键：`xxl_ai_agent_conv.agent_uuid = xxl_ai_agent.uuid`；`xxl_ai_agent_msg.conv_id = xxl_ai_agent_conv.id`。
- 索引：`xxl_ai_agent_conv` 已有 `i_agent_visitor (agent_uuid, visitor_id)`，支持按 Agent + 访客过滤。
- 时间字段由既有表 `add_time/update_time` 提供，列表/明细只读展示。

## 三、菜单 / 授权
- 隐藏菜单（type=1，承载路由，侧栏不展示）：`Agent对话` permission=`agent:conv` url=`/agent/conv`，parentId=0（与知识文档/SKILL内容隐藏路由一致）。
- 注册：`XxlRoleEnum` 的 `ADMIN_RESOURCES`、`USER_RESOURCES` 各追加一条 `resHidden(21, 0, "Agent对话", MENU, "agent:conv", "/agent/conv", "", 111)`。
- 按钮：Agent管理页行操作列「Agent对话」`v-hasPermi="['agent:conv']"`，位于「修改」左侧。
- 后端接口：`@XxlSso(permission = "agent:conv")`。
- 落盘：菜单走枚举注册，无 SQL。

## 四、后端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `AgentConvMapper.java`（改） | business/chat/mapper | 新增管理端 `pageList` / `pageListCount`（agentUuid + title/visitorId 模糊） |
| `AgentConvMapper.xml`（改） | resources/mapper/business/chat | 显式 resultMap 复用；`<if>` 动态拼条件；`LIMIT #{offset},#{pagesize}` |
| `AgentConvService.java`（新） | business/agent/service | `pageList` / `msgList` |
| `AgentConvServiceImpl.java`（新） | business/agent/service/impl | 校验 Agent 归属空间；空 uuid 返回空页；对话归属校验 |
| `AgentConvController.java`（新） | business/agent/controller | `@RequestMapping("/agent/conv")`，全 `@XxlSso(permission="agent:conv")`；分页 offset/pagesize；空间校验 |
| `XxlRoleEnum.java`（改） | framework/constant/enums | 注册隐藏菜单 |

接口：`/agent/conv/pageList`（agentId/offset/pagesize/title/visitorId）、`/agent/conv/msgList`（agentId/convId）。

## 五、前端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `types/index.ts`（改） | modules/business/agent | 新增 `AgentConv` / `AgentMsg` / `AgentConvQuery` / `AgentConvListQuery` |
| `api/index.ts`（改） | modules/business/agent | 新增 `listAgentConv(agentId, query)`、`listAgentConvMsg(agentId, convId)` |
| `pages/index.vue`（改） | modules/business/agent | 行操作列新增「Agent对话」按钮（`agent:conv`），`router.push('/agent/conv?agentId&agentName')`；操作列宽 220→320 |
| `pages/conv.vue`（新） | modules/business/agent/pages | 三段式列表页：返回 + 标题/访客ID 搜索 + 表格（行点击/查看明细）+ 分页 + 明细 Drawer（思考折叠、助手 Markdown） |
| i18n（改） | src/i18n/locales/{zh,en}.json | `business.agent.*` 成对补充 conv/convListTitle/convDetail/viewDetail/backAgent/convTitle/visitorId/roleUser/roleAssistant/convEmptyTip |

路由映射：`/agent/conv` → `modules/business/agent/pages/conv.vue`（loadView 自动映射，无需改路由）。

## 六、验证结果 / 变更记录
- [x] 需求结论确认并回填第一节
- [x] 无需建表（复用既有 Agent 对话/消息表）
- [x] `XxlRoleEnum` 隐藏菜单已注册（ADMIN + USER）
- [x] 后端 `mvn -q compile` 通过
- [x] 前端 `vue-tsc --noEmit` 通过；eslint / prettier（新增文件）通过
- [ ] 起 api+vue 联调：Agent管理行「Agent对话」可见、列表/搜索/分页/明细可用、无权限按钮隐藏（待联调）
- [x] 变更记录：2026-09-19 新增 Agent 对话管理（隐藏路由页 + 明细抽屉 + `/agent/conv` 接口）
