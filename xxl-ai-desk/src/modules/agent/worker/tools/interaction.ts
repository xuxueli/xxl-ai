/*
 * 人机交互类内置工具：让 Agent 在多个候选方案中请用户拍板。
 *   - 只负责 choice（单选/多选 + 「其他」自由输入）；
 *   - 调用后本轮挂起，等待用户在输入框内联面板应答，再回填结果给模型继续执行；
 *   - 确认与自由文本询问走对话正文，权限校验（permission）只能由系统沙箱发起。
 *
 * @author xuxueli 2026-10-31
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import {
  ALL_PERMISSIONS,
  describe,
  text,
  toolError,
  tr,
  type ToolContext,
  type ToolEntry
} from '@modules/agent/worker/toolkit'
import { requestInteraction } from '@modules/agent/worker/hitl'
import type { ChoiceInteractionRequest, InteractionOption, InteractionResult } from '@modules/chat/shared'

/* 工具入参：兼容单问题字段与多问题列表 */
interface AskUserParams {
  questions?: unknown
  title?: unknown
  message?: unknown
  options?: unknown
  multiple?: unknown
  allowOther?: unknown
}

/* 入参裁剪上限（避免模型生成的超长内容撑破面板与上下文） */
const MAX_TITLE = 120
const MAX_MESSAGE = 2000
const MAX_OPTION = 100
const MAX_OPTIONS = 20
const MIN_OPTIONS = 2
const MAX_OTHER = 200
const MAX_QUESTIONS = 10

/* 参数不合法：返回原因文案 key 与插值参数，由工具转成错误结果 */
interface InvalidParams {
  errorKey: string
  params?: Array<string | number>
}

function invalid(reasonKey: string, params?: Array<string | number>): InvalidParams {
  return { errorKey: reasonKey, params }
}

/* 读取字符串参数并裁剪 */
function readString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/* 归一化选项：value 缺省时使用 label，按 value 去重 */
function normalizeOptions(raw: unknown): { options: InteractionOption[] } | InvalidParams {
  if (!Array.isArray(raw)) {
    return invalid('runtime.hitl.invalidOptions')
  }
  if (raw.length < MIN_OPTIONS || raw.length > MAX_OPTIONS) {
    return invalid('runtime.hitl.invalidOptions')
  }
  const options: InteractionOption[] = []
  const values = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return invalid('runtime.hitl.invalidOption')
    }
    const record = item as { value?: unknown; label?: unknown; description?: unknown }
    const label = readString(record.label, MAX_OPTION)
    const value = readString(record.value, MAX_OPTION) || label
    if (!label || !value) {
      return invalid('runtime.hitl.invalidOption')
    }
    if (values.has(value)) {
      return invalid('runtime.hitl.duplicateOption', [value])
    }
    values.add(value)
    const description = readString(record.description, MAX_OPTION)
    options.push({ value, label, ...(description ? { description } : {}) })
  }
  return { options }
}

/* 归一化单个问题：不合法时返回错误键，合法时返回交互请求 */
function normalizeQuestion(
  params: AskUserParams
): { request: ChoiceInteractionRequest } | InvalidParams {
  const title = readString(params.title, MAX_TITLE)
  if (!title) {
    return invalid('runtime.hitl.invalidTitle')
  }
  const options = normalizeOptions(params.options)
  if ('errorKey' in options) {
    return options
  }
  const message = readString(params.message, MAX_MESSAGE)
  return {
    request: {
      kind: 'choice',
      title,
      ...(message ? { message } : {}),
      options: options.options,
      multiple: params.multiple === true,
      allowOther: params.allowOther !== false
    }
  }
}

/* 归一化工具入参：优先使用 questions 列表，缺省时兼容顶层单问题字段 */
function normalizeParams(
  params: AskUserParams
): { requests: ChoiceInteractionRequest[] } | InvalidParams {
  let items: AskUserParams[]
  if (params.questions !== undefined) {
    if (
      !Array.isArray(params.questions) ||
      params.questions.length === 0 ||
      params.questions.length > MAX_QUESTIONS
    ) {
      return invalid('runtime.hitl.invalidQuestions', [MAX_QUESTIONS])
    }
    items = params.questions as AskUserParams[]
  } else {
    items = [params]
  }
  const requests: ChoiceInteractionRequest[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return invalid('runtime.hitl.invalidQuestion')
    }
    const normalized = normalizeQuestion(item)
    if ('errorKey' in normalized) {
      return normalized
    }
    requests.push(normalized.request)
  }
  return { requests }
}

/* 选项值 → 展示标签（自定义值原样标注） */
function labelOf(request: ChoiceInteractionRequest, value: string): string {
  const option = request.options.find((item) => item.value === value)
  return option ? option.label : `「${value}」`
}

