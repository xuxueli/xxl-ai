/*
 * MCP 工具装配（运行时进程侧）：按 Pi 官方推荐方式把 MCP Tool 包装为 AgentTool。
 *   - 参数：MCP inputSchema 直接作为工具参数（补齐 type/properties）；
 *   - 结果：toLlmContent 将 MCP 结果转为模型可读的文本/图片内容；
 *   - 失败：MCP 用 result.isError 表达工具失败，协议/网络错误包装为工具错误；
 *   - 权限：仅可查看只注册 readOnlyHint 工具，其余权限全量注册；
 *   - 单服务连接失败仅跳过该服务，不影响本轮对话。
 *
 * @author xuxueli 2026-10-31
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import log from 'electron-log/main'
import type { PermissionMode } from '@modules/chat/shared'
import type { McpRuntimeConfig } from '@modules/mcp/shared'
import { translate } from '@common/shared/i18n'
import {
  ASSEMBLY_CONNECT_TIMEOUT,
  callMcpTool,
  getMcpConnection,
  loadPiMcp
} from '@modules/mcp/worker/client'
import { buildToolName, uniqueToolName } from '@modules/mcp/worker/naming'

/* 工具结果详情：图片只保留类型与大小，避免 base64 落库膨胀 */
function buildToolDetails(
  server: McpRuntimeConfig,
  toolName: string,
  result: { isError?: boolean; content?: unknown[]; structuredContent?: unknown }
): Record<string, unknown> {
  const blocks = (result.content ?? []).map((block) => {
    const item = block as { type?: string; mimeType?: string; data?: string }
    if (item.type === 'image') {
      return {
        type: 'image',
        mimeType: item.mimeType ?? '',
        bytes: item.data ? Math.floor(item.data.length * 0.75) : 0
      }
    }
    return block
  })
  return {
    server: server.name,
    tool: toolName,
    isError: result.isError === true,
    content: blocks,
    structuredContent: result.structuredContent
  }
}

/*
 * 构建 MCP 工具集合：逐个服务连接并列举工具，失败服务跳过。
 * 复用运行时连接缓存，连接与工具列表在会话间共享。
 */
export async function createMcpTools(options: {
  servers: McpRuntimeConfig[]
  permissionMode: PermissionMode
  /* 应用语言：工具错误文案使用对应语言 */
  language: 'zh' | 'en'
  runtimePath: string
  /* 会话是否已被终止：创建阶段提前跳出，避免终止后仍等待连接 */
  isAborted?: () => boolean
}): Promise<AgentTool[]> {
  const { servers, permissionMode } = options
  if (servers.length === 0) {
    return []
  }
  const mcp = await loadPiMcp()

  /*
   * 并行连接各服务：单个服务慢或超时不再串行叠加等待，
   * 失败服务按连接失败冷却快速跳过（见 client.ts）。
   */
  const discoveredList = await Promise.all(
    servers.map(async (server) => {
      try {
        const connection = await getMcpConnection(server, ASSEMBLY_CONNECT_TIMEOUT)
        return { server, tools: connection.tools }
      } catch (error) {
        log.warn(`[mcp] 服务连接失败，已跳过：${server.name} ${(error as Error).message}`)
        return null
      }
    })
  )

  const tools: AgentTool[] = []
  const usedNames = new Set<string>()

  /* 按配置顺序装配工具，保证同名工具序号稳定（与连接并发顺序无关） */
  for (const discoveredItem of discoveredList) {
    if (!discoveredItem) {
      continue
    }
    /* 已被终止：不再装配后续服务的工具 */
    if (options.isAborted?.()) {
      break
    }
    const { server, tools: discovered } = discoveredItem

    for (const tool of discovered) {
      /* 仅可查看：仅暴露显式声明只读的工具 */
      if (permissionMode === 'read-only' && tool.annotations?.readOnlyHint !== true) {
        continue
      }

      /* 同名工具追加序号，保证 Agent 工具名唯一 */
      const name = uniqueToolName(buildToolName(server.name, tool.name), usedNames)
      usedNames.add(name)

      tools.push({
        name,
        label: tool.title || tool.name,
        description: tool.description || `来自 MCP 服务「${server.name}」的工具`,
        /* 模型供应商要求对象 schema；部分服务未提供 properties，补齐避免被拒 */
        parameters: {
          ...tool.inputSchema,
          type: 'object',
          properties: (tool.inputSchema?.properties as Record<string, unknown>) ?? {}
        } as never,
        /* MCP 工具可能有副作用，统一串行执行 */
        executionMode: 'sequential',
        execute: async (_toolCallId, params, signal) => {
          try {
            const result = await callMcpTool(
              server,
              tool.name,
              (params ?? {}) as Record<string, unknown>,
              signal
            )
            /* Pi 推荐：MCP 失败通过 isError 透传，内容统一走 toLlmContent */
            return {
              content: mcp.toLlmContent(result),
              details: buildToolDetails(server, tool.name, result),
              isError: result.isError === true
            }
          } catch (error) {
            /* 用户终止：给出明确结果，避免被误判为服务异常 */
            const message = signal?.aborted
              ? translate(options.language, 'runtime.tool.mcpAborted', [server.name, tool.name])
              : translate(options.language, 'runtime.tool.mcpFailed', [
                  server.name,
                  tool.name,
                  (error as Error).message
                ])
            return {
              content: [{ type: 'text' as const, text: message }],
              details: undefined,
              isError: true
            }
          }
        }
      })
    }
  }

  return tools
}
