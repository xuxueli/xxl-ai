/*
 * Agent 运行时协议：主进程 ⇄ 运行时进程（Electron utilityProcess）之间的消息约定。
 * 运行时进程承载模型调用、工具执行与文件沙箱，主进程仅做 IPC 网关与审批弹窗，
 * 避免 LLM 流式与工具重活占用主进程事件循环。
 */

import type { ChatMode } from './ipc'

/* 供应商运行时配置（主进程解密后传给运行时，与 Pi Models 构建入参一致） */
export interface ProviderModelConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  headers: Record<string, string>
  models: string[]
  sessionId?: string
}

/* 运行时进程向主进程推送的对话流式事件 */
export type HostEvent =
  | { type: 'delta'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_end'; toolCallId: string; toolName: string; isError: boolean; result?: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

/* 越界访问动作类型（文案区分用） */
export type PathAction = 'read' | 'write'

/* 越界审批结果：允许本次 / 本会话允许 / 拒绝 */
export type ApprovalChoice = 'once' | 'session' | 'deny'

/* 越界审批请求（运行时进程 → 主进程 → 渲染进程，由渲染进程弹应用内对话框） */
export interface ApprovalRequest {
  sessionId: string
  tool: string
  action: PathAction
  abs: string
  root: string
}

/* 一次对话运行入参 */
export interface RunAgentInput {
  sessionId: string
  provider: ProviderModelConfig
  modelId: string
  systemPrompt: string
  messages: unknown[]
  mode: ChatMode
  rootDir: string
  text: string
}

/* 主进程 → 运行时进程 */
export type WorkerRequest =
  | { type: 'run'; input: RunAgentInput }
  | { type: 'abort'; sessionId: string }
  | { type: 'evict'; sessionId: string }
  | { type: 'clear-permissions'; sessionId: string }
  | { type: 'reset' }
  | { type: 'approval-response'; requestId: string; choice: ApprovalChoice }

/* 运行时进程 → 主进程 */
export type WorkerMessage =
  | { type: 'event'; sessionId: string; event: HostEvent }
  | { type: 'run-done'; sessionId: string; messages: unknown[] }
  | { type: 'run-error'; sessionId: string; message: string }
  | ({ type: 'approval-request'; requestId: string } & ApprovalRequest)
