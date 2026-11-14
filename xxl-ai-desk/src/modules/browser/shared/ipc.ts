/*
 * 浏览器域 IPC 通道。
 * @author xuxueli 2026-11-07
 */

export const BROWSER_IPC = {
  openTab: 'desk:browser:open-tab',
  actionRequest: 'desk:browser:action-request',
  actionResult: 'desk:browser:action-result',
  /* 会话终止：取消该会话全部挂起的页面动作（主 → 渲染） */
  actionCancel: 'desk:browser:action-cancel',
  /* 渲染层同步面板激活态（仅激活时主进程拦截快捷键） */
  setPanelActive: 'desk:browser:set-panel-active',
  /* 主进程拦截到的面板快捷键（主 → 渲染） */
  shortcutKey: 'desk:browser:shortcut-key'
} as const
