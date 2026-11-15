/*
 * 对话域跨进程契约：流式事件与人机交互。
 */

/* 对话流式事件（主 → 渲染） */
export interface ChatEvent {
  /* 所属会话主键 */
  sessionId: number
  /* 事件类型：turn-start 轮次开始 / delta 增量文本 / thinking 思考 / tool_start / tool_end / usage 上下文用量 / notice 非致命提示 / error 致命错误 / done / aborted */
  type:
    | 'turn-start'
    | 'delta'
    | 'thinking'
    | 'tool_start'
    | 'tool_end'
    | 'usage'
    | 'notice'
    | 'error'
    | 'done'
    | 'aborted'
  /* 用户提问正文（turn-start） */
  userText?: string
  /* 提问发生时刻毫秒时间戳（turn-start） */
  startedAt?: number
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
  /* 已用上下文 token（usage） */
  used?: number
  /* 模型上下文窗口（usage） */
  window?: number
  /* 系统提示词估算 token（usage） */
  systemTokens?: number
  /* 工具定义估算 token（usage） */
  toolTokens?: number
  /* 对话消息估算 token（usage） */
  messageTokens?: number
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
  /* 本次工具调用涉及的越界目标（规范化绝对路径，已去重；一次应答覆盖全部） */
  paths: string[]
  root: string
  /* 本次执行的完整命令（仅 action=command），供用户审批时查看 */
  command?: string
}

/* 交互公共信息 */
interface InteractionBase {
  /* 交互面板标题 */
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
  /* 当前问题轮次（多问题时从 1 开始，单问题时缺省） */
  round?: number
  /* 本轮交互的问题总数（1 表示单问题） */
  total?: number
}

/* 越界权限校验：仅由系统沙箱发起，工具不可构造 */
export interface PermissionInteractionRequest extends InteractionBase {
  kind: 'permission'
  /* 越界信息 */
  permission: InteractionPermission
}

/* 一次人机交互请求：按 kind 区分，字段随类型必填 */
export type InteractionRequest = ChoiceInteractionRequest | PermissionInteractionRequest

/* 人机交互结果：提交 / 拒绝 / 自动决策（无人值守） / 取消（终止、会话删除、应用退出） */
export type InteractionResult =
  | { status: 'submitted'; value: string | string[]; remember?: boolean }
  | { status: 'denied' }
  /* 无人值守会话：不伪造用户选择，交回模型自行决策 */
  | { status: 'auto' }
  | { status: 'cancelled' }

/* 交互请求推送载荷（主 → 渲染） */
export interface ChatInteractionPrompt {
  /* 交互请求 ID */
  requestId: string
  /* 所属会话主键 */
  sessionId: number
  /* 交互内容 */
  request: InteractionRequest
}

/* 交互取消载荷（主 → 渲染）：会话终止/删除后移除对应交互面板 */
export interface ChatInteractionCancel {
  /* 交互请求 ID */
  requestId: string
}
