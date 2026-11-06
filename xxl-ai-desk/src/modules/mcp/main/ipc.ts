/*
 * MCP 域 IPC 注册：保存即清空运行时缓存，下一轮对话重建工具。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { MCP_IPC } from '../shared/ipc'
import { deleteMcp, listMcps, saveMcp } from './service'
import { listMcpTools, testMcp } from './runtime'
import { discoverMcp, discoverMcpDetail, listMcpCategories } from './discover'
import { resetAgents } from '@modules/agent/main'

export function registerMcpIpc(ipc: IpcContext): void {
  ipc.handle(MCP_IPC.list, () => listMcps())
  ipc.handle(MCP_IPC.save, (_event, dto) => {
    const saved = saveMcp(dto)
    resetAgents()
    return saved
  })
  ipc.handle(MCP_IPC.remove, (_event, id: string) => {
    deleteMcp(id)
    resetAgents()
  })
  ipc.handle(MCP_IPC.test, (_event, dto) => testMcp(dto))
  ipc.handle(MCP_IPC.tools, (_event, id: string) => listMcpTools(id))
  ipc.handle(MCP_IPC.discover, (_event, query) => discoverMcp(query))
  ipc.handle(MCP_IPC.categories, () => listMcpCategories())
  ipc.handle(MCP_IPC.detail, (_event, slug: string) => discoverMcpDetail(slug))
}
