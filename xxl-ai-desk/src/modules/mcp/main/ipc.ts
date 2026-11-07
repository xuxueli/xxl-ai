/*
 * MCP 域 IPC 注册：保存即清空运行时缓存，下一轮对话重建工具。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { t } from '@common/main/i18n'
import { MCP_IPC } from '../shared/ipc'
import { deleteMcp, listMcps, saveMcp } from './service'
import { listMcpTools, testMcp } from './runtime'
import { discoverMcp, discoverMcpDetail, listMcpCategories } from './discover'
import { countAgentsByMcpId, resetAgents } from '@modules/agent/main'

export function registerMcpIpc(ipc: IpcContext): void {
  ipc.handle(MCP_IPC.list, () =>
    listMcps().map((mcp) => ({ ...mcp, agentCount: countAgentsByMcpId(mcp.id) }))
  )
  ipc.handle(MCP_IPC.save, (_event, dto) => {
    const saved = saveMcp(dto)
    resetAgents()
    return saved
  })
  ipc.handle(MCP_IPC.remove, (_event, id: number) => {
    const agentCount = countAgentsByMcpId(id)
    if (agentCount > 0) {
      throw new Error(t('runtime.error.mcpInUse', [agentCount]))
    }
    deleteMcp(id)
    resetAgents()
  })
  ipc.handle(MCP_IPC.test, (_event, dto) => testMcp(dto))
  ipc.handle(MCP_IPC.tools, (_event, id: number) => listMcpTools(id))
  ipc.handle(MCP_IPC.discover, (_event, query) => discoverMcp(query))
  ipc.handle(MCP_IPC.categories, () => listMcpCategories())
  ipc.handle(MCP_IPC.detail, (_event, slug: string) => discoverMcpDetail(slug))
}
