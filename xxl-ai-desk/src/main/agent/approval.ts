/*
 * 主进程侧越界审批：运行时进程把越界访问转交此处，由主进程弹原生对话框。
 * 默认焦点落在「拒绝」，关闭窗口等同于拒绝。
 */

import { BrowserWindow, dialog } from 'electron'
import type { ApprovalChoice, ApprovalRequest } from '../../shared/agentProtocol'

/* 弹出越界确认对话框，返回用户选择 */
export async function confirmOutside(input: ApprovalRequest): Promise<ApprovalChoice> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    noLink: true,
    title: '越界访问确认',
    message: `工具「${input.tool}」请求${input.action === 'write' ? '写入' : '读取'}项目目录之外的文件`,
    detail: `目标路径：${input.abs}\n项目目录：${input.root}\n\n是否允许本次操作？`,
    buttons: ['允许本次', '本会话允许', '拒绝'],
    defaultId: 2,
    cancelId: 2
  }
  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options)
  if (response === 0) {
    return 'once'
  }
  if (response === 1) {
    return 'session'
  }
  return 'deny'
}
