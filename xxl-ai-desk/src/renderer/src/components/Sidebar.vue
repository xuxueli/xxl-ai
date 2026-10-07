<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { useProjectStore } from '../stores/project'
import { useLayoutStore } from '../stores/layout'
import { t } from '../i18n'
import logo from '../assets/favicon.ico'
import type { ProjectDTO, SessionDTO } from '../../../shared/ipc'

/* 左侧会话栏：新建 / 搜索 / 项目分组（项目下挂会话）/ 底部操作 */
const router = useRouter()
const chat = useChatStore()
const settings = useSettingsStore()
const project = useProjectStore()
const layout = useLayoutStore()
const keyword = ref('')
/* 项目展开状态（默认收起；选中/新建时自动展开） */
const expanded = ref<Record<string, boolean>>({})

/* 项目 → 其下会话（保持会话按更新时间倒序） */
function sessionsOf(projectId: string): SessionDTO[] {
  return chat.sessions.filter((item) => item.projectId === projectId)
}

/* 搜索：无关键字展示全部项目；有关键字时项目名或会话标题命中才保留，且仅展示命中的会话 */
const filteredGroups = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) {
    return project.projects.map((item) => ({ project: item, sessions: sessionsOf(item.id) }))
  }
  return project.projects
    .map((item) => {
      const sessions = sessionsOf(item.id).filter((session) =>
        (session.title || '').toLowerCase().includes(key)
      )
      const hit = item.name.toLowerCase().includes(key) || sessions.length > 0
      return hit ? { project: item, sessions } : null
    })
    .filter((item): item is { project: ProjectDTO; sessions: SessionDTO[] } => item !== null)
})

/* 搜索时全部展开，否则按展开状态 */
function isExpanded(projectId: string): boolean {
  return keyword.value.trim() ? true : Boolean(expanded.value[projectId])
}

/* 点击项目：选中并折叠/展开 */
function toggleProject(projectId: string): void {
  project.selectProject(projectId)
  expanded.value[projectId] = !expanded.value[projectId]
}

/* 当前项目变化时自动展开（点击会话/新建项目同步选中） */
watch(
  () => project.currentId,
  (id) => {
    if (id) {
      expanded.value[id] = true
    }
  }
)

/* 「在文件管理器中显示」文案按运行平台区分 */
const revealLabel = computed(() => {
  if (settings.platform === 'darwin') {
    return t('project.revealMac')
  }
  if (settings.platform === 'win32') {
    return t('project.revealWin')
  }
  return t('project.revealLinux')
})

