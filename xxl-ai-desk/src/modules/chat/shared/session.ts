/*
 * 会话域跨进程契约：对话模式、会话与已持久化消息。
 */

/* 对话模式：plan 只读只规划；build 全量读写（默认） */
export type ChatMode = 'plan' | 'build'

/* 会话（归属某项目，并绑定一个 Agent） */
export interface SessionDTO {
  /* 主键 */
  id: number
  /* 会话标题 */
  title: string
  /* 归属项目主键 */
  projectId: number
  /* 绑定的 Agent 主键（创建后不可修改） */
  agentId: number
  /* 绑定的供应商主键（0 表示未绑定，回退设置默认） */
  providerId: number
  /* 选用的模型 ID */
  modelId: string
  /* 对话模式（plan 只读只规划 / build 全量读写） */
  mode: ChatMode
  /* 创建时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 已持久化的消息记录 */
export interface StoredMessage {
  /* 主键 */
  id: number
  /* 所属会话主键 */
  sessionId: number
  /* 所属轮次：等于该轮真实用户提问消息 id */
  turnId: number
  /* 角色（user / assistant 等） */
  role: string
  /* 运行时注入消息（非用户输入）：不展示、不构成新一轮 */
  injected: boolean
  /* 文本内容（列表预览用） */
  content: string
  /* Agent 原始消息 JSON */
  data: string
  /* 创建时间（ISO） */
  addTime: string
}

/* 项目内按会话分组的增量消息（供 Agent 记忆生成） */
export interface ProjectMessageGroup {
  /* 会话 ID（记忆写入前校验来源会话是否仍存在） */
  sessionId: number
  /* 会话标题 */
  title: string
  /* 晚于游标的消息 */
  messages: StoredMessage[]
}

/* 项目增量消息集合 */
export interface ProjectMessages {
  /* 按会话分组 */
  sessions: ProjectMessageGroup[]
  /* 总消息数 */
  total: number
  /* 本次读取到的最新消息时间（下次生成游标） */
  lastMessageTime: string
}