/* 交互结果 → 可直接回填模型的文本与结构化细节 */
function formatResult(
  context: ToolContext,
  request: ChoiceInteractionRequest,
  result: InteractionResult
): ReturnType<typeof text> {
  const details: Record<string, unknown> = {
    kind: request.kind,
    status: result.status,
    value: ''
  }
  if (result.status === 'denied') {
    return text(tr(context, 'runtime.hitl.rejected'), details)
  }
  if (result.status === 'cancelled') {
    return text(tr(context, 'runtime.hitl.cancelled'), details)
  }
  const values = Array.isArray(result.value) ? result.value : [result.value]
  const clean = values
    .map((item) => String(item).trim().slice(0, MAX_OTHER))
    .filter(Boolean)
  if (clean.length === 0) {
    return text(tr(context, 'runtime.hitl.noSelection'), { ...details, value: [] })
  }
  const labels = clean.map((item) => labelOf(request, item)).join(', ')
  return text(tr(context, 'runtime.hitl.selected', [labels]), { ...details, value: clean })
}

/* 构建 ask_user 工具：入参校验、发起交互并回填结果 */
async function buildAskUserTool(context: ToolContext): Promise<AgentTool> {
  const { Type } = await import('@earendil-works/pi-ai')
  /* 单问题字段：顶层与 questions 数组各自生成新 schema，避免复用同一对象实例 */
  const questionFields = () => ({
    title: Type.Optional(Type.String({ description: '问题标题，简洁明确' })),
    message: Type.Optional(Type.String({ description: '补充说明或背景信息' })),
    options: Type.Optional(
      Type.Array(
        Type.Object({
          value: Type.String({ description: '回传给模型的值，缺省同 label' }),
          label: Type.String({ description: '展示给用户的选项名' }),
          description: Type.Optional(Type.String({ description: '选项补充说明' }))
        }),
        { description: '候选选项（2~20 个）' }
      )
    ),
    multiple: Type.Optional(Type.Boolean({ description: '是否多选，默认单选' })),
    allowOther: Type.Optional(
      Type.Boolean({ description: '是否允许用户填写「其他」选项，默认允许' })
    )
  })

  return {
    name: 'ask_user',
    label: '询问用户',
    description: describe(
      '在多个候选方案中让用户拍板：每个问题提供 2~20 个选项，支持单选/多选，并默认允许用户填写「其他」。一次需要连续确认多个问题时，用 questions 按顺序列出（1~10 个），界面会显示 1/N 并在作答后进入下一题；只有一个问题时也可直接用顶层字段。仅在需要用户从多个方案中选择时使用；需要确认操作或补充自由文本时，直接在回复里提问，不要调用本工具。',
      'Let the user decide among several candidate options: each question provides 2-20 choices with optional multi-select and an "Other" free-form entry (enabled by default). When several questions must be answered in sequence, put them in questions (1-10); the UI shows 1/N and advances after each answer. A single question can use the top-level fields. Use only when the user must pick among options; ask for confirmation or free-form input directly in your reply instead.'
    ),
    parameters: Type.Object({
      questions: Type.Optional(
        Type.Array(Type.Object(questionFields()), {
          description: '要依次询问的问题列表（1~10 个）；提供后忽略顶层单问题字段'
        })
      ),
      ...questionFields()
    }),
    execute: async (_toolCallId, params, signal) => {
      const normalized = normalizeParams(params as AskUserParams)
      if ('errorKey' in normalized) {
        const reason = tr(context, normalized.errorKey, normalized.params ?? [])
        return toolError(tr(context, 'runtime.hitl.invalidParams', [reason]))
      }
      const total = normalized.requests.length
      const parts: string[] = []
      for (let index = 0; index < total; index += 1) {
        const request = { ...normalized.requests[index], round: index + 1, total }
        const result = await requestInteraction(context.sessionId, request, signal)
        const content = formatResult(context, request, result)
          .content.map((block) => (block.type === 'text' ? block.text : ''))
          .join('\n')
        parts.push(total > 1 ? `「${request.title}」\n${content}` : content)
        /* 用户拒绝 / 取消：停止后续问题，避免继续打扰 */
        if (result.status !== 'submitted') {
          break
        }
      }
      return text(parts.join('\n\n'), { kind: 'choice', total, answered: parts.length })
    }
  }
}

/* 构建人机交互工具 */
export async function createInteractionTools(context: ToolContext): Promise<ToolEntry[]> {
  return [
    {
      meta: {
        group: 'interaction',
        readOnly: true,
        permissionModes: ALL_PERMISSIONS,
        maxOutput: 4000
      },
      tool: await buildAskUserTool(context)
    }
  ]
}
