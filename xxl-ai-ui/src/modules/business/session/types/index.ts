/**
 * @fileoverview Session 类型定义
 * @description 对话、消息与管理端列表类型，对应后端 Session / SessionMsg / SessionDTO
 * @author xuxueli 2026-11-22
 */

/** 对话（对应后端 Session 实体） */
export interface Session {
  /** 主键 */
  id: number
  /** Agent ID */
  agentId?: number
  /** 访客标识 */
  visitorId: string
  /** 对话标题 */
  title: string
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 对话消息（对应后端 SessionMsg 实体） */
export interface SessionMsg {
  /** 主键 */
  id?: number
  /** 对话 ID */
  sessionId?: number
  /** 角色：user-用户、assistant-助手 */
  role: string
  /** 思考过程（推理模型 reasoning_content，可空） */
  reasoning?: string
  /** 消息内容 */
  content: string
  /** 状态：0-生成中、1-完成、2-失败（含主动终止；生成中可据消息 ID 断点续传） */
  status?: number
  /** 添加时间 */
  addTime?: string
  [key: string]: unknown
}

/** 管理端对话列表项（含所属 Agent 名称） */
export interface SessionDTO {
  /** 主键 */
  id: number
  /** Agent ID */
  agentId?: number
  /** Agent 名称 */
  agentName?: string
  /** 访客标识 */
  visitorId: string
  /** 对话标题 */
  title: string
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 管理端对话列表搜索栏参数（含分页） */
export interface SessionQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** Agent 筛选，<=0 表示全部 */
  agentId?: number
  /** 对话标题，模糊匹配 */
  title?: string
  /** 访客标识，模糊匹配 */
  visitorId?: string
}

/** 对话消息分页查询参数（含分页） */
export interface SessionMsgQuery {
  /** 对话 ID */
  sessionId: number
  /** Agent ID（用于后端校验归属） */
  agentId?: number
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
}
