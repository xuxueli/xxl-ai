/*
 * Agent 运行时协议：主进程 ⇄ 运行时进程（Electron utilityProcess）之间的消息约定。
 * 运行时进程承载模型调用、工具执行与文件沙箱，主进程仅做 IPC 网关与交互转发，
 * 避免 LLM 流式与工具重活占用主进程事件循环。
 */

import type { PermissionMode } from '@modules/chat/shared'
import type { ModelDescriptor, ReasoningLevel } from '@common/shared/model'
import type { McpRuntimeConfig, McpTestResult, McpToolMeta } from '@modules/mcp/shared'
import type { SkillRuntimeConfig } from '@modules/skill/shared'
import type { AgentToolSwitches } from './contracts'
import type { BrowserAction, BrowserActionResult } from '@modules/browser/shared'
import type { InteractionRequest, InteractionResult } from '@modules/chat/shared'
import type { LlmTraceInput } from '@modules/diagnostics/shared'

/* 供应商运行时配置（主进程解密后传给运行时，与 Pi Models 构建入参一致） */
export interface ProviderModelConfig {
  /* 供应商主键 */
  id: number
  /* 供应商名 */
  name: string
  /* 接口基址 */
  baseUrl: string
  /* 解密后的访问密钥 */
  apiKey: string
  /* 附加请求头 */
  headers: Record<string, string>
  /* 可选模型列表 */
  models: ModelDescriptor[]
  /* 关联会话 ID（供 {session} 占位替换） */
  sessionId?: number
}

/* 运行时进程向主进程推送的对话流式事件 */
export type HostEvent =
  | { type: 'delta'; text: string } /* 增量文本 */
  | { type: 'thinking'; text: string } /* 思考文本 */
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown } /* 工具开始 */
  | { type: 'tool_end'; toolCallId: string; toolName: string; isError: boolean; result?: string; details?: unknown; durationMs?: number } /* 工具结束 */
  | { type: 'usage'; used: number; window: number; systemTokens?: number; toolTokens?: number; messageTokens?: number } /* 上下文用量（每次模型响应结束后回传；分项为估算值） */
  | { type: 'notice'; message: string } /* 非致命异常提示（继续执行） */
  | { type: 'done' } /* 本轮完成 */
  | { type: 'error'; message: string } /* 出错（结束） */

/* 越界访问动作类型（文案区分用）：command 表示 shell 命令访问目录外路径 */
export type PathAction = 'read' | 'write' | 'command'

/* 内置工具分类开关：主进程按 Agent 配置组装，运行时据 domain 决定装配哪些工具 */
export type BuiltinToolSwitches = AgentToolSwitches

/* 一次对话运行入参 */
export interface RunAgentInput {
  /* 会话主键 */
  sessionId: number
  /* 供应商运行时配置 */
  provider: ProviderModelConfig
  /* 模型 ID */
  modelId: string
  /* 推理等级（Default / Low / High / Max） */
  reasoningLevel: ReasoningLevel
  /* 系统提示词 */
  systemPrompt: string
  /* 模型上下文（最近窗口，不含 thinking） */
  messages: unknown[]
  /* 应用语言：运行期异常备注使用对应语言 */
  language: 'zh' | 'en'
  /* 权限模式（仅可查看 / 工作区内修改 / 完全权限） */
  permissionMode: PermissionMode
  /* 项目根目录（文件沙箱根） */
  rootDir: string
  /* 运行时 PATH（含设置的 Node / Python 环境，供 run_command 使用） */
  runtimePath: string
  /* MCP stdio 专用 PATH：优先系统 Node，避免 Electron-as-Node 子进程产生 Dock 图标 */
  mcpRuntimePath: string
  /* 已生效的 MCP 服务配置（未开启的不下发） */
  mcpServers: McpRuntimeConfig[]
  /* 已启用的技能清单（只下发索引，正文由 read_skill 按需读取） */
  skills: SkillRuntimeConfig[]
  /* 技能根目录（技能库只读放行的边界，含未启用技能与目录列举） */
  skillsDir: string
  /* 内置工具分类开关（关闭的分类不装配） */
  tools: BuiltinToolSwitches
  /* 本轮用户输入 */
  text: string
  /* 开发者模式：开启后采集模型通讯 trace 并回传主进程落库 */
  traceEnabled: boolean
}

