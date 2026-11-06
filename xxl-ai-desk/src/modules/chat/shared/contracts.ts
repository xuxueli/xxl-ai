/*
 * 对话域跨进程契约：流式事件与人机交互。
 */

/* 对话流式事件（主 → 渲染） */
export interface ChatEvent {
  /* 所属会话主键 */
  sessionId: string
  /* 事件类型：delta 增量文本 / thinking 思考 / tool_start / tool_end / notice 非致命提示 / error 致命错误 / done / aborted */
  type:
    | 'delta'
    | 'thinking'
    | 'tool_start'
    | 'tool_end'
    | 'notice'
    | 'error'
    | 'done'
    | 'aborted'
  /* 增量文本（delta / thinking） */
  text?: string
  /* 工具名（tool_start / tool_end） */
  toolName?: string
  /* 工具调用 ID（tool_start / tool_end） */
  toolCallId?: string
  /* 工具调用入参（tool_start） */
  args?: unknown
  /* 工具返回文本（tool_end） */
  result?: string
  /* 工具结构化结果（tool_end，供 UI 展开查看） */
  details?: unknown
  /* 工具执行耗时毫秒（tool_end） */
  durationMs?: number
  /* 工具是否失败（tool_end） */
  isError?: boolean
  /* 错误 / 提示信息（notice / error） */
  message?: string
}

/* 选择项（value 回传模型，label 展示） */
export interface InteractionOption {
  value: string
  label: string
  description?: string
}

/* 越界权限信息：仅由系统沙箱填充 */
export interface InteractionPermission {
  tool: string
  action: 'read' | 'write' | 'command'
  abs: string
  root: string
}

/* 交互公共信息 */
interface InteractionBase {
  /* 弹窗标题 */
  title: string
  /* 补充说明 */
  message?: string
}

/* 方案选择：模型发起，2~20 个候选，可多选并允许「其他」自由输入 */
export interface ChoiceInteractionRequest extends InteractionBase {
  kind: 'choice'
  /* 候选选项（2~20 个） */
  options: InteractionOption[]
  /* 是否多选 */
  multiple: boolean
  /* 是否允许「其他」自由输入 */
  allowOther: boolean
}

/* 越界权限校验：仅由系统沙箱发起，工具不可构造 */
export interface PermissionInteractionRequest extends InteractionBase {
  kind: 'permission'
  /* 越界信息 */
  permission: InteractionPermission
}

/* 一次人机交互请求：按 kind 区分，字段随类型必填 */
export type InteractionRequest = ChoiceInteractionRequest | PermissionInteractionRequest

/* 人机交互结果：提交 / 拒绝 / 取消（终止、会话删除、应用退出） */
export type InteractionResult =
  | { status: 'submitted'; value: string | string[]; remember?: boolean }
  | { status: 'denied' }
  | { status: 'cancelled' }

/* 交互请求推送载荷（主 → 渲染） */
export interface ChatInteractionPrompt {
  /* 交互请求 ID */
  requestId: string
  /* 所属会话主键 */
  sessionId: string
  /* 交互内容 */
  request: InteractionRequest
}

/* 交互取消载荷（主 → 渲染）：会话终止/删除后关闭对应弹窗 */
export interface ChatInteractionCancel {
  /* 交互请求 ID */
  requestId: string
}
