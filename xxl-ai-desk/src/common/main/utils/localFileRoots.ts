/*
 * 本地文件协议允许根目录注册表：各域登记自己的根目录提供者。
 *   - 提供者按需计算（项目列表、笔记目录会随配置变化）；
 *   - 同一 key 重复登记时覆盖，避免热更新 / 重复初始化累积；
 *   - 单个提供者异常不影响其它域。
 * @author xuxueli 2026-11-08
 */

type LocalFileRootProvider = () => string | string[]

const providers = new Map<string, LocalFileRootProvider>()

/* 登记某个域的允许根（key 使用模块名） */
export function registerLocalFileRoot(key: string, provider: LocalFileRootProvider): void {
  providers.set(key, provider)
}

/* 汇总全部允许根：去重，异常提供者跳过 */
export function listLocalFileRoots(): string[] {
  const roots = new Set<string>()
  for (const provider of providers.values()) {
    try {
      const value = provider()
      const items = Array.isArray(value) ? value : [value]
      for (const item of items) {
        if (item) {
          roots.add(item)
        }
      }
    } catch {
      /* 根目录暂不可用：忽略该域，不影响其它根 */
    }
  }
  return [...roots]
}
