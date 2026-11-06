/*
 * 浏览器域 IPC 通道。
 * @author xuxueli 2026-11-07
 */

export const BROWSER_IPC = {
  openTab: 'desk:browser:open-tab',
  actionRequest: 'desk:browser:action-request',
  actionResult: 'desk:browser:action-result'
} as const
