/*
 * SKILL 域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { GithubSkillInspectResult, GithubSkillInstallInput, GithubSkillQuery, SkillContentChunk, SkillDetail, SkillDiscoverDetail, SkillDiscoverPage, SkillDiscoverQuery, SkillDTO, SkillImportResult } from './contracts'

export interface SkillApi {
  list(): Promise<SkillDTO[]>
  detail(id: string): Promise<SkillDetail>
  content(id: string, offset: number): Promise<SkillContentChunk>
  importDirectory(): Promise<SkillImportResult | null>
  importZip(): Promise<SkillImportResult | null>
  remove(id: string): Promise<void>
  reveal(id: string): Promise<void>
  refresh(): Promise<SkillDTO[]>
  discover(query: SkillDiscoverQuery): Promise<SkillDiscoverPage>
  discoverDetail(id: string): Promise<SkillDiscoverDetail>
  install(id: string): Promise<SkillDTO>
  githubInspect(query: GithubSkillQuery): Promise<GithubSkillInspectResult>
  githubInstall(input: GithubSkillInstallInput): Promise<SkillDTO>
  githubCancel(query: GithubSkillQuery): Promise<void>
}
