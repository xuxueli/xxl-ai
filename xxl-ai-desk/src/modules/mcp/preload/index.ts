/*
 * MCP 域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { McpApi } from '../shared/api'
import { MCP_IPC } from '../shared/ipc'

export const mcpApi: McpApi = {
  list: () => ipcRenderer.invoke(MCP_IPC.list),
  save: (dto) => ipcRenderer.invoke(MCP_IPC.save, dto),
  remove: (id: number) => ipcRenderer.invoke(MCP_IPC.remove, id),
  test: (dto) => ipcRenderer.invoke(MCP_IPC.test, dto),
  tools: (id: number) => ipcRenderer.invoke(MCP_IPC.tools, id),
  discover: (query) => ipcRenderer.invoke(MCP_IPC.discover, query),
  categories: () => ipcRenderer.invoke(MCP_IPC.categories),
  detail: (slug: string) => ipcRenderer.invoke(MCP_IPC.detail, slug)
}
