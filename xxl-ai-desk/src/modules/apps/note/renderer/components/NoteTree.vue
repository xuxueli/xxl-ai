<script setup lang="ts">
/*
 * 笔记目录：根目录展开、按名称过滤、右键新建 / 重命名 / 删除 / 定位，宽度可拖拽。
 * @author xuxueli 2026-11-08
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@common/renderer/api'
import { t } from '@renderer/shell/i18n'
import PanelResizer from '@renderer/shell/layout/components/PanelResizer/index.vue'
import NoteTreeNode from '@modules/apps/note/renderer/components/NoteTreeNode.vue'
import NoteNameDialog from '@modules/apps/note/renderer/components/NoteNameDialog.vue'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import { parentDir } from '@modules/apps/note/renderer/utils/path'
import type { NoteEntry } from '@modules/apps/note/shared'

const store = useNoteStore()

/* 树宽度：拖拽像素值，按最小宽度夹取 */
const treeWidth = computed({
  get: () => store.treeWidth,
  set: (value: number) => store.setTreeWidth(value)
})

/* 根节点：以笔记目录名展示，点击箭头展开 / 收起整棵树 */
const rootEntry = computed<NoteEntry | null>(() => {
  if (!store.rootPath) {
    return null
  }
  return { name: store.rootName, path: store.rootPath, relativePath: '', isDir: true }
})

/* 根目录子项 */
const rootChildren = computed(() => store.childrenMap[store.rootPath] ?? [])

/* 右键菜单状态 */
const contextMenu = ref<{ entry: NoteEntry; x: number; y: number; visible: boolean } | null>(
  null
)

/* 右键菜单元素与最终定位（保证不超出视口） */
const menuRef = ref<HTMLElement | null>(null)
const menuPosition = ref({ left: 0, top: 0 })

/* 右键菜单动作 */
type NoteMenuAction = 'newNote' | 'newFolder' | 'rename' | 'trash' | 'reveal'

/* 右键菜单项 */
interface NoteMenuItem {
  action: NoteMenuAction
  labelKey: string
  icon: string
}

/* 菜单项：根目录不提供重命名 / 删除 */
const menuItems = computed<NoteMenuItem[]>(() => {
  const entry = contextMenu.value?.entry
  if (!entry) {
    return []
  }
  const items: NoteMenuItem[] = [
    { action: 'newNote', labelKey: 'note.newNote', icon: 'DocumentAdd' },
    { action: 'newFolder', labelKey: 'note.newFolder', icon: 'FolderAdd' }
  ]
  if (entry.path !== store.rootPath) {
    items.push(
      { action: 'rename', labelKey: 'note.rename', icon: 'EditPen' },
      { action: 'trash', labelKey: 'note.delete', icon: 'Delete' }
    )
  }
  items.push({ action: 'reveal', labelKey: 'note.reveal', icon: 'FolderOpened' })
  return items
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

/* 名称弹框状态 */
const nameDialogVisible = ref(false)
const nameDialogState = ref<{
  target: NoteNameTarget
  title: string
  initialValue: string
  dir: string
  entry: NoteEntry | null
} | null>(null)

/* 打开名称弹框：按目标回填标题与初始名称 */
function openNameDialog(target: NoteNameTarget, dir: string, entry: NoteEntry | null): void {
  const titles: Record<NoteNameTarget, string> = {
    newNote: t('note.newNote'),
    newFolder: t('note.newFolder'),
    rename: t('note.rename')
  }
  const initialValue =
    target === 'newNote' ? t('note.untitled') : target === 'rename' ? (entry?.name ?? '') : ''
  nameDialogState.value = { target, title: titles[target], initialValue, dir, entry }
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

/* 提交名称：按目标执行对应操作 */
async function onNameSubmit(name: string): Promise<void> {
  const state = nameDialogState.value
  if (!state) {
    return
  }
  switch (state.target) {
    case 'newNote':
      await store.createNote(state.dir, name)
      break
    case 'newFolder':
      await store.createFolder(state.dir, name)
      break
    case 'rename':
      if (state.entry) {
        await store.renameEntry(state.entry, name)
      }
      break
    default:
      break
  }
}

/* 删除：移入系统废纸篓 */
async function trash(entry: NoteEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('note.deleteConfirm', [entry.name]),
      t('note.delete'),
      {
        confirmButtonText: t('common.confirm'),
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
    ElMessage.error(String(revealError))
  }
}

/* 右键菜单：在系统中定位 */
function reveal(entry: NoteEntry): void {
  void revealPath(entry.path)
}

/* 执行菜单动作 */
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
    case 'trash':
      await trash(entry)
      break
    case 'reveal':
      reveal(entry)
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
  <div class="note-tree" :style="{ width: `${treeWidth}px` }">
    <!-- 右边缘拖拽手柄：拖拽调整目录宽度，双击恢复默认 -->
    <PanelResizer
      v-model:size="treeWidth"
      side="left"
      :title="t('layout.resetPanelWidth')"
      @reset="store.resetTreeWidth"
    />
    <div class="note-tree-head">
      <span class="note-tree-title">{{ t('note.title') }}</span>
      <button class="note-icon-btn" :title="t('note.newNote')" @click="createNote(store.rootPath)">
        <el-icon><DocumentAdd /></el-icon>
      </button>
      <button class="note-icon-btn" :title="t('note.newFolder')" @click="createFolder(store.rootPath)">
        <el-icon><FolderAdd /></el-icon>
      </button>
      <button class="note-icon-btn" :title="t('note.openDir')" @click="revealPath(store.rootPath)">
        <el-icon><FolderOpened /></el-icon>
      </button>
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
    <el-scrollbar class="note-tree-body">
      <template v-if="rootEntry">
        <NoteTreeNode
          :entry="rootEntry"
          :depth="0"
          @context-menu="openMenu"
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
          <div v-if="index > 0 && item.action === 'reveal'" class="note-menu-sep"></div>
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
      :placeholder="t('note.namePlaceholder')"
      @submit="onNameSubmit"
    />
  </div>
</template>

<style scoped lang="scss">
.note-tree {
  position: relative;
  flex-shrink: 0;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--desk-surface-sidebar);
  border-right: 1px solid var(--desk-border);
}

.note-tree-head {
  flex-shrink: 0;
  height: 44px;
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
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--desk-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.note-icon-btn:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
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
