/*
 * 本地终端服务：以 node-pty 启动系统 Shell 的伪终端（PTY），
 * 输出经事件总线推送渲染进程，输入/尺寸变更由 IPC 驱动。
 */

import { app } from 'electron'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { t } from '@common/main/i18n'
import type { TerminalAttachResult, TerminalChunk, TerminalCreateInput, TerminalDTO, TerminalEvent } from '@modules/terminal/shared'
import {
  buildRuntimePath,
  getRuntimeShellDir,
  runtimePathPrefix
} from '@modules/platform/main'

/* 受管终端会话：id → PTY 进程 */
interface TerminalSession {
  id: string /* 终端标识 */
  sessionId: string /* 所属会话 */
  cwd: string /* 工作目录 */
  shell: string /* 启动的 Shell 可执行路径 */
  pty: IPty /* node-pty 伪终端进程 */
  seq: number /* 输出序号（终端内单调递增） */
  chunks: TerminalChunk[] /* 输出环形缓冲（用于会话切换后回放） */
  bufferedBytes: number /* 缓冲当前字节数 */
}

/* 每个终端保留的输出缓冲上限（字节）：切回会话时回放，超出后丢弃最旧片段 */
const MAX_BUFFER_BYTES = 256 * 1024

const sessions = new Map<string, TerminalSession>()

/* 会话 → 终端实例集合索引（按会话列举与级联回收） */
const sessionIndex = new Map<string, Set<string>>()

/* 终端事件总线：向渲染进程广播输出片段与退出事件 */
const emitter = new EventEmitter()

/* 选择默认 Shell：Windows 取 COMSPEC，其它平台取登录 Shell，兜底 bash */
function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

/* shell 单引号字符串（内部单引号按 POSIX 规则转义） */
function singleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/* shell 双引号字符串（转义 \ " $ 反引号，用于需要展开 $PATH 的场景） */
function doubleQuote(value: string): string {
  return `"${value.replace(/[\\"$`]/g, (char) => `\\${char}`)}"`
}

/*
 * 生成「命令运行环境」shell 包装脚本：
 *   先加载用户自身配置（保留别名 / 提示符等），再按设置把运行时目录前置到 PATH。
 *   返回启动参数与需追加的环境变量；无法识别的 shell 返回空（退化为纯环境注入）。
 */
function prepareRuntimeShell(shellPath: string): {
  args: string[]
  env: Record<string, string>
} {
  const name = basename(shellPath).toLowerCase()
  const home = process.env.HOME || app.getPath('home')
  /* 仅处理 POSIX shell：前缀目录 + 展开 $PATH，保证设置优先且保留用户其它路径 */
  const prefix = runtimePathPrefix().join(':')
  const exportLine = `export PATH=${doubleQuote(prefix)}:$PATH`

  if (name === 'zsh') {
    const dir = join(getRuntimeShellDir(), 'zsh')
    mkdirSync(dir, { recursive: true })
    /* .zshenv 转发用户配置；.zshrc 先加载用户配置再覆盖 PATH */
    writeFileSync(
      join(dir, '.zshenv'),
      [
        '# XXL-AI-Desk: 转发用户 .zshenv',
        `[ -f ${singleQuote(join(home, '.zshenv'))} ] && . ${singleQuote(join(home, '.zshenv'))}`,
        ''
      ].join('\n'),
      'utf-8'
    )
    writeFileSync(
      join(dir, '.zshrc'),
      [
        '# XXL-AI-Desk: 加载用户配置后按「命令运行环境」覆盖 PATH',
        `[ -f ${singleQuote(join(home, '.zshrc'))} ] && . ${singleQuote(join(home, '.zshrc'))}`,
        exportLine,
        ''
      ].join('\n'),
      'utf-8'
    )
    return { args: ['-i'], env: { ZDOTDIR: dir } }
  }
  if (name === 'bash') {
    const dir = join(getRuntimeShellDir(), 'bash')
    mkdirSync(dir, { recursive: true })
    const rcFile = join(dir, 'bashrc')
    writeFileSync(
      rcFile,
      [
        '# XXL-AI-Desk: 加载用户配置后按「命令运行环境」覆盖 PATH',
        `[ -f ${singleQuote(join(home, '.bashrc'))} ] && . ${singleQuote(join(home, '.bashrc'))}`,
        exportLine,
        ''
      ].join('\n'),
      'utf-8'
    )
    return { args: ['--rcfile', rcFile, '-i'], env: {} }
  }
  return { args: [], env: {} }
}

