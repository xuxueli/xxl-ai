/*
 * 应用中心跨进程契约：应用安装 / 启用状态与配置。
 * @author xuxueli 2026-11-08
 */

/* 单个应用的状态与配置 */
export interface AppStateDTO {
  /* 应用标识 */
  appId: string
  /* 是否已安装 */
  installed: boolean
  /* 是否启用（左侧图标栏入口） */
  enabled: boolean
  /* 应用配置（每类应用结构不同，JSON 对象） */
  config: Record<string, unknown>
}
