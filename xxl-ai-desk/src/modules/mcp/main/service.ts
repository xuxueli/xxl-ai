/*
 * MCP 配置业务：仅负责 MCP 配置的增删改查、校验归一化与运行时数据生成。
 *   - 唯一读写 desk_mcp 的出口；不依赖任何 MCP 客户端/运行时实现。
 *   - 对外输出：McpDTO（管理界面）与 McpRuntimeConfig（运行时装配）。
 */

import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { mcpTable } from '@modules/mcp/main/schema'
import { decryptSecret, encryptSecret } from '@modules/provider/main'
import type { McpDTO, McpHealth, McpRuntimeConfig, McpTransport, McpType } from '@modules/mcp/shared'

type McpRow = typeof mcpTable.$inferSelect

/* MCP 名称排序：自然排序（数字按数值比较，如 Server 2 在 Server 10 前） */
const NAME_COLLATOR = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })

/* 解析字符串 Map（headers/env）：值按需解密 */
function parseSecretMap(raw: string, decode: boolean): Record<string, string> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = decode ? decryptSecret(String(value ?? '')) : String(value ?? '')
      }
      return result
    }
  } catch {
    /* 忽略非法 JSON */
  }
  return {}
}

/* 编码字符串 Map（headers/env）：值统一编码后入库 */
function encodeSecretMap(map: Record<string, string> | undefined): string {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(map ?? {})) {
    const name = key.trim()
    if (name) {
      result[name] = encryptSecret(String(value ?? ''))
    }
  }
  return JSON.stringify(result)
}

/* 解析命令参数 JSON 数组 */
function parseArgs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    /* 忽略非法 JSON */
  }
  return []
}

/* 解析最近检测结果 */
function parseHealth(raw: string): McpHealth | null {
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as McpHealth
    if (parsed && typeof parsed === 'object' && typeof parsed.ok === 'boolean') {
      return parsed
    }
  } catch {
    /* 忽略非法 JSON */
  }
  return null
}

