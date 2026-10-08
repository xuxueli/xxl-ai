import type { Agent } from '@earendil-works/pi-agent-core'
import { buildModels, type ProviderModelConfig } from './models'
import { createBuiltinTools } from './tools'
import type { ChatMode } from '../../shared/ipc'
import type { HostEvent } from '../../shared/agentProtocol'

/* 事件回调：由运行时进程（utilityProcess）转发到主进程 */

export interface AgentRuntimeOptions {
  sessionId: string
  provider: ProviderModelConfig
  modelId: string
  systemPrompt: string
  messages?: unknown[]
  /* 对话模式（plan 只读 / build 读写）与项目根目录（文件沙箱边界） */
  mode: ChatMode
  rootDir: string
}

/* 会话级 Agent 运行时缓存：同一会话复用上下文 */
const runtimes = new Map<string, Promise<Agent>>()

async function createAgent(options: AgentRuntimeOptions): Promise<Agent> {
  const { Agent: AgentClass } = await import('@earendil-works/pi-agent-core')
  const models = await buildModels([{ ...options.provider, sessionId: options.sessionId }])
  const model = models.getModel(options.provider.id, options.modelId)
  if (!model) {
    throw new Error(`模型未找到：${options.provider.id}/${options.modelId}`)
  }
  const tools = await createBuiltinTools({
    mode: options.mode,
    rootDir: options.rootDir,
    sessionId: options.sessionId
  })
  /* 历史消息随 initialState 注入：Agent 会在其前自动补上系统指令（直接覆盖 state.messages 会把系统指令冲掉） */
  const agent = new AgentClass({
    initialState: {
      systemPrompt: options.systemPrompt,
      model,
      tools,
      messages: (options.messages ?? []) as never[]
    },
    streamFn: models.streamSimple.bind(models)
  })
  return agent
}

/* 获取（或创建）会话 Agent */
export function getAgent(options: AgentRuntimeOptions): Promise<Agent> {
  let runtime = runtimes.get(options.sessionId)
  if (!runtime) {
    runtime = createAgent(options)
    runtimes.set(options.sessionId, runtime)
  }
  return runtime
}

/* 释放会话 Agent（删除会话/切换模型时） */
export function evictAgent(sessionId: string): void {
  runtimes.delete(sessionId)
}

/* 中断会话当前生成 */
export async function abortAgent(sessionId: string): Promise<void> {
  const runtime = runtimes.get(sessionId)
  if (runtime) {
    const agent = await runtime
    agent.abort()
  }
}

/* 清空全部运行时（退出时） */
export function resetAgents(): void {
  runtimes.clear()
}

/* 执行一轮对话，流式回调事件 */
export async function runPrompt(
  agent: Agent,
  text: string,
  sink: (event: HostEvent) => void
): Promise<void> {
  const unsubscribe = agent.subscribe((event) => {
    switch (event.type) {
      case 'message_update': {
        const inner = event.assistantMessageEvent
        if (inner.type === 'text_delta') {
          sink({ type: 'delta', text: inner.delta })
        } else if (inner.type === 'thinking_delta') {
          sink({ type: 'thinking', text: inner.delta })
        }
        break
      }
      case 'tool_execution_start':
        sink({
          type: 'tool_start',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args
        })
        break
      case 'tool_execution_end':
        sink({
          type: 'tool_end',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
          result: toolResultText(event.result)
        })
        break
      default:
        break
    }
  })

  try {
    await agent.prompt(text)
    const failed = findLastError(agent)
    if (failed !== undefined) {
      sink({ type: 'error', message: failed })
    } else {
      sink({ type: 'done' })
    }
  } catch (error) {
    sink({ type: 'error', message: (error as Error).message })
  } finally {
    unsubscribe()
  }
}

/* 汇总工具结果为纯文本（仅取文本内容块，供 UI 展开查看） */
function toolResultText(result: unknown): string {
  const content = (result as { content?: unknown })?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        return (part as { type?: string; text?: string }).type === 'text'
          ? ((part as { text?: string }).text ?? '')
          : ''
      })
      .filter((item) => item !== '')
      .join('\n')
  }
  return ''
}

/* 检查最后一轮是否以错误结束，返回错误信息（无错误返回 undefined） */
function findLastError(agent: Agent): string | undefined {
  const messages = agent.state.messages
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: string; stopReason?: string; errorMessage?: string }
    if (message.role === 'assistant') {
      if (message.stopReason === 'error') {
        return message.errorMessage || ''
      }
      return undefined
    }
  }
  return undefined
}
