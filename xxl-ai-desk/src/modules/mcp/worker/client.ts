/*
 * MCP 运行时客户端（运行时进程侧）：基于 Pi 官方 @earendil-works/pi-mcp 封装连接、工具列举、调用与测试。
 *   - 传输仅支持 Streamable HTTP（远程）与 stdio（本地，cross-spawn）；
 *   - 按配置指纹缓存连接，配置变化自动重建并关闭旧连接（含子进程组）；
 *   - 本文件不感知业务配置/数据库，只接收 McpRuntimeConfig。
 */

import { createHash } from 'crypto'
import { delimiter } from 'path'
import log from 'electron-log/main'
import type { CallToolResult, McpClient, McpTransport, Tool } from '@earendil-works/pi-mcp'
import { APP_VERSION } from '@common/shared/appInfo'
import { translate } from '@common/shared/i18n'
import type { AppLanguage } from '@common/shared/i18n'
import type { McpRuntimeConfig, McpTestResult, McpToolMeta } from '@modules/mcp/shared'

/* pi-mcp 为 ESM 包：运行时进程按需动态加载 */
type PiMcpModule = typeof import('@earendil-works/pi-mcp')
let modulePromise: Promise<PiMcpModule> | null = null

/* 加载 Pi MCP 模块（缓存） */
export function loadPiMcp(): Promise<PiMcpModule> {
  modulePromise ??= import('@earendil-works/pi-mcp')
  return modulePromise
}

/* 初始化超时（连接握手；显式连通测试用，保持可预期等待） */
const CONNECT_TIMEOUT = 30000

/*
 * 首次运行握手超时：npx / uvx 首次会下载并安装依赖（uvx 实测可达数分钟），
 * 装配已移出首字关键路径（见 session.ts 预算），放宽以允许冷安装一次完成。
 */
export const ASSEMBLY_CONNECT_TIMEOUT = 300000

/* 按传输类型取握手超时：本地 stdio 首次安装依赖较慢，远程保持较短超时 */
function connectTimeoutFor(server: McpRuntimeConfig): number {
  return server.transport === 'stdio' ? ASSEMBLY_CONNECT_TIMEOUT : CONNECT_TIMEOUT
}

/* 连接失败冷却：同一配置在冷却期内直接快速失败，避免每个新会话重复等待超时 */
const FAILURE_COOLDOWN = 5 * 60 * 1000

/* 工具列举 / 调用超时 */
const LIST_TIMEOUT = 30000
const CALL_TIMEOUT = 60000

/* 单服务工具数量上限 */
const MAX_TOOLS = 1000

/* 客户端标识（随 MCP 握手发送给服务端） */
const CLIENT_INFO = { name: 'xxl-ai-desk', version: APP_VERSION }

/* 已建立的连接缓存：服务 ID → 指纹 / 客户端 / 工具列表 */
interface CachedConnection {
  fingerprint: string
  client: McpClient
  tools: Tool[]
}
const connections = new Map<number, CachedConnection>()

/* 失败冷却记录：服务 ID → 指纹 / 到期时间 / 失败原因 */
interface CachedFailure {
  fingerprint: string
  until: number
  message: string
}
const failures = new Map<number, CachedFailure>()

/* 进行中的握手：服务 ID + 指纹 → 连接 Promise（并发请求共享一次连接，避免重复拉起子进程） */
const inflight = new Map<string, Promise<{ client: McpClient; tools: Tool[] }>>()

/* 运行时 PATH（含设置的 Node / Python 环境，供 stdio 解析 npx / uvx） */
let runtimePath = ''

/* 错误文案语言（随每轮对话 / MCP 请求由主进程传入） */
let language: AppLanguage = 'zh'

/* 设置运行时 PATH（每轮对话开始时由运行时进程调用） */
export function setMcpRuntimePath(value?: string): void {
  runtimePath = value?.trim() || ''
}

/* 设置错误文案语言 */
export function setMcpLanguage(value: AppLanguage): void {
  language = value
}

/* 配置指纹：配置变化即重建连接 */
function fingerprintOf(server: McpRuntimeConfig): string {
  return createHash('sha1')
    .update(
      JSON.stringify({
        transport: server.transport,
        url: server.url ?? '',
        headers: server.headers ?? {},
        command: server.command ?? '',
        args: server.args ?? [],
        env: server.env ?? {},
        cwd: server.cwd ?? ''
      })
    )
    .digest('hex')
}

