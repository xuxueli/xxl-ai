/*
 * MCP 配置片段工具：社区「安装配置」的可用性评分与解析（JSON / 命令行安装片段）。
 * @author xuxueli 2026-10-24
 */

/* 可解析出的 MCP 配置（字段与编辑表单对应） */
export interface ParsedMcpSnippet {
  /* 名称（片段中带名称时回填） */
  name: string
  /* 远程地址 */
  url: string
  /* 远程请求头 */
  headers: Record<string, string>
  /* 本地命令 */
  command: string
  /* 本地参数 */
  args: string[]
  /* 本地环境变量 */
  env: Record<string, string>
  /* 工作目录 */
  cwd: string
}

/* 允许解析的本地命令（避免把任意 shell 行当作 MCP 配置） */
const COMMANDS = ['npx', 'uvx', 'node', 'python', 'python3', 'bunx', 'deno']

/* 片段可用性评分：MCP JSON 与平台内命令优先，docker / 跨平台命令降权 */
export function scoreSnippet(snippet: string, platform: string): number {
  if (/"url"\s*:/.test(snippet)) {
    return 4
  }
  if (/"command"\s*:\s*"(npx|uvx|node|python3?|bunx?|deno)"/.test(snippet)) {
    return 3
  }
  if (/"command"\s*:\s*"cmd"/.test(snippet)) {
    return platform === 'win32' ? 2 : -3
  }
  if (/docker/i.test(snippet)) {
    return -2
  }
  if (/(^|\s)(npx|uvx|node|python3?)\s/.test(snippet)) {
    return 1
  }
  return 0
}

/* 选出最可用的一条片段（无候选时返回首条） */
export function pickSnippet(snippets: string[], platform: string): string {
  let best = ''
  let bestScore = -Infinity
  for (const snippet of snippets) {
    const score = scoreSnippet(snippet, platform)
    if (score > bestScore) {
      bestScore = score
      best = snippet
    }
  }
  return best
}

/* 解析 JSON 形式的 mcpServers / 单服务配置 */
function parseJsonSnippet(raw: string): ParsedMcpSnippet | null {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
  const servers = (parsed.mcpServers ?? parsed) as Record<string, unknown>
  let config: Record<string, unknown> | null = null
  /* 直接是单个服务配置（含 url / command） */
  if (typeof servers.url === 'string' || typeof servers.command === 'string') {
    config = servers
  } else {
    const entry = Object.entries(servers).find(
      ([, value]) =>
        value &&
        typeof value === 'object' &&
        (typeof (value as Record<string, unknown>).url === 'string' ||
          typeof (value as Record<string, unknown>).command === 'string')
    )
    if (entry) {
      config = entry[1] as Record<string, unknown>
    }
  }
  if (!config) {
    return null
  }
  const url = typeof config.url === 'string' ? config.url : ''
  const command = typeof config.command === 'string' ? config.command : ''
  if (!url && !command) {
    return null
  }
  return {
    name: typeof config.name === 'string' ? config.name : '',
    url,
    headers: (config.headers ?? {}) as Record<string, string>,
    command,
    args: Array.isArray(config.args) ? config.args.map((item) => String(item)) : [],
    env: (config.env ?? {}) as Record<string, string>,
    cwd: typeof config.cwd === 'string' ? config.cwd : ''
  }
}

/* 命令行分词：支持单/双引号包裹的参数 */
function tokenize(value: string): string[] {
  return (value.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((item) =>
    item.replace(/^(['"])(.*)\1$/, '$2')
  )
}

/* 解析命令行安装片段：claude/codex mcp add、code --add-mcp、裸 npx/uvx 命令 */
function parseCommandSnippet(raw: string): ParsedMcpSnippet | null {
  const text = raw.trim()

  /* code --add-mcp '{"name":...}' */
  const addMcp = text.match(/--add-mcp\s+(['"])(\{[\s\S]*?\})\1/)
  if (addMcp) {
    try {
      const config = JSON.parse(addMcp[2]) as Record<string, unknown>
      if (typeof config.command === 'string') {
        return {
          name: typeof config.name === 'string' ? config.name : '',
          url: '',
          headers: {},
          command: config.command,
          args: Array.isArray(config.args) ? config.args.map((item) => String(item)) : [],
          env: (config.env ?? {}) as Record<string, string>,
          cwd: typeof config.cwd === 'string' ? config.cwd : ''
        }
      }
    } catch {
      return null
    }
  }

  const tokens = tokenize(text)
  /* 去掉 mcp add 前缀（claude / codex / 其他客户端） */
  const addIndex = tokens.findIndex((item) => item === 'add' && tokens[tokens.length - 1] !== 'add')
  const start = addIndex >= 0 ? addIndex + 1 : 0
  const commandIndex = tokens.findIndex(
    (item, index) => index >= start && COMMANDS.includes(item)
  )
  if (commandIndex < 0) {
    return null
  }
  const name = addIndex > 1 ? tokens[addIndex - 1] : ''
  return {
    name,
    url: '',
    headers: {},
    command: tokens[commandIndex],
    args: tokens.slice(commandIndex + 1),
    env: {},
    cwd: ''
  }
}

/* 解析片段（JSON 优先，其次命令行安装） */
export function parseMcpSnippet(raw: string): ParsedMcpSnippet | null {
  if (!raw.trim()) {
    return null
  }
  return parseJsonSnippet(raw.trim()) ?? parseCommandSnippet(raw)
}
