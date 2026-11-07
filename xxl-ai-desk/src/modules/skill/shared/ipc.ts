/*
 * SKILL 域 IPC 通道。
 * @author xuxueli 2026-11-07
 */

export const SKILL_IPC = {
  list: 'desk:skill:list',
  detail: 'desk:skill:detail',
  content: 'desk:skill:content',
  importDir: 'desk:skill:import-dir',
  importZip: 'desk:skill:import-zip',
  remove: 'desk:skill:remove',
  reveal: 'desk:skill:reveal',
  refresh: 'desk:skill:refresh',
  discover: 'desk:skill:discover',
  discoverDetail: 'desk:skill:discover-detail',
  install: 'desk:skill:install',
  githubInspect: 'desk:skill:github-inspect',
  githubInstall: 'desk:skill:github-install',
  githubCancel: 'desk:skill:github-cancel'
} as const