/* stdio 子进程环境：自定义变量 + 运行时 PATH（继承进程环境由 inheritEnv 负责） */
function buildStdioEnv(server: McpRuntimeConfig): Record<string, string> {
  const env: Record<string, string> = { ...(server.env ?? {}) }
  const path = [runtimePath, process.env.PATH].filter(Boolean).join(delimiter)
  if (path) {
    env.PATH = path
  }
  return env
}

/* 建立传输层（远程 Streamable HTTP / 本地 stdio）；stdio stderr 尾部写入缓存供错误提示 */
async function createTransport(server: McpRuntimeConfig): Promise<McpTransport> {
  const { StdioTransport, StreamableHttpTransport } = await loadPiMcp()
  if (server.transport === 'stdio') {
    const command = (server.command ?? '').trim()
    if (!command) {
      throw new Error(translate(language, 'runtime.error.mcpLocalCommandMissing'))
    }
    const stderrKey = server.id ? String(server.id) : fingerprintOf(server)
    return new StdioTransport({
      command,
      args: server.args ?? [],
      cwd: server.cwd?.trim() || undefined,
      env: buildStdioEnv(server),
      inheritEnv: true,
      stderr: 'pipe',
      /* 捕获子进程 stderr：连接失败时回传给用户定位原因 */
      onStderr: (chunk) => {
        const tail = (stderrCapture.get(stderrKey) ?? '') + chunk
        stderrCapture.set(stderrKey, tail.slice(-4000))
      }
    })
  }
  if (!server.url) {
    throw new Error(translate(language, 'runtime.error.mcpRemoteUrlMissing'))
  }
  return new StreamableHttpTransport({
    url: new URL(server.url),
    headers: server.headers ?? {}
  })
}

/* stdio stderr 尾部缓存：服务 ID → 输出（仅用于错误提示） */
const stderrCapture = new Map<string, string>()

/* 连接失败文案：优先给出定位提示，并附带服务 stderr 尾部输出 */
function describeConnectError(error: Error, stderr: string, server: McpRuntimeConfig): string {
  const base = error.message || translate(language, 'runtime.error.mcpConnectFailed')
  const parts: string[] = []
  if (/closed|transport/i.test(base) && !stderr) {
    parts.push(
      server.transport === 'stdio'
        ? translate(language, 'runtime.error.mcpStdioExited', [server.command ?? ''])
        : translate(language, 'runtime.error.mcpConnectionClosed', [server.url ?? ''])
    )
  } else {
    parts.push(base)
  }
  if (stderr) {
    /* 首次安装依赖的提示：避免用户把正常下载误判为服务故障 */
    if (/Downloading|Installing|Resolving|Building/i.test(stderr)) {
      parts.push(translate(language, 'runtime.error.mcpFirstInstall'))
    }
    parts.push(translate(language, 'runtime.error.mcpStderr', [stderr]))
  }
  return parts.join('；')
}

/* 建立新连接（含 initialize 握手） */
async function connect(server: McpRuntimeConfig, timeoutMs = CONNECT_TIMEOUT): Promise<McpClient> {
  const { McpClient } = await loadPiMcp()
  const readStderr = (): string =>
    stderrCapture.get(server.id ? String(server.id) : fingerprintOf(server)) ?? ''
  const transport = await createTransport(server)
  const client = new McpClient({
    ...CLIENT_INFO,
    requestTimeoutMs: timeoutMs
  })
  try {
    await client.connect(transport)
    return client
  } catch (error) {
    await closeClient(client)
    throw new Error(describeConnectError(error as Error, readStderr(), server))
  }
}

/* 工具元信息归一 */
function toToolMeta(tool: Tool): McpToolMeta {
  return {
    name: tool.name,
    title: tool.title || tool.name,
    description: tool.description ?? '',
    readOnly: tool.annotations?.readOnlyHint === true
  }
}

/* 列举工具（超时保护） */
async function listTools(client: McpClient): Promise<Tool[]> {
  const tools = await client.listTools({ timeoutMs: LIST_TIMEOUT })
  return (tools ?? []).slice(0, MAX_TOOLS)
}

/* 记录连接失败：冷却期内直接跳过，避免每个新会话重复等待握手超时 */
function recordFailure(server: McpRuntimeConfig, fingerprint: string, error: unknown): void {
  failures.set(server.id, {
    fingerprint,
    until: Date.now() + FAILURE_COOLDOWN,
    message: (error as Error).message || '连接失败'
  })
}

