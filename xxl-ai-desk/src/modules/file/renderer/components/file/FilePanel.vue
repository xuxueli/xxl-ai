<script setup lang="ts">
/*
 * 右侧「文件」面板：左为项目目录文件树，右为选中文件内容（可编辑代码 / 预览）。
 * 顶部提供保存、预览切换、打开（左半默认应用打开 / 右半打开方式下拉）与「打开所在文件夹」。
 * 文件树支持右键菜单：默认应用打开 / 打开所在文件夹 / 复制路径 / 删除（移入废纸篓）。
 * 查看器支持 Markdown / 图片 / 视频 / 音频预览。
 * 文件树状态由 useProjectFileTree 维护，查看器由 FileViewer 渲染，右键菜单由 FileContextMenu 渲染。
 * @author xuxueli 2026-10-18
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@common/renderer/api'
import { t } from '@renderer/shell/i18n'
import { useToolPanelStore } from '@modules/toolPanel/renderer'
import { normalizePath, parentDir } from '@modules/file/renderer/utils/path'
import { imageMimeOf, mediaKindOf } from '@common/shared/fileTypes'
import {
  EDITOR_THEME_STORAGE_KEY,
  isEditorThemeId,
  type EditorThemeId
} from '@common/renderer/components/CodeEditor/editorThemes'
import FileToolbar from '@modules/file/renderer/components/file/FileToolbar.vue'
import FileViewer from '@modules/file/renderer/components/file/FileViewer.vue'
import FileTreePanel from '@modules/file/renderer/components/file/FileTreePanel.vue'
import FileContextMenu from '@modules/file/renderer/components/file/FileContextMenu.vue'
import type { FileContent, FsEntry } from '@modules/file/shared'
import type { OpenWithApp } from '@modules/platform/shared'

const props = defineProps<{
  sessionId: string
  projectId?: number
  root?: string
  projectName?: string
}>()

/* 工具面板 store：选中文件与预览态按会话隔离 */
const toolPanel = useToolPanelStore()
const fileState = computed(() => toolPanel.sliceOf(props.sessionId).fileExplorer)

/* 编辑器主题：本地持久化，跨会话共用 */
const editorTheme = ref<EditorThemeId>(
  isEditorThemeId(localStorage.getItem(EDITOR_THEME_STORAGE_KEY))
    ? (localStorage.getItem(EDITOR_THEME_STORAGE_KEY) as EditorThemeId)
    : 'auto'
)

/* 切换编辑器主题并持久化 */
function onThemeCommand(theme: EditorThemeId): void {
  editorTheme.value = theme
  try {
    localStorage.setItem(EDITOR_THEME_STORAGE_KEY, theme)
  } catch {
    /* 本地存储不可用时忽略（仅影响恢复） */
  }
}
/* 文件树是否收起（收起时仅展示文件内容） */
const treeCollapsed = computed(() => fileState.value.treeCollapsed)

/* 折叠 / 展开文件树区域 */
function toggleTree(): void {
  toolPanel.toggleTreeCollapsed(props.sessionId)
}

/* 当前选中节点、文件内容与加载/错误态、是否预览 */
const selected = ref<FsEntry | null>(null)
const file = ref<FileContent | null>(null)
const fileLoading = ref(false)
const fileError = ref('')
const preview = ref(fileState.value.preview)

/* 预览态回写工具面板状态（切换会话后保留） */
watch(preview, (value) => {
  toolPanel.setPreview(props.sessionId, value)
})

/* 编辑态：original 为磁盘基线，draft 为编辑内容；二者不一致即未保存 */
const original = ref('')
const draft = ref('')
const saving = ref(false)

/* 本机可用「打开方式」应用（macOS 探测常见编辑器） */
const openApps = ref<OpenWithApp[]>([])

/* 右键菜单：可见态、鼠标位置与目标文件（菜单动作只针对该文件） */
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  path: '',
  name: '',
  isDir: false,
  isRoot: false
})

/* 文件变更监听解绑函数 */
let offFsChange: (() => void) | null = null

/* 挂载：监听当前文件所在目录变更，并探测本机「打开方式」应用 */
onMounted(async () => {
  offFsChange = api.fs.onChange((dir) => {
    if (selected.value && parentDir(selected.value.path) === normalizePath(dir)) {
      void refreshSelected()
    }
  })
  try {
    openApps.value = await api.shell.openWithApps()
  } catch {
    openApps.value = []
  }
  /* 恢复会话上次选中的文件（切换会话后保留文件视图） */
  const path = fileState.value.selectedPath
  if (path && props.root) {
    const entry: FsEntry = { name: path.split(/[\\/]/).pop() || path, path, isDir: false }
    await select(entry)
  }
})

/* 卸载：取消文件变更监听 */
onBeforeUnmount(() => {
  offFsChange?.()
  offFsChange = null
})

/* 扩展名小写（含点） */
function extOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

/* 是否为可预览的图片文件 */
function isImageName(name: string): boolean {
  return Boolean(imageMimeOf(name))
}