/* 组装 PTY 环境变量：注入运行时 PATH（Node / Python），兜底 UTF-8 Locale */
function buildEnv(): { [key: string]: string } {
  const env = { ...process.env } as { [key: string]: string }
  env.TERM = 'xterm-256color'
  /* 注入设置中配置的 Node / Python 运行环境（终端面板与 Agent 执行命令保持一致） */
  env.PATH = buildRuntimePath(env.PATH ?? '')
  /* 类 Unix：GUI 启动的进程常缺 LANG/LC_*，无 UTF-8 locale 时补默认值 */
  if (process.platform !== 'win32') {
    const isUtf8 = (value?: string): boolean => !!value && /utf-?8/i.test(value)
    if (!isUtf8(env.LANG) && !isUtf8(env.LC_ALL) && !isUtf8(env.LC_CTYPE)) {
      env.LANG = 'en_US.UTF-8'
      env.LC_CTYPE = 'en_US.UTF-8'
    }
  }
  return env
}

/* 解析工作目录：入参目录需存在且为目录，否则回退用户主目录 */
function resolveCwd(cwd?: string): string {
  if (cwd && existsSync(cwd)) {
    try {
      if (statSync(cwd).isDirectory()) {
        return cwd
      }
    } catch {
      /* 目录不可访问时回退 */
    }
  }
  return app.getPath('home')
}

/* 终端实例信息转换 */
function toDTO(session: TerminalSession): TerminalDTO {
  return {
    id: session.id,
    sessionId: session.sessionId,
    cwd: session.cwd,
    shell: session.shell
  }
}

/* 会话索引：登记终端归属 */
function indexSession(sessionId: string, terminalId: string): void {
  let ids = sessionIndex.get(sessionId)
  if (!ids) {
    ids = new Set()
    sessionIndex.set(sessionId, ids)
  }
  ids.add(terminalId)
}

/* 会话索引：移除终端归属 */
function unindexSession(sessionId: string, terminalId: string): void {
  const ids = sessionIndex.get(sessionId)
  if (!ids) {
    return
  }
  ids.delete(terminalId)
  if (ids.size === 0) {
    sessionIndex.delete(sessionId)
  }
}

/* 追加输出片段到环形缓冲：超出上限丢弃最旧片段 */
function appendChunk(session: TerminalSession, data: string): void {
  session.seq += 1
  const chunk: TerminalChunk = { seq: session.seq, data }
  session.chunks.push(chunk)
  session.bufferedBytes += Buffer.byteLength(data)
  while (session.bufferedBytes > MAX_BUFFER_BYTES && session.chunks.length > 0) {
    const removed = session.chunks.shift()
    if (!removed) {
      break
    }
    session.bufferedBytes -= Buffer.byteLength(removed.data)
  }
}

/* 终端资源上限：单会话标签数 / 全局活动终端数 */
const MAX_TERMINALS_PER_SESSION = 4
const MAX_TERMINALS_TOTAL = 16

