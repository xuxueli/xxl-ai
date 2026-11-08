/*
 * 技能类内置工具：读取当前 Agent 已配置技能的 SKILL.md 与附属文件。
 *   - 只读，三档权限均可用；
 *   - Agent 勾选决定能否主动使用技能（read_skill 入口）；
 *   - 技能库的文件读取权限是另一维度：整库只读放行，永不弹审批（见 shared.ts）。
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import { promises as fs } from 'fs'
import { isAbsolute, relative, resolve } from 'path'
import { ALL_PERMISSIONS, describe, text, toolError, tr, type ToolContext, type ToolEntry } from '@modules/agent/worker'
import type { SkillRuntimeConfig } from '@modules/skill/shared'
import { translate } from '@common/shared/i18n'

/* 解析技能文件：归一化真实路径并限制在技能目录内 */
async function resolveSkillFile(
  skill: SkillRuntimeConfig,
  relativePath: string,
  language: string
): Promise<string> {
  const deny = (): never => {
    throw new Error(translate(language, 'runtime.tool.skillPathDenied'))
  }
  const root = await fs.realpath(skill.dir)
  const target = resolve(root, relativePath)
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    deny()
  }
  const real = await fs.realpath(target)
  const realRel = relative(root, real)
  if (realRel.startsWith('..') || isAbsolute(realRel)) {
    deny()
  }
  return real
}

/* 构建技能类工具 */
export async function createSkillTools(context: ToolContext): Promise<ToolEntry[]> {
  const skills = context.skills ?? []
  /* 当前 Agent 未配置任何技能：不装配 read_skill（文件读取仍可经 fs 工具访问技能库） */
  if (skills.length === 0) {
    return []
  }
  const { obj, opt, str } = await import('@earendil-works/pi-schema')

  /* 按名称或目录名查找技能（忽略大小写） */
  function findSkill(name: string): SkillRuntimeConfig | undefined {
    const key = name.trim().toLowerCase()
    return skills.find(
      (item) => item.name.toLowerCase() === key || item.id.toLowerCase() === key
    )
  }

  /* 读取技能说明：默认 SKILL.md，可读取技能目录内其他文件 */
  const readSkill: AgentTool = {
    name: 'read_skill',
    label: '读取技能说明',
    description: describe(
      '读取当前 Agent 已配置技能的 SKILL.md 完整说明或技能目录内的附属文件；任务与技能描述匹配时，先调用本工具再执行。',
      'Read the full SKILL.md or a supporting file of a skill assigned to the current agent before following it.'
    ),
    parameters: obj({
      name: str({ description: '技能名称或目录名' }),
      path: opt(
        str({ description: '技能目录内的相对路径，默认 SKILL.md' })
      )
    }),
    execute: async (_toolCallId, params) => {
      const { name, path } = params as { name: string; path?: string }
      const skill = findSkill(name)
      if (!skill) {
        const available = skills.map((item) => item.name).join('、')
        return toolError(tr(context, 'runtime.tool.skillNotFound', [name, available || '-']))
      }
      const relativePath = (path ?? '').trim() || 'SKILL.md'
      try {
        const file = await resolveSkillFile(skill, relativePath, context.language)
        const buffer = await fs.readFile(file)
        /* 含 NUL 视为二进制，避免把乱码写入上下文 */
        if (buffer.includes(0)) {
          return toolError(tr(context, 'runtime.tool.skillBinary', [relativePath]))
        }
        const content = buffer.toString('utf-8')
        return text(
          `技能：${skill.name}\n目录：${skill.dir}\n文件：${relativePath}\n\n${content}`,
          { skill: skill.id, path: relativePath }
        )
      } catch (error) {
        return toolError(tr(context, 'runtime.tool.skillReadFailed', [(error as Error).message]))
      }
    }
  }

  return [
    {
      meta: {
        group: 'skill',
        readOnly: true,
        permissionModes: ALL_PERMISSIONS,
        /* 技能说明可能较长，放宽到 10 万字符（仍受单次上下文预算约束） */
        maxOutput: 100000
      },
      tool: readSkill
    }
  ]
}
