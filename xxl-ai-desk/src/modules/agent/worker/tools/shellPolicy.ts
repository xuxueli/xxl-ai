/*
 * 终端命令策略：危险命令识别与越界路径解析（纯函数，便于单测与复用）。
 *   - 危险命令：命中即拒绝，覆盖删根 / 格式化 / 提权 / 远端脚本直执行等；
 *   - 越界路径：只识别命令中的静态路径（cd、重定向、绝对路径、~、相对 ..），
 *     动态展开（$VAR / 命令替换）不参与判定；
 *   - 代码文本（heredoc 正文、脚本片段、注释、URL）不是路径，不触发越界审批；
 *   - 无害设备路径（/dev/null 等）仅丢弃或回显输出，不参与越界与危险判定。
 *
 * @author xuxueli 2026-10-31
 */

import { homedir } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { outsidePath } from '@modules/agent/worker/sandbox'

/* 无害设备路径：只做输出丢弃 / 回显，不写真实文件，无需越界审批 */
const HARMLESS_DEVICE_PATHS = new Set(['/dev/null', '/dev/stdin', '/dev/stdout', '/dev/stderr'])

/* 是否为无害设备路径（仅标准输入 / 输出 / 错误三个文件描述符，避免放行任意 fd） */
function isHarmlessDevice(absPath: string): boolean {
  return HARMLESS_DEVICE_PATHS.has(absPath) || /^\/dev\/fd\/[012]$/.test(absPath)
}

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
    /* 重定向覆盖系统目录（/dev/null 等无害设备除外） */
    pattern:
      />\s*\/(etc|usr|bin|sbin|boot|dev|var|System)\/(?!null\b|stdin\b|stdout\b|stderr\b|fd\/[012]\b)/i,
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

/* 从一行里识别 heredoc 起始标记；引号内的 << 不算标记 */
function heredocMarker(line: string): { delimiter: string; stripIndent: boolean } | null {
  let quote = ''
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quote) {
      if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char !== '<' || line[index + 1] !== '<') {
      continue
    }
    const match = /^<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/.exec(line.slice(index))
    if (match) {
      return { delimiter: match[3], stripIndent: match[1] === '-' }
    }
  }
  return null
}

/*
 * 去掉 heredoc 正文：<<'EOF' 与结束标记 EOF 之间是文件正文 / 脚本内容，
 * 其中出现的「/」「a/b」等片段不是命令访问的路径，不参与越界判定。
 */
function stripHeredocs(command: string): string {
  const lines = command.split('\n')
  const kept: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    kept.push(line)
    const marker = heredocMarker(line)
    if (!marker) {
      continue
    }
    /* 跳过正文，只保留结束标记行，避免正文参与后续分词 */
    for (index += 1; index < lines.length; index += 1) {
      const body = marker.stripIndent ? lines[index].replace(/^\t+/, '') : lines[index]
      if (body === marker.delimiter) {
        kept.push(lines[index])
        break
      }
    }
  }
  return kept.join('\n')
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
      } else if (char === '\n' || char === '\r') {
        /* 未闭合引号止于行尾：避免一行代码把后续多行文本吞成一个「路径」 */
        quote = ''
        current = ''
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

/* 是否为「像路径」的 token：命令里的代码文本、注释、URL 等不能当作越界路径 */
function looksLikePath(value: string): boolean {
  /* 多行文本（脚本正文 / heredoc 残留）不是路径 */
  if (/[\r\n]/.test(value)) {
    return false
  }
  /* 转义换行等代码片段（"\nconst x = ..."）不是路径 */
  if (/\\[nrt]/.test(value)) {
    return false
  }
  /* 注释（// /* *\/）与协议地址（http:// 等）不是本地路径 */
  if (/^\/[/*]/.test(value) || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) {
    return false
  }
  /* 句首斜杠紧跟空白属于正文，不是路径 */
  if (/^[~/]+\s/.test(value)) {
    return false
  }
  /* 超过文件系统路径长度上限的文本不是路径 */
  return value.length <= 512
}

/* 把 token 解析为绝对路径；非静态路径（命令替换 / 变量展开）返回空串 */
function absoluteToken(rootDir: string, token: string): string {
  const value = token.replace(/^['"]|['"]$/g, '')
  if (!value || /\$|`/.test(value) || !looksLikePath(value)) {
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
 * 返回去重后的全部命中；动态展开不参与判定。
 */
export function findOutsideTargets(command: string, rootDir: string): string[] {
  const tokens = tokenize(stripHeredocs(command))
  const hits = new Set<string>()
  const check = (token: string | undefined): void => {
    if (!token) {
      return
    }
    const abs = absoluteToken(rootDir, token)
    /* 无害设备路径（/dev/null 等）不产生越界命中 */
    if (!abs || isHarmlessDevice(abs)) {
      return
    }
    const outside = outsidePath(rootDir, abs)
    if (outside) {
      hits.add(outside)
    }
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (/^\d?&?>>?$/.test(token) || token === 'cd' || token === 'pushd') {
      check(tokens[index + 1])
    }
  }
  /* 跳过首个 token（命令名可能本身是绝对路径的可执行文件） */
  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index].startsWith('-')) {
      continue
    }
    check(tokens[index])
  }
  return [...hits]
}
