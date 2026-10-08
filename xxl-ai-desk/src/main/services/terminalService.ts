/*
 * 本地终端服务：以 node-pty 启动系统 Shell 的伪终端（PTY），
 * 输出经事件总线推送渲染进程，输入/尺寸变更由 IPC 驱动。
 */

import { app } from 'electron'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { existsSync, statSync } from 'fs'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import type { TerminalCreateInput, TerminalDTO, TerminalEvent } from '../../shared/ipc'

/* 受管终端会话：id → PTY 进程 */
interface TerminalSession {
  id: string /* 终端标识 */
  cwd: string /* 工作目录 */
  shell: string /* 启动的 Shell 可执行路径 */
  pty: IPty /* node-pty 伪终端进程 */
}

const sessions = new Map<string, TerminalSession>()

/* 终端事件总线：向渲染进程广播输出片段与退出事件 */
const emitter = new EventEmitter()

/* 选择默认 Shell：Windows 取 COMSPEC，其它平台取登录 Shell，兜底 bash */
function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
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

/* 创建终端：启动本地 Shell 伪终端并回传标识 */
export function createTerminal(input?: TerminalCreateInput): TerminalDTO {
  const id = randomUUID()
  const cwd = resolveCwd(input?.cwd)
  const shell = defaultShell()
  const cols = input?.cols && input.cols > 0 ? input.cols : 80
  const rows = input?.rows && input.rows > 0 ? input.rows : 24

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' } as { [key: string]: string }
  })

  sessions.set(id, { id, cwd, shell, pty: ptyProcess })

  /* 输出片段 → 广播；进程退出 → 广播并回收会话 */
  ptyProcess.onData((data) => emitter.emit('event', { id, type: 'data', data } as TerminalEvent))
  ptyProcess.onExit(({ exitCode }) => {
    sessions.delete(id)
    emitter.emit('event', { id, type: 'exit', exitCode } as TerminalEvent)
  })

  return { id, cwd, shell }
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
  try {
    session.pty.kill()
  } catch {
    /* 进程可能已退出 */
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
