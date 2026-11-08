/*
 * MCP 运行时服务：连通测试与工具查询的业务编排（不含配置存储与协议实现）。
 *   - 配置解析/校验来自 mcpService（纯配置）；
 *   - 连接、协议、工具列举由 runtimeHost → 运行时进程（pi-mcp）完成。
 */

import { t } from '@common/main/i18n'
import { buildMcpRuntimePath } from '@modules/platform/main'
import { buildRuntimeConfig, getMcp, saveMcpHealth } from './service'
import { listMcpToolsByRuntime, testMcpByRuntime } from '@modules/agent/main'
import type { McpDTO, McpHealth, McpTestResult, McpToolMeta } from '@modules/mcp/shared'

/* 连通测试：支持未保存草稿；已保存记录回写检测结果 */
export async function testMcp(input: Partial<McpDTO>): Promise<McpTestResult> {
  const config = buildRuntimeConfig(input)
  const result = await testMcpByRuntime(config, buildMcpRuntimePath())

  /* 仅已保存记录回写 health（草稿没有存储实体） */
  if (input.id) {
    const health: McpHealth = {
      ok: result.ok,
      message: result.message,
      toolCount: result.toolCount,
      elapsedMs: result.elapsedMs,
      checkTime: result.checkTime
    }
    saveMcpHealth(config.id, health)
  }
  return result
}

/* 列举已保存服务的工具（复用运行时连接缓存） */
export async function listMcpTools(id: number): Promise<McpToolMeta[]> {
  const dto = getMcp(id)
  if (!dto) {
    throw new Error(t('runtime.error.mcpNotFound'))
  }
  return listMcpToolsByRuntime(buildRuntimeConfig(dto), buildMcpRuntimePath())
}
