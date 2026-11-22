/*
 * 内置工具注册表：按域聚合工具工厂，并按权限模式统一装配。
 *   - 每个工具自带 ToolMeta（分组 / 只读 / 适用模式 / 审批 / 输出上限）；
 *   - 新增工具只需在对应域文件中追加定义，无需修改装配逻辑；
 *   - 同时生成「当前可用工具」提示，随系统指令下发给模型。
 */

import { translate, type AppLanguage } from '@common/shared/i18n'
import { clipToolResult, MAX_OUTPUT, type ToolContext, type ToolEntry, type ToolGroup } from '@modules/agent/worker/toolkit'
import type { BuiltinToolSwitches } from '@modules/agent/shared/agentProtocol'
import { createGeneralTools } from '@modules/agent/worker/tools/general'
import { createFsTools } from '@modules/file/worker'
import { createShellTools } from '@modules/agent/worker/tools/shell'
import { createBrowserTools } from '@modules/browser/worker'
import { createSkillTools } from '@modules/skill/worker'
import { createInteractionTools } from '@modules/agent/worker/tools/interaction'

/* 工具域 → 工厂（新增域在此登记） */
interface ToolFactory {
  group: ToolGroup
  create: (context: ToolContext) => Promise<ToolEntry[]>
}

/* 按域聚合的工具工厂；顺序即装配顺序 */
const FACTORIES: ToolFactory[] = [
  { group: 'general', create: createGeneralTools },
  { group: 'fs', create: createFsTools },
  { group: 'shell', create: createShellTools },
  { group: 'browser', create: createBrowserTools },
  { group: 'skill', create: createSkillTools },
  { group: 'interaction', create: createInteractionTools }
]

/* 域是否启用：skill 无用户开关，恒启用；其余按设置开关过滤 */
function isGroupEnabled(group: ToolGroup, switches: BuiltinToolSwitches): boolean {
  return group === 'skill' ? true : switches[group]
}

/* 工具执行与终止信号竞速：工具自身未响应 signal 时，点击终止也能立即结束当前步骤 */
function raceAbort<T>(task: Promise<T>, signal: AbortSignal | undefined, message: string): Promise<T> {
  if (!signal) {
    return task
  }
  if (signal.aborted) {
    return Promise.reject(new Error(message))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new Error(message))
    signal.addEventListener('abort', onAbort, { once: true })
    task.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

/* 统一包装工具执行：终止信号竞速 + 按 meta.maxOutput 裁剪输出 */
function withExecutionGuards(entry: ToolEntry, language: AppLanguage): ToolEntry {
  const maxOutput = entry.meta.maxOutput ?? MAX_OUTPUT
  const execute = entry.tool.execute
  const abortedMessage = translate(language, 'runtime.abortNote')
  return {
    meta: entry.meta,
    tool: {
      ...entry.tool,
      execute: (async (...args: Parameters<typeof execute>) => {
        const [toolCallId, params, signal, onUpdate] = args
        const task = execute(toolCallId, params, signal, onUpdate)
        return clipToolResult(await raceAbort(task, signal, abortedMessage), maxOutput)
      }) as typeof execute
    }
  }
}

/* 构建当前权限模式下的工具条目（含元信息，供提示生成使用） */
export async function createBuiltinToolEntries(context: ToolContext): Promise<ToolEntry[]> {
  /* 关闭的分类不调用工厂：既不装配工具，也避免无谓的动态导入 */
  const enabled = FACTORIES.filter((item) => isGroupEnabled(item.group, context.tools))
  const groups = await Promise.all(enabled.map((item) => item.create(context)))
  return groups
    .flat()
    .filter((entry) => entry.meta.permissionModes.includes(context.permissionMode))
    .map((entry) => withExecutionGuards(entry, context.language))
}

/* 生成内置工具清单：名称 + 读写属性 + 一句话说明，避免模型臆造内置工具；MCP 工具由本轮工具列表提供 */
export function buildToolGuide(entries: ToolEntry[]): string {
  if (entries.length === 0) {
    return ''
  }
  const lines = entries.map(
    ({ meta, tool }) => `- ${tool.name}（${meta.readOnly ? '只读' : '可写'}）：${tool.label}`
  )
  return `\n\n## 内置工具\n${lines.join('\n')}`
}

/* 运行时 PATH 注入（终端与 MCP stdio 共用） */
export { setRuntimePath } from '@modules/agent/worker/tools/shell'
/* 浏览器动作回调注入 */
export { setBrowserActionInvoker } from '@modules/browser/worker'
export type { ToolContext, ToolEntry, ToolMeta } from '@modules/agent/worker/toolkit'