/* 建立连接并列举工具（成功写缓存并清除冷却；失败写入冷却记录） */
async function establish(
  server: McpRuntimeConfig,
  fingerprint: string,
  timeoutMs: number
): Promise<{ client: McpClient; tools: Tool[] }> {
  let client: McpClient
  try {
    client = await connect(server, timeoutMs)
  } catch (error) {
    recordFailure(server, fingerprint, error)
    throw error
  }
  try {
    const tools = await listTools(client)
    connections.set(server.id, { fingerprint, client, tools })
    failures.delete(server.id)
    return { client, tools }
  } catch (error) {
    await closeClient(client)
    recordFailure(server, fingerprint, error)
    throw error
  }
}

/* 获取（或重建）连接：配置指纹变化时关闭旧连接；冷却期内快速失败 */
export async function getMcpConnection(
  server: McpRuntimeConfig,
  timeoutMs = CONNECT_TIMEOUT
): Promise<{ client: McpClient; tools: Tool[] }> {
  const fingerprint = fingerprintOf(server)
  const cached = connections.get(server.id)
  if (cached && cached.fingerprint === fingerprint) {
    return { client: cached.client, tools: cached.tools }
  }

  /* 冷却期内：直接抛错（调用方跳过该服务，不阻塞本轮），到期后自动重试 */
  const failure = failures.get(server.id)
  if (failure && failure.fingerprint === fingerprint) {
    if (failure.until > Date.now()) {
      const remain = Math.ceil((failure.until - Date.now()) / 1000)
      throw new Error(translate(language, 'runtime.error.mcpCooldown', [failure.message, remain]))
    }
    failures.delete(server.id)
  }

  /* 配置变更：先关闭旧连接，再重建 */
  if (cached) {
    await closeClient(cached.client)
    connections.delete(server.id)
  }

  /* 并发请求共享同一次握手：避免首轮装配与后台装配重复拉起子进程 */
  const inflightKey = `${server.id}:${fingerprint}`
  const running = inflight.get(inflightKey)
  if (running) {
    return running
  }
  const task = establish(server, fingerprint, timeoutMs).finally(() => {
    inflight.delete(inflightKey)
  })
  inflight.set(inflightKey, task)
  return task
}

/* 关闭客户端（忽略关闭异常；stdio 会同时终止子进程组） */
async function closeClient(client: McpClient): Promise<void> {
  try {
    await client.close()
  } catch {
    /* 关闭失败忽略 */
  }
}

/* 关闭全部连接（运行时重置 / 退出） */
export async function closeAllMcpClients(): Promise<void> {
  const list = Array.from(connections.values())
  connections.clear()
  failures.clear()
  stderrCapture.clear()
  await Promise.all(list.map((item) => closeClient(item.client)))
}

/* 调用工具（参数为模型生成的 JSON 对象；signal 用于用户终止） */
export async function callMcpTool(
  server: McpRuntimeConfig,
  toolName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<CallToolResult> {
  const { client } = await getMcpConnection(server, connectTimeoutFor(server))
  return client.callTool(toolName, args, {
    timeoutMs: CALL_TIMEOUT,
    signal
  })
}

/* 连通测试：临时连接（不进入缓存），返回服务信息与工具明细 */
export async function testMcpServer(
  server: McpRuntimeConfig,
  path: string
): Promise<McpTestResult> {
  runtimePath = path.trim()
  const start = Date.now()
  let client: McpClient | null = null
  try {
    client = await connect(server, connectTimeoutFor(server))
    const tools = await listTools(client)
    const elapsedMs = Date.now() - start
    return {
      ok: true,
      message: `连接成功，发现 ${tools.length} 个工具`,
      toolCount: tools.length,
      elapsedMs,
      checkTime: new Date().toISOString(),
      serverName: client.serverInfo?.name ?? '',
      serverVersion: client.serverInfo?.version ?? '',
      protocolVersion: client.protocolVersion ?? '',
      instructions: client.instructions ?? '',
      tools: tools.map(toToolMeta)
    }
  } catch (error) {
    const message = (error as Error).message || '连接失败'
    log.warn(`[mcp] 连通测试失败：${server.name} ${message}`)
    return {
      ok: false,
      message,
      toolCount: 0,
      elapsedMs: Date.now() - start,
      checkTime: new Date().toISOString(),
      serverName: '',
      serverVersion: '',
      protocolVersion: '',
      instructions: '',
      tools: []
    }
  } finally {
    if (client) {
      await closeClient(client)
    }
  }
}

/* 列举已连接服务的工具（复用缓存） */
export async function listServerTools(server: McpRuntimeConfig): Promise<McpToolMeta[]> {
  const { tools } = await getMcpConnection(server, connectTimeoutFor(server))
  return tools.map(toToolMeta)
}
