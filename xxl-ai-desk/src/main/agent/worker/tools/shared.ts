/*
 * 内置工具公共能力：工具元信息类型、统一结果构造、路径闸门与目录遍历。
 *   - 所有文件类工具统一经 createGuard 走沙箱闸门（目录内放行、越界审批）；
 *   - 结果文本统一由注册表按工具声明的 maxOutput 截断，工具实现不再各自裁剪。
 */

import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { promises as fs } from 'fs'
import type { Dirent } from 'fs'
import { basename, relative, resolve, sep } from 'path'
import type { ChatMode } from '@shared/ipc'
import type { SkillRuntimeConfig } from '@shared/ipc'
import type { BuiltinToolSwitches } from '@shared/agentProtocol'
import { translate, type AppLanguage } from '@shared/i18n'
import { guardPath, type PathAction } from '../sandbox'

/* 工具装配上下文 */
export interface ToolContext {
  mode: ChatMode
  rootDir: string
  sessionId: string
  /* 应用语言：工具错误与摘要文案使用对应语言 */
  language: AppLanguage
  /* 已启用的技能索引（正文由 read_skill 按需读取） */
  skills?: SkillRuntimeConfig[]
  /* 技能根目录（技能库只读放行边界：覆盖全部已安装技能与目录列举） */
  skillsDir?: string
  /* 内置工具分类开关（由注册表统一过滤，工具工厂不再各自判断） */
  tools: BuiltinToolSwitches
}

/* 工具分组：便于按域拆分文件与后续扩展 */
export type ToolGroup = 'fs' | 'shell' | 'browser' | 'general' | 'skill' | 'interaction'

/* 工具元信息：能力声明与装配策略（模式过滤由 registry 统一执行） */
export interface ToolMeta {
  group: ToolGroup
  /* 是否只读：用于生成可用工具说明，以及 Plan 模式下的语义约束 */
  readOnly: boolean
  /* 允许出现的对话模式（显式声明，避免靠数组位置隐含） */
  modes: ChatMode[]
  /* 是否包含审批/拦截闸门（越界路径或危险命令） */
  requiresApproval?: boolean
  /* 单次结果最大字符数（缺省 MAX_OUTPUT） */
  maxOutput?: number
}

/* 工具条目：元信息 + Pi 工具定义 */
export interface ToolEntry {
  meta: ToolMeta
  tool: AgentTool
}

/* 单次工具结果返回的文本内容上限（字符数，缺省值） */
export const MAX_OUTPUT = 20000

/* 两种模式均可用 */
export const ALL_MODES: ChatMode[] = ['plan', 'build']

/* 仅 Build（写操作）可用 */
export const BUILD_ONLY: ChatMode[] = ['build']

/* 中英文工具描述：模型对两种语言均友好，保留中文可读性同时兼顾英文模型 */
export function describe(zh: string, en: string): string {
  return `${zh}\n${en}`
}

/* 工具运行期文案：按会话语言取词，供错误与摘要复用 */
export function tr(
  context: ToolContext,
  key: string,
  params?: Array<string | number> | Record<string, string | number>
): string {
  return translate(context.language, key, params)
}

/* 文本结果（details 供 UI / 落库展示结构化信息；长度裁剪由注册表按 maxOutput 统一执行） */
export function text(
  value: string,
  details: Record<string, unknown> = {}
): { content: { type: 'text'; text: string }[]; details: Record<string, unknown> } {
  return { content: [{ type: 'text' as const, text: value }], details }
}

/* 错误结果（模型可见，UI 标记为失败） */
export function toolError(value: string): {
  content: { type: 'text'; text: string }[]
  details: Record<string, unknown>
  isError: true
} {
  return { content: [{ type: 'text' as const, text: value }], details: {}, isError: true }
}

/*
 * 按工具声明的 maxOutput 裁剪结果文本：
 *   - 由注册表统一调用，保证 meta 声明与实际裁剪一致；
 *   - 仅裁剪文本块，图片内容、details 与 structuredContent 原样保留。
 */
export function clipToolResult<T>(
  result: AgentToolResult<T>,
  maxOutput: number
): AgentToolResult<T> {
  const content = result.content.map((block) =>
    block.type === 'text' && block.text.length > maxOutput
      ? { ...block, text: `${block.text.slice(0, maxOutput)}\n...(已截断)` }
      : block
  )
  return { ...result, content }
}

/*
 * 技能只读放行根目录：技能库整库可读（含未启用技能与目录列举），**永不弹审批**。
 * 这是「文件读取权限」；「是否启用」只决定 Agent 能否通过 read_skill 主动使用技能，
 * 两者是不同维度，不要用启用状态去限制文件读取。
 */
export function readAllowedRootsOf(context: ToolContext): string[] {
  return [
    ...new Set([context.skillsDir, ...(context.skills ?? []).map((skill) => skill.dir)])
  ].filter((dir): dir is string => Boolean(dir))
}

/* 技能库完全信任根目录：读 / 写 / 命令均直接放行（文件工具与终端共用） */
export function skillTrustedRoots(context: ToolContext): string[] {
  return context.skillsDir ? [context.skillsDir] : []
}

/*
 * 统一路径闸门：目录内直接放行，越界转主进程审批；拒绝则返回可直接回填模型的错误。
 * 具体工具只需声明动作类型（read / write）与工具名。
 * 技能库（技能根目录）读取时放行，且作为完全信任目录，写入不弹审批。
 */
export function createGuard(context: ToolContext) {
  const readAllowedRoots = readAllowedRootsOf(context)
  /* 技能库为完全信任目录：Agent 可读写技能内容，不触发越界审批 */
  const trustedRoots = skillTrustedRoots(context)
  return async function guard(
    target: string | undefined,
    action: PathAction,
    tool: string
  ): Promise<
    { ok: true; abs: string } | { ok: false; result: ReturnType<typeof toolError> }
  > {
    const outcome = await guardPath({
      sessionId: context.sessionId,
      rootDir: context.rootDir,
      target,
      action,
      tool,
      language: context.language,
      readAllowedRoots,
      trustedRoots
    })
    if (!outcome.allowed) {
      return {
        ok: false,
        result: toolError(outcome.reason ?? tr(context, 'runtime.tool.pathBlocked'))
      }
    }
    return { ok: true, abs: outcome.abs }
  }
}

/* glob 模式 → 正则：支持 * ? 与 ** */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*')
  return new RegExp(`^${escaped}$`)
}

/* 遍历时跳过的目录（避免扫描依赖与版本库） */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.svn', '.hg'])

/* 递归收集根目录下的文件（绝对路径），达到上限即停止 */
export async function walkFiles(dir: string, max = 5000): Promise<string[]> {
  const results: string[] = []
  async function walk(current: string): Promise<void> {
    if (results.length >= max) {
      return
    }
    let entries: Dirent[]
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= max) {
        return
      }
      const full = resolve(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue
        }
        await walk(full)
      } else if (entry.isFile()) {
        results.push(full)
      }
    }
  }
  await walk(dir)
  return results
}

/* 绝对路径 → 相对根目录的 POSIX 展示路径 */
export function displayPath(rootDir: string, abs: string): string {
  const rel = relative(rootDir, abs)
  return rel.split(sep).join('/') || basename(abs)
}