/* Agent 记忆生成入参（主进程组装提示词，运行时进程只调用模型） */
export interface MemoryGenerateInput {
  /* 请求标识（结果回传关联） */
  requestId: string
  /* 归属会话（trace 记录用） */
  sessionId: number
  /* 开发者模式：开启后采集本次模型调用 trace */
  traceEnabled: boolean
  /* 供应商运行时配置 */
  provider: ProviderModelConfig
  /* 模型 ID */
  modelId: string
  /* 应用语言：提示词与输出语言 */
  language: 'zh' | 'en'
  /* 旧记忆（为空表示首次生成） */
  oldMemory: string
  /* 最近对话转录文本 */
  transcript: string
}

/* 会话摘要生成入参（主进程组装提示词，运行时进程只调用模型） */
export interface SessionSummaryGenerateInput {
  /* 请求标识（结果回传关联） */
  requestId: string
  /* 归属会话（trace 记录用） */
  sessionId: number
  /* 开发者模式：开启后采集本次模型调用 trace */
  traceEnabled: boolean
  /* 供应商运行时配置 */
  provider: ProviderModelConfig
  /* 模型 ID */
  modelId: string
  /* 应用语言：提示词与输出语言 */
  language: 'zh' | 'en'
  /* 旧摘要（为空表示首次压缩） */
  oldSummary: string
  /* 上次摘要后的增量对话转录文本 */
  transcript: string
}

/* 主进程 → 运行时进程 */
export type WorkerRequest =
  | { type: 'run'; input: RunAgentInput } /* 启动一轮对话 */
  | { type: 'abort'; sessionId: number } /* 中止指定会话生成 */
  | { type: 'evict'; sessionId: number } /* 释放会话缓存 */
  | { type: 'clear-permissions'; sessionId: number } /* 清空会话越界白名单 */
  | { type: 'reset' } /* 重置全部运行时状态 */
  | { type: 'shutdown' } /* 退出前优雅关闭：释放 MCP 子进程后自行退出 */
  | { type: 'interaction-response'; requestId: string; result: InteractionResult } /* 回传用户交互结果 */
  | { type: 'mcp-test'; requestId: string; server: McpRuntimeConfig; runtimePath: string; language: 'zh' | 'en' } /* 连通测试（临时连接） */
  | { type: 'mcp-tools'; requestId: string; server: McpRuntimeConfig; runtimePath: string; language: 'zh' | 'en' } /* 列举工具（复用连接缓存） */
  | { type: 'memory-generate'; input: MemoryGenerateInput } /* 生成 Agent 记忆 */
  | { type: 'summary-generate'; input: SessionSummaryGenerateInput } /* 生成会话压缩摘要 */
  | { type: 'browser-action-result'; requestId: string; result: BrowserActionResult } /* 页面动作结果回传 */

/* 运行时进程 → 主进程 */
export type WorkerMessage =
  | { type: 'event'; sessionId: number; event: HostEvent } /* 流式事件 */
  | { type: 'open-browser'; sessionId: number; url: string; newTab?: boolean } /* 在右侧「浏览器」面板打开页面（Agent 工具触发） */
  | { type: 'browser-action'; requestId: string; sessionId: number; action: BrowserAction } /* 执行页面动作（跨进程请求渲染层） */
  | { type: 'run-done'; sessionId: number; messages: unknown[] } /* 运行完成（只返回本轮新增消息） */
  | { type: 'run-error'; sessionId: number; message: string } /* 运行失败 */
  | { type: 'interaction-request'; requestId: string; sessionId: number; request: InteractionRequest } /* 人机交互请求 */
  | { type: 'interaction-cancel'; requestId: string } /* 交互取消（移除渲染层交互面板） */
  | { type: 'mcp-test-result'; requestId: string; result: McpTestResult } /* 连通测试结果 */
  | { type: 'mcp-tools-result'; requestId: string; tools: McpToolMeta[] } /* 工具列表结果 */
  | { type: 'memory-result'; requestId: string; ok: boolean; content?: string; message?: string } /* 记忆生成结果 */
  | { type: 'summary-result'; requestId: string; ok: boolean; content?: string; message?: string } /* 会话摘要生成结果 */
  | { type: 'mcp-result-error'; requestId: string; message: string } /* MCP 操作失败 */
  | { type: 'llm-trace'; sessionId: number; trace: LlmTraceInput } /* 模型通讯 trace（开发者模式） */
