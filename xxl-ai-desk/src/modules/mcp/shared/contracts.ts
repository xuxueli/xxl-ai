/*
 * MCP 域跨进程契约：本地 MCP 服务配置、连通测试、工具元信息与「发现 MCP」检索结果。
 */

/* 服务类型：remote 远程（Streamable HTTP）/ local 本地（stdio 子进程） */
export type McpType = 'remote' | 'local'

/* 传输协议：远程 Streamable HTTP / 本地 stdio（本期不支持 SSE） */
export type McpTransport = 'streamable-http' | 'stdio'

/* 最近一次连通检测结果 */
export interface McpHealth {
  /* 是否连通 */
  ok: boolean
  /* 结果描述 */
  message: string
  /* 可用工具数量 */
  toolCount: number
  /* 检测耗时（毫秒） */
  elapsedMs: number
  /* 检测时间（ISO） */
  checkTime: string
}

/* MCP 服务（列表 / 编辑） */
export interface McpDTO {
  /* 主键 */
  id: string
  /* 名称（工具名前缀来源） */
  name: string
  /* 服务类型 */
  type: McpType
  /* 传输协议 */
  transport: McpTransport
  /* 远程服务地址（仅 http/https） */
  url: string
  /* 远程请求头（值落库编码，读取时解密） */
  headers: Record<string, string>
  /* 本地命令 */
  command: string
  /* 本地命令参数 */
  args: string[]
  /* 本地环境变量（值落库编码，读取时解密） */
  env: Record<string, string>
  /* 本地工作目录（空则项目根目录） */
  cwd: string
  /* 规范配置 JSON（表单字段派生，唯一权威配置） */
  config: string
  /* 备注 */
  remark: string
  /* 是否生效（开启后才参与对话） */
  enabled: boolean
  /* 最近检测结果 */
  health: McpHealth | null
  /* 新增时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* MCP 工具元信息（测试结果与工具列表复用） */
export interface McpToolMeta {
  /* 工具名 */
  name: string
  /* 工具标题（缺省回落工具名） */
  title: string
  /* 工具说明 */
  description: string
  /* 是否只读（Plan 模式仅暴露只读工具） */
  readOnly: boolean
}

/* 连通测试结果 */
export interface McpTestResult extends McpHealth {
  /* 服务名（serverInfo.name） */
  serverName: string
  /* 服务版本 */
  serverVersion: string
  /* 协议版本 */
  protocolVersion: string
  /* 服务说明（instructions） */
  instructions: string
  /* 可用工具明细 */
  tools: McpToolMeta[]
}

/* 发现 MCP：条目 */
export interface McpDiscoverItem {
  /* 来源社区（当前仅 mcpso） */
  source: 'mcpso'
  /* 站点内唯一标识（拼详情地址） */
  slug: string
  /* 名称 */
  name: string
  /* 描述 */
  description: string
  /* 作者 */
  author: string
  /* 分类 */
  category: string
  /* 是否远程服务 */
  remote: boolean
  /* 星标数（站点展示的 Star 数，0 表示未提供） */
  stars: number
  /* 详情页地址 */
  detailUrl: string
  /* 图标地址（可能为空） */
  logo: string
}

/* 发现 MCP：分页结果 */
export interface McpDiscoverPage {
  /* 来源社区 */
  source: 'mcpso'
  /* 条目列表 */
  items: McpDiscoverItem[]
  /* 当前页码（从 1 开始） */
  page: number
  /* 是否还有下一页 */
  hasMore: boolean
  /* 是否命中缓存 */
  cached: boolean
}

/* 发现 MCP：站点支持的浏览排序（搜索固定推荐顺序，不传 sort） */
export type McpDiscoverSort = 'star' | 'latest' | 'name'

/* 发现 MCP：检索入参 */
export interface McpDiscoverQuery {
  /* 关键字（空则浏览社区列表 / 指定分类） */
  keyword: string
  /* 页码（从 1 开始） */
  page?: number
  /* 分类 slug（有值且无关键字时按分类浏览） */
  category?: string
  /* 浏览排序：star 最热门 / latest 最近添加 / name 名称 */
  sort?: McpDiscoverSort
}

/* 发现 MCP：社区分类 */
export interface McpCategory {
  /* 分类标识（拼分类页地址） */
  slug: string
  /* 分类名称 */
  label: string
  /* 该分类下服务数量（站点提供时） */
  count: number
}

/* 发现 MCP：详情（含可导入配置片段） */
export interface McpDiscoverDetail extends McpDiscoverItem {
  /* 简介 / README 摘要（纯文本） */
  readme: string
  /* 可导入的配置片段（mcpServers JSON / 安装命令） */
  snippets: string[]
}

/* MCP 运行时配置：配置模块产出的纯数据，交运行时进程装配（不包含连接/协议逻辑） */
export interface McpRuntimeConfig {
  /* 服务主键 */
  id: string
  /* 服务名（工具名前缀） */
  name: string
  /* 传输协议：Streamable HTTP / stdio */
  transport: 'streamable-http' | 'stdio'
  /* 远程服务地址 */
  url?: string
  /* 远程请求头（已解密） */
  headers?: Record<string, string>
  /* 本地命令 */
  command?: string
  /* 本地命令参数 */
  args?: string[]
  /* 本地环境变量（已解密） */
  env?: Record<string, string>
  /* 本地工作目录 */
  cwd?: string
}
