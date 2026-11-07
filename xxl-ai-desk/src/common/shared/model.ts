/*
 * 模型元数据：上下文窗口默认值与模型用量归一化（供应商 / 运行时 / 渲染层共用）。
 * @author xuxueli 2026-11-07
 */

/* 上下文窗口默认值（100 万） */
export const CONTEXT_WINDOW_DEFAULT = 1_000_000

/* 模型最小描述：ID + 上下文窗口（供应商配置与运行时协议共用） */
export interface ModelDescriptor {
  /* 模型 ID */
  id: string
  /* 上下文窗口（token） */
  contextWindow: number
}

/* Pi 用量最小结构：totalTokens 缺失时用分项累加兜底 */
export interface UsageLike {
  totalTokens?: number
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
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
