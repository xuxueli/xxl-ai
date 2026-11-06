/*
 * 文件域跨进程契约：目录项与文件读取结果。
 */

/* 文件树节点（目录懒加载，children 由前端按需请求） */
export interface FsEntry {
  /* 名称 */
  name: string
  /* 绝对路径 */
  path: string
  /* 是否目录 */
  isDir: boolean
}

/* 文件读取结果（文本预览；图片附带 dataUrl 供内联预览） */
export interface FileContent {
  /* 绝对路径 */
  path: string
  /* 文件名 */
  name: string
  /* 文本内容（二进制文件为空串） */
  content: string
  /* 文件字节大小 */
  size: number
  /* 因体积超限被截断 */
  truncated: boolean
  /* 判定为二进制（不可文本预览） */
  binary: boolean
  /* 图片预览数据 URL（仅可预览图片提供） */
  dataUrl?: string
}
