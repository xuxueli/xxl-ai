/*
 * 按会话串行的任务队列：浏览器动作同一会话依次执行，跨会话互不阻塞。
 * @author xuxueli 2026-10-25
 */

const queues = new Map<string, Promise<unknown>>()

/* 入队任务：前序任务成功或失败后继续执行，避免一次失败卡死后续动作 */
export function enqueueSessionTask<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(sessionId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(task)
  const tail = next.then(
    () => undefined,
    () => undefined
  )
  queues.set(sessionId, tail)
  /* 队列已排空：移除会话槽位，避免长期运行累积空 Promise */
  void tail.then(() => {
    if (queues.get(sessionId) === tail) {
      queues.delete(sessionId)
    }
  })
  return next
}