/* 行记录 → DTO（密钥解密、JSON 解析） */
function toDTO(row: McpRow): McpDTO {
  return {
    id: row.id,
    name: row.name,
    type: row.type === 'local' ? 'local' : 'remote',
    transport: row.transport === 'stdio' ? 'stdio' : 'streamable-http',
    url: row.url,
    headers: parseSecretMap(row.headers, true),
    command: row.command,
    args: parseArgs(row.args),
    env: parseSecretMap(row.env, true),
    cwd: row.cwd,
    config: row.config,
    remark: row.remark,
    health: parseHealth(row.health),
    agentCount: 0,
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

/* 组装规范配置（表单字段派生，作为唯一权威配置） */
function buildConfig(input: {
  transport: McpTransport
  url: string
  headers: Record<string, string>
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
}): string {
  const config =
    input.transport === 'stdio'
      ? {
          transport: 'stdio',
          command: input.command,
          args: input.args,
          env: input.env,
          cwd: input.cwd
        }
      : {
          transport: 'streamable-http',
          url: input.url,
          headers: input.headers
        }
  return JSON.stringify(config)
}

/* MCP 列表：按名称自然排序 */
export function listMcps(): McpDTO[] {
  const rows = getDb().select().from(mcpTable).all()
  return rows.map(toDTO).sort((a, b) => NAME_COLLATOR.compare(a.name, b.name))
}

/* 按主键读取 MCP */
export function getMcp(id: number): McpDTO | null {
  if (!id) {
    return null
  }
  const row = getDb().select().from(mcpTable).where(eq(mcpTable.id, id)).get()
  return row ? toDTO(row) : null
}

/* 校验并归一化保存入参（缺省字段回落已存记录） */
function normalizeInput(
  input: Partial<McpDTO>,
  existing: McpDTO | null
): Omit<McpRow, 'id' | 'addTime' | 'updateTime'> {
  const name = (input.name ?? existing?.name ?? '').trim()
  if (!name) {
    throw new Error(t('runtime.error.mcpNameRequired'))
  }
  if (name.length > 64) {
    throw new Error(t('runtime.error.mcpNameTooLong', [64]))
  }

  const type: McpType = (input.type ?? existing?.type ?? 'remote') === 'local' ? 'local' : 'remote'
  const url = (input.url ?? existing?.url ?? '').trim()
  const command = (input.command ?? existing?.command ?? '').trim()
  const args = input.args ?? existing?.args ?? []
  const cwd = (input.cwd ?? existing?.cwd ?? '').trim()
  const headers = input.headers ?? existing?.headers ?? {}
  const env = input.env ?? existing?.env ?? {}
  const transport: McpTransport = type === 'local' ? 'stdio' : 'streamable-http'

  if (type === 'remote') {
    if (!url) {
      throw new Error(t('runtime.error.mcpUrlRequired'))
    }
    if (!/^https?:\/\/\S+$/i.test(url)) {
      throw new Error(t('runtime.error.mcpUrlScheme'))
    }
  } else if (!command) {
    throw new Error(t('runtime.error.mcpCommandRequired'))
  }

  const argsList = args.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  /* 密钥统一编码后入库（config 同步存编码值，避免明文落库） */
  const encodedHeaders = JSON.parse(
    encodeSecretMap(type === 'remote' ? headers : {})
  ) as Record<string, string>
  const encodedEnv = JSON.parse(encodeSecretMap(type === 'local' ? env : {})) as Record<string, string>
  const config = buildConfig({
    transport,
    url,
    headers: encodedHeaders,
    command,
    args: argsList,
    env: encodedEnv,
    cwd
  })

  /* 检测结果：优先采用本次表单测试结果；配置未变化时沿用历史检测结果 */
  const providedHealth =
    input.health && typeof input.health === 'object' ? JSON.stringify(input.health) : ''
  const unchangedConfig = existing ? existing.config === config : false

  return {
    name,
    type,
    transport,
    url: type === 'remote' ? url : '',
    headers: JSON.stringify(encodedHeaders),
    command: type === 'local' ? command : '',
    args: JSON.stringify(type === 'local' ? argsList : []),
    env: JSON.stringify(encodedEnv),
    cwd: type === 'local' ? cwd : '',
    config,
    remark: (input.remark ?? existing?.remark ?? '').trim(),
    /* 本次测试结果或未变更配置的历史结果；配置已变更则清空，避免展示过期状态 */
    health: providedHealth || (unchangedConfig && existing?.health ? JSON.stringify(existing.health) : '')
  }
}

/* 新增或更新 MCP（保存即生效：调用方负责清空运行时缓存） */
export function saveMcp(input: Partial<McpDTO>): McpDTO {
  const db = getDb()
  const existingRow = input.id
    ? db.select().from(mcpTable).where(eq(mcpTable.id, input.id)).get()
    : undefined
  const existing = existingRow ? toDTO(existingRow) : null
  const record = normalizeInput(input, existing)

  /* 名称唯一（工具名前缀与会话内识别均依赖名称） */
  const duplicated = db
    .select()
    .from(mcpTable)
    .all()
    .find((row) => row.name === record.name && row.id !== existingRow?.id)
  if (duplicated) {
    throw new Error(t('runtime.error.mcpNameDuplicate', [record.name]))
  }

  const now = new Date().toISOString()
  const values = {
    ...record,
    addTime: existingRow?.addTime ?? now,
    updateTime: now
  }
  if (existingRow) {
    db.update(mcpTable).set(values).where(eq(mcpTable.id, existingRow.id)).run()
    return toDTO({ ...existingRow, ...values })
  }
  const inserted = db
    .insert(mcpTable)
    .values(values)
    .returning({ id: mcpTable.id })
    .get()
  return toDTO({ id: inserted.id, ...values })
}

/* 删除 MCP */
export function deleteMcp(id: number): void {
  if (!id) {
    return
  }
  getDb().delete(mcpTable).where(eq(mcpTable.id, id)).run()
}

/* DTO → 运行时配置（headers/env 已解密） */
function toRuntimeConfig(dto: McpDTO): McpRuntimeConfig {
  if (dto.type === 'local') {
    return {
      id: dto.id,
      name: dto.name,
      transport: 'stdio',
      command: dto.command,
      args: dto.args,
      env: dto.env,
      cwd: dto.cwd
    }
  }
  return {
    id: dto.id,
    name: dto.name,
    transport: 'streamable-http',
    url: dto.url,
    headers: dto.headers
  }
}

/* MCP 运行时配置（会话运行时按 Agent 选中的 id 过滤） */
export function listMcpRuntimeConfigs(): McpRuntimeConfig[] {
  return listMcps().map(toRuntimeConfig)
}

/* 将运行时检测结果回写配置表（health 属配置元数据，由配置模块维护） */
export function saveMcpHealth(id: number, health: McpHealth): void {
  if (!id || !getMcp(id)) {
    return
  }
  getDb()
    .update(mcpTable)
    .set({ health: JSON.stringify(health), updateTime: new Date().toISOString() })
    .where(eq(mcpTable.id, id))
    .run()
}

/*
 * 生成运行时配置：支持未保存草稿（测试连接用）。
 * 仅做配置字段解析与校验，不涉及连接/协议等运行时逻辑。
 */
export function buildRuntimeConfig(input: Partial<McpDTO>): McpRuntimeConfig {
  const existing = input.id ? getMcp(input.id) : null
  const draft: McpDTO = {
    ...(existing ?? {
      id: 0,
      name: '',
      type: 'remote',
      transport: 'streamable-http',
      url: '',
      headers: {},
      command: '',
      args: [],
      env: {},
      cwd: '',
      config: '',
      remark: '',
      health: null,
      agentCount: 0,
      addTime: '',
      updateTime: ''
    }),
    ...input,
    headers: input.headers ?? existing?.headers ?? {},
    args: input.args ?? existing?.args ?? [],
    env: input.env ?? existing?.env ?? {},
    type: input.type ?? existing?.type ?? 'remote',
    transport:
      input.type === 'local' || (!input.type && existing?.type === 'local')
        ? 'stdio'
        : 'streamable-http'
  } as McpDTO

  if (!draft.name.trim()) {
    throw new Error(t('runtime.error.mcpNameRequired'))
  }
  if (draft.type === 'remote' && !draft.url.trim()) {
    throw new Error(t('runtime.error.mcpUrlRequired'))
  }
  if (draft.type === 'local' && !draft.command.trim()) {
    throw new Error(t('runtime.error.mcpCommandRequired'))
  }
  return toRuntimeConfig(draft)
}
