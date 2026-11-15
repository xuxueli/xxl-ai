/*
 * 无人值守会话的交互策略：定时任务会话不推送审批 / 询问面板，由主进程直接结算。
 *   - 权限审批：保持任务所选的权限档位，自动拒绝越界写入与命令；
 *   - ask_user：不伪造用户选择，交回模型基于已有信息自行决策。
 * @author xuxueli 2026-11-15
 */

import type { InteractionRequest, InteractionResult } from '@modules/chat/shared'
import { getSession } from './sessionService'

/*
 * 解析无人值守交互结果：返回 null 表示仍需人工处理。
 * 只在会话来源为定时任务时生效，手动会话行为不变。
 */
export function resolveUnattendedInteraction(
  sessionId: number,
  request: InteractionRequest
): InteractionResult | null {
  const session = getSession(sessionId)
  if (!session || session.triggerType !== 'schedule') {
    return null
  }
  /* 越界写入 / 命令：自动拒绝，模型收到原因后自行收敛到工作区内 */
  if (request.kind === 'permission') {
    return { status: 'denied' }
  }
  /* 方案选择：交回模型自行决策，避免把「无人值守」伪装成用户已选 */
  return { status: 'auto' }
}
