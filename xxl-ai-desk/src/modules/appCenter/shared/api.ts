/*
 * 应用中心 preload API 契约。
 * @author xuxueli 2026-11-08
 */

import type { AppStateDTO } from './contracts'

export interface AppCenterApi {
  /* 全部应用状态（含未安装但有历史配置的应用） */
  listStates(): Promise<AppStateDTO[]>
  /* 单个应用状态 */
  getState(appId: string): Promise<AppStateDTO>
  /* 安装应用 */
  install(appId: string): Promise<AppStateDTO>
  /* 卸载应用（仅更新状态，保留配置） */
  uninstall(appId: string): Promise<AppStateDTO>
  /* 启用 / 停用应用 */
  setEnabled(appId: string, enabled: boolean): Promise<AppStateDTO>
}
