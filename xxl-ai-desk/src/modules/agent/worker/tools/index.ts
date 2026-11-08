/*
 * 内置工具注册表：按域聚合工具工厂，并按权限模式统一装配。
 *   - 每个工具自带 ToolMeta（分组 / 只读 / 适用模式 / 审批 / 输出上限）；
 *   - 新增工具只需在对应域文件中追加定义，无需修改装配逻辑；
 *   - 同时生成「当前可用工具」提示，随系统指令下发给模型。
 */

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

/* 按 meta.maxOutput 统一裁剪工具输出（声明与实现同源，避免各处各自裁剪） */
function withOutputLimit(entry: ToolEntry): ToolEntry {
  const maxOutput = entry.meta.maxOutput ?? MAX_OUTPUT
  const execute = entry.tool.execute
  return {
    meta: entry.meta,
    tool: {
      ...entry.tool,
      execute: (async (...args: Parameters<typeof execute>) =>
        clipToolResult(await execute(...args), maxOutput)) as typeof execute
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
    .map(withOutputLimit)
}

/* 生成可用工具提示：名称 + 读写属性 + 一句话说明，避免模型臆造工具 */
export function buildToolGuide(entries: ToolEntry[]): string {
  if (entries.length === 0) {
    return ''
  }
  const lines = entries.map(
    ({ meta, tool }) => `- ${tool.name}（${meta.readOnly ? '只读' : '可写'}）：${tool.label}`
  )
  return `\n\n当前可用工具：\n${lines.join('\n')}`
}

/* 运行时 PATH 注入（终端与 MCP stdio 共用） */
export { setRuntimePath } from '@modules/agent/worker/tools/shell'
/* 浏览器打开 / 动作回调注入 */
export { setBrowserOpener, setBrowserActionInvoker } from '@modules/browser/worker'
export type { ToolContext, ToolEntry, ToolMeta } from '@modules/agent/worker/toolkit'
