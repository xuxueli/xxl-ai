/*
 * 会话 Harness 主进程公共出口：运行时进程托管、人机交互与会话级运行时控制。
 *   - 会话 Loop（模型请求 / 工具调用 / MCP / SKILL）统一收口在本模块；
 *   - 业务侧只经此出口使用运行时能力，不直接依赖 Worker 实现。
 * @author xuxueli 2026-11-22
 */

export {
  abortAgent,
  clearSessionPermissions,
  disposeAgentRuntime,
  evictAgent,
  generateMemory,
  generateSessionSummary,
  isAgentRunning,
  listMcpToolsByRuntime,
  prepareAgentRuntime,
  runAgent,
  setSessionActiveResolver,
  testMcpByRuntime
} from './main/runtimeHost'
export {
  cancelInteraction,
  cancelInteractionsOf,
  clearInteractions,
  openInteraction,
  resolveInteraction,
  setInteractionAutoResolver
} from './main/interaction'
export { resolveUnattendedInteraction } from './main/interactionPolicy'
export { buildSystemPrompt } from './main/systemPrompt'
