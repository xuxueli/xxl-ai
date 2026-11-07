/*
 * Agent 域 IPC 通道。
 * @author xuxueli 2026-11-07
 */

export const AGENT_IPC = {
  list: 'desk:agent:list',
  save: 'desk:agent:save',
  remove: 'desk:agent:remove',
  memoryList: 'desk:agent-memory:list',
  memorySave: 'desk:agent-memory:save'
} as const
