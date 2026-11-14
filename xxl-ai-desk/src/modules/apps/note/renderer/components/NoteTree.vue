<script setup lang="ts">
/*
 * 笔记目录：根目录不展示（直接列出其子项）、按名称过滤、右键新建 / 重命名 / 删除 / 定位、拖拽移动，宽度可拖拽。
 * @author xuxueli 2026-11-08
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@common/renderer/api'
import { CollapseShell, DeskTooltip } from '@common/renderer/components'
import { CollapseAllIcon, ExpandAllIcon } from '@common/renderer/components/icons'
import { useCollapseAnimation } from '@common/renderer/composables/useCollapseAnimation'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@common/renderer/i18n'
import PanelResizer from '@renderer/shell/layout/components/PanelResizer/index.vue'
import NoteTreeNode from '@modules/apps/note/renderer/components/NoteTreeNode.vue'
import NoteNameDialog from '@modules/apps/note/renderer/components/NoteNameDialog.vue'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import { useNoteTreeDrag } from '@modules/apps/note/renderer/composables/useNoteTreeDrag'
import { parentDir } from '@modules/apps/note/renderer/utils/path'
import { matchesNoteEntry } from '@modules/apps/note/renderer/utils/tree'
import type { NoteEntry } from '@modules/apps/note/shared'

const store = useNoteStore()
const { dragging, dropTargetPath, endDrag, canDropInto } = useNoteTreeDrag()

/* 树宽度：拖拽像素值，按最小宽度夹取 */
const treeWidth = computed({
  get: () => store.treeWidth,
  set: (value: number) => store.setTreeWidth(value)
})

/* 目录折叠过渡：仅在折叠状态变化时播放 */
const { animated, onTransitionEnd } = useCollapseAnimation(() => store.treeCollapsed)

/* 根目录子项：根目录本身不展示，直接以顶层节点呈现 */
const rootChildren = computed(() => store.childrenMap[store.rootPath] ?? [])

/* 过滤后的根目录可见子项 */
const visibleRootChildren = computed(() => {
  const word = store.keyword.trim()
  return word
    ? rootChildren.value.filter((entry) => matchesNoteEntry(entry, word, store.childrenMap))
    : rootChildren.value
})

/* 拖拽到空白区：移动到笔记根目录 */
function onRootDragOver(event: DragEvent): void {
  if (!canDropInto(store.rootPath)) {
    return
  }
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dropTargetPath.value = store.rootPath
}

/* 离开空白区：移入子元素时保留高亮 */
function onRootDragLeave(event: DragEvent): void {
  const current = event.currentTarget
  const next = event.relatedTarget
  if (current instanceof Node && next instanceof Node && current.contains(next)) {
    return
  }
  if (dropTargetPath.value === store.rootPath) {
    dropTargetPath.value = ''
  }
}

/* 在空白区投放：把被拖节点移动到根目录 */
async function onRootDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  const source = dragging.value
  const target = store.rootPath
  if (!source || !canDropInto(target)) {
    endDrag()
    return
  }
  endDrag()
  await store.moveEntry(source, target)
}

/* 右键菜单状态 */
const contextMenu = ref<{ entry: NoteEntry; x: number; y: number; visible: boolean } | null>(
  null
)

/* 右键菜单元素与最终定位（保证不超出视口） */
const menuRef = ref<HTMLElement | null>(null)
const menuPosition = ref({ left: 0, top: 0 })

/* 右键菜单动作：目录含新建入口，文件仅重命名 / 复制 / 删除 */
type NoteMenuAction = 'newNote' | 'newFolder' | 'rename' | 'copy' | 'trash'

/* 右键菜单项 */
interface NoteMenuItem {
  action: NoteMenuAction
  labelKey: string
  icon: string
}

/* 菜单项按目录 / 文件区分 */
const menuItems = computed<NoteMenuItem[]>(() => {
  const entry = contextMenu.value?.entry
  if (!entry) {
    return []
  }
  if (entry.isDir) {
    return [
      { action: 'newNote', labelKey: 'note.newNote', icon: 'DocumentAdd' },
      { action: 'newFolder', labelKey: 'note.newFolder', icon: 'FolderAdd' },
      { action: 'rename', labelKey: 'note.rename', icon: 'EditPen' },
      { action: 'trash', labelKey: 'note.delete', icon: 'Delete' }
    ]
  }
  return [
    { action: 'rename', labelKey: 'note.rename', icon: 'EditPen' },
    { action: 'copy', labelKey: 'note.copy', icon: 'CopyDocument' },
    { action: 'trash', labelKey: 'note.delete', icon: 'Delete' }
  ]
})

