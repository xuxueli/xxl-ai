/*
 * 项目状态：项目 1:1 绑定本地目录，会话归属项目。
 *   - currentId 为「新建对话」的默认归属项目，点击项目/会话时同步。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@common/renderer/api'
import { t } from '@common/renderer/i18n'
import { useSettingsStore } from '@modules/settings/renderer'
import type { ProjectDTO } from '@modules/project/shared'

export const useProjectStore = defineStore('project', () => {
  /* 项目列表（最近更新优先） */
  const projects = ref<ProjectDTO[]>([])
  /* 当前选中项目 id */
  const currentId = ref(0)
  /* 项目展开状态（按项目 id 记录，切换板块/页面后保留） */
  const expanded = ref<Record<number, boolean>>({})

  /* 当前项目对象（未选中为 null） */
  const currentProject = computed(
    () => projects.value.find((item) => item.id === currentId.value) ?? null
  )

  /* 默认项目空间（按内置目录识别） */
  const defaultProject = computed(
    () => projects.value.find((item) => item.defaultWorkspace) ?? null
  )

  /* 加载项目列表（保留当前选择，失效则回落上次选择 / 清空） */
  async function loadProjects(): Promise<void> {
    const lastId = useSettingsStore().settings.sessionDefaults.projectId
    projects.value = await api.project.list()
    if (currentId.value && !projects.value.some((item) => item.id === currentId.value)) {
      currentId.value = 0
    }
    /* 启动时恢复上次选中的项目，供新建对话沿用 */
    if (!currentId.value && projects.value.some((item) => item.id === lastId)) {
      currentId.value = lastId
    }
  }

  /* 选择当前项目（写入新建会话默认配置） */
  function selectProject(id: number): void {
    currentId.value = id
    /* 选择失败不回滚界面状态，下次启动回落到已保存值 */
    void useSettingsStore().saveSessionDefaults({ projectId: id }).catch(() => undefined)
  }

  /* 选中默认项目空间；不存在时回退到名称升序的第一个项目 */
  function selectDefaultProject(): void {
    const target =
      defaultProject.value ??
      [...projects.value].sort((a, b) => a.name.localeCompare(b.name, 'zh'))[0]
    selectProject(target?.id ?? 0)
  }

  /* 项目是否展开 */
  function isExpanded(id: number): boolean {
    return Boolean(expanded.value[id])
  }

  /* 设置项目展开状态 */
  function setExpanded(id: number, value: boolean): void {
    expanded.value = { ...expanded.value, [id]: value }
  }

  /* 折叠/展开项目 */
  function toggleExpanded(id: number): void {
    setExpanded(id, !isExpanded(id))
  }

  /*
   * 新建项目：弹出系统目录选择对话框，选中的目录自动生成项目。
   *   取消返回 null；目录重复等错误由调用方捕获提示。
   */
  async function createProject(): Promise<ProjectDTO | null> {
    const created = await api.project.create({ dialogTitle: t('project.selectDirTitle') })
    if (created) {
      projects.value = [created, ...projects.value]
      selectProject(created.id)
      setExpanded(created.id, true)
    }
    return created
  }

  /* 重命名项目 */
  async function renameProject(id: number, name: string): Promise<void> {
    const updated = await api.project.rename(id, name)
    const target = projects.value.find((item) => item.id === id)
    if (target) {
      target.name = updated.name
    }
  }

  /* 删除项目（主进程级联删除其下会话与消息） */
  async function removeProject(id: number): Promise<void> {
    await api.project.remove(id)
    projects.value = projects.value.filter((item) => item.id !== id)
    /* 同步清理已删除项目的展开状态 */
    if (expanded.value[id] !== undefined) {
      const next = { ...expanded.value }
      delete next[id]
      expanded.value = next
    }
    if (currentId.value === id) {
      /* 删除当前项目后重新选中默认项目空间，避免界面停在无归属状态 */
      selectDefaultProject()
    }
  }

  /* 在系统文件管理器中展示项目目录 */
  async function revealProject(id: number): Promise<void> {
    await api.project.reveal(id)
  }

  /* 切换项目记忆开关（保留已存记忆内容） */
  async function setMemoryEnabled(id: number, value: boolean): Promise<void> {
    const updated = await api.project.setMemoryEnabled(id, value)
    const target = projects.value.find((item) => item.id === id)
    if (target) {
      target.memoryEnabled = updated.memoryEnabled
    }
  }

  return {
    projects,
    currentId,
    expanded,
    currentProject,
    defaultProject,
    loadProjects,
    selectProject,
    selectDefaultProject,
    isExpanded,
    setExpanded,
    toggleExpanded,
    createProject,
    renameProject,
    removeProject,
    revealProject,
    setMemoryEnabled
  }
})
