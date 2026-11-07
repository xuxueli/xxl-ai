/*
 * 文件沙箱：把 Agent 的本地文件读写限制在当前项目目录内。
 *   - 目录内：直接放行；
 *   - 软件数据目录下的 SKILL 内容：读 / 写 / 命令全部放行（技能库是用户主动安装的可信资料）；
 *   - 目录外：拦截并转交主进程弹应用内对话框人工确认（允许本次 / 本会话允许 / 拒绝），
 *     「本会话允许」记入会话级信任，本会话内后续越界访问不再重复询问。
 * 路径解析对符号链接做归一化，避免用软链接绕过目录限制。
 *
 * 本模块运行在 Agent 运行时进程（utilityProcess）内，越界确认经统一人机交互桥
 * （hitl.ts → 主进程 → 渲染层）完成，不直接依赖 Electron。
 */

import { canonicalize, isWithinRoot, resolveTarget } from '@common/main/utils/pathGuard'
import type { PathAction } from '@modules/agent/shared/agentProtocol'
import { translate } from '@common/shared/i18n'
import { requestInteraction } from '@modules/agent/worker/hitl'

/* 越界访问的动作类型（文案区分用） */
export type { PathAction }

/* 会话级越界放行：用户在弹窗选择「本会话允许」后，该会话内所有越界访问不再询问 */
const sessionTrusted = new Set<number>()

/* 越界动作 → 文案 key */
const ACTION_LABEL_KEY: Record<PathAction, string> = {
  read: 'runtime.tool.actionRead',
  write: 'runtime.tool.actionWrite',
  command: 'runtime.tool.actionCommand'
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

/*
 * 目录内直接放行的判定与越界确认：
 *   返回 allowed=false 时，reason 为可直接回填给模型的拦截说明。
 */
export async function guardPath(options: {
  sessionId: number
  rootDir: string
  target?: string
  action: PathAction
  tool: string
  /* 应用语言：拦截文案使用对应语言 */
  language?: string
  /* 只读放行根目录（如技能根目录）：读取越界到这些目录时直接放行 */
  readAllowedRoots?: string[]
  /* 完全信任根目录（如技能库）：读 / 写 / 命令均直接放行 */
  trustedRoots?: string[]
}): Promise<{ allowed: boolean; abs: string; reason?: string }> {
  const root = canonicalize(options.rootDir)
  const abs = canonicalize(resolveTarget(options.rootDir, options.target))
  if (isWithinRoot(root, abs)) {
    return { allowed: true, abs }
  }
  /* 完全信任目录（技能库）：读 / 写 / 命令全部放行，不弹审批 */
  if ((options.trustedRoots ?? []).some((item) => isWithinRoot(item, abs))) {
    return { allowed: true, abs }
  }
  /* SKILL 内容（技能库）：读取直接放行，不弹审批 */
  if (
    options.action === 'read' &&
    (options.readAllowedRoots ?? []).some((item) => isWithinRoot(item, abs))
  ) {
    return { allowed: true, abs }
  }
  /* 会话已授权全部越界访问：不再重复询问 */
  if (sessionTrusted.has(options.sessionId)) {
    return { allowed: true, abs }
  }
  const language = options.language ?? 'zh'
  const choice = await requestInteraction(
    options.sessionId,
    {
      kind: 'permission',
      title: translate(language, 'chat.interaction.permission.title'),
      permission: {
        tool: options.tool,
        action: options.action,
        abs,
        root: options.rootDir
      }
    }
  )
  if (choice.status === 'submitted' && choice.value === 'allow') {
    if (choice.remember) {
      sessionTrusted.add(options.sessionId)
    }
    return { allowed: true, abs }
  }
  return {
    allowed: false,
    abs,
    reason: translate(language, 'runtime.tool.pathDenied', [
      abs,
      options.rootDir,
      translate(language, ACTION_LABEL_KEY[options.action])
    ])
  }
}
