/*
 * 笔记路径工具：渲染层只做展示所需的纯字符串处理。
 * @author xuxueli 2026-11-08
 */

/* 父目录（兼容 / 与 \） */
export function parentDir(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index > 0 ? path.slice(0, index) : path
}

/* 名称（路径最后一段） */
export function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index >= 0 ? path.slice(index + 1) : path
}

/* 是否位于某目录下（含目录本身） */
export function isUnder(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`) || path.startsWith(`${dir}\\`)
}