/* 右键打开菜单：先贴近鼠标，再按菜单实际尺寸向内收拢 */
async function openMenu(entry: NoteEntry, position: { x: number; y: number }): Promise<void> {
  contextMenu.value = { entry, ...position, visible: true }
  menuPosition.value = { left: position.x, top: position.y }
  await nextTick()
  const el = menuRef.value
  if (!el) {
    return
  }
  const left = Math.min(position.x, window.innerWidth - el.offsetWidth - 4)
  const top = Math.min(position.y, window.innerHeight - el.offsetHeight - 4)
  menuPosition.value = { left: Math.max(4, left), top: Math.max(4, top) }
}

/* 关闭菜单 */
function closeMenu(): void {
  if (contextMenu.value) {
    contextMenu.value = null
  }
}

/* 目标目录：文件取其父目录 */
function targetDirOf(entry: NoteEntry): string {
  return entry.isDir ? entry.path : parentDir(entry.path)
}

/* 名称弹框目标：新建笔记 / 新建目录 / 重命名 */
type NoteNameTarget = 'newNote' | 'newFolder' | 'rename'

/* 名称弹框状态：新建时携带初始目录，重命名不展示位置选择 */
const nameDialogVisible = ref(false)
const nameDialogError = ref('')
const nameDialogState = ref<{
  target: NoteNameTarget
  title: string
  placeholder: string
  requiredMessage: string
  initialValue: string
  directory?: string
  entry: NoteEntry | null
} | null>(null)

/* 弹框初始名称：新建笔记用默认标题、新建目录留空；重命名笔记隐藏 .md 扩展名 */
function initialNameOf(
  target: NoteNameTarget,
  entry: NoteEntry | null,
  isFolder: boolean
): string {
  if (target === 'newNote') {
    return t('note.untitled')
  }
  if (target === 'newFolder') {
    return ''
  }
  const name = entry?.name ?? ''
  return isFolder ? name : name.replace(/\.md$/i, '')
}

/* 打开名称弹框：按笔记 / 目录与新建 / 重命名回填标题、提示与初始名称 */
function openNameDialog(target: NoteNameTarget, dir: string, entry: NoteEntry | null): void {
  const isFolder = target === 'newFolder' || (target === 'rename' && Boolean(entry?.isDir))
  const titles: Record<NoteNameTarget, string> = {
    newNote: t('note.newNote'),
    newFolder: t('note.newFolder'),
    rename: isFolder ? t('note.renameFolder') : t('note.renameNote')
  }
  const placeholders: Record<NoteNameTarget, string> = {
    newNote: t('note.noteNamePlaceholder'),
    newFolder: t('note.folderNamePlaceholder'),
    rename: t('note.renameNamePlaceholder')
  }
  const requiredMessages: Record<NoteNameTarget, string> = {
    newNote: t('note.noteNameRequired'),
    newFolder: t('note.folderNameRequired'),
    rename: t('note.renameNameRequired')
  }
  nameDialogState.value = {
    target,
    title: titles[target],
    placeholder: placeholders[target],
    requiredMessage: requiredMessages[target],
    initialValue: initialNameOf(target, entry, isFolder),
    directory: target === 'rename' ? undefined : dir,
    entry
  }
  nameDialogError.value = ''
  nameDialogVisible.value = true
}

/* 新建笔记 */
function createNote(dir: string): void {
  openNameDialog('newNote', dir, null)
}

/* 新建目录 */
function createFolder(dir: string): void {
  openNameDialog('newFolder', dir, null)
}

/* 重命名 */
function rename(entry: NoteEntry): void {
  openNameDialog('rename', '', entry)
}

/* 提交名称：成功关闭弹框，失败在弹框内就地提示 */
async function onNameSubmit(name: string, directory: string): Promise<void> {
  const state = nameDialogState.value
  if (!state) {
    return
  }
  nameDialogError.value = ''
  try {
    switch (state.target) {
      case 'newNote':
        await store.createNote(directory, name)
        break
      case 'newFolder':
        await store.createFolder(directory, name)
        break
      case 'rename':
        if (state.entry) {
          await store.renameEntry(state.entry, name)
        }
        break
      default:
        break
    }
    nameDialogVisible.value = false
  } catch (submitError) {
    nameDialogError.value = ipcErrorMessage(submitError)
  }
}

