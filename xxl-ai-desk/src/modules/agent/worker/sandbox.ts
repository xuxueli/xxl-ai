/*
 * 文件沙箱：按会话权限模式控制 Agent 的本地读写与命令范围。
 *   - read-only：全局可读；写入 / 命令一律拦截；
 *   - workspace-write：全局可读；仅项目目录与系统临时目录可直接写入，其它写入转人工审批；
 *   - full-access：全局可读 / 写；系统与用户敏感目录仍由统一拦截机制兜底。
 *   - 技能库（{dataDir}/skills）：完全信任，读 / 写 / 命令均直接放行；
 *   - 越界写入 / 命令：转交主进程，在渲染层输入框位置内联展示人工确认（允许一次 / 本会话全部允许 / 拒绝）。
 * 路径解析对符号链接做归一化，避免用软链接绕过限制。
 *
 * 本模块运行在 Agent 运行时进程（utilityProcess）内，越界确认经统一人机交互桥
 * （hitl.ts → 主进程 → 渲染层）完成，不直接依赖 Electron。
 */

import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { canonicalize, isWithinRoot, resolveTarget } from '@common/main/utils/pathGuard'
import type { PermissionMode } from '@modules/chat/shared'
import type { PathAction } from '@modules/agent/shared/agentProtocol'
import { translate } from '@common/shared/i18n'
import { requestInteraction } from '@modules/agent/worker/hitl'

/* 越界访问的动作类型（文案区分用） */
export type { PathAction }

/* 会话级越界放行：用户选择「本会话全部允许」后，该会话内所有越界访问不再询问 */
const sessionTrusted = new Set<number>()

/* 越界动作 → 文案 key */
const ACTION_LABEL_KEY: Record<PathAction, string> = {
  read: 'runtime.tool.actionRead',
  write: 'runtime.tool.actionWrite',
  command: 'runtime.tool.actionCommand'
}

/*
 * 敏感路径兜底：即使完全权限也不允许写入的系统目录与用户凭据目录。
 * 只用于写 / 命令，读取不受限制（仅可查看即全局读）。
 */
function protectedRoots(): string[] {
  const systemRoots =
    process.platform === 'win32'
      ? [process.env.SystemRoot, process.env.ProgramFiles, process.env.ProgramData]
      : ['/etc', '/usr', '/bin', '/sbin', '/boot', '/System', '/Library']
  return [
    ...systemRoots.filter((root): root is string => Boolean(root)),
    join(homedir(), '.ssh'),
    join(homedir(), '.aws'),
    join(homedir(), '.gnupg'),
    join(homedir(), '.kube'),
    join(homedir(), '.netrc'),
    join(homedir(), '.git-credentials')
  ]
}

/* 清理会话的越界放行状态（删除/清空会话时调用） */
export function clearSessionPermissions(sessionId: number): void {
  sessionTrusted.delete(sessionId)
}

/* 判断目标是否越界：越界返回规范化绝对路径，目录内返回 null（供 shell 等自定义路径识别复用） */
export function outsidePath(rootDir: string, target: string): string | null {
  const root = canonicalize(rootDir)
  const abs = canonicalize(target)
  return isWithinRoot(root, abs) ? null : abs
}

/* 判断是否为统一拦截的敏感路径：命中返回规范化绝对路径，未命中返回 null */
export function protectedPathOf(target: string): string | null {
  const abs = canonicalize(target)
  return protectedRoots().some((root) => isWithinRoot(root, abs)) ? abs : null
}

/* 系统临时目录：工作区内修改允许直接写入 */
function tempRoots(): string[] {
  return [tmpdir(), '/tmp'].map((item) => canonicalize(item))
}

/* 写 / 命令是否落在当前权限的直接放行范围（信任目录与敏感目录另行判断） */
function withinWriteScope(root: string, abs: string, permissionMode: PermissionMode): boolean {
  if (isWithinRoot(root, abs)) {
    return true
  }
  if (permissionMode === 'full-access') {
    return true
  }
  return tempRoots().some((item) => isWithinRoot(item, abs))
}

/* 构造拦截说明：模型可直接回填 */
function blocked(
  language: string,
  abs: string,
  rootDir: string,
  action: PathAction,
  key: string
): { allowed: false; abs: string; reason: string } {
  return {
    allowed: false,
    abs,
    reason: translate(language, key, [abs, rootDir, translate(language, ACTION_LABEL_KEY[action])])
  }
}

/*
 * 路径闸门：
 *   - 读取：全局放行（仅可查看即「全局读」）；
 *   - 写入 / 命令：按权限模式判断放行范围，越界写入转人工审批。
 * 返回 allowed=false 时，reason 为可直接回填给模型的拦截说明。
 */
export async function guardPath(options: {
  sessionId: number
  rootDir: string
  target?: string
  action: PathAction
  tool: string
  /* 应用语言：拦截文案使用对应语言 */
  language?: string
  /* 当前会话权限模式 */
  permissionMode: PermissionMode
  /* 完全信任根目录（如技能库）：读 / 写 / 命令均直接放行 */
  trustedRoots?: string[]
}): Promise<{ allowed: boolean; abs: string; reason?: string }> {
  const root = canonicalize(options.rootDir)
  const abs = canonicalize(resolveTarget(options.rootDir, options.target))
  const language = options.language ?? 'zh'

  /* 全局读：所有权限模式下读取项目外路径均直接放行 */
  if (options.action === 'read') {
    return { allowed: true, abs }
  }
  /* 仅可查看：先于信任目录判断，禁止任何写入或命令 */
  if (options.permissionMode === 'read-only') {
    return blocked(language, abs, options.rootDir, options.action, 'runtime.tool.permissionReadOnly')
  }
  /* 完全信任目录（技能库）：写 / 命令全部放行，不弹审批 */
  if ((options.trustedRoots ?? []).some((item) => isWithinRoot(item, abs))) {
    return { allowed: true, abs }
  }
  /* 兜底拦截：系统 / 用户敏感目录即使完全权限也不允许写入 */
  if (protectedPathOf(abs)) {
    return blocked(language, abs, options.rootDir, options.action, 'runtime.tool.protectedPath')
  }
  /* 项目目录 / 系统临时目录（或完全权限）：直接放行 */
  if (withinWriteScope(root, abs, options.permissionMode)) {
    return { allowed: true, abs }
  }
  /* 会话已授权全部越界访问：不再重复询问 */
  if (sessionTrusted.has(options.sessionId)) {
    return { allowed: true, abs }
  }
  const choice = await requestInteraction(options.sessionId, {
    kind: 'permission',
    title: translate(language, 'chat.interaction.permission.header'),
    permission: {
      tool: options.tool,
      action: options.action,
      abs,
      root: options.rootDir
    }
  })
  if (choice.status === 'submitted' && choice.value === 'allow') {
    if (choice.remember) {
      sessionTrusted.add(options.sessionId)
    }
    return { allowed: true, abs }
  }
  return blocked(language, abs, options.rootDir, options.action, 'runtime.tool.pathDenied')
}
