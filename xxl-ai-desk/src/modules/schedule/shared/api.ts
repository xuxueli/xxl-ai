/*
 * 定时任务域 preload API 契约。
 * @author xuxueli 2026-11-15
 */

import type {
  ScheduleConfigDTO,
  ScheduleRunStartDTO,
  ScheduledTaskDTO,
  ScheduledTaskInput
} from './contracts'

export interface ScheduleApi {
  /* 全部定时任务（含运行时派生字段） */
  list(): Promise<ScheduledTaskDTO[]>
  /* 新增 / 编辑 */
  save(input: ScheduledTaskInput): Promise<ScheduledTaskDTO>
  /* 删除 */
  remove(id: number): Promise<void>
  /* 启停 */
  setEnabled(id: number, enabled: boolean): Promise<void>
  /* 立即运行：返回本次实例会话 ID（长轮次后台继续） */
  runNow(id: number): Promise<ScheduleRunStartDTO>
  /* 任务设置 */
  getConfig(): Promise<ScheduleConfigDTO>
  saveConfig(patch: Partial<ScheduleConfigDTO>): Promise<ScheduleConfigDTO>
  /* 任务或运行状态变化通知 */
  onChanged(cb: (payload: { taskId: number }) => void): () => void
}