/* 当前文件的图片 / Markdown / 音视频判定、是否可预览、预览是否生效 */
const isImage = computed(() => Boolean(file.value) && isImageName(file.value?.name ?? ''))
const isMarkdown = computed(
  () => Boolean(file.value) && ['.md', '.markdown'].includes(extOf(file.value?.name ?? ''))
)
const isVideo = computed(() => Boolean(file.value) && mediaKindOf(file.value?.name ?? '') === 'video')
const isAudio = computed(() => Boolean(file.value) && mediaKindOf(file.value?.name ?? '') === 'audio')
const canPreview = computed(() => isImage.value || isMarkdown.value)
const showPreview = computed(() => preview.value && canPreview.value)

/* 可编辑：文本文件且未被截断 */
const editable = computed(() => Boolean(file.value) && !file.value?.binary && !file.value?.truncated)
/* 有未保存修改 */
const dirty = computed(() => editable.value && draft.value !== original.value)

/* 清空当前文件选择与内容（根目录切换 / 文件被删除时） */
function clearSelection(): void {
  selected.value = null
  toolPanel.setSelectedPath(props.sessionId, '')
  file.value = null
  fileError.value = ''
  preview.value = false
  original.value = ''
  draft.value = ''
}

/* 选中的文件在磁盘上变化（或被删除）时回读；编辑中（dirty）不覆盖 */
async function refreshSelected(): Promise<void> {
  const projectId = props.projectId
  const entry = selected.value
  if (!projectId || !entry || dirty.value) {
    return
  }
  try {
    const loaded = await api.fs.read(projectId, entry.path)
    file.value = loaded
    original.value = loaded.content
    draft.value = loaded.content
  } catch {
    /* 文件已被删除：清空内容 */
    clearSelection()
  }
}

/* 选中文件并加载内容（有未保存修改时先确认）；返回是否完成选中 */
async function select(entry: FsEntry): Promise<boolean> {
  const projectId = props.projectId
  if (!projectId) {
    return false
  }
  /* 重复选中当前文件：保留编辑内容，不再触发未保存确认 */
  if (selected.value?.path === entry.path && file.value) {
    return true
  }
  if (dirty.value) {
    try {
      await ElMessageBox.confirm(t('panel.unsavedConfirm'), t('panel.unsavedTitle'), {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel')
      })
    } catch {
      /* 取消切换 */
      return false
    }
  }
  selected.value = entry
  toolPanel.setSelectedPath(props.sessionId, entry.path)
  fileLoading.value = true
  fileError.value = ''
  preview.value = false
  original.value = ''
  draft.value = ''
  try {
    const loaded = await api.fs.read(projectId, entry.path)
    file.value = loaded
    original.value = loaded.content
    draft.value = loaded.content
    /* 图片直接进入预览，避免展示无意义的二进制代码 */
    preview.value = isImageName(loaded.name) && Boolean(loaded.dataUrl)
  } catch (error) {
    file.value = null
    fileError.value = (error as Error).message || t('panel.loadFail')
  } finally {
    fileLoading.value = false
  }
  return true
}

/* 保存编辑内容到磁盘 */
async function save(): Promise<void> {
  const projectId = props.projectId
  if (!projectId || !file.value || !editable.value || saving.value || !dirty.value) {
    return
  }
  saving.value = true
  try {
    await api.fs.write(projectId, file.value.path, draft.value)
    file.value = {
      ...file.value,
      content: draft.value,
      size: new Blob([draft.value]).size
    }
    original.value = draft.value
    ElMessage.success(t('common.saved'))
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    saving.value = false
  }
}

/* 根目录变化时清空当前文件选择（文件树由 composable 自行重置） */
watch(
  () => props.root,
  () => {
    clearSelection()
  }
)

/* 面包屑：项目名 > 相对根目录的各级路径 */
const breadcrumb = computed(() => {
  const parts: string[] = []
  if (props.projectName) {
    parts.push(props.projectName)
  }
  if (props.root && file.value) {
    const root = props.root.replace(/\\/g, '/').replace(/\/$/, '')
    const full = normalizePath(file.value.path)
    const rel = full.startsWith(root) ? full.slice(root.length + 1) : full
    parts.push(...rel.split('/').filter(Boolean))
  }
  return parts
})

/* 打开所在的文件夹：优先文件所在目录，未选中文件时打开项目根目录 */
function revealFolder(): void {
  const target = file.value?.path ?? props.root
  if (target) {
    void api.shell.reveal(target)
  }
}

/* 复制指定路径到剪贴板（工具栏与右键菜单共用） */
async function copyToClipboard(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path)
    ElMessage.success(t('panel.copied'))
  } catch {
    ElMessage.error(t('common.copyFailed'))
  }
}

/* 复制当前文件绝对路径 */
async function copyPath(): Promise<void> {
  if (!file.value) {
    return
  }
  await copyToClipboard(file.value.path)
}

/* 目标是否为可编辑控件（输入框 / 文本域 / 可编辑区域） */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  )
}

