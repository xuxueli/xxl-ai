/*
 * 本地文件 URL 工具：把项目内的绝对路径转成 `desk-file` 协议地址。
 * 供 Markdown 图片/媒体与文件预览共用，避免渲染层直接使用 file://（会被 CSP 与安全策略拦截）。
 *
 * @author xuxueli 2026-10-31
 */

/* 本地绝对路径 → 本地文件协议 URL：逐段编码，避免 # ? 等字符截断路径 */
export function toLocalFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const absolute = normalized.startsWith('/') ? normalized : `/${normalized}`
  const encoded = absolute
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `desk-file://local${encoded}`
}
