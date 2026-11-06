/*
 * 终端域跨进程契约：PTY 实例创建入参、实例信息、输出片段与流事件。
 *   - 终端归属会话（sessionId）：按会话创建、列举、重连与回收；
 *   - 每个输出片段带自增 seq，配合主进程环形缓冲支持切换会话后的回放续接。
 */

/* 终端创建入参：sessionId 为所属会话，cwd 为工作目录（通常为项目目录），缺省回退用户主目录 */
export interface TerminalCreateInput {
  /* 所属会话 ID */
  sessionId: string
  /* 工作目录 */
  cwd?: string
  /* 终端列数 */
  cols?: number
  /* 终端行数 */
  rows?: number
}

/* 终端实例信息 */
export interface TerminalDTO {
  /* 终端实例 ID */
  id: string
  /* 所属会话 ID */
  sessionId: string
  /* 工作目录 */
  cwd: string
  /* 使用的 shell */
  shell: string
}

/* 终端输出片段（环形缓冲元素） */
export interface TerminalChunk {
  /* 输出序号（终端内单调递增） */
  seq: number
  /* 输出片段 */
  data: string
}

/* 终端重连结果：实例信息 + 当前序号 + 历史输出片段 */
export interface TerminalAttachResult {
  /* 终端实例信息 */
  terminal: TerminalDTO
  /* 当前最新序号（回放片段的末尾） */
  seq: number
  /* 历史输出片段（按 seq 升序） */
  chunks: TerminalChunk[]
}

/* 终端流事件（主 → 渲染）：data 为输出片段，exit 为进程退出 */
export interface TerminalEvent {
  /* 终端实例 ID */
  id: string
  /* 所属会话 ID */
  sessionId: string
  /* 输出序号（终端内单调递增） */
  seq: number
  /* 事件类型：data 输出 / exit 退出 */
  type: 'data' | 'exit'
  /* 输出片段（data） */
  data?: string
  /* 退出码（exit） */
  exitCode?: number
}
