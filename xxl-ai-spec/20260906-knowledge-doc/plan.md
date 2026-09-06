# 知识文档管理改造方案（knowledge/doc）

> 需求目录：`xxl-ai-spec/20260906-knowledge-doc/` | 日期：2026-09-06

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8090 + xxl-ai-ui 3000） |
| 模块/业务命名 | `knowledge/doc`，包 `com.xxl.ai.api.business.knowledge.doc` |
| 核心需求 | ① 长文本支持 ② 上传修复与格式限制 ③ 表格列宽/操作列调整 ④ Milvus 向量化与检索调通 |
| 页面形态 | 现有列表页 `knowledge/base/pages/doc.vue` 改造 |
| 验证范围 | 后端 `mvn -q compile` + 起 api+vue 联调向量化/检索 |

## 二、数据库设计
表：`xxl_ai_knowledge_doc`
| 字段 | 类型 | 说明 |
|---|---|---|
| content | TEXT → **MEDIUMTEXT** | 文档内容（支持长文本，上限 16MB） |

- 变更 SQL：`ALTER TABLE xxl_ai_knowledge_doc MODIFY COLUMN content MEDIUMTEXT NULL COMMENT '文档内容';`
- 同步更新 `doc/db/tables_xxl_ai.sql` 初始化脚本。

## 三、菜单 / 授权
- 菜单/按钮已存在（`knowledge:doc`），无需改动。

## 四、后端改造
| 文件 | 改动要点 |
|---|---|
| `KnowledgeDocServiceImpl.upload` | 限制上传格式（仅 .txt/.md）+ 文件大小/格式校验 + 文件名清洗 |
| `LLMClient.embedding` | 兼容 Ollama 供应商 BaseURL 缺失 `/v1` 前缀（自动补 `/v1`） |
| `MilvusTool` | 检查集合创建/写入/检索配置（维度取实际向量维度） |

## 五、前端改造
| 文件 | 改动要点 |
|---|---|
| `doc.vue` | ① content 输入上限放宽至 MEDIUMTEXT；② 上传格式限制 + beforeValidate；③ 表格文档名列窄化（超长...）、操作列加宽、向量化按钮移至操作列第一位 |
| i18n (`zh/en.json`) | 补充/调整文案（上传格式提示等） |

## 六、验证结果 / 变更记录
- [x] 需求结论确认并回填第一节（上传仅 txt/md；content MEDIUMTEXT；后端编译 + 联调验证）
- [x] content 列 MEDIUMTEXT 变更执行并确认（`SHOW COLUMNS` → mediumtext）
- [x] 上传 .md 成功、.pdf / .exe 被拒（`仅支持 .txt / .md 文本文件`）
- [x] 后端 `mvn -q compile` 通过
- [x] 前端 `vue-tsc --noEmit` + `npm run build` 通过
- [x] 联调：向量化成功（chunk 写入 Milvus 集合 `kb_space_1_base_1`）、向量检索按相似度返回命中
- [x] 补充需求：普通用户角色无空间授权导致顶部空间切换器不显示 → 补充 `xxl_ai_user_space` 种子授权（默认空间），联调 `/space/listByUser` 返回默认空间，user 角色可正常按空间访问知识库
  - 后续补充：未分配空间时顶部空间入口占位展示（`SpaceSelect.vue` 无空间分支显示「未分配空间」，弱化样式 + not-allowed），不再整体隐藏
- 变更记录：
  - 2026-09-06 后端：`LLMClient` 增加 `buildParallelUrl`，裸地址 BaseURL 自动补 `/v1`（修复 Ollama 嵌入式 404）
  - 2026-09-06 后端：种子修正 Ollama `qwen3-embedding:0.6b` 模型 type=1（嵌入），保证向量化模型校验通过
  - 2026-09-06 前端：doc.vue content 输入上限 65535 → 16777215（对齐 MEDIUMTEXT）；上传前校验格式/大小；文档名列 200→180（超长...）、操作列 150→220、向量化按钮移至操作列第一位；去掉手动 multipart Content-Type（修复浏览器上传）
  - 2026-09-06 种子：`xxl_ai_user_space` 为普通用户默认授权默认空间