/* 文件面板快捷键：选中文件后 ⌘/Ctrl+C 默认复制文件路径；不干扰输入与文本选择 */
function onPanelKeydown(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'c') {
    return
  }
  if (!selected.value || isEditableTarget(event.target)) {
    return
  }
  /* 已有文本选区时保持系统复制行为 */
  if (window.getSelection()?.toString()) {
    return
  }
  event.preventDefault()
  void copyToClipboard(selected.value.path)
}

/* 直接以系统默认应用打开当前文件（「打开」按钮左半区） */
function openDefault(): void {
  if (!file.value) {
    return
  }
  void api.shell.openPath(file.value.path)
}

/* 打开方式下拉分发 */
function onOpenCommand(command: string): void {
  if (!file.value) {
    return
  }
  if (command === 'default') {
    void api.shell.openPath(file.value.path)
  } else if (command === 'folder') {
    revealFolder()
  } else if (command === 'copy') {
    void copyPath()
  } else if (command.startsWith('app:')) {
    void api.shell.openWith(command.slice(4), file.value.path)
  }
}

/* 右键文件 / 目录：文件先选中（保留未保存修改确认），目录直接展示菜单 */
async function openContextMenu(
  entry: FsEntry,
  position: { x: number; y: number }
): Promise<void> {
  if (!props.root) {
    return
  }
  if (!entry.isDir) {
    const selectedOk = await select(entry)
    if (!selectedOk) {
      return
    }
  }
  contextMenu.value = {
    visible: true,
    x: position.x,
    y: position.y,
    path: entry.path,
    name: entry.name,
    isDir: entry.isDir,
    isRoot: normalizePath(entry.path) === normalizePath(props.root ?? '')
  }
}

/* 右键菜单：默认应用打开 */
function menuOpenDefault(): void {
  void api.shell.openPath(contextMenu.value.path)
}

/* 右键菜单：在文件管理器中显示 */
function menuReveal(): void {
  void api.shell.reveal(contextMenu.value.path)
}

/* 右键菜单：复制文件路径 */
async function menuCopyPath(): Promise<void> {
  await copyToClipboard(contextMenu.value.path)
}

/* 右键菜单：删除文件（移入系统废纸篓，操作前二次确认） */
async function menuRemove(): Promise<void> {
  const projectId = props.projectId
  if (!projectId) {
    return
  }
  const { path, name } = contextMenu.value
  /* 根目录不可删除，避免误操作移除整个项目目录 */
  if (normalizePath(path) === normalizePath(props.root ?? '')) {
    return
  }
  try {
    await ElMessageBox.confirm(t('panel.deleteConfirm', [name]), t('panel.deleteTitle'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return
  }
  try {
    await api.fs.trash(projectId, path)
    ElMessage.success(t('common.deleted'))
    /* 删除的是当前文件或当前文件所在目录：清空查看器，避免残留已删除内容 */
    const selectedPath = selected.value?.path ?? ''
    if (
      selectedPath === path ||
      selectedPath.startsWith(`${path}/`) ||
      selectedPath.startsWith(`${path}\\`)
    ) {
      clearSelection()
    }
  } catch (error) {
    ElMessage.error((error as Error).message || t('panel.deleteFail'))
  }
}
</script>

<template>
  <div class="file-panel" @keydown="onPanelKeydown">
    <FileToolbar
      :breadcrumb="breadcrumb"
      :editable="editable"
      :dirty="dirty"
      :saving="saving"
      :can-preview="canPreview"
      :show-preview="showPreview"
      :has-file="Boolean(file)"
      :has-root="Boolean(root)"
      :tree-collapsed="treeCollapsed"
      :open-apps="openApps"
      :editor-theme="editorTheme"
      @save="save"
      @toggle-preview="preview = !preview"
      @toggle-tree="toggleTree"
      @reveal="revealFolder"
      @open-default="openDefault"
      @open-command="onOpenCommand"
      @theme-command="onThemeCommand"
    />

    <div class="file-main">
      <!-- 左：项目目录树（可折叠隐藏） -->
      <FileTreePanel
        v-show="!treeCollapsed"
        :session-id="props.sessionId"
        :project-id="props.projectId"
        :root="root"
        :selected-path="selected?.path ?? ''"
        @select="select"
        @context-menu="openContextMenu"
      />

      <!-- 右：文件内容 -->
      <FileViewer
        v-model:draft="draft"
        :root="root"
        :file="file"
        :loading="fileLoading"
        :error="fileError"
        :editable="editable"
        :show-preview="showPreview"
        :is-image="isImage"
        :is-markdown="isMarkdown"
        :is-video="isVideo"
        :is-audio="isAudio"
        :saving="saving"
        :editor-theme="editorTheme"
        @save="save"
      />
    </div>

    <!-- 右键菜单：定位到鼠标位置，动作针对被右键的文件 -->
    <FileContextMenu
      v-model:visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :is-dir="contextMenu.isDir"
      :is-root="contextMenu.isRoot"
      @open="menuOpenDefault"
      @reveal="menuReveal"
      @copy="menuCopyPath"
      @remove="menuRemove"
    />
  </div>
</template>

<style scoped lang="scss">
.file-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* 主体：左文件树 + 右内容 */
.file-main {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
</style>