/* 删除：移入系统废纸篓 */
async function trash(entry: NoteEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('note.deleteConfirm', [entry.name]),
      entry.isDir ? t('note.deleteFolder') : t('note.deleteNote'),
      {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )
    await store.trashEntry(entry)
  } catch {
    /* 取消 */
  }
}

/* 在系统中定位 */
async function revealPath(path: string): Promise<void> {
  try {
    await api.shell.reveal(path)
  } catch (revealError) {
    ElMessage.error(ipcErrorMessage(revealError))
  }
}

/* 目录快捷“+”：在当前目录下新建笔记 */
function createNoteIn(entry: NoteEntry): void {
  createNote(entry.path)
}

/* 执行菜单动作：右键与悬浮“...”共用同一套逻辑 */
async function onMenuAction(action: NoteMenuAction): Promise<void> {
  const entry = contextMenu.value?.entry
  closeMenu()
  if (!entry) {
    return
  }
  switch (action) {
    case 'newNote':
      createNote(targetDirOf(entry))
      break
    case 'newFolder':
      createFolder(targetDirOf(entry))
      break
    case 'rename':
      rename(entry)
      break
    case 'copy':
      await store.copyEntry(entry)
      break
    case 'trash':
      await trash(entry)
      break
    default:
      break
  }
}

/* 点击菜单外部关闭 */
function onDocumentMouseDown(event: MouseEvent): void {
  if (!contextMenu.value) {
    return
  }
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    closeMenu()
  }
}

/* Esc 关闭菜单 */
function onDocumentKeydown(event: KeyboardEvent): void {
  if (contextMenu.value && event.key === 'Escape') {
    closeMenu()
  }
}

onMounted(() => {
  store.bindWatcher()
  document.addEventListener('mousedown', onDocumentMouseDown, true)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('scroll', closeMenu, true)
  window.addEventListener('resize', closeMenu)
})

onBeforeUnmount(() => {
  store.unbindWatcher()
  document.removeEventListener('mousedown', onDocumentMouseDown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('scroll', closeMenu, true)
  window.removeEventListener('resize', closeMenu)
})
</script>

<template>
  <CollapseShell
    class="note-tree"
    :width="treeWidth"
    :collapsed="store.treeCollapsed"
    :animated="animated"
    @transitionend="onTransitionEnd"
  >
    <!-- 右边缘拖拽手柄：拖拽调整目录宽度，双击恢复默认；折叠时随外壳宽度隐藏 -->
    <PanelResizer
      v-if="!store.treeCollapsed"
      v-model:size="treeWidth"
      side="left"
      :title="t('layout.resetPanelWidth')"
      @reset="store.resetTreeWidth"
    />
    <div class="note-tree-inner">
      <div class="note-tree-head">
        <span class="note-tree-title">{{ t('note.title') }}</span>
        <!-- 顺序：新建笔记 → 新建目录 → 展开/折叠全部 → 打开目录 -->
        <DeskTooltip :content="t('note.newNote')">
          <button class="note-icon-btn" @click="createNote(store.rootPath)">
            <el-icon><DocumentAdd /></el-icon>
          </button>
        </DeskTooltip>
        <DeskTooltip :content="t('note.newFolder')">
          <button class="note-icon-btn" @click="createFolder(store.rootPath)">
            <el-icon><FolderAdd /></el-icon>
          </button>
        </DeskTooltip>
        <DeskTooltip
          :content="store.allDirsExpanded ? t('note.collapseAll') : t('note.expandAll')"
        >
          <button
            class="note-icon-btn"
            :disabled="!store.rootPath"
            @click="store.toggleAllDirs"
          >
            <CollapseAllIcon v-if="store.allDirsExpanded" class="note-toggle-icon" />
            <ExpandAllIcon v-else class="note-toggle-icon" />
          </button>
        </DeskTooltip>
        <DeskTooltip :content="t('note.openDir')">
          <button class="note-icon-btn" @click="revealPath(store.rootPath)">
            <el-icon><FolderOpened /></el-icon>
          </button>
        </DeskTooltip>
      </div>
      <div class="note-tree-filter">
        <el-input
          v-model="store.keyword"
          size="small"
          clearable
          :placeholder="t('note.searchPlaceholder')"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
      <el-scrollbar
        class="note-tree-body"
        :class="{ 'drop-root': store.rootPath !== '' && dropTargetPath === store.rootPath }"
        @dragover="onRootDragOver"
        @dragleave="onRootDragLeave"
        @drop="onRootDrop"
      >
        <template v-if="store.rootPath">
          <NoteTreeNode
            v-for="entry in visibleRootChildren"
            :key="entry.path"
            :entry="entry"
            :depth="0"
            @context-menu="openMenu"
            @create-note="createNoteIn"
          />
          <div
            v-if="!store.loading && store.keyword.trim() === '' && rootChildren.length === 0"
            class="note-tree-empty"
          >
            <div class="empty-title">{{ t('note.emptyTree') }}</div>
            <div class="empty-tip">{{ t('note.emptyTreeTip') }}</div>
          </div>
        </template>
        <div v-else class="note-tree-empty">
          <div class="empty-tip">{{ t('common.empty') }}</div>
        </div>
      </el-scrollbar>
    </div>
  </CollapseShell>

  <!-- 右键菜单：样式与文件树右键菜单保持一致 -->
  <Teleport to="body">
    <div
      v-if="contextMenu?.visible"
      ref="menuRef"
      class="note-menu"
      :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }"
      @contextmenu.prevent
    >
      <template v-for="(item, index) in menuItems" :key="item.action">
        <div v-if="index > 0 && item.action === 'trash'" class="note-menu-sep"></div>
        <button
          class="note-menu-item"
          :class="{ danger: item.action === 'trash' }"
          @click="onMenuAction(item.action)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ t(item.labelKey) }}</span>
        </button>
      </template>
    </div>
  </Teleport>

  <!-- 名称弹框：新建笔记 / 新建目录 / 重命名共用 -->
  <NoteNameDialog
    v-model="nameDialogVisible"
    :title="nameDialogState?.title ?? ''"
    :initial-value="nameDialogState?.initialValue ?? ''"
    :root-path="store.rootPath"
    :directory="nameDialogState?.directory"
    :placeholder="nameDialogState?.placeholder ?? ''"
    :required-message="nameDialogState?.requiredMessage ?? ''"
    :error-message="nameDialogError"
    @submit="onNameSubmit"
    @clear-error="nameDialogError = ''"
  />
