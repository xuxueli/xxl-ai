/*
 * MCP 域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { McpCategory, McpDiscoverDetail, McpDiscoverPage, McpDiscoverQuery, McpDTO, McpTestResult, McpToolMeta } from './contracts'

export interface McpApi {
  list(): Promise<McpDTO[]>
  save(dto: Partial<McpDTO>): Promise<McpDTO>
  remove(id: number): Promise<void>
  test(dto: Partial<McpDTO>): Promise<McpTestResult>
  tools(id: number): Promise<McpToolMeta[]>
  discover(query: McpDiscoverQuery): Promise<McpDiscoverPage>
  categories(): Promise<McpCategory[]>
  detail(slug: string): Promise<McpDiscoverDetail>
}
