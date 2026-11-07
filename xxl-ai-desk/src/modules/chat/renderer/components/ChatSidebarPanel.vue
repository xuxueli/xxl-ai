<script setup lang="ts">
/*
* 首页侧栏：新建对话 / 项目分组（项目下挂会话）
* @author xuxueli 2026-10-18
*/
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@modules/chat/renderer'
import { useProjectStore } from '@modules/project/renderer'
import SidebarHeader from '@renderer/shell/layout/components/Sidebar/SidebarHeader.vue'
import SidebarRow from '@renderer/shell/layout/components/Sidebar/SidebarRow.vue'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import ProjectGroup from '@modules/chat/renderer/components/ProjectGroup.vue'
import type { SessionDTO } from '@modules/chat/shared'

const router = useRouter()
const chat = useChatStore()
const project = useProjectStore()

/* 项目展开状态由 project store 统一维护（切换板块不会丢失） */

/* 排序方式：名称 / 更新时间（默认按名称排序） */
const sortBy = ref<'time' | 'name'>('name')

/* 项目 → 其下会话 */
function sessionsOf(projectId: number): SessionDTO[] {
  return chat.sessions.filter((item) => item.projectId === projectId)
}

/* 按当前排序方式排序的会话 */
function sortedSessionsOf(projectId: number): SessionDTO[] {
  const list = sessionsOf(projectId)
  if (sortBy.value === 'name') {
    return [...list].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh'))
  }
  return [...list].sort((a, b) => b.updateTime.localeCompare(a.updateTime))
}

/* 按当前排序方式排序的项目 */
const sortedProjects = computed(() => {
  const list = [...project.projects]
  if (sortBy.value === 'name') {
    return list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }
  return list.sort((a, b) => b.updateTime.localeCompare(a.updateTime))
})

/* 项目分组列表（一级项目 + 二级会话） */
const projectGroups = computed(() =>
  sortedProjects.value.map((item) => ({ project: item, sessions: sortedSessionsOf(item.id) }))
)

/* 切换排序方式 */
function onSortCommand(command: string): void {
  if (command === 'name' || command === 'time') {
    sortBy.value = command
  }
}

/* 展开状态（由 project store 维护，组件重挂载后仍保留） */
function isExpanded(projectId: number): boolean {
  return project.isExpanded(projectId)
}

/* 点击项目：选中并折叠/展开 */
function toggleProject(projectId: number): void {
  project.selectProject(projectId)
  project.toggleExpanded(projectId)
}

/* 当前项目变化时自动展开（点击会话/新建项目同步选中） */
watch(
  () => project.currentId,
  (id) => {
    if (id) {
      project.setExpanded(id, true)
    }
  }
)

/* 新建项目：选择本地目录并自动生成项目（store 内自动选中并展开） */
async function onCreateProject(): Promise<void> {
  try {
    await project.createProject()
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 新建对话并回到对话页 */
function onNew(): void {
  chat.startNewChat()
  router.push('/')
}

/* 选中会话并回到对话页 */
async function onSelect(id: number): Promise<void> {
  await chat.selectSession(id)
  router.push('/')
}

</script>

<template>
  <SidebarHeader title-key="chat.title" />

  <!-- 新建对话：与扩展中心/设置子菜单项使用同一列表行 -->
  <div class="new-chat">
    <SidebarRow :active="!chat.currentId" @click="onNew">
      <template #icon>
        <el-icon class="new-icon"><Edit /></el-icon>
      </template>
      {{ t('chat.newChatAction') }}
    </SidebarRow>
  </div>

  <!-- 「项目:」标题：右侧 排序（...）与 + 新建项目，鼠标悬浮展示 -->
  <div class="project-head">
    <span class="project-label">{{ t('project.label') }}</span>
    <span class="project-head-actions">
      <el-dropdown trigger="click" popper-class="sort-dropdown" @command="onSortCommand">
        <el-icon class="project-icon-btn" :title="t('common.actions')"><MoreFilled /></el-icon>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item disabled class="sort-group">
              {{ t('project.sortBy') }}
            </el-dropdown-item>
            <el-dropdown-item command="name">
              {{ t('project.sortName') }}
              <el-icon v-if="sortBy === 'name'" class="sort-check"><Check /></el-icon>
            </el-dropdown-item>
            <el-dropdown-item command="time">
              {{ t('project.sortTime') }}
              <el-icon v-if="sortBy === 'time'" class="sort-check"><Check /></el-icon>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-icon class="project-icon-btn" :title="t('project.new')" @click="onCreateProject">
        <Plus />
      </el-icon>
    </span>
  </div>

  <el-scrollbar class="sidebar-list">
    <ProjectGroup
      v-for="group in projectGroups"
      :key="group.project.id"
      :project="group.project"
      :sessions="group.sessions"
      :expanded="isExpanded(group.project.id)"
      :active-session-id="chat.currentId"
      @toggle="toggleProject(group.project.id)"
      @select="onSelect"
    />
    <el-empty v-if="projectGroups.length === 0" :description="t('project.empty')" :image-size="60" />
  </el-scrollbar>
</template>

<style scoped lang="scss">
/* 新建对话：容器与子菜单列表同宽（左右各 10px） */
.new-chat {
  padding: 0 10px;
  margin-bottom: 10px;
}

.new-icon {
  flex-shrink: 0;
  font-size: var(--desk-icon-sm);
}

/* 「项目:」分组标题：右侧排序/新建入口 */
.project-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 左内边距对齐项目行文件夹图标（10px 列表内边距 + 12px 行内边距） */
  padding: 0 16px 6px 22px;
}

/* 「项目」分组标签：小号加粗，颜色比条目略浅 */
.project-label {
  font-size: var(--desk-font-xs);
  font-weight: 600;
  color: var(--desk-text-secondary);
}

/* 排序/新建入口：默认隐藏，悬浮「项目:」标题行时展示 */
.project-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  visibility: hidden;
}

.project-head:hover .project-head-actions {
  visibility: visible;
}

.project-icon-btn {
  font-size: var(--desk-icon-sm);
  color: var(--desk-text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.project-icon-btn:hover {
  color: var(--desk-primary);
}

/* 空状态说明：对齐侧栏次要文案字号，避免 Element 默认 15px 盖过列表条目 */
.sidebar-list :deep(.el-empty__description p) {
  font-size: var(--desk-font-sm);
}

</style>
