/**
 * @fileoverview Skill API
 * @description SKILL 与内容文件接口，方法名与后端 SkillController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { Skill, SkillFile, SkillForm, SkillQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** SKILL API，调用方式：skillApi.pageList(...) */
export const skillApi = {
  /**
   * 分页查询 SKILL
   *
   * @param query 页面查询条件
   * @returns SKILL 分页结果
   */
  pageList(query: SkillQuery): Promise<Response<PageModel<Skill>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/skill/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 查询当前空间 SKILL 列表（Agent 绑定下拉）
   *
   * @returns SKILL 列表
   */
  listBySpace(): Promise<Response<Skill[]>> {
    return request({
      url: '/skill/listBySpace',
      method: 'get'
    })
  },

  /**
   * 新增 SKILL（自动播种固定文件 SKILL.md + scripts/ + reference/）
   *
   * @param data 表单数据
   * @returns 保存结果
   */
  insert(data: SkillForm): Promise<Response<string>> {
    return request({
      url: '/skill/insert',
      method: 'post',
      data
    })
  },

  /**
   * 删除 SKILL（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<string>> {
    return request({
      url: '/skill/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  },

  /**
   * 修改 SKILL
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: SkillForm): Promise<Response<string>> {
    return request({
      url: '/skill/update',
      method: 'post',
      data
    })
  },

  /**
   * 查询某 SKILL 的文件树
   *
   * @param skillId SKILL 主键
   * @returns 文件树
   */
  fileTree(skillId: number): Promise<Response<SkillFile[]>> {
    return request({
      url: '/skill/file/tree',
      method: 'get',
      params: { skillId }
    })
  },

  /**
   * 加载文件内容
   *
   * @param id 文件节点主键
   * @returns 文件节点
   */
  fileLoad(id: number): Promise<Response<SkillFile>> {
    return request({
      url: '/skill/file/load',
      method: 'get',
      params: { id }
    })
  },

  /**
   * 新增目录
   *
   * @param data 文件节点
   * @returns 保存结果
   */
  fileInsertDir(data: SkillFile): Promise<Response<string>> {
    return request({
      url: '/skill/file/insertDir',
      method: 'post',
      data
    })
  },

  /**
   * 新增文件
   *
   * @param data 文件节点
   * @returns 保存结果
   */
  fileInsertFile(data: SkillFile): Promise<Response<string>> {
    return request({
      url: '/skill/file/insertFile',
      method: 'post',
      data
    })
  },

  /**
   * 重命名节点
   *
   * @param data 文件节点
   * @returns 保存结果
   */
  fileRename(data: SkillFile): Promise<Response<string>> {
    return request({
      url: '/skill/file/rename',
      method: 'post',
      data
    })
  },

  /**
   * 移动节点（拖拽调整目录归属）
   *
   * @param data 文件节点
   * @returns 保存结果
   */
  fileMove(data: SkillFile): Promise<Response<string>> {
    return request({
      url: '/skill/file/move',
      method: 'post',
      data
    })
  },

  /**
   * 保存文件内容
   *
   * @param data 文件节点
   * @returns 保存结果
   */
  fileSaveContent(data: SkillFile): Promise<Response<string>> {
    return request({
      url: '/skill/file/saveContent',
      method: 'post',
      data
    })
  },

  /**
   * 删除节点
   *
   * @param id 文件节点主键
   * @returns 删除结果
   */
  fileDelete(id: number): Promise<Response<string>> {
    return request({
      url: '/skill/file/delete',
      method: 'post',
      params: { id }
    })
  }
}
