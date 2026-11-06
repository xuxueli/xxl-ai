/*
 * 项目域跨进程契约：本地项目（1:1 绑定磁盘目录）与新建入参。
 */

/* 项目：1:1 强绑定一个本地磁盘目录 */
export interface ProjectDTO {
  /* 主键 */
  id: string
  /* 项目名 */
  name: string
  /* 绑定的本地磁盘目录绝对路径 */
  path: string
  /* 创建时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 新建项目入参（path 缺省时由主进程弹出目录选择对话框） */
export interface ProjectCreateInput {
  /* 项目名（缺省取目录名） */
  name?: string
  /* 目标目录（缺省时弹出目录选择对话框） */
  path?: string
  /* 目录选择对话框标题（由渲染进程按语言注入） */
  dialogTitle?: string
}
