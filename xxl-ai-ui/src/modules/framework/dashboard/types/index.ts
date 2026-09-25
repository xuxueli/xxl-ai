/**
 * 类型定义：首页 Dashboard（dashboard 模块）
 * 覆盖首页指标卡片、Agent 会话消息趋势与占比数据结构。
 */

/** 首页指标卡片数据 */
export interface DashboardStats {
  /** Agent 数量 */
  agentCount: number
  /** Skill 数量 */
  skillCount: number
  /** MCP 数量 */
  mcpCount: number
  /** 供应商模型数量 */
  modelCount: number
}

/** 会话消息趋势单日数据点 */
export interface ConvMsgTrendItem {
  /** 日期（YYYY-MM-DD） */
  date: string
  /** 当日消息量 */
  count: number
}

/** Agent 会话消息占比项 */
export interface AgentMsgShareItem {
  /** Agent 名称 */
  name: string
  /** 消息量 */
  value: number
}