</template>

<style scoped lang="scss">
/* 笔记目录：外层折叠外壳负责宽度过渡，内容区宽度固定，折叠时整体左移淡出 */
.note-tree {
  position: relative;
  height: 100%;
  min-width: 0;
}

.note-tree-inner {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--desk-surface-sidebar);
  border-right: 1px solid var(--desk-border);
}

.note-tree-head {
  flex-shrink: 0;
  height: 38px;
  padding: 0 8px 0 14px;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 与各板块子菜单标题保持同一字号 */
.note-tree-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--desk-text);
  font-size: var(--desk-font-lg);
  font-weight: 600;
}

.note-icon-btn {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--desk-text-secondary);
  /* 与项目名左侧图标同尺寸：button 默认不继承字号，需显式指定 */
  font-size: var(--desk-font-md);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.note-icon-btn:hover:not(:disabled) {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.note-icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* 展开 / 折叠全部：与项目名左侧图标同一尺寸 */
.note-toggle-icon {
  width: var(--desk-font-md);
  height: var(--desk-font-md);
}

.note-tree-filter {
  flex-shrink: 0;
  padding: 0 10px 8px;
}

.note-tree-body {
  flex: 1;
  min-height: 0;
  padding: 0 6px 12px;
}

/* 拖拽到空白区：提示将移动到根目录 */
.note-tree-body.drop-root {
  background: var(--desk-primary-soft);
}

.note-tree-empty {
  padding: 28px 14px;
  text-align: center;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-sm);
}

.empty-title {
  margin-bottom: 6px;
  color: var(--desk-text-secondary);
}

.empty-tip {
  line-height: 1.6;
}

/* 悬浮菜单：与文件树右键菜单统一视觉 */
.note-menu {
  position: fixed;
  z-index: 4000;
  min-width: 176px;
  padding: 4px;
  border: 1px solid var(--desk-border);
  border-radius: 10px;
  background: var(--desk-bg-elevated);
  box-shadow: var(--desk-shadow);
}

.note-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  text-align: left;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.note-menu-item:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.note-menu-item.danger {
  color: var(--desk-danger);
}

.note-menu-item.danger:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-danger);
}

.note-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--desk-border);
}
</style>
