/*
 * skill 模块主进程公共出口。
 * @author xuxueli 2026-11-07
 */

export { detailSkillSh, isInstallableSource, listLeaderboardSkillsSh, searchSkillsSh } from './community/skillsShAdapter'
export type { RemoteSkillItem, RemoteSkillPage } from './community/skillsShAdapter'
export { acquireGithubArchive, cancelGithubArchive, cleanupGithubArchiveTemps, disposeGithubArchive } from './github/githubArchive'
export type { GithubArchive } from './github/githubArchive'
export { downloadGithubArchive } from './github/githubDownload'
export { parseGithubUrl } from './github/githubUrl'
export { commitSkillRoot, importSkillDirectory, importSkillZip, listSkillFiles, listSkillRoots, parseSkillMeta, readSkillContentChunk } from './import'
export type { ImportedSkill, ParsedSkillMeta } from './import'
export { cancelGithubRepo, inspectGithubRepo, installFromGithub } from './install'
export { findSkillBySourceId, listInstalledSourceIds, listSkills, listSkillsForRuntime, registerSkill } from './service'
