/*
 * Agent 记忆生成：调用一次无工具的模型补全，把旧记忆与最近对话压缩成固定四段。
 *   - 运行在运行时进程（不访问数据库），结果回传主进程落库。
 */

import { randomUUID } from 'crypto'
import { AGENT_MEMORY_MAX_CHARS } from '@modules/agent/shared'
import { translate } from '@common/shared/i18n'
import type { MemoryGenerateInput } from '@modules/agent/shared/agentProtocol'
import { buildModels } from '@modules/agent/worker/models'
import {
  beginTraceRun,
  createTraceHooks,
  createTraceTarget,
  endTraceRun,
  handleTraceMessageEnd
} from '@modules/agent/worker/trace'

/* 维度标题（按当前语言生成，作为固定章节名） */
function dimensions(language: 'zh' | 'en'): string[] {
  return [
    translate(language, 'agent.memoryDim.preference'),
    translate(language, 'agent.memoryDim.fact'),
    translate(language, 'agent.memoryDim.decision'),
    translate(language, 'agent.memoryDim.todo')
  ]
}

/* 组装记忆压缩请求：固定系统模板 + 旧记忆 + 最近对话 */
function buildRequest(input: MemoryGenerateInput): {
  systemPrompt: string
  messages: Array<{ role: 'user'; content: string; timestamp: number }>
} {
  return {
    systemPrompt: translate(input.language, 'agent.memoryGen.system', dimensions(input.language)),
    messages: [
      {
        role: 'user',
        content: translate(input.language, 'agent.memoryGen.user', [
          input.oldMemory.trim() || translate(input.language, 'agent.memoryGen.empty'),
          input.transcript
        ]),
        timestamp: Date.now()
      }
    ]
  }
}

/* 只取文本块，作为记忆正文 */
function textOf(message: { content: Array<{ type: string; text?: string }> }): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim()
}

/* 生成记忆：低温度、固定模板，输出截断到固定上限；开发者模式开启时记录本次模型调用 trace */
export async function generateMemoryContent(input: MemoryGenerateInput): Promise<string> {
  /* 记忆生成沿用当前会话：{session} 请求头（如 x-opencode-session）不能为空，否则供应商直接 400 */
  const models = await buildModels([{ ...input.provider, sessionId: input.sessionId }])
  const model = models.getModel(String(input.provider.id), input.modelId)
  if (!model) {
    throw new Error(
      translate(input.language, 'runtime.error.modelNotFound', [input.provider.id, input.modelId])
    )
  }
  const tracing = input.traceEnabled && Boolean(input.sessionId)
  const traceTarget = tracing ? createTraceTarget(input.sessionId, 'memory') : null
  if (traceTarget) {
    beginTraceRun(traceTarget, randomUUID())
  }
  try {
    const message = await models.completeSimple(model, buildRequest(input), {
      temperature: 0.2,
      maxTokens: 3000,
      timeoutMs: 120_000,
      ...(traceTarget ? createTraceHooks(traceTarget, input.provider.id, input.modelId) : {})
    })
    if (traceTarget) {
      handleTraceMessageEnd(traceTarget, message)
      endTraceRun(traceTarget)
    }
    return textOf(message).slice(0, AGENT_MEMORY_MAX_CHARS)
  } catch (error) {
    if (traceTarget) {
      endTraceRun(traceTarget, (error as Error).message)
    }
    throw error
  }
}
