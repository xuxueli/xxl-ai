/*
 * 按会话串行的任务队列：浏览器动作同一会话依次执行，跨会话互不阻塞；
 * 会话终止时可整体取消当前动作与排队动作，避免旧动作阻塞下一轮。
 * @author xuxueli 2026-10-25
 */

/* 会话队列尾部：前序任务成功或失败后继续执行，避免一次失败卡死后续动作 */
const queues = new Map<string, Promise<unknown>>()

/* 会话级取消信号：终止后旧信号失效，新动作重新创建 */
const controllers = new Map<string, AbortController>()

/* 取（或创建）会话的取消信号 */
function controllerOf(sessionId: string): AbortController {
  let controller = controllers.get(sessionId)
  if (!controller) {
    controller = new AbortController()
    controllers.set(sessionId, controller)
  }
  return controller
}

/* 入队任务：任务接收会话取消信号，长耗时动作据此提前退出 */
export function enqueueSessionTask<T>(
  sessionId: string,
  task: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const signal = controllerOf(sessionId).signal
  const previous = queues.get(sessionId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(() => task(signal))
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

/* 取消会话的全部浏览器动作：中止当前执行，并让排队动作直接失败返回 */
export function cancelSessionTasks(sessionId: string): void {
  controllers.get(sessionId)?.abort()
  controllers.delete(sessionId)
}

/* 已登记动作队列的会话（含尚未创建浏览器状态的会话，供删除会话时统一取消） */
export function sessionTaskIds(): string[] {
  return [...controllers.keys()]
}
