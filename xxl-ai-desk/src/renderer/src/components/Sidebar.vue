<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
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
/* 项目展开状态（默认收起；选中/新建时自动展开） */
const expanded = ref<Record<string, boolean>>({})

/* 搜索面板状态与关键字 */
const searchVisible = ref(false)
const searchKeyword = ref('')
const paletteInputRef = ref()

/* 排序方式：名称 / 更新时间（默认按名称排序） */
const sortBy = ref<'time' | 'name'>('name')

/* 项目 → 其下会话 */
function sessionsOf(projectId: string): SessionDTO[] {
  return chat.sessions.filter((item) => item.projectId === projectId)
}

/* 按当前排序方式排序的会话 */
function sortedSessionsOf(projectId: string): SessionDTO[] {
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

/* 项目名（会话结果右侧展示归属） */
function projectNameOf(projectId: string): string {
  return project.projects.find((item) => item.id === projectId)?.name ?? ''
}

/* 是否已输入关键字 */
const hasKeyword = computed(() => searchKeyword.value.trim().length > 0)

/* 关键字匹配：会话（按标题），最多展示 50 条 */
const matchedSessions = computed(() => {
  const key = searchKeyword.value.trim().toLowerCase()
  if (!key) {
    return []
  }
  return chat.sessions
    .filter((item) => (item.title || '').toLowerCase().includes(key))
    .slice(0, 50)
})

/* 未输入时固定展示最近在用的 5 条会话；输入后展示搜索结果 */
const visibleSessions = computed(() =>
  hasKeyword.value ? matchedSessions.value : chat.sessions.slice(0, 5)
)

/* 展开状态 */
function isExpanded(projectId: string): boolean {
  return Boolean(expanded.value[projectId])
}

/* 打开搜索面板（居中弹框） */
function openSearch(): void {
  searchKeyword.value = ''
  searchVisible.value = true
  nextTick(() => paletteInputRef.value?.focus())
}

/* 关闭搜索面板 */
function closeSearch(): void {
  searchVisible.value = false
}

/* 选中结果：定位并关闭 */
function onPickSession(sessionId: string): void {
  void onSelect(sessionId)
  closeSearch()
}

/* 推荐入口：新建会话 / 设置 */
function onNewFromPalette(): void {
  onNew()
  closeSearch()
}

function onSettingsFromPalette(): void {
  goSettings()
  closeSearch()
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

/* 拖拽右边缘调整侧栏宽度（拖拽期间禁用过渡与选中） */
function startResize(event: MouseEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = layout.sidebarWidth
  const onMove = (e: MouseEvent): void => {
    layout.setSidebarWidth(startWidth + (e.clientX - startX))
  }
  const onUp = (): void => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.classList.remove('resizing')
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  document.body.classList.add('resizing')
}
</script>

<template>
  <aside
    class="desk-sidebar"
    :class="{ collapsed: layout.sidebarCollapsed }"
    :style="{ width: layout.sidebarCollapsed ? '0px' : `${layout.sidebarWidth}px` }"
  >
    <!-- 右边缘拖拽手柄：调整侧栏宽度 -->
    <div v-if="!layout.sidebarCollapsed" class="sidebar-resizer" @mousedown="startResize"></div>

    <div class="sidebar-head" :class="{ mac: settings.platform === 'darwin' }">
      <div class="brand">
        <img class="brand-logo" :src="logo" alt="logo" />
        <div class="brand-text">
          <div class="brand-name">{{ settings.settings.appName || t('app.name') }}</div>
        </div>
        <!-- 搜索入口：位于 Logo 区域右侧，打开命令面板 -->
        <el-icon class="brand-search" :title="t('common.search')" @click="openSearch">
          <Search />
        </el-icon>
      </div>
      <div class="new-btn" @click="onNew">
        <el-icon class="new-icon"><Edit /></el-icon>
        <span class="new-btn-label">{{ t('chat.newChatAction') }}</span>
      </div>
    </div>

    <!-- 「项目:」标题：右侧 排序（...）与 + 新建项目，鼠标悬浮展示 -->
    <div class="project-head">
      <span class="project-label">{{ t('project.label') }}:</span>
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
      <div v-for="group in projectGroups" :key="group.project.id" class="project-group">
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
            <el-dropdown trigger="click" @command="(command: string) => onProjectCommand(command, group.project)">
              <el-icon class="op" :title="t('common.actions')"><MoreFilled /></el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">
                    <el-icon><EditPen /></el-icon>{{ t('project.rename') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="reveal">
                    <el-icon><FolderOpened /></el-icon>{{ revealLabel }}
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    <el-icon><Delete /></el-icon>{{ t('project.delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-icon class="op" :title="t('project.rename')" @click="onRenameProject(group.project)">
              <EditPen />
            </el-icon>
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
      <el-empty v-if="projectGroups.length === 0" :description="t('project.empty')" :image-size="60" />
    </el-scrollbar>

    <div class="sidebar-foot">
      <el-button text class="foot-btn" :title="t('settings.title')" @click="goSettings">
        <el-icon><Setting /></el-icon>
        <span class="foot-label">{{ t('settings.title') }}</span>
      </el-button>
    </div>

    <!-- 搜索命令面板：项目/会话关键字搜索 + 推荐入口 -->
    <teleport to="body">
      <div v-if="searchVisible" class="palette-mask" @mousedown.self="closeSearch">
        <div class="palette" @mousedown.stop>
          <div class="palette-input">
            <el-icon class="palette-input-icon"><Search /></el-icon>
            <input
              ref="paletteInputRef"
              v-model="searchKeyword"
              class="palette-input-field"
              :placeholder="t('project.searchPlaceholder')"
              @keydown.esc="closeSearch"
            />
          </div>

          <div class="palette-body">
            <template v-if="visibleSessions.length > 0">
              <div class="palette-section">
                {{ hasKeyword ? t('chat.sessions') : t('chat.recentSessions') }}
              </div>
              <div
                v-for="item in visibleSessions"
                :key="item.id"
                class="palette-item"
                @click="onPickSession(item.id)"
              >
                <el-icon class="palette-item-icon"><ChatLineRound /></el-icon>
                <span class="palette-item-title">{{ item.title || t('chat.newChat') }}</span>
                <span class="palette-item-meta">{{ projectNameOf(item.projectId) }}</span>
              </div>
            </template>

            <div v-if="hasKeyword && matchedSessions.length === 0" class="palette-empty">
              {{ t('common.empty') }}
            </div>

            <div class="palette-section">{{ t('project.recommend') }}</div>
            <div class="palette-item" @click="onNewFromPalette">
              <el-icon class="palette-item-icon"><Edit /></el-icon>
              <span class="palette-item-title">{{ t('chat.newChatAction') }}</span>
            </div>
            <div class="palette-item" @click="onSettingsFromPalette">
              <el-icon class="palette-item-icon"><Setting /></el-icon>
              <span class="palette-item-title">{{ t('settings.title') }}</span>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </aside>
</template>

<style scoped lang="scss">
.sidebar-head {
  padding: 10px 16px 12px;
  /* macOS 隐藏标题栏后，顶部区域需可拖拽移动窗口（系统红黄绿按钮不受影响） */
  -webkit-app-region: drag;
}

/* 右边缘拖拽手柄：调整侧栏宽度 */
.sidebar-resizer {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  -webkit-app-region: no-drag;
}

.sidebar-resizer:hover,
body.resizing .sidebar-resizer {
  background: var(--desk-primary-soft);
}

/* macOS：顶部让出系统红黄绿按钮，并使品牌 Logo 顶部与右侧正文区顶部对齐 */
.sidebar-head.mac {
  padding-top: var(--desk-header-height);
}

.brand {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-width: 0;
  margin-bottom: 16px;
}

.brand-text {
  flex: 1;
  min-width: 0;
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: contain;
  flex-shrink: 0;
}

.brand-name {
  font-size: 18px;
  font-weight: 600;
  line-height: 32px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Logo 区域右侧搜索入口 */
.brand-search {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--desk-text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: color 0.15s ease;
}

.brand-search:hover {
  color: var(--desk-primary);
}

/* 新建对话：与会话条目同款列表行（同字号/内边距/圆角），悬浮高亮 */
.new-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 0;
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

/* 「项目:」分组标题：右侧搜索/新建入口 */
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
  font-size: 14px;
  color: var(--desk-text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.project-icon-btn:hover {
  color: var(--desk-primary);
}

/* --- 搜索命令面板（居中弹框 + 遮罩） --- */
.palette-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.palette {
  width: 640px;
  max-width: calc(100vw - 40px);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--desk-bg);
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.palette-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--desk-border);
  color: var(--desk-text-tertiary);
}

.palette-input-field {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--desk-text);
  font-size: 14px;
  font-family: inherit;
}

.palette-input-field::placeholder {
  color: var(--desk-text-tertiary);
}

.palette-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.palette-section {
  padding: 8px 10px 4px;
  font-size: 12px;
  color: var(--desk-text-tertiary);
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  font-size: 14px;
  transition: background 0.12s ease;
}

.palette-item:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.palette-item-icon {
  flex-shrink: 0;
  font-size: 15px;
}

.palette-item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-item-meta {
  flex-shrink: 0;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--desk-text-tertiary);
}

.palette-empty {
  padding: 10px;
  font-size: 13px;
  color: var(--desk-text-tertiary);
  text-align: center;
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
  padding: 6px 10px 6px 6px;
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
  padding-left: 0;
  margin-bottom: 12px;
}

.desk-sidebar.collapsed .brand-text,
.desk-sidebar.collapsed .new-btn-label,
.desk-sidebar.collapsed .foot-label,
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
