/*
 * MCP 工具名归一：把服务名 / 工具名映射为供应商允许的字符集与长度。
 *   - 统一小写，仅保留字母、数字、下划线、连字符；
 *   - 名称总长上限 64（主流供应商限制）；
 *   - 同名冲突追加序号，返回值可直接用于 Agent 工具注册。
 */

/* 工具名总长上限（主流模型供应商限制 64） */
export const MAX_TOOL_NAME_LENGTH = 64

/* 名称归一：仅保留字母、数字、下划线、连字符 */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'mcp'
}

/* 工具名：mcp_{服务}_{工具}，保证多服务下唯一且符合供应商约束 */
export function buildToolName(serverName: string, toolName: string): string {
  return `mcp_${slugify(serverName)}_${slugify(toolName)}`.slice(0, MAX_TOOL_NAME_LENGTH)
}

/* 冲突归一：已存在同名时追加 _2、_3…（截断时保留序号后缀） */
export function uniqueToolName(baseName: string, used: Set<string>): string {
  let name = baseName
  let suffix = 2
  while (used.has(name)) {
    const tail = `_${suffix}`
    name = `${baseName.slice(0, MAX_TOOL_NAME_LENGTH - tail.length)}${tail}`
    suffix += 1
  }
  return name
}
