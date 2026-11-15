/*
 * 定时任务运行状态：进程内记录正在执行的任务，供列表展示与重入保护。
 *   - 运行状态不落库，应用退出后自然清空；
 *   - 上次运行结果由任务表持久化，二者职责分离。
 * @author xuxueli 2026-11-15
 */

const runningTaskIds = new Set<number>()

/* 标记任务开始 / 结束运行 */
export function markTaskRunning(taskId: number, running: boolean): void {
  if (running) {
    runningTaskIds.add(taskId)
  } else {
    runningTaskIds.delete(taskId)
  }
}

/* 任务当前是否正在运行 */
export function isTaskRunning(taskId: number): boolean {
  return runningTaskIds.has(taskId)
}

/* 当前正在运行的任务数（最大并发限制） */
export function countRunningTasks(): number {
  return runningTaskIds.size
}
