/*
 * 文件类型单一来源：图片 / 音视频 / 字幕的扩展名、MIME 与类别判定。
 * 供渲染层预览与主进程 `desk-file` 响应共用；只收录 Chromium 原生可处理的格式。
 */

/* 媒体类别 */
export type MediaKind = 'video' | 'audio'

/* 扩展名 → 图片 MIME */
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.apng': 'image/apng',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
}

/* 扩展名 → 媒体类别 + MIME */
const MEDIA_TYPES: Record<string, { kind: MediaKind; mime: string }> = {
  '.mp4': { kind: 'video', mime: 'video/mp4' },
  '.m4v': { kind: 'video', mime: 'video/x-m4v' },
  '.webm': { kind: 'video', mime: 'video/webm' },
  '.ogv': { kind: 'video', mime: 'video/ogg' },
  '.mov': { kind: 'video', mime: 'video/quicktime' },
  '.mp3': { kind: 'audio', mime: 'audio/mpeg' },
  '.wav': { kind: 'audio', mime: 'audio/wav' },
  '.ogg': { kind: 'audio', mime: 'audio/ogg' },
  '.oga': { kind: 'audio', mime: 'audio/ogg' },
  '.opus': { kind: 'audio', mime: 'audio/ogg' },
  '.weba': { kind: 'audio', mime: 'audio/webm' },
  '.m4a': { kind: 'audio', mime: 'audio/mp4' },
  '.m4b': { kind: 'audio', mime: 'audio/mp4' },
  '.aac': { kind: 'audio', mime: 'audio/aac' },
  '.flac': { kind: 'audio', mime: 'audio/flac' }
}

/* 扩展名 → 字幕 MIME（track 仅支持 WebVTT） */
const SUBTITLE_TYPES: Record<string, string> = {
  '.vtt': 'text/vtt'
}

/* 取扩展名（小写含点，忽略 query / hash） */
function extensionOf(value: string): string {
  const clean = value.split(/[?#]/)[0] ?? ''
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot).toLowerCase() : ''
}

/* 图片 MIME（非图片返回空串） */
export function imageMimeOf(value: string): string {
  return IMAGE_TYPES[extensionOf(value)] ?? ''
}

/* 判定媒体类别：支持普通路径/URL 与 data:video|audio 内联数据；非媒体返回 null */
export function mediaKindOf(value: string): MediaKind | null {
  const inline = /^data:(video|audio)\//i.exec(value)
  if (inline) {
    return inline[1].toLowerCase() as MediaKind
  }
  return MEDIA_TYPES[extensionOf(value)]?.kind ?? null
}

/* 媒体 MIME（非媒体返回空串） */
export function mediaMimeOf(value: string): string {
  return MEDIA_TYPES[extensionOf(value)]?.mime ?? ''
}

/* 字幕 MIME（非字幕返回空串） */
export function subtitleMimeOf(value: string): string {
  return SUBTITLE_TYPES[extensionOf(value)] ?? ''
}

/* 文件 MIME 汇总：供 desk-file 协议按扩展名返回 Content-Type */
export function mimeOf(value: string): string {
  return imageMimeOf(value) || mediaMimeOf(value) || subtitleMimeOf(value)
}
