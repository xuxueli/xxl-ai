/*
 * 会话级本地持久化：统一 localStorage 读写、防抖调度、版本校验与失效清理。
 *   - 各业务 store 只提供「创建默认值 / 解析归一化 / 序列化快照」；
 *   - 键名为 prefix + sessionId，删除会话时按有效列表清理。
 * @author xuxueli 2026-10-25
 */

/* 默认防抖写入间隔（毫秒） */
const DEFAULT_DELAY = 300

/* 持久化配置 */
export interface SessionScopedStorageOptions<T> {
  /* 键前缀（如 desk:toolPanel:） */
  prefix: string
  /* 结构版本（不一致时视为无缓存） */
  version: number
  /* 解析后的原始对象 → 业务状态（结构非法时返回 null） */
  fromStored: (raw: unknown) => T | null
  /* 业务状态 → 待写入对象（可裁剪运行时字段） */
  toStored: (state: T) => unknown
  /* 防抖间隔 */
  delay?: number
}

/* 持久化能力 */
export interface SessionScopedStorage<T> {
  /* 读取并归一化；无记录/版本不符返回 null */
  read: (key: string) => T | null
  /* 立即写入 */
  write: (key: string, state: T) => void
  /* 防抖写入：同一 key 的连续变更合并 */
  schedule: (key: string, snapshot: () => T | undefined) => void
  /* 取消某 key 的待写入任务 */
  cancel: (key: string) => void
  /* 删除某 key 的持久化 */
  remove: (key: string) => void
  /* 清理不在有效列表内的持久化键 */
  cleanup: (validKeys: string[]) => void
}

/* 创建会话级持久化工具 */
export function createSessionScopedStorage<T>(
  options: SessionScopedStorageOptions<T>
): SessionScopedStorage<T> {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const delay = options.delay ?? DEFAULT_DELAY

  /* 取消待写入任务 */
  function cancel(key: string): void {
    const timer = timers.get(key)
    if (timer) {
      clearTimeout(timer)
      timers.delete(key)
    }
  }

  /* 读取并归一化 */
  function read(key: string): T | null {
    try {
      const raw = localStorage.getItem(options.prefix + key)
      if (!raw) {
        return null
      }
      const parsed = JSON.parse(raw) as { version?: number }
      if (parsed?.version !== options.version) {
        return null
      }
      return options.fromStored(parsed)
    } catch {
      return null
    }
  }

  /* 立即写入 */
  function write(key: string, state: T): void {
    cancel(key)
    try {
      localStorage.setItem(options.prefix + key, JSON.stringify(options.toStored(state)))
    } catch {
      /* 本地存储不可用时忽略（仅影响恢复） */
    }
  }

  /* 防抖写入：回调在 flush 时读取最新状态，避免持有过期快照 */
  function schedule(key: string, snapshot: () => T | undefined): void {
    cancel(key)
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        const state = snapshot()
        if (state !== undefined) {
          write(key, state)
        }
      }, delay)
    )
  }

  /* 删除单个键 */
  function remove(key: string): void {
    cancel(key)
    try {
      localStorage.removeItem(options.prefix + key)
    } catch {
      /* 本地存储不可用时忽略 */
    }
  }

  /* 清理失效键 */
  function cleanup(validKeys: string[]): void {
    const valid = new Set(validKeys)
    for (const key of timers.keys()) {
      if (!valid.has(key)) {
        cancel(key)
      }
    }
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const storageKey = localStorage.key(index)
        if (!storageKey || !storageKey.startsWith(options.prefix)) {
          continue
        }
        const key = storageKey.slice(options.prefix.length)
        if (!valid.has(key)) {
          localStorage.removeItem(storageKey)
        }
      }
    } catch {
      /* 本地存储不可用时忽略 */
    }
  }

  return { read, write, schedule, cancel, remove, cleanup }
}
