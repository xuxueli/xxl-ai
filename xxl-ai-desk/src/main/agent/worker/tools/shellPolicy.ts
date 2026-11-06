/*
 * 终端命令策略：危险命令识别与越界路径解析（纯函数，便于单测与复用）。
 *   - 危险命令：命中即拒绝，覆盖删根 / 格式化 / 提权 / 远端脚本直执行等；
 *   - 越界路径：只识别命令中的静态路径（cd、重定向、绝对路径、~、相对 ..），
 *     动态展开（$VAR / 命令替换）不参与判定。
 *
 * @author xuxueli 2026-10-31
 */

import { homedir } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { outsidePath } from '../sandbox'

/* 危险命令规则：命中即拦截，返回可读原因 */
const DANGEROUS_RULES: Array<{ pattern: RegExp; reason: string }> = [
  {
    /* rm -rf /、rm -rf ~、rm -rf /* 等根目录/家目录递归删除 */
    pattern: /\brm\s+(-[a-z]*[rf][a-z]*\s+)+(\/|~|\$HOME|\/\*|\.\.)(\s|$|\/)/i,
    reason: '递归删除根目录或家目录'
  },
  {
    /* 格式化文件系统 / 写裸设备 */
    pattern: /\bmkfs(\.\w+)?\b|\bdd\b[^\n]*\bof=\/dev\//i,
    reason: '格式化磁盘或写入块设备'
  },
  {
    /* 关机、重启、停机 */
    pattern: /\b(shutdown|reboot|poweroff|halt)\b/i,
    reason: '关机或重启系统'
  },
  {
    /* 全局放开权限 / 改根目录属主 */
    pattern: /\bchmod\s+(-[a-z]+\s+)*0?777\s+\/(\s|$)/i,
    reason: '放开根目录写权限'
  },
  {
    /* 提权执行：交由用户手动确认（允许前置空白） */
    pattern: /(^|[;&|]\s*)\s*sudo\b/i,
    reason: '需要提权（sudo）'
  },
  {
    /* 重定向覆盖系统目录 */
    pattern: />\s*\/(etc|usr|bin|sbin|boot|dev|var|System)\//i,
    reason: '覆盖系统目录文件'
  },
  {
    /* 下载后直接交给 shell 执行 */
    pattern: /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(ba|z|k)?sh\b/i,
    reason: '下载内容直接交给 shell 执行'
  },
  {
    /* fork 炸弹 */
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason: 'fork 炸弹'
  }
]

/* 检测危险命令：命中返回原因，未命中返回 null */
export function detectDangerousCommand(command: string): string | null {
  const value = command.trim()
  if (!value) {
    return null
  }
  for (const rule of DANGEROUS_RULES) {
    if (rule.pattern.test(value)) {
      return rule.reason
    }
  }
  return null
}

/* 简易分词：按空白切分并保留引号内容，同时把 ; | & 作为分隔符 */
function tokenize(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote = ''
  for (const char of command) {
    if (quote) {
      if (char === quote) {
        quote = ''
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    if (char === ';' || char === '|' || char === '&') {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) {
    tokens.push(current)
  }
  return tokens
}

/* 把 token 解析为绝对路径；非静态路径（命令替换 / 变量展开）返回空串 */
function absoluteToken(rootDir: string, token: string): string {
  const value = token.replace(/^['"]|['"]$/g, '')
  if (!value || /\$|`/.test(value)) {
    return ''
  }
  if (value === '~' || value.startsWith('~/')) {
    return join(homedir(), value.slice(1))
  }
  if (isAbsolute(value)) {
    return value
  }
  /* 含分隔符的相对路径同样解析：覆盖 ../ 与 ./../../ 等越界写法 */
  if (value.includes('/')) {
    return resolve(rootDir, value)
  }
  return ''
}

/*
 * 识别命令中显式访问项目目录外的静态路径：
 *   - cd / pushd 目标；
 *   - 重定向目标（> >> 2> &>）；
 *   - 除命令名外的绝对路径 / ~ / 相对路径参数。
 * 未命中或动态展开返回 null，交由调用方按目录内处理。
 */
export function findOutsideTarget(command: string, rootDir: string): string | null {
  const tokens = tokenize(command)
  const check = (token: string | undefined): string | null => {
    if (!token) {
      return null
    }
    const abs = absoluteToken(rootDir, token)
    return abs ? outsidePath(rootDir, abs) : null
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (/^\d?&?>>?$/.test(token) || token === 'cd' || token === 'pushd') {
      const hit = check(tokens[index + 1])
      if (hit) {
        return hit
      }
    }
  }
  /* 跳过首个 token（命令名可能本身是绝对路径的可执行文件） */
  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index].startsWith('-')) {
      continue
    }
    const hit = check(tokens[index])
    if (hit) {
      return hit
    }
  }
  return null
}
