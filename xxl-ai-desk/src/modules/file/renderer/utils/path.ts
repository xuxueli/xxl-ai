/*
 * 工具面板文件路径工具：统一分隔符与父目录解析（纯函数）。
 * @author xuxueli 2026-10-25
 */

/* 统一路径分隔符，便于跨平台比较 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

/* 取文件所在目录（统一正斜杠） */
export function parentDir(file: string): string {
  const normalized = normalizePath(file)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index)
}

/* 取路径末级名称（兼容末尾分隔符） */
export function baseName(path: string): string {
  const normalized = normalizePath(path).replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index < 0 ? normalized : normalized.slice(index + 1)
}
