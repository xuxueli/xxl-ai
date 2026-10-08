/*
 * 命令运行环境服务：为 Agent 执行命令与终端面板解析 Node / Python 运行环境并组装 PATH。
 *   - Node 内置：以 Electron 自身作为 node（ELECTRON_RUN_AS_NODE），生成 shim 暴露 `node` 命令；
 *   - Node 自定义 / Python 自定义：取所选可执行文件目录注入 PATH（自定义优先）；
 *   - Python 留空：自动探测系统 python3 / python。
 * GUI 启动的进程默认 PATH 不含 Homebrew 等目录，故补充常见包管理器目录作为兜底。
 */

import { execFile } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { delimiter, dirname, isAbsolute, join } from 'path'
import { getDataDir } from './storageService'
import { getSettings } from './settingsService'
import type { RuntimeDetectResult, RuntimeExecInput } from '../../shared/ipc'

/* Electron 内置 Node shim 所在目录：随数据目录迁移，避免污染系统 */
export function getRuntimeBinDir(): string {
  return join(getDataDir(), 'runtime', 'bin')
}

/* shim 文件名（Windows 需 .cmd 后缀才能被 shell 作为命令解析） */
function shimFileName(): string {
  return process.platform === 'win32' ? 'node.cmd' : 'node'
}

/* 单引号/双引号包裹路径，避免空格导致命令解析失败 */
function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

/*
 * 生成「内置 Node」shim：内容为携带 ELECTRON_RUN_AS_NODE=1 调用 Electron 可执行文件。
 * 仅在内容变化时重写（含权限位），避免频繁落盘。
 */
export function ensureBuiltinNodeShim(): string {
  const binDir = getRuntimeBinDir()
  mkdirSync(binDir, { recursive: true })
  const shim = join(binDir, shimFileName())
  const execPath = process.execPath
  const content =
    process.platform === 'win32'
      ? `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n${quote(execPath)} %*\r\n`
      : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quote(execPath)} "$@"\n`
  let current = ''
  try {
    current = existsSync(shim) ? readFileSync(shim, 'utf-8') : ''
  } catch {
    /* 读取失败按需重写 */
  }
  if (current !== content) {
    writeFileSync(shim, content, 'utf-8')
    if (process.platform !== 'win32') {
      chmodSync(shim, 0o755)
    }
  }
  return binDir
}

/* 非 Windows 常见包管理器目录：GUI 启动的进程默认 PATH 不含，补充后可命中 Homebrew 等安装的 node/python */
function commonBinDirs(): string[] {
  if (process.platform === 'win32') {
    return []
  }
  return ['/opt/homebrew/bin', '/usr/local/bin'].filter((dir) => existsSync(dir))
}

/* 去重拼接目录列表（保持顺序：越靠前优先级越高） */
function joinUniqueDirs(dirs: string[], basePath: string): string {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const dir of [...dirs, ...basePath.split(delimiter)]) {
    if (dir && !seen.has(dir)) {
      seen.add(dir)
      ordered.push(dir)
    }
  }
  return ordered.join(delimiter)
}

/* 按运行时 PATH 把命令名解析为绝对路径（与 shell 的 which/where 等价），找不到返回 null */
function resolveCommandPath(command: string): string | null {
  const dirs = buildRuntimePath().split(delimiter)
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : ['']
  for (const dir of dirs) {
    if (!dir) {
      continue
    }
    for (const ext of exts) {
      const candidate = join(dir, command + ext)
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return candidate
        }
      } catch {
        /* 目录不可访问时跳过 */
      }
    }
  }
  return null
}

/*
 * 依据当前设置组装运行时 PATH 前缀目录（保持顺序，已去重）：自定义 Node 目录 / 内置 Node shim / 自定义 Python 目录 / 常见目录。
 * 终端据此在加载用户 shell 配置后重新前置；Agent 执行命令据此前置到进程 PATH。
 */
export function runtimePathPrefix(): string[] {
  const settings = getSettings()
  const dirs: string[] = []
  const nodePath = settings.runtimeNodePath.trim()
  if (settings.runtimeNodeMode === 'custom' && nodePath) {
    dirs.push(dirname(nodePath))
  } else {
    /* 内置，或已选自定义但路径为空：回退内置 Node */
    dirs.push(ensureBuiltinNodeShim())
  }
  const pythonPath = settings.runtimePythonPath.trim()
  if (pythonPath) {
    dirs.push(dirname(pythonPath))
  }
  dirs.push(...commonBinDirs())
  return [...new Set(dirs.filter(Boolean))]
}

/* 依据当前设置组装完整运行时 PATH：前缀目录前置到原 PATH */
export function buildRuntimePath(basePath: string = process.env.PATH ?? ''): string {
  return joinUniqueDirs(runtimePathPrefix(), basePath)
}

/* 终端 shell 包装脚本目录（按设置的优先级重排 PATH） */
export function getRuntimeShellDir(): string {
  return join(getDataDir(), 'runtime', 'shell')
}

/* 执行命令并返回首行输出版本号（python 可能输出到 stderr，一并拼接） */
function execVersion(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout: 5000,
        env: { ...process.env, PATH: buildRuntimePath() },
        /* Windows 下 shim 为 .cmd，需经 shell 解析 */
        shell: process.platform === 'win32'
      },
      (error, stdout, stderr) => {
        const output = `${stdout || ''}${stderr || ''}`.trim().split('\n')[0]?.trim() ?? ''
        if (output) {
          resolve(output)
          return
        }
        reject(error ?? new Error('未获取到版本信息'))
      }
    )
  })
}

/*
 * 检测运行时可执行文件版本：
 *   - node：带 path 用外部 Node，省略则用内置 Node；
 *   - python：带 path 用指定解释器，省略则按 python3 → python 顺序自动探测（解析为绝对路径）。
 */
export async function detectExecutable(input: RuntimeExecInput): Promise<RuntimeDetectResult> {
  const raw = input.path?.trim() ?? ''
  /* 非绝对路径（如直接填命令名 node / python3）先按运行时 PATH 解析为绝对路径 */
  const path = raw && !isAbsolute(raw) ? resolveCommandPath(raw) ?? raw : raw
  try {
    if (input.kind === 'node') {
      const target = path || join(ensureBuiltinNodeShim(), shimFileName())
      const version = await execVersion(target, ['--version'])
      return { ok: true, version, path: target, message: '' }
    }
    if (path) {
      const version = await execVersion(path, ['--version'])
      return { ok: true, version, path, message: '' }
    }
    for (const candidate of ['python3', 'python']) {
      const resolved = resolveCommandPath(candidate)
      if (!resolved) {
        continue
      }
      try {
        const version = await execVersion(resolved, ['--version'])
        return { ok: true, version, path: resolved, message: '' }
      } catch {
        /* 尝试下一个候选命令 */
      }
    }
    return { ok: false, version: '', path: '', message: '未检测到 Python，请手动选择解释器路径' }
  } catch (error) {
    return { ok: false, version: '', path, message: (error as Error).message }
  }
}
