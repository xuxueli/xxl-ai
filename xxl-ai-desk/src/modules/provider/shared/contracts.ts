/*
 * 供应商域跨进程契约：OpenAI 兼容端点配置与远程模型查询。
 */

import type { ModelDescriptor } from '@common/shared/model'

/* 供应商模型：模型 ID + 上下文窗口 */
export type ProviderModelDTO = ModelDescriptor

/* 供应商（OpenAI 兼容端点） */
export interface ProviderDTO {
  /* 主键 */
  id: number
  /* 名称 */
  name: string
  /* 接口基址（OpenAI 兼容端点） */
  baseUrl: string
  /* 访问密钥（base64 编码存储，读取时解码） */
  apiKey: string
  /* 附加请求头（支持 {session} 等占位） */
  headers: Record<string, string>
  /* 可选模型列表 */
  models: ProviderModelDTO[]
  /* 是否启用 */
  enabled: boolean
  /* 排序值（升序，越小越靠前） */
  sort: number
  /* 创建时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 远程模型查询入参（未保存的草稿可直接传表单值，已保存的可只传 id 复用库存密钥） */
export interface ProviderModelQuery {
  /* 已保存供应商主键（用于复用库存配置） */
  id?: number
  /* 草稿接口基址 */
  baseUrl?: string
  /* 草稿访问密钥 */
  apiKey?: string
  /* 草稿附加请求头 */
  headers?: Record<string, string>
}
