/*
 * 模型元数据：模型类型、推理等级、上下文窗口默认值与模型用量归一化（供应商 / 运行时 / 渲染层共用）。
 * @author xuxueli 2026-11-07
 */

/* 上下文窗口默认值（100 万） */
export const CONTEXT_WINDOW_DEFAULT = 1_000_000

/* 模型类型：通用 / 对话 / 嵌入 / 文生图 */
export const MODEL_TYPES = ['general', 'chat', 'embedding', 'text_to_image'] as const
export type ModelType = (typeof MODEL_TYPES)[number]

/* 未填写类型时的默认值 */
export const DEFAULT_MODEL_TYPE: ModelType = 'general'

/* 会话输入框可选择的模型类型 */
export const SESSION_MODEL_TYPES: readonly ModelType[] = ['general', 'chat']

/* 推理等级：固定四档，文案不翻译 */
export const REASONING_LEVELS = ['default', 'low', 'high', 'max'] as const
export type ReasoningLevel = (typeof REASONING_LEVELS)[number]

/* 默认推理等级：由供应商决定 */
export const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'default'

/* 模型最小描述：ID + 上下文窗口 + 类型（供应商配置与运行时协议共用） */
export interface ModelDescriptor {
  /* 模型 ID */
  id: string
  /* 上下文窗口（token） */
  contextWindow: number
  /* 模型类型，可选；缺省按 general 处理 */
  type?: ModelType
}

/* 模型类型归一：非法或缺失回退通用模型 */
export function modelTypeOf(model: Pick<ModelDescriptor, 'type'>): ModelType {
  return model.type && (MODEL_TYPES as readonly string[]).includes(model.type)
    ? model.type
    : DEFAULT_MODEL_TYPE
}

/* 是否可被会话选择（通用 / 对话模型） */
export function isSessionModel(model: Pick<ModelDescriptor, 'type'>): boolean {
  return SESSION_MODEL_TYPES.includes(modelTypeOf(model))
}

/* 是否展示推理等级（仅对话模型） */
export function isReasoningModel(model: Pick<ModelDescriptor, 'type'>): boolean {
  return modelTypeOf(model) === 'chat'
}

/* 推理等级归一：非法值回退默认 */
export function normalizeReasoningLevel(value: unknown): ReasoningLevel {
  return (REASONING_LEVELS as readonly string[]).includes(String(value))
    ? (value as ReasoningLevel)
    : DEFAULT_REASONING_LEVEL
}

/* Pi 用量最小结构：totalTokens 缺失时用分项累加兜底 */
export interface UsageLike {
  totalTokens?: number
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
}

/* 上下文占用分项估算：系统提示词 / 工具定义 / 对话消息 */
export interface ContextBreakdown {
  /* 系统提示词估算 token */
  systemTokens: number
  /* 工具定义估算 token */
  toolTokens: number
  /* 对话消息估算 token */
  messageTokens: number
}

/* 上下文用量：优先 totalTokens，缺失时按分项累加 */
export function contextTokensOfUsage(usage?: UsageLike | null): number {
  if (!usage) {
    return 0
  }
  return (
    Number(usage.totalTokens) ||
    (Number(usage.input) || 0) +
      (Number(usage.output) || 0) +
      (Number(usage.cacheRead) || 0) +
      (Number(usage.cacheWrite) || 0)
  )
}
