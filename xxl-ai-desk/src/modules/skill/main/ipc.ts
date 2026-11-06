/*
 * SKILL 域 IPC 注册：导入 / 启停 / 删除 / 发现安装。
 * @author xuxueli 2026-11-07
 */

import { dialog, shell } from 'electron'
import type { IpcContext } from '@common/main/ipc'
import { SKILL_IPC } from '../shared/ipc'
import {
  deleteSkill,
  getSkillContent,
  getSkillDetail,
  getSkillRevealPath,
  importSkillsFromDirectory,
  importSkillsFromZip,
  listSkills,
  refreshSkills,
  setSkillEnabled
} from './service'
import { discoverSkillDetail, discoverSkills, installDiscoveredSkill } from './discover'
import { cancelGithubSkills, inspectGithubSkills, installGithubSkill } from './github'

export function registerSkillIpc(ipc: IpcContext): void {
  ipc.handle(SKILL_IPC.list, () => listSkills())
  ipc.handle(SKILL_IPC.detail, (_event, id: string) => getSkillDetail(id))
  ipc.handle(SKILL_IPC.content, (_event, id: string, offset: number) => getSkillContent(id, offset))
  ipc.handle(SKILL_IPC.importDir, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择技能目录',
      properties: ['openDirectory']
    })
    return result.canceled || result.filePaths.length === 0
      ? null
      : importSkillsFromDirectory(result.filePaths[0])
  })
  ipc.handle(SKILL_IPC.importZip, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择技能 Zip 文件',
      properties: ['openFile'],
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    return result.canceled || result.filePaths.length === 0
      ? null
      : importSkillsFromZip(result.filePaths[0])
  })
  ipc.handle(SKILL_IPC.setEnabled, (_event, id: string, enabled: boolean) =>
    setSkillEnabled(id, enabled)
  )
  ipc.handle(SKILL_IPC.remove, (_event, id: string) => deleteSkill(id))
  ipc.handle(SKILL_IPC.reveal, (_event, id: string) => {
    shell.showItemInFolder(getSkillRevealPath(id))
  })
  ipc.handle(SKILL_IPC.refresh, () => refreshSkills())
  ipc.handle(SKILL_IPC.discover, (_event, query) => discoverSkills(query))
  ipc.handle(SKILL_IPC.discoverDetail, (_event, id: string) => discoverSkillDetail(id))
  ipc.handle(SKILL_IPC.install, (_event, id: string) => installDiscoveredSkill(id))
  ipc.handle(SKILL_IPC.githubInspect, (_event, query) => inspectGithubSkills(query))
  ipc.handle(SKILL_IPC.githubInstall, (_event, input) => installGithubSkill(input))
  ipc.handle(SKILL_IPC.githubCancel, (_event, query) => cancelGithubSkills(query))
}
