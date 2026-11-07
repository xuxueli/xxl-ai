/**
 * 对话模块 类型定义（公开对话数据 + 管理端对话管理 + 全链路可观测与RAG引用模型）
 */
import type { ListQuery } from '@/types'

/** Run 状态机与基础耗时指标 */
export interface RunMeta {
  runId: number
  sessionId: number
  agentId: number
  supplierId?: number
  supplierName?: string
  modelId?: number
  modelName?: string
  state: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string
  startTime: number
  firstTokenTime?: number
  endTime?: number
  ttftMs?: number
  totalElapsedMs?: number
  errorMsg?: string
  workerNode?: string
}

/** Token 消耗统计（多轮 ReAct 累加） */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  rounds: number
}

/** RAG 检索引用来源项 */
export interface RagReference {
  kbId: number
  kbName: string
  docId: number
  docName: string
  chunkIndex: number
  score: number
  content: string
}

/** 工具调用证据链记录 */
export interface ToolTraceItem {
  callId: string
  toolName: string
  toolType: 'MCP' | 'SKILL' | 'EXEC' | string
  arguments?: string
  resultSummary?: string
  status: 'RUNNING' | 'SUCCESS' | 'ERROR' | string
  errorMsg?: string
  startTime: number
  endTime?: number
  elapsedMs?: number
}

/** 时延瀑布图阶段 Span */
export interface TraceSpan {
  spanId: string
  stage: 'context' | 'memory' | 'rag' | 'llm' | 'tool' | string
  name: string
  status: 'RUNNING' | 'SUCCESS' | 'ERROR' | 'SKIPPED' | string
  startTime: number
  endTime?: number
  elapsedMs?: number
  detail?: string
}

/** 实时执行日志流条目 */
export interface TraceLogEntry {
  time: string
  timestamp: number
  level: 'INFO' | 'WARN' | 'ERROR' | string
  stage: string
  message: string
}

/** 助手消息 ext_json 反序列化后的结构化扩展对象 */
export interface SessionMsgExt {
  runMeta?: RunMeta
  tokenUsage?: TokenUsage
  references?: RagReference[]
  toolTraces?: ToolTraceItem[]
  spans?: TraceSpan[]
  logs?: TraceLogEntry[]
}

/**
 * 安全解析助手消息 extJson 字段
 */
export function parseSessionMsgExt(extJson?: string): SessionMsgExt | undefined {
  if (!extJson || !extJson.trim()) {
    return undefined
  }
  try {
    return JSON.parse(extJson) as SessionMsgExt
  } catch (e) {
    return undefined
  }
}

/** 对话（对应后端 Session 实体） */
export interface Session {
  id: number
  /** AgentID */
  agentId?: number
  /** 访客标识 */
  visitorId: string
  /** 对话标题 */
  title: string
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 对话消息（对应后端 SessionMsg 实体） */
export interface SessionMsg {
  id?: number
  /** 对话ID */
  sessionId?: number
  /** 角色：user-用户、assistant-助手 */
  role: string
  /** 思考过程（推理模型 reasoning_content，可空） */
  reasoning?: string
  /** 消息内容 */
  content: string
  /** 扩展信息 JSON 字符串（承载 runMeta/tokenUsage/references/toolTraces/spans/logs） */
  extJson?: string
  /** 状态：0-生成中、1-完成、2-失败（含主动终止；生成中可据消息ID断点续传） */
  status?: number
  addTime?: string
  [key: string]: unknown
}

/** 管理端对话列表项（含所属 Agent 名称） */
export interface SessionDTO {
  id: number
  /** AgentID */
  agentId?: number
  /** Agent名称 */
  agentName?: string
  /** 访客标识 */
  visitorId: string
  /** 对话标题 */
  title: string
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 管理端对话列表搜索栏参数 */
export interface SessionQuery {
  pageNum: number
  pageSize: number
  /** Agent ID（<=0 表示全部） */
  agentId?: number
  /** 对话标题（模糊） */
  title?: string
  /** 访客标识（模糊） */
  visitorId?: string
}

/** 管理端对话列表接口请求参数 */
export type SessionListQuery = ListQuery<SessionQuery>
