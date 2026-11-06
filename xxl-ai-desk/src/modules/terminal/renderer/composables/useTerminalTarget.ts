/*
 * 工具面板终端的目标项目：优先当前会话所属项目，回落当前选择项目。
 * @author xuxueli 2026-10-25
 */
import { computed } from 'vue'
import { useChatStore } from '@modules/chat/renderer'
import { useProjectStore } from '@modules/project/renderer'
import { t } from '@renderer/shell/i18n'

export function useTerminalTarget() {
  const chat = useChatStore()
  const project = useProjectStore()

  /* 终端所属项目 */
  const terminalProject = computed(() => {
    const id = chat.currentSession?.projectId || project.currentId
    return project.projects.find((item) => item.id === id) || null
  })

  /* 终端标签名：项目名优先，否则回退「终端」 */
  const terminalName = computed(() => terminalProject.value?.name || t('toolPanel.terminal'))

  /* 终端工作目录 */
  const terminalCwd = computed(() => terminalProject.value?.path || undefined)

  return { terminalProject, terminalName, terminalCwd }
}
