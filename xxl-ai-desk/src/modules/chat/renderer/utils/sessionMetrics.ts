/*
 * 会话指标聚合：从已加载的 UI 消息计算轮次 / 步数 / 耗时与 Token 用量（纯函数）。
 *   - 会话统计取真实用户轮次与每次模型响应；
 *   - Token 用量取本轮全部响应的分项累加，缓存命中按输入侧 token 计算。
 * @author xuxueli 2026-11-08
 */

import type { UsageLike } from '@common/shared/model'
import type { UiMessage } from '@modules/chat/renderer/types'

/* 会话统计结果 */
export interface SessionMetrics {
  /* 真实用户轮次 */
  turns: number
  /* 模型响应步数 */
  steps: number
  /* 模型请求耗时合计（毫秒） */
  modelMs: number
  /* 工具调用耗时合计（毫秒） */
  toolMs: number
  /* 输出 token 合计 */
  outputTokens: number
  /* 输出速度（token / 秒） */
  tps: number
}

/* Token 用量结果 */
export interface TokenUsage {
  /* 输入 + 缓存读取 + 缓存写入 + 输出 */
  total: number
  /* 未缓存输入 */
  input: number
  /* 缓存读取 */
  cacheRead: number
  /* 缓存写入 */
  cacheWrite: number
  /* 输出 */
  output: number
  /* 缓存命中率（0–100），无输入侧 token 时为 null */
  cacheHit: number | null
}

/* 汇总工具调用耗时：来自助手消息内的工具片段 */
function toolDurationOf(message: UiMessage): number {
  return message.parts.reduce(
    (total, part) =>
      part.type === 'tool' ? total + (Number(part.tool.durationMs) || 0) : total,
    0
  )
}

/* 判断用量是否为空：全部为 0 视为供应商未上报 */
function isEmptyUsage(usage: UsageLike): boolean {
  return !(
    Number(usage.input) ||
    Number(usage.output) ||
    Number(usage.cacheRead) ||
    Number(usage.cacheWrite)
  )
}

/* 会话统计：无任何轮次 / 步数时返回 null（空会话不展示） */
export function computeSessionMetrics(messages: UiMessage[]): SessionMetrics | null {
  let turns = 0
  let steps = 0
  let modelMs = 0
  let toolMs = 0
  let outputTokens = 0
  for (const message of messages) {
    if (message.role === 'user') {
      turns += 1
      continue
    }
    if (message.role !== 'assistant') {
      continue
    }
    steps += message.steps ?? 0
    modelMs += message.modelMs ?? 0
    outputTokens += Number(message.usage?.output) || 0
    toolMs += toolDurationOf(message)
  }
  if (turns === 0 && steps === 0) {
    return null
  }
  return {
    turns,
    steps,
    modelMs,
    toolMs,
    outputTokens,
    tps: modelMs > 0 ? Math.round(outputTokens / (modelMs / 1000)) : 0
  }
}

/* Token 用量：无任何用量时返回 null（空会话或供应商未上报不展示） */
export function computeTokenUsage(messages: UiMessage[]): TokenUsage | null {
  let input = 0
  let cacheRead = 0
  let cacheWrite = 0
  let output = 0
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.usage || isEmptyUsage(message.usage)) {
      continue
    }
    input += Number(message.usage.input) || 0
    cacheRead += Number(message.usage.cacheRead) || 0
    cacheWrite += Number(message.usage.cacheWrite) || 0
    output += Number(message.usage.output) || 0
  }
  const total = input + cacheRead + cacheWrite + output
  if (total === 0) {
    return null
  }
  const promptTokens = input + cacheRead + cacheWrite
  return {
    total,
    input,
    cacheRead,
    cacheWrite,
    output,
    cacheHit: promptTokens > 0 ? Math.round((cacheRead / promptTokens) * 100) : null
  }
}
