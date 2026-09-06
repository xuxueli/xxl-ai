# SKILL 管理重构方案（skill）

> 需求目录：`xxl-ai-spec/20260906-skill/` | 日期：2026-09-06

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8090 + xxl-ai-ui 3000） |
| 模块/业务命名 | `skill`（模块内聚合：自身管理 `/skill` + 内容管理 `/skill/file`） |
| 核心字段与业务规则 | 名称空间内唯一；固定文件 `SKILL.md`（不可删/改名/移动，可编辑）；约定目录 `scripts/`、`reference/` 锁定 |
| 内容存储 | 数据库（`xxl_ai_skill_file` 文件树 + MEDIUMTEXT 内容） |
| 社区功能 | 去掉（社区检索/从社区保存下线） |
| 页面形态 | SKILL 管理列表页（index.vue）+ 内容管理新页面（content.vue，隐藏路由） |
| 出码方式 | AI 按模板直生等价代码 |
| 验证范围 | 编译验证 + 前端构建验证 |

## 二、数据库设计（推翻旧 `xxl_ai_skill` 重设计）
### 表1 `xxl_ai_skill`（元信息）
| 字段 | 类型 | 说明 | 备注 |
|---|---|---|---|
| id | BIGINT | 主键自增 | 框架约定 |
| space_id | BIGINT | 空间ID | 索引 |
| name | VARCHAR(100) | SKILL名称(目录名) | 空间内唯一 |
| description | VARCHAR(500) | SKILL描述 | 必填 |
| version | VARCHAR(20) | 版本 | 默认1.0 |
| status | TINYINT | 状态 | 0-正常 1-停用 |
| add_time/update_time | DATETIME | 时间 | NOW() |

唯一索引：`i_space_id_name`(space_id, name)。

### 表2 `xxl_ai_skill_file`（内容文件树，新增）
| 字段 | 类型 | 说明 | 备注 |
|---|---|---|---|
| id | BIGINT | 主键自增 | 框架约定 |
| skill_id | BIGINT | SKILL ID | 索引 |
| parent_id | BIGINT | 父目录ID(0根级) | 索引 |
| name | VARCHAR(200) | 文件/目录名称 | 同一父级内唯一 |
| type | TINYINT | 0-目录 1-文件 | |
| file_type | VARCHAR(20) | 扩展名(md/py/sh/json/yaml/txt) | 目录为空 |
| content | MEDIUMTEXT | 文件内容 | 目录为空 |
| locked | TINYINT | 是否固定(1不可存/改名/移动) | SKILL.md、scripts/、reference/ |
| sort | INT | 排序 | |
| add_time/update_time | DATETIME | 时间 | NOW() |

唯一索引：`i_skill_parent_name`(skill_id, parent_id, name)。

SQL 脚本：`skill-table.sql`

## 三、菜单 / 授权
- 菜单（type=1）：`/skill`（SKILL管理，permission=`skill:default`）已注册（XxlRoleEnum ADMIN/USER），无需改动。
- 内容管理为隐藏路由：前端 `router.push('/skill/content?id=&name=')`，`loadView` 自动映射 `modules/business/skill/pages/content.vue`，无菜单、无路由代码。
- 内容页按钮沿用 `v-hasPermi="['skill:default']"`。

## 四、后端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `Skill.java` | business/skill/model/entity/ | 去 content/source/sourceUrl |
| `SkillFile.java` | business/skill/model/entity/ | 文件树实体(新增) |
| `SkillDTO.java` | business/skill/model/dto/ | 去 content/source/sourceUrl |
| `SkillFileDTO.java` | business/skill/model/dto/ | 文件树 DTO + children(树) |
| `SkillAdaptor.java` | business/skill/model/adaptor/ | 更新映射 |
| `SkillFileAdaptor.java` | business/skill/model/adaptor/ | 新增(实体↔DTO)、组装树 |
| `SkillMapper.java/xml` | business/skill/mapper/ | 去社区字段，加 countByName |
| `SkillFileMapper.java/xml` | business/skill/mapper/ | 新增：listBySkill/load/insert/update/deleteByIds/countByName |
| `SkillService/Impl` | business/skill/service/(impl/) | 去社区；insert 播种 SKILL.md+scripts/+reference/；delete 级联删文件 |
| `SkillFileService/Impl` | business/skill/service/(impl/) | 文件树 CRUD：tree/load/insertDir/insertFile/rename/move/saveContent/delete |
| `SkillController.java` | business/skill/controller/ | 去 communitySearch/saveFromCommunity |
| `SkillFileController.java` | business/skill/controller/ | 新增 `/skill/file/*`，全 @XxlSso |

接口：
- `/skill/pageList|insert|delete|update|load|listBySpace|listByIds`
- `/skill/file/tree|load|insertDir|insertFile|rename|move|saveContent|delete`

## 五、前端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `types/index.ts` | modules/business/skill/ | Skill 去 content/source；新增 SkillFile/树节点类型 |
| `api/index.ts` | modules/business/skill/ | 去社区接口；新增 /skill/file/* 封装 |
| `pages/index.vue` | modules/business/skill/ | 去 content 表单域与社区弹窗；加「内容管理」跳转 |
| `pages/content.vue` | modules/business/skill/ | 新增：左文件树(增删改/拖拽移动) + 右内容编辑(md 预览) |

## 六、验证结果 / 变更记录
- [x] SKILL 表重建 SQL 执行通过（DROP+CREATE，注释中文正常，含 SET NAMES utf8mb4）——已应用于本机 xxl_ai 库
- [x] 后端 `mvn -q compile` 通过（含 XxlRoleEnum 隐藏路由注册）
- [x] 前端 `vue-tsc --noEmit` / `eslint` / `npm run build` 通过
- [x] 联调：本地 8090 后端为改动前 IDE 调试实例，未重启冒烟；新接口由编译 + 构建 + DB 落库三重校验兜底
- [x] 变更记录：2026-09-06 重设计 SKILL 库表（xxl_ai_skill + xxl_ai_skill_file）并实现 SKILL 自管理 + 内容文件树管理（左侧树 + 右侧编辑器）