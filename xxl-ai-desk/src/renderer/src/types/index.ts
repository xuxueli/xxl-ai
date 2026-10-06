/* 渲染进程 UI 类型 */

/* 工具调用状态 */
export interface ToolCallState {
  id: string
  name: string
  status: 'running' | 'done' | 'error'
  args?: unknown
}

/* 对话消息（UI 渲染用） */
export interface UiMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking: string
  tools: ToolCallState[]
  addTime: string
  pending?: boolean
  error?: boolean
}
