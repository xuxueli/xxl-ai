/*
 * 会话域跨进程契约：对话模式、会话与已持久化消息。
 */

/* 对话模式：plan 只读只规划；build 全量读写（默认） */
export type ChatMode = 'plan' | 'build'

/* 会话（归属某项目） */
export interface SessionDTO {
  /* 主键 */
  id: string
  /* 会话标题 */
  title: string
  /* 归属项目主键 */
  projectId: string
  /* 绑定的供应商主键 */
  providerId: string
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
  id: string
  /* 所属会话主键 */
  sessionId: string
  /* 会话内顺序号 */
  seq: number
  /* 角色（user / assistant 等） */
  role: string
  /* 文本内容（列表预览用） */
  content: string
  /* Agent 原始消息 JSON */
  data: string
  /* 创建时间（ISO） */
  addTime: string
}
