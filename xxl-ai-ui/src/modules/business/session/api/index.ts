/**
 * @fileoverview Session API
 * @description 管理端对话查询接口，方法名与后端 SessionController 对齐；
 *     C 端公开对话接口见 chat 模块
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { SessionDTO, SessionMsg, SessionMsgQuery, SessionQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** 对话管理 API，调用方式：sessionApi.pageList(...) */
export const sessionApi = {
  /**
   * 分页查询空间内对话列表
   *
   * @param query 页面查询条件
   * @returns 对话分页结果
   */
  pageList(query: SessionQuery): Promise<Response<PageModel<SessionDTO>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/session/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 分页查询对话消息明细（页面内按时间正序）
   *
   * @param query 消息查询条件
   * @returns 消息分页结果
   */
  msgList(query: SessionMsgQuery): Promise<Response<PageModel<SessionMsg>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/session/msgList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  }
}
