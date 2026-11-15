/*
 * 会话变更通知：领域服务不直接持有窗口引用，由 IPC 注册时注入发送器。
 *   - 定时任务等后台流程创建会话后，通知渲染层刷新侧栏会话列表；
 *   - 未注册发送器（如单元调用）时静默跳过。
 * @author xuxueli 2026-11-15
 */

/* 变更发送器：通常为 ipc.send(SESSION_IPC.changed, payload) */
type SessionChangedSender = (sessionId: number) => void

let sender: SessionChangedSender | null = null

/* 注册 / 注销发送器（由 chat 模块 IPC 注册时调用） */
export function setSessionChangedSender(next: SessionChangedSender | null): void {
  sender = next
}

/* 广播会话变更（新增 / 后台更新后调用） */
export function broadcastSessionChanged(sessionId: number): void {
  sender?.(sessionId)
}
