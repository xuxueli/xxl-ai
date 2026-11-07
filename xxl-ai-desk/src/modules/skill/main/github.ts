/*
 * GitHub 安装业务：解析地址、扫描仓库技能、安装与取消下载。
 *   - 下载与缓存统一由 agent/host/skills/githubArchive 完成；
 *   - 安装统一进入 skillInstallService.installFromGithub；
 *   - 不调用 GitHub REST API。
 * @author xuxueli 2026-10-31
 */

import { t } from '@common/main/i18n'
import { parseGithubUrl } from './github/githubUrl'
import { installFromGithub, inspectGithubRepo, cancelGithubRepo } from './install'
import type { GithubSkillCandidate, GithubSkillInspectResult, GithubSkillInstallInput, GithubSkillQuery, SkillDTO } from '@modules/skill/shared'

/* 扫描 GitHub 仓库中的技能 */
export async function inspectGithubSkills(
  query: GithubSkillQuery
): Promise<GithubSkillInspectResult> {
  const repoRef = parseGithubUrl(query.url, query.ref)
  const candidates: GithubSkillCandidate[] = await inspectGithubRepo({
    repo: repoRef.repoPath,
    ref: repoRef.ref,
    path: repoRef.path || undefined
  })
  if (candidates.length === 0) {
    throw new Error(t('runtime.error.skillNoInstallable'))
  }
  return {
    repo: repoRef.repoPath,
    ref: repoRef.ref,
    candidates
  }
}

/* 安装 GitHub 仓库中的指定技能 */
export async function installGithubSkill(input: GithubSkillInstallInput): Promise<SkillDTO> {
  const repoRef = parseGithubUrl(input.url, input.ref)
  return installFromGithub({
    repo: repoRef.repoPath,
    ref: repoRef.ref,
    path: input.path ?? repoRef.path,
    origin: 'github'
  })
}

/* 中止弹框未完成的下载，保留已完成的 30 分钟归档缓存 */
export function cancelGithubSkills(query: GithubSkillQuery): void {
  try {
    const repoRef = parseGithubUrl(query.url, query.ref)
    cancelGithubRepo(repoRef.repoPath, repoRef.ref)
  } catch {
    /* 关闭弹框时地址可能已被编辑，取消失败不影响用户流程 */
  }
}
