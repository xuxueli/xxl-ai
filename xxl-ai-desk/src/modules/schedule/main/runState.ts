/*
 * 定时任务运行状态：进程内记录正在执行的任务、开始时刻与待强制调度请求。
 *   - 运行状态不落库，应用退出后自然清空（运行日志负责历史追溯）；
 *   - 上次运行结果由任务表持久化，三者职责分离；
 *   - 强制调度请求：终止进行中会话后待启动的触发，本轮收尾时消费。
 * @author xuxueli 2026-11-15
 */

/* 运行中任务：taskId → 本轮开始时刻 */
const runningSince = new Map<number, number>()
/* 运行中的日志主键：taskId → 日志记录 ID（超时兜底结算用） */
const activeLogs = new Map<number, number>()
/* 待强制调度：taskId → 计划触发时刻（空串表示立即运行） */
const pendingForce = new Map<number, string>()

/* 标记任务开始 / 结束运行 */
export function markTaskRunning(taskId: number, running: boolean): void {
  if (running) {
    runningSince.set(taskId, Date.now())
  } else {
    runningSince.delete(taskId)
  }
}

/* 任务当前是否正在运行 */
export function isTaskRunning(taskId: number): boolean {
  return runningSince.has(taskId)
}

/* 本轮开始时刻（毫秒），未运行返回 0 */
export function getTaskRunningSince(taskId: number): number {
  return runningSince.get(taskId) ?? 0
}

/* 当前正在运行的任务数（最大并发限制） */
export function countRunningTasks(): number {
  return runningSince.size
}

/* 绑定本轮运行日志 */
export function setActiveRunLog(taskId: number, logId: number): void {
  activeLogs.set(taskId, logId)
}

/* 取走本轮运行日志（强制结算时使用，取走即清除） */
export function takeActiveRunLog(taskId: number): number {
  const logId = activeLogs.get(taskId) ?? 0
  activeLogs.delete(taskId)
  return logId
}

/* 登记强制调度请求：本轮收尾后按该计划时刻重新触发 */
export function setPendingForce(taskId: number, slotAt: string): void {
  pendingForce.set(taskId, slotAt)
}

/* 取走强制调度请求：存在即清除并返回计划时刻，否则返回 null */
export function takePendingForce(taskId: number): string | null {
  const slotAt = pendingForce.get(taskId)
  if (slotAt === undefined) {
    return null
  }
  pendingForce.delete(taskId)
  return slotAt
}

/* 清理任务的全部进程内状态（删除任务时调用） */
export function clearRunState(taskId: number): void {
  runningSince.delete(taskId)
  activeLogs.delete(taskId)
  pendingForce.delete(taskId)
}
