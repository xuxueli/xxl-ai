/*
 * project 模块主进程公共出口。
 * @author xuxueli 2026-11-07
 */

export { getProject, getProjectMemory, listProjectMemories, listProjects, saveProjectMemory } from './projectService'
export type { ProjectMemoryEntry, ProjectMemoryState } from './projectService'
