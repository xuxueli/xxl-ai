/*
 * 终端类内置工具：在项目目录内执行 shell 命令。
 *   - 命令策略（危险命令 / 越界路径）见 shellPolicy.ts；
 *   - 显式访问项目目录外的路径时，走与文件工具相同的越界审批；
 *   - 串行执行，用户终止时同步杀掉子进程；输出统一截断，避免大 buffer 常驻。
 *
 * @author xuxueli 2026-10-31
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import { exec } from 'child_process'
import {
  BUILD_ONLY,
  MAX_OUTPUT,
  describe,
  readAllowedRootsOf,
  text,
  toolError,
  tr,
  type ToolContext,
  type ToolEntry
} from './shared'
import { detectDangerousCommand, findOutsideTarget, isReadOnlyCommand } from './shellPolicy'
import { guardPath } from '../sandbox'

/* 运行时 PATH（主进程随每轮对话下发，供命令使用设置的 Node / Python 环境） */
let runtimePath: string | undefined

/* 设置运行时 PATH（每轮对话开始时由运行时进程调用） */
export function setRuntimePath(value?: string): void {
  runtimePath = value?.trim() || undefined
}

/* 构建终端类工具 */
export async function createShellTools(context: ToolContext): Promise<ToolEntry[]> {
  const { Type } = await import('@earendil-works/pi-ai')
  const { rootDir } = context
  /* 技能库只读放行根目录：与文件类工具共用同一套放行规则 */
  const readAllowedRoots = readAllowedRootsOf(context)
  /* 技能库为完全信任目录：命令访问技能库不触发越界审批 */
  const trustedRoots = context.skillsDir ? [context.skillsDir] : []

  /* 执行命令：项目目录内执行 shell 并汇总 stdout/stderr，仅 Build 模式 */
  const runCommand: AgentTool = {
    name: 'run_command',
    label: '执行命令',
    description: describe(
      '在项目目录内执行 shell 命令并返回输出（仅 Build 模式可用）。危险命令（删除根目录、提权、管道执行远端脚本等）会被拦截；显式访问项目目录之外的路径会先请求确认',
      'Run a shell command inside the project directory and return its output (Build mode only). Destructive commands (root deletion, privilege escalation, piping remote scripts to a shell) are blocked; explicit access outside the project directory requires confirmation.'
    ),
    parameters: Type.Object({
      command: Type.String({ description: '要执行的命令' }),
      timeout: Type.Optional(Type.Number({ description: '超时毫秒数，默认 60000' }))
    }),
    /* 与其他工具串行，避免命令与文件写入交错造成不确定结果 */
    executionMode: 'sequential',
    execute: async (_toolCallId, params, signal) => {
      const { command, timeout } = params as { command: string; timeout?: number }
      /* 危险命令先拦截：把原因回填给模型，由模型决定改用安全方式 */
      const danger = detectDangerousCommand(command)
      if (danger) {
        return {
          content: [
            {
              type: 'text' as const,
              text: tr(context, 'runtime.tool.dangerBlocked', [danger, command])
            }
          ],
          details: { blocked: true, reason: danger },
          isError: true
        }
      }
      /* 越界路径：与文件工具共用审批弹窗与会话级信任；纯读取命令按 read 动作走只读放行目录 */
      const outside = findOutsideTarget(command, rootDir)
      if (outside) {
        const outcome = await guardPath({
          sessionId: context.sessionId,
          rootDir,
          target: outside,
          action: isReadOnlyCommand(command) ? 'read' : 'command',
          tool: 'run_command',
          language: context.language,
          readAllowedRoots,
          trustedRoots
        })
        if (!outcome.allowed) {
          return toolError(outcome.reason ?? tr(context, 'runtime.tool.commandBlocked', [outside]))
        }
      }
      return new Promise<ReturnType<typeof text>>((resolvePromise) => {
        exec(
          command,
          {
            cwd: rootDir,
            /* 使用设置中配置的 Node / Python 运行环境 */
            env: runtimePath ? { ...process.env, PATH: runtimePath } : process.env,
            timeout: timeout && timeout > 0 ? timeout : 60000,
            /* 输出最终会被截断到 20k 字符，限制收集上限避免大 buffer 常驻 */
            maxBuffer: 1024 * 1024 * 2,
            /* 用户点击终止时同步杀掉子进程，避免长时间占用 */
            signal
          },
          (error, stdout, stderr) => {
            const parts: string[] = []
            if (stdout) {
              parts.push(stdout)
            }
            if (stderr) {
              parts.push(`[stderr]\n${stderr}`)
            }
            if (error) {
              parts.push(
                signal?.aborted
                  ? tr(context, 'runtime.tool.commandAborted')
                  : tr(context, 'runtime.tool.commandExit', [error.message])
              )
            }
            const rawCode = error ? (error as NodeJS.ErrnoException).code : undefined
            const exitCode =
              typeof rawCode === 'number' ? rawCode : error ? 1 : 0
            resolvePromise(
              text(parts.join('\n') || tr(context, 'runtime.tool.commandNoOutput'), {
                exitCode,
                timedOut: Boolean(error && (error as { killed?: boolean }).killed),
                aborted: Boolean(signal?.aborted)
              })
            )
          }
        )
      })
    }
  }

  return [
    {
      meta: {
        group: 'shell',
        readOnly: false,
        modes: BUILD_ONLY,
        requiresApproval: true,
        maxOutput: MAX_OUTPUT
      },
      tool: runCommand
    }
  ]
}
