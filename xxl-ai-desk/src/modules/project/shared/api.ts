/*
 * 项目域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { ProjectCreateInput, ProjectDTO } from './contracts'

export interface ProjectApi {
  list(): Promise<ProjectDTO[]>
  create(input?: ProjectCreateInput): Promise<ProjectDTO | null>
  rename(id: string, name: string): Promise<ProjectDTO>
  remove(id: string): Promise<void>
  reveal(id: string): Promise<void>
}