/* 创建终端：启动本地 Shell 伪终端并回传标识（必须归属会话） */
export function createTerminal(input: TerminalCreateInput): TerminalDTO {
  const sessionId = input.sessionId?.trim()
  if (!sessionId) {
    throw new Error(t('runtime.error.terminalSessionRequired'))
  }
  /* 资源上限：避免长期运行持续累积 PTY 进程 */
  if (sessions.size >= MAX_TERMINALS_TOTAL) {
    throw new Error(t('runtime.error.terminalLimit', [MAX_TERMINALS_TOTAL]))
  }
  if ((sessionIndex.get(sessionId)?.size ?? 0) >= MAX_TERMINALS_PER_SESSION) {
    throw new Error(t('runtime.error.terminalSessionLimit', [MAX_TERMINALS_PER_SESSION]))
  }
  const id = randomUUID()
  const cwd = resolveCwd(input.cwd)
  const shell = defaultShell()
  const cols = input.cols && input.cols > 0 ? input.cols : 80
  const rows = input.rows && input.rows > 0 ? input.rows : 24

  /* 组装环境与 shell 启动参数：按「命令运行环境」设置覆盖 PATH（加载用户配置后再前置） */
  const env = buildEnv()
  const shellLaunch = prepareRuntimeShell(shell)
  Object.assign(env, shellLaunch.env)

  let ptyProcess: IPty
  try {
    ptyProcess = pty.spawn(shell, shellLaunch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env
    })
  } catch (error) {
    /* posix_spawnp failed 多由 spawn-helper 缺少可执行权限或 Shell 路径失效导致 */
    const detail = (error as Error).message || '未知错误'
    throw new Error(t('runtime.error.terminalStartFailed', [shell, detail]))
  }

  const session: TerminalSession = {
    id,
    sessionId,
    cwd,
    shell,
    pty: ptyProcess,
    seq: 0,
    chunks: [],
    bufferedBytes: 0
  }
  sessions.set(id, session)
  indexSession(sessionId, id)

  /* 输出片段 → 写入环形缓冲并广播；进程退出 → 广播并回收会话 */
  ptyProcess.onData((data) => {
    const current = sessions.get(id)
    if (!current) {
      return
    }
    appendChunk(current, data)
    emitter.emit('event', {
      id,
      sessionId: current.sessionId,
      seq: current.seq,
      type: 'data',
      data
    } as TerminalEvent)
  })
  ptyProcess.onExit(({ exitCode }) => {
    const current = sessions.get(id)
    if (!current) {
      return
    }
    current.seq += 1
    sessions.delete(id)
    unindexSession(current.sessionId, id)
    emitter.emit('event', {
      id,
      sessionId: current.sessionId,
      seq: current.seq,
      type: 'exit',
      exitCode
    } as TerminalEvent)
  })

  return toDTO(session)
}

/* 列举某会话存活的终端实例 */
export function listTerminals(sessionId: string): TerminalDTO[] {
  const ids = sessionIndex.get(sessionId)
  if (!ids) {
    return []
  }
  const list: TerminalDTO[] = []
  for (const id of ids) {
    const session = sessions.get(id)
    if (session) {
      list.push(toDTO(session))
    }
  }
  return list
}

/* 重连终端：返回实例信息、最新序号与历史输出片段；实例不存在时返回 null */
export function attachTerminal(id: string): TerminalAttachResult | null {
  const session = sessions.get(id)
  if (!session) {
    return null
  }
  return {
    terminal: toDTO(session),
    seq: session.seq,
    chunks: [...session.chunks]
  }
}

/* 写入终端输入 */
export function writeTerminal(id: string, data: string): void {
  sessions.get(id)?.pty.write(data)
}

/* 调整终端尺寸 */
export function resizeTerminal(id: string, cols: number, rows: number): void {
  if (cols > 0 && rows > 0) {
    sessions.get(id)?.pty.resize(cols, rows)
  }
}

/* 关闭终端并回收进程 */
export function disposeTerminal(id: string): void {
  const session = sessions.get(id)
  if (!session) {
    return
  }
  sessions.delete(id)
  unindexSession(session.sessionId, id)
  try {
    session.pty.kill()
  } catch {
    /* 进程可能已退出 */
  }
}

/* 关闭某会话的全部终端（删除会话时级联回收） */
export function disposeTerminalsBySession(sessionId: string): void {
  const ids = sessionIndex.get(sessionId)
  if (!ids) {
    return
  }
  for (const id of [...ids]) {
    disposeTerminal(id)
  }
}

/* 终端归属会话迁移：新建对话草稿（__draft__）首次落库后归入真实会话 */
export function reassignTerminals(fromSessionId: string, toSessionId: string): void {
  const ids = sessionIndex.get(fromSessionId)
  if (!ids || !toSessionId || fromSessionId === toSessionId) {
    return
  }
  for (const id of [...ids]) {
    const session = sessions.get(id)
    if (!session) {
      continue
    }
    session.sessionId = toSessionId
    unindexSession(fromSessionId, id)
    indexSession(toSessionId, id)
  }
}

/* 关闭全部终端（应用退出时调用） */
export function disposeAllTerminals(): void {
  for (const id of [...sessions.keys()]) {
    disposeTerminal(id)
  }
}

/* 订阅终端事件（IPC 层转发给渲染进程） */
export function onTerminalEvent(listener: (event: TerminalEvent) => void): void {
  emitter.on('event', listener)
}
