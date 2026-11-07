/*
 * SKILL 域 IPC 注册：导入 / 删除 / 发现安装。
 *   - 技能变更后统一清理运行时缓存（resetAgents），避免 skill service 反向依赖 agent。
 * @author xuxueli 2026-11-07
 */

import { dialog, shell } from 'electron'
import type { IpcContext } from '@common/main/ipc'
import { t } from '@common/main/i18n'
import { SKILL_IPC } from '../shared/ipc'
import { countAgentsBySkillId, resetAgents } from '@modules/agent/main'
import {
  deleteSkill,
  getSkillContent,
  getSkillDetail,
  getSkillRevealPath,
  importSkillsFromDirectory,
  importSkillsFromZip,
  listSkills,
  refreshSkills
} from './service'
import { discoverSkillDetail, discoverSkills, installDiscoveredSkill } from './discover'
import { cancelGithubSkills, inspectGithubSkills, installGithubSkill } from './github'

export function registerSkillIpc(ipc: IpcContext): void {
  ipc.handle(SKILL_IPC.list, () =>
    listSkills().map((skill) => ({ ...skill, agentCount: countAgentsBySkillId(skill.id) }))
  )
  ipc.handle(SKILL_IPC.detail, (_event, id: string) => getSkillDetail(id))
  ipc.handle(SKILL_IPC.content, (_event, id: string, offset: number) => getSkillContent(id, offset))
  ipc.handle(SKILL_IPC.importDir, async () => {
    const result = await dialog.showOpenDialog({
      title: t('runtime.dialog.selectSkillDir'),
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const imported = await importSkillsFromDirectory(result.filePaths[0])
    resetAgents()
    return imported
  })
  ipc.handle(SKILL_IPC.importZip, async () => {
    const result = await dialog.showOpenDialog({
      title: t('runtime.dialog.selectSkillZip'),
      properties: ['openFile'],
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const imported = await importSkillsFromZip(result.filePaths[0])
    resetAgents()
    return imported
  })
  ipc.handle(SKILL_IPC.remove, (_event, id: string) => {
    const agentCount = countAgentsBySkillId(id)
    if (agentCount > 0) {
      throw new Error(t('runtime.error.skillInUse', [agentCount]))
    }
    deleteSkill(id)
    resetAgents()
  })
  ipc.handle(SKILL_IPC.reveal, (_event, id: string) => {
    shell.showItemInFolder(getSkillRevealPath(id))
  })
  ipc.handle(SKILL_IPC.refresh, () => {
    const skills = refreshSkills()
    resetAgents()
    return skills
  })
  ipc.handle(SKILL_IPC.discover, (_event, query) => discoverSkills(query))
  ipc.handle(SKILL_IPC.discoverDetail, (_event, id: string) => discoverSkillDetail(id))
  ipc.handle(SKILL_IPC.install, async (_event, id: string) => {
    const skill = await installDiscoveredSkill(id)
    resetAgents()
    return skill
  })
  ipc.handle(SKILL_IPC.githubInspect, (_event, query) => inspectGithubSkills(query))
  ipc.handle(SKILL_IPC.githubInstall, async (_event, input) => {
    const skill = await installGithubSkill(input)
    resetAgents()
    return skill
  })
  ipc.handle(SKILL_IPC.githubCancel, (_event, query) => cancelGithubSkills(query))
}
