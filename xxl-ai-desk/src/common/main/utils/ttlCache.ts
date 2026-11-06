/*
 * 轻量 TTL 缓存：按 key 保存值并设置过期时间，超容量时淘汰最早写入项。
 *   供社区发现类服务（MCP / SKILL）复用，避免各自维护一份缓存实现。
 * @author xuxueli 2026-10-25
 */

/* 缓存条目 */
interface CacheEntry<T> {
  /* 过期时间戳（毫秒） */
  expireAt: number
  /* 缓存值 */
  value: T
}

/* 缓存配置 */
export interface TtlCacheOptions {
  /* 默认有效期（毫秒） */
  ttl: number
  /* 容量上限 */
  limit?: number
}

/* TTL 缓存 */
export interface TtlCache<T> {
  /* 读取（过期视为未命中） */
  get: (key: string) => T | null
  /* 写入（可覆盖 ttl） */
  set: (key: string, value: T, ttl?: number) => void
  /* 清空 */
  clear: () => void
}

/* 创建 TTL 缓存 */
export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const store = new Map<string, CacheEntry<T>>()
  const limit = options.limit ?? 100

  return {
    get(key) {
      const entry = store.get(key)
      if (!entry) {
        return null
      }
      if (entry.expireAt <= Date.now()) {
        store.delete(key)
        return null
      }
      return entry.value
    },
    set(key, value, ttl = options.ttl) {
      if (!store.has(key) && store.size >= limit) {
        const oldest = store.keys().next().value
        if (oldest) {
          store.delete(oldest)
        }
      }
      store.set(key, { expireAt: Date.now() + ttl, value })
    },
    clear() {
      store.clear()
    }
  }
}
