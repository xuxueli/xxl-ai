/*
 * 文件沙箱：把 Agent 的本地文件读写限制在当前项目目录内。
 *   - 目录内：直接放行；
 *   - 目录外：拦截并转交主进程弹系统对话框人工确认（允许本次 / 本会话允许 / 拒绝），
 *     「本会话允许」记入会话级白名单，后续同路径不再重复询问。
 * 路径解析对符号链接做归一化，避免用软链接绕过目录限制。
 *
 * 本模块运行在 Agent 运行时进程（utilityProcess）内，不直接依赖 Electron：
 * 越界审批通过注入的 approvalRequester 回调（跨进程请求主进程对话框）完成。
 */

import { existsSync, realpathSync } from 'fs'
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'path'
import type { ApprovalChoice, ApprovalRequest, PathAction } from '../../shared/agentProtocol'

/* 越界访问的动作类型（文案区分用） */
export type { PathAction }

/* 审批询问函数：由运行时进程启动时注入；未注入时一律拒绝，避免越界静默放行 */
type ApprovalRequester = (request: ApprovalRequest) => Promise<ApprovalChoice>
let approvalRequester: ApprovalRequester | null = null

/* 注册审批询问函数（运行时进程启动时调用一次） */
export function setApprovalRequester(requester: ApprovalRequester | null): void {
  approvalRequester = requester
}

/* 会话级越界白名单：sessionId → 已允许的规范化绝对路径集合 */
const sessionAllowed = new Map<string, Set<string>>()

/* 清理会话的越界白名单（删除/清空会话时调用） */
export function clearSessionPermissions(sessionId: string): void {
  sessionAllowed.delete(sessionId)
}

/*
 * 规范化路径：解析符号链接（对不存在的尾部逐级回退到最近的已存在祖先，再拼回剩余片段），
 * 保证软链接与 .. 都无法绕过根目录判断。
 */
function canonicalize(target: string): string {
  let current = resolve(target)
  const suffix: string[] = []
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    suffix.unshift(basename(current))
    current = parent
  }
  let real = current
  try {
    real = realpathSync.native(current)
  } catch {
    /* 无法解析（如权限不足）时按原路径使用 */
  }
  return suffix.length > 0 ? join(real, ...suffix) : real
}

/* 将用户给定路径解析为绝对路径：空值取根目录，相对路径基于根目录 */
export function resolveTarget(rootDir: string, target?: string): string {
  const raw = (target ?? '').trim()
  if (!raw) {
    return resolve(rootDir)
  }
  return normalize(isAbsolute(raw) ? raw : resolve(rootDir, raw))
}

/* 判断绝对路径是否位于根目录内（含根目录本身） */
function isWithinRoot(root: string, abs: string): boolean {
  return abs === root || abs.startsWith(root + sep)
}

/* 请求越界审批：转交主进程弹原生对话框；未注册或异常时按拒绝处理 */
async function requestApproval(request: ApprovalRequest): Promise<ApprovalChoice> {
  if (!approvalRequester) {
    return 'deny'
  }
  try {
    return await approvalRequester(request)
  } catch {
    return 'deny'
  }
}

/*
 * 目录内直接放行的判定与越界确认：
 *   返回 allowed=false 时，reason 为可直接回填给模型的拦截说明。
 */
export async function guardPath(options: {
  sessionId: string
  rootDir: string
  target?: string
  action: PathAction
  tool: string
}): Promise<{ allowed: boolean; abs: string; reason?: string }> {
  const root = canonicalize(options.rootDir)
  const abs = canonicalize(resolveTarget(options.rootDir, options.target))
  if (isWithinRoot(root, abs)) {
    return { allowed: true, abs }
  }
  /* 会话级白名单命中：不再重复询问 */
  if (sessionAllowed.get(options.sessionId)?.has(abs)) {
    return { allowed: true, abs }
  }
  const choice = await requestApproval({
    sessionId: options.sessionId,
    tool: options.tool,
    action: options.action,
    abs,
    root: options.rootDir
  })
  if (choice === 'session') {
    const set = sessionAllowed.get(options.sessionId) ?? new Set<string>()
    set.add(abs)
    sessionAllowed.set(options.sessionId, set)
    return { allowed: true, abs }
  }
  if (choice === 'once') {
    return { allowed: true, abs }
  }
  return {
    allowed: false,
    abs,
    reason: `已拦截：路径「${abs}」超出项目目录「${options.rootDir}」，用户拒绝本次${options.action === 'write' ? '写入' : '读取'}操作。`
  }
}
