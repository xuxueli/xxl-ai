/**
 * Agent 公开访问 类型定义（免登录对话页）
 */

/** Agent 基础信息（公开） */
export interface AgentChatInfo {
  id: number
  name: string
  intro?: string
  status: number
  publishStatus: number
  [key: string]: unknown
}

/** Agent 对话 */
export interface AgentConv {
  id: number
  agentUuid: string
  visitorId: string
  title: string
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** Agent 消息 */
export interface AgentMsg {
  id?: number
  convId?: number
  role: string
  /** 思考过程（推理模型 reasoning_content，可空） */
  reasoning?: string
  content: string
  /** 状态：0-生成中、1-完成、2-失败（生成中可据消息ID断点续传） */
  status?: number
  addTime?: string
  [key: string]: unknown
}