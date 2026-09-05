# 供应商连通测试开发方案（supplier）

> 需求目录：`xxl-ai-spec/20260906-supplier-testconnect/` | 日期：2026-09-06

## 一、需求相关
| 项 | 结论 |
|---|---|
| 运行模式 | 前后端分离（xxl-ai-api 8090 + xxl-ai-ui 3000） |
| 模块/业务命名 | `supplier`（供应商管理页新增「连通测试」） |
| 核心字段与业务规则 | 勾选单行供应商 → 后端读库存 `baseUrl/apiKey` 发起探测；GET `{baseUrl}/models` 优先，失败回退 POST `{baseUrl}/chat/completions` 最小请求（模型探测，不做真实对话） |
| 状态/枚举下拉 | 无新增 |
| 特殊组件 | 无（工具栏按钮 + 轻提示展示结果） |
| 页面形态 | 在现有供应商列表页顶部工具栏增加按钮 |
| 出码方式 | AI 按模板直生等价代码 |
| 验证范围 | 编译验证 + 前后端联调 |

## 二、数据库设计
无需建表。复用 `xxl_ai_supplier`（`base_url`/`api_key`）。

## 三、菜单 / 授权
- 顶部工具按钮：`v-hasPermi="['supplier:default']"`，沿用供应商页默认权限，无需新增资源注册。

## 四、后端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `SupplierConnectDTO.java`（新增） | business/supplier/model/dto/ | `connectable/httpCode/elapsedMs/message` |
| `SupplierService.java` | business/supplier/service/ | 新增 `testConnect(spaceId, supplierId)` |
| `SupplierServiceImpl.java` | business/supplier/service/impl/ | `java.net.http.HttpClient` 探测：GET /models 优先，401/403 判定认证失败不回退，其余回退 POST /chat/completions；`Response.ofSuccess(SupplierConnectDTO)` 恒成功返回、`connectable` 供前端判定 |
| `SupplierController.java` | business/supplier/controller/ | 新增 `/supplier/testConnect`，`@XxlSso(permission="supplier:default")` + 空间校验 |

接口：`/supplier/testConnect?id=xxx`（GET）

## 五、前端改造
| 文件 | 位置 | 要点 |
|---|---|---|
| `types/supplier.ts` | modules/business/supplier/types/ | 新增 `SupplierConnect` 类型 |
| `api/supplier.api.ts` | modules/business/supplier/api/ | 新增 `testConnectSupplier(id)` |
| `pages/index.vue` | modules/business/supplier/pages/ | 顶部工具栏新增「连通测试」按钮（`:loading` 交互态），`table.ids` 取单选行，`connectable` 分支 msgSuccess/msgError |
| i18n | locales/{zh,en}.json | 新增 `business.supplier.testConnect`（连通测试 / Connectivity Test） |

## 六、验证结果 / 变更记录
- [x] 后端 `mvn -q compile` 通过
- [x] 前端 vue-tsc / eslint 通过
- [ ] 联调：勾选单行→连通测试，可达（200）提示成功、认证失败/网络异常/接口异常提示含原因与 HTTP 码
- [x] 变更记录：2026-09-06 新增供应商连通测试（两端结合校验）