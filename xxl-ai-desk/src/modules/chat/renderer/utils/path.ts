/*
 * 对话文件路径工具：把项目内绝对路径转为相对项目根目录的展示路径。
 * @author xuxueli 2026-11-07
 */

/* 相对项目根目录的路径：不在项目内时原样返回（兼容 Windows 分隔符） */
export function relativeToRoot(path: string, root: string): string {
  const normalizedPath = path.replace(/\\/g, '/')
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalizedRoot || !normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath
  }
  return normalizedPath.slice(normalizedRoot.length + 1)
}
