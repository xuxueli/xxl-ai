/*
 * 笔记应用跨进程契约：设置、目录项、笔记内容与图片落盘结果。
 * @author xuxueli 2026-11-08
 */

/* 笔记应用设置（配置值 + 生效值） */
export interface NoteSettings {
  /* 配置的存储目录（空表示使用默认目录） */
  storageDir: string
  /* 实际生效的存储目录 */
  resolvedStorageDir: string
  /* 默认存储目录（安装目录下 note） */
  defaultStorageDir: string
  /* 图片资源目录（{resolvedStorageDir}/resource/image） */
  imageDir: string
  /* 默认目录不可写而回退到数据目录 */
  storageFallback: boolean
}

/* 设置更新入参 */
export interface NoteSettingsPatch {
  storageDir?: string
}

/* 笔记目录项：目录或 .md 文件 */
export interface NoteEntry {
  /* 名称 */
  name: string
  /* 绝对路径 */
  path: string
  /* 相对笔记根目录的 POSIX 路径 */
  relativePath: string
  /* 是否目录 */
  isDir: boolean
}

/* 笔记内容 */
export interface NoteContent {
  /* 绝对路径 */
  path: string
  /* 文本内容 */
  content: string
  /* 最后修改时间（ISO） */
  updateTime: string
}

/* 图片落盘结果 */
export interface NoteSaveImageResult {
  /* 图片绝对路径 */
  path: string
  /* 相对当前笔记所在目录的 POSIX 路径 */
  relativePath: string
  /* 可直接插入正文的 Markdown 片段 */
  markdown: string
}
