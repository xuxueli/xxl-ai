/* 渲染进程 UI 类型 */

/* 工具调用状态（含入参、结果与耗时，供执行过程时间线渲染） */
export interface ToolCallState {
  /* 模型给出的工具调用 id（与 toolResult 关联） */
  id: string
  /* 工具名称 */
  name: string
  /* 调用状态：执行中 / 成功 / 失败 */
  status: 'running' | 'done' | 'error'
  /* 调用入参（模型给出的参数） */
  args?: unknown
  /* 工具返回文本（供展开查看） */
  result?: string
  /* 开始/结束时间戳（毫秒），用于展示耗时；历史消息缺省为 0 */
  startedAt: number
  endedAt?: number
}

/*
 * 助手消息的有序片段：思考 / 正文 / 工具调用。
 * 按模型实际发生顺序记录（思考 → 工具 → 正文 交错），据此渲染成"执行过程"，
 * 避免把所有思考、工具堆在一起再用最终结果一次性吐出。
 */
export type MessagePart =
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: ToolCallState }

/* 对话消息（UI 渲染用） */
export interface UiMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  /* 用户消息文本；助手消息为全部正文片段的拼接（供复制与列表预览） */
  content: string
  /* 助手消息的有序片段（用户消息为空） */
  parts: MessagePart[]
  /* 消息落库时间（ISO 字符串） */
  addTime: string
  /* 助手消息是否仍在生成中（展示光标与禁用操作） */
  pending?: boolean
  /* 助手消息本轮是否以错误结束（标记失败样式） */
  error?: boolean
  /* 助手消息本轮开始时间戳（展示总耗时） */
  startedAt?: number
  /* 助手消息本轮结束时间戳 */
  endedAt?: number
}
