import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api'
import { t } from '../i18n'
import type { ProjectDTO } from '../../../shared/ipc'

/*
 * 项目状态：项目 1:1 绑定本地目录，会话归属项目。
 *   - currentId 为「新建对话」的默认归属项目，点击项目/会话时同步。
 */
export const useProjectStore = defineStore('project', () => {
  const projects = ref<ProjectDTO[]>([])
  const currentId = ref('')
  const loaded = ref(false)

  const currentProject = computed(
    () => projects.value.find((item) => item.id === currentId.value) ?? null
  )

  /* 加载项目列表（保留当前选择，失效则清空） */
  async function loadProjects(): Promise<void> {
    projects.value = await api.project.list()
    if (currentId.value && !projects.value.some((item) => item.id === currentId.value)) {
      currentId.value = ''
    }
    loaded.value = true
  }

  /* 选择当前项目 */
  function selectProject(id: string): void {
    currentId.value = id
  }

  /*
   * 新建项目：弹出系统目录选择对话框，选中的目录自动生成项目。
   *   取消返回 null；目录重复等错误由调用方捕获提示。
   */
  async function createProject(): Promise<ProjectDTO | null> {
    const created = await api.project.create({ dialogTitle: t('project.selectDirTitle') })
    if (created) {
      projects.value = [created, ...projects.value]
      currentId.value = created.id
    }
    return created
  }

  /* 重命名项目 */
  async function renameProject(id: string, name: string): Promise<void> {
    const updated = await api.project.rename(id, name)
    const target = projects.value.find((item) => item.id === id)
    if (target) {
      target.name = updated.name
    }
  }

  /* 删除项目（主进程级联删除其下会话与消息） */
  async function removeProject(id: string): Promise<void> {
    await api.project.remove(id)
    projects.value = projects.value.filter((item) => item.id !== id)
    if (currentId.value === id) {
      currentId.value = ''
    }
  }

  /* 在系统文件管理器中展示项目目录 */
  async function revealProject(id: string): Promise<void> {
    await api.project.reveal(id)
  }

  return {
    projects,
    currentId,
    loaded,
    currentProject,
    loadProjects,
    selectProject,
    createProject,
    renameProject,
    removeProject,
    revealProject
  }
})
