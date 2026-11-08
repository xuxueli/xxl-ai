/*
 * 系统域跨进程契约：运行时信息、可执行文件检测、客户端更新与系统外壳能力。
 * @author xuxueli 2026-11-07
 */

/* 运行时可执行文件检测入参 */
export interface RuntimeExecInput {
  /* 运行时类型：node / python */
  kind: 'node' | 'python'
  /* 可执行文件路径；node 省略时使用内置 Node，python 省略时自动探测 */
  path?: string
}

/* 运行时可执行文件检测结果 */
export interface RuntimeDetectResult {
  /* 是否检测通过 */
  ok: boolean
  /* 解析到的版本（如 v22.9.0 / Python 3.12.4） */
  version: string
  /* 实际使用的可执行文件路径或命令名 */
  path: string
  /* 失败提示（ok=false 时） */
  message: string
}

/* 运行时信息（版本 / 平台 / 数据目录） */
export interface RuntimeInfo {
  /* 应用版本 */
  version: string
  /* 运行平台（darwin / win32 / linux） */
  platform: string
  /* 当前数据目录 */
  dataDir: string
  /* 默认数据目录 */
  defaultDataDir: string
  /* SQLite 数据库文件路径 */
  dbFile: string
}

/* 客户端更新信息（引导式：检测 + 前往下载） */
export interface UpdateInfo {
  /* 是否有新版本 */
  hasUpdate: boolean
  /* 当前版本 */
  currentVersion: string
  /* 最新版本（去 v 前缀） */
  latestVersion: string
  /* release 页面地址 */
  releaseUrl: string
  /* 匹配到的安装包直链（可能为空） */
  downloadUrl: string
  /* release 说明正文 */
  notes: string
  /* 发布时间（ISO） */
  publishedAt: string
}

/* 可用「打开方式」应用（由主进程探测本机常见编辑器，供下拉选择） */
export interface OpenWithApp {
  /* 应用显示名 */
  name: string
  /* 应用可执行文件路径 */
  path: string
}
