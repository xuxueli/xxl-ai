/*
 * Agent 运行时协议：主进程 ⇄ 运行时进程（Electron utilityProcess）之间的消息约定。
 * 运行时进程承载模型调用、工具执行与文件沙箱，主进程仅做 IPC 网关与审批弹窗，
 * 避免 LLM 流式与工具重活占用主进程事件循环。
 */

import type { ChatMode } from './ipc'

/* 供应商运行时配置（主进程解密后传给运行时，与 Pi Models 构建入参一致） */
export interface ProviderModelConfig {
  /* 供应商主键 */
  id: string
  /* 供应商名 */
  name: string
  /* 接口基址 */
  baseUrl: string
  /* 解密后的访问密钥 */
  apiKey: string
  /* 附加请求头 */
  headers: Record<string, string>
  /* 可选模型 ID 列表 */
  models: string[]
  /* 关联会话 ID（供 {session} 占位替换） */
  sessionId?: string
}

/* 运行时进程向主进程推送的对话流式事件 */
export type HostEvent =
  | { type: 'delta'; text: string } /* 增量文本 */
  | { type: 'thinking'; text: string } /* 思考文本 */
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown } /* 工具开始 */
  | { type: 'tool_end'; toolCallId: string; toolName: string; isError: boolean; result?: string } /* 工具结束 */
  | { type: 'done' } /* 本轮完成 */
  | { type: 'error'; message: string } /* 出错 */

/* 越界访问动作类型（文案区分用） */
export type PathAction = 'read' | 'write'

/* 越界审批结果：允许本次 / 本会话允许 / 拒绝 */
export type ApprovalChoice = 'once' | 'session' | 'deny'

/* 越界审批请求（运行时进程 → 主进程 → 渲染进程，由渲染进程弹应用内对话框） */
export interface ApprovalRequest {
  /* 所属会话主键 */
  sessionId: string
  /* 触发审批的工具名 */
  tool: string
  /* 动作类型：read 读 / write 写 */
  action: PathAction
  /* 越界目标的绝对路径 */
  abs: string
  /* 沙箱根目录 */
  root: string
}

/* 一次对话运行入参 */
export interface RunAgentInput {
  /* 会话主键 */
  sessionId: string
  /* 供应商运行时配置 */
  provider: ProviderModelConfig
  /* 模型 ID */
  modelId: string
  /* 系统提示词 */
  systemPrompt: string
  /* 历史消息（Pi AgentMessage[]） */
  messages: unknown[]
  /* 对话模式 */
  mode: ChatMode
  /* 项目根目录（文件沙箱根） */
  rootDir: string
  /* 运行时 PATH（含设置的 Node / Python 环境，供 run_command 使用） */
  runtimePath: string
  /* 本轮用户输入 */
  text: string
}

/* 主进程 → 运行时进程 */
export type WorkerRequest =
  | { type: 'run'; input: RunAgentInput } /* 启动一轮对话 */
  | { type: 'abort'; sessionId: string } /* 中止指定会话生成 */
  | { type: 'evict'; sessionId: string } /* 释放会话缓存 */
  | { type: 'clear-permissions'; sessionId: string } /* 清空会话越界白名单 */
  | { type: 'reset' } /* 重置全部运行时状态 */
  | { type: 'approval-response'; requestId: string; choice: ApprovalChoice } /* 回传越界审批结果 */

/* 运行时进程 → 主进程 */
export type WorkerMessage =
  | { type: 'event'; sessionId: string; event: HostEvent } /* 流式事件 */
  | { type: 'run-done'; sessionId: string; messages: unknown[] } /* 运行完成（返回最新上下文） */
  | { type: 'run-error'; sessionId: string; message: string } /* 运行失败 */
  | ({ type: 'approval-request'; requestId: string } & ApprovalRequest) /* 越界审批请求 */
