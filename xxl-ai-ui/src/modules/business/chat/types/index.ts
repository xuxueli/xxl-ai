/**
 * 对话模块 类型定义（公开对话页 + 管理端对话管理）
 */
import type { ListQuery } from '@/types'

/** Agent 基础信息（公开，免登录对话页展示） */
export interface AgentChatInfo {
  id: number
  name: string
  intro?: string
  status: number
  publishStatus: number
  [key: string]: unknown
}

/** 对话 */
export interface ChatConv {
  id: number
  /** Agent访问UUID */
  agentUuid: string
  /** 访客标识 */
  visitorId: string
  /** 对话标题 */
  title: string
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 对话消息 */
export interface ChatMsg {
  id?: number
  /** 对话ID */
  convId?: number
  /** 角色：user-用户、assistant-助手 */
  role: string
  /** 思考过程（推理模型 reasoning_content，可空） */
  reasoning?: string
  /** 消息内容 */
  content: string
  /** 状态：0-生成中、1-完成、2-失败（生成中可据消息ID断点续传） */
  status?: number
  addTime?: string
  [key: string]: unknown
}

/** 管理端对话列表搜索栏参数 */
export interface ChatConvQuery {
  pageNum: number
  pageSize: number
  /** 对话标题（模糊） */
  title?: string
  /** 访客标识（模糊） */
  visitorId?: string
}

/** 管理端对话列表接口请求参数 */
export type ChatConvListQuery = ListQuery<ChatConvQuery>