/* 新建项目：选择本地目录并自动生成项目 */
async function onCreateProject(): Promise<void> {
  try {
    const created = await project.createProject()
    if (created) {
      expanded.value[created.id] = true
    }
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* 项目操作下拉：重命名 / 在文件管理器中显示 / 删除 */
function onProjectCommand(command: string, target: ProjectDTO): void {
  if (command === 'rename') {
    void onRenameProject(target)
  } else if (command === 'reveal') {
    void project.revealProject(target.id)
  } else if (command === 'delete') {
    void onDeleteProject(target)
  }
}

/* 重命名项目 */
async function onRenameProject(target: ProjectDTO): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('', t('project.rename'), {
      inputValue: target.name,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
    const name = value?.trim()
    if (name && name !== target.name) {
      await project.renameProject(target.id, name)
      ElMessage.success(t('project.renamed'))
    }
  } catch {
    /* 取消 */
  }
}

/* 删除项目：级联删除其下会话与消息 */
async function onDeleteProject(target: ProjectDTO): Promise<void> {
  try {
    await ElMessageBox.confirm(t('project.deleteConfirm', [target.name]), t('project.delete'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
    await project.removeProject(target.id)
    await chat.reloadSessions()
    ElMessage.success(t('project.deleted'))
  } catch {
    /* 取消 */
  }
}

function onNew(): void {
  chat.startNewChat()
  router.push('/')
}

async function onSelect(id: string): Promise<void> {
  await chat.selectSession(id)
  router.push('/')
}

async function onRename(id: string, title: string): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('', t('chat.renameSession'), {
      inputValue: title,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
    await chat.renameSession(id, value || title)
  } catch {
    /* 取消 */
  }
}

async function onDelete(id: string): Promise<void> {
  try {
    await ElMessageBox.confirm(t('chat.deleteConfirm'), t('chat.deleteSession'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
    await chat.removeSession(id)
    ElMessage.success(t('common.deleted'))
  } catch {
    /* 取消 */
  }
}

function goSettings(): void {
  router.push('/settings')
}
</script>

<template>
  <aside class="desk-sidebar" :class="{ collapsed: layout.sidebarCollapsed }">
    <div class="sidebar-head" :class="{ mac: settings.platform === 'darwin' }">
      <div class="brand">
        <img class="brand-logo" :src="logo" alt="logo" />
        <div class="brand-text">
          <div class="brand-name">{{ settings.settings.appName || t('app.name') }}</div>
          <div class="brand-tag">v{{ settings.version }}</div>
        </div>
      </div>
      <div class="new-btn" @click="onNew">
        <el-icon class="new-icon"><Edit /></el-icon>
        <span class="new-btn-label">{{ t('chat.newChatAction') }}</span>
      </div>
    </div>

    <div class="sidebar-search">
      <el-input v-model="keyword" :placeholder="t('chat.searchSession')" clearable>
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- 「项目:」标题：悬浮显示 + 号，点击新建项目（选择本地目录） -->
    <div class="project-head">
      <span class="project-label">{{ t('project.label') }}:</span>
      <el-icon class="project-add" :title="t('project.new')" @click="onCreateProject">
        <Plus />
      </el-icon>
    </div>

    <el-scrollbar class="sidebar-list">
      <div v-for="group in filteredGroups" :key="group.project.id" class="project-group">
        <div
          class="project-item"
          :class="{ active: group.project.id === project.currentId }"
          @click="toggleProject(group.project.id)"
        >
          <el-icon class="project-icon">
            <FolderOpened v-if="isExpanded(group.project.id)" />
            <Folder v-else />
          </el-icon>
          <span class="project-name" :title="group.project.path">{{ group.project.name }}</span>
          <span class="project-actions" @click.stop>
            <el-icon class="op" :title="t('project.rename')" @click="onRenameProject(group.project)">
              <EditPen />
            </el-icon>
            <el-dropdown trigger="click" @command="(command: string) => onProjectCommand(command, group.project)">
              <el-icon class="op" :title="t('common.actions')"><MoreFilled /></el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">{{ t('project.rename') }}</el-dropdown-item>
                  <el-dropdown-item command="reveal">{{ revealLabel }}</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>{{ t('project.delete') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </span>
        </div>

        <div v-if="isExpanded(group.project.id)" class="project-sessions">
          <div
            v-for="session in group.sessions"
            :key="session.id"
            class="session-item"
            :class="{ active: session.id === chat.currentId }"
            @click="onSelect(session.id)"
          >
            <span class="session-title">{{ session.title || t('chat.newChat') }}</span>
            <span class="session-actions" @click.stop>
              <el-icon class="op" @click="onRename(session.id, session.title)"><EditPen /></el-icon>
              <el-icon class="op" @click="onDelete(session.id)"><Delete /></el-icon>
            </span>
          </div>
          <div v-if="group.sessions.length === 0" class="session-empty">
            {{ t('project.noSession') }}
          </div>
        </div>
      </div>
      <el-empty v-if="filteredGroups.length === 0" :description="t('project.empty')" :image-size="60" />
    </el-scrollbar>

    <div class="sidebar-foot">
      <el-button text class="foot-btn" :title="t('settings.title')" @click="goSettings">
        <el-icon><Setting /></el-icon>
        <span class="foot-label">{{ t('settings.title') }}</span>
      </el-button>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.sidebar-head {
  padding: 10px 14px 12px;
  /* macOS 隐藏标题栏后，顶部区域需可拖拽移动窗口（系统红黄绿按钮不受影响） */
  -webkit-app-region: drag;
}

/* macOS：顶部让出系统红黄绿按钮，并使品牌 Logo 顶部与右侧正文区顶部对齐 */
.sidebar-head.mac {
  padding-top: var(--desk-header-height);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-bottom: 16px;
}

.brand-text {
  flex: 1;
  min-width: 0;
}

.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: contain;
  flex-shrink: 0;
}

.brand-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-tag {
  font-size: 12px;
  color: var(--desk-text-tertiary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 新建对话：与会话条目同款列表行（同字号/内边距/圆角），悬浮高亮 */
.new-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  font-size: 14px;
  transition: background 0.15s ease;
  -webkit-app-region: no-drag;
}

.new-btn:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.new-icon {
  flex-shrink: 0;
}

.sidebar-search {
  padding: 0 16px 10px;
}

/* 「项目:」分组标题：默认隐藏 + 号，悬浮标题行时显示 */
.project-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 6px;
}

.project-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--desk-text-tertiary);
}

.project-add {
  font-size: 14px;
  color: var(--desk-text-secondary);
  cursor: pointer;
  visibility: hidden;
  transition: color 0.15s ease;
}

.project-head:hover .project-add {
  visibility: visible;
}

.project-add:hover {
  color: var(--desk-primary);
}

.sidebar-list {
  flex: 1;
  padding: 0 10px;
}

.project-group {
  margin-bottom: 2px;
}

/* 项目行：与折叠箭头/图标同排，悬浮显示操作 */
.project-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  font-size: 14px;
  transition: background 0.15s ease;
}

.project-item:hover {
  background: var(--desk-primary-soft);
}

.project-item.active {
  color: var(--desk-text);
  font-weight: 600;
}

.project-icon {
  flex-shrink: 0;
}

.project-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-actions {
  display: none;
  align-items: center;
  gap: 6px;
}

.project-item:hover .project-actions {
  display: inline-flex;
}

/* 项目下的会话缩进展示 */
.project-sessions {
  padding-left: 16px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  margin-bottom: 2px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  transition: background 0.15s ease;
  font-size: 14px;
}

.session-item:hover {
  background: var(--desk-primary-soft);
}

.session-item.active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.session-title {
  flex: 1;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-actions {
  display: none;
  gap: 6px;
}

.session-item:hover .session-actions {
  display: inline-flex;
}

.session-empty {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--desk-text-tertiary);
}

.op {
  font-size: 13px;
  color: var(--desk-text-tertiary);
}

.op:hover {
  color: var(--desk-primary);
}

.sidebar-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  border-top: 1px solid var(--desk-border);
}

.foot-btn {
  color: var(--desk-text-secondary);
}

/* --- 折叠为窄图标栏：隐藏文字与列表，仅保留图标操作 --- */
.desk-sidebar.collapsed .sidebar-head {
  padding-left: 8px;
  padding-right: 8px;
}

.desk-sidebar.collapsed .brand {
  justify-content: center;
  margin-bottom: 12px;
}

.desk-sidebar.collapsed .brand-text,
.desk-sidebar.collapsed .new-btn-label,
.desk-sidebar.collapsed .foot-label,
.desk-sidebar.collapsed .sidebar-search,
.desk-sidebar.collapsed .project-head,
.desk-sidebar.collapsed .sidebar-list {
  display: none;
}

.desk-sidebar.collapsed .new-btn {
  width: 36px;
  margin: 0 auto;
  padding: 0;
  height: 36px;
  justify-content: center;
}

.desk-sidebar.collapsed .sidebar-foot {
  /* 折叠态列表隐藏后无占位，靠 margin-top 将操作区压到左下角 */
  margin-top: auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 4px 8px;
}

.desk-sidebar.collapsed .foot-btn {
  padding: 6px;
}
</style>
