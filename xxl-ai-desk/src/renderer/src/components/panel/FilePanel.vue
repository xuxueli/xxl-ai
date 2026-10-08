<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../../api'
import { t } from '../../i18n'
import { renderMarkdown } from '../../composables/useMarkdown'
import { onCodeCopyClick } from '../../composables/useCodeCopy'
import { escapeHtml, highlightCode, languageOf } from '../../composables/useHighlight'
import FileTreeNode from './FileTreeNode.vue'
import type { FileContent, FsEntry, OpenWithApp } from '../../../../shared/ipc'

/*
 * 右侧「文件」面板：左为选中文件内容（可编辑代码 / 预览），右为项目目录文件树。
 * 顶部提供保存、预览切换、打开方式下拉与「打开所在文件夹」。
 */
const props = defineProps<{ root?: string; projectName?: string }>()

/* 编辑区着色长度上限：超过则退化为纯文本，保证大文件编辑流畅 */
const MAX_EDITOR_HIGHLIGHT = 100000

/* 目录 → 子项（懒加载缓存）、展开态、加载态 */
const childrenMap = ref<Record<string, FsEntry[]>>({})
const expandedMap = ref<Record<string, boolean>>({})
const loadingMap = ref<Record<string, boolean>>({})

const keyword = ref('')
const selected = ref<FsEntry | null>(null)
const file = ref<FileContent | null>(null)
const fileLoading = ref(false)
const fileError = ref('')
const preview = ref(false)

/* 编辑态：original 为磁盘基线，draft 为编辑内容；二者不一致即未保存 */
const original = ref('')
const draft = ref('')
const saving = ref(false)
const editorRef = ref<HTMLTextAreaElement | null>(null)
const gutterRef = ref<HTMLElement | null>(null)
const highlightRef = ref<HTMLElement | null>(null)

/* 本机可用「打开方式」应用（macOS 探测常见编辑器） */
const openApps = ref<OpenWithApp[]>([])

/* 已注册监听的目录集合（避免重复 IPC）与正在重载的目录集合 */
const watchedDirs = new Set<string>()
const reloading = new Set<string>()
let offFsChange: (() => void) | null = null

/* 统一路径分隔符，便于跨平台比较 */
function norm(path: string): string {
  return path.replace(/\\/g, '/')
}

/* 取文件所在目录（统一正斜杠） */
function parentDir(file: string): string {
  const normalized = norm(file)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index)
}

onMounted(async () => {
  /* 目录变更 → 刷新对应已加载目录 */
  offFsChange = api.fs.onChange(onFsChange)
  try {
    openApps.value = await api.shell.openWithApps()
  } catch {
    openApps.value = []
  }
})

onBeforeUnmount(() => {
  offFsChange?.()
  for (const dir of [...watchedDirs]) {
    unwatch(dir)
  }
  watchedDirs.clear()
})

/* 根目录直接子项 */
const rootChildren = computed(() => (props.root ? (childrenMap.value[props.root] ?? []) : []))

/* 扩展名小写（含点） */
function extOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

/* 可预览图片扩展名 */
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']

function isImageName(name: string): boolean {
  return IMAGE_EXTS.includes(extOf(name))
}

const isImage = computed(() => Boolean(file.value) && isImageName(file.value?.name ?? ''))
const isMarkdown = computed(
  () => Boolean(file.value) && ['.md', '.markdown'].includes(extOf(file.value?.name ?? ''))
)
const canPreview = computed(() => isImage.value || isMarkdown.value)
const showPreview = computed(() => preview.value && canPreview.value)

/* 可编辑：文本文件且未被截断 */
const editable = computed(() => Boolean(file.value) && !file.value?.binary && !file.value?.truncated)
/* 有未保存修改 */
const dirty = computed(() => editable.value && draft.value !== original.value)

/* 过滤时递归判断节点（或已加载子孙）是否命中 */
function matchNode(entry: FsEntry, word: string): boolean {
  if (entry.name.toLowerCase().includes(word)) {
    return true
  }
  const kids = childrenMap.value[entry.path]
  return Boolean(kids && kids.some((child) => matchNode(child, word)))
}

const visibleRoot = computed(() => {
  const word = keyword.value.trim().toLowerCase()
  return word ? rootChildren.value.filter((entry) => matchNode(entry, word)) : rootChildren.value
})

/* 注册目录监听（幂等） */
function registerWatch(dir: string): void {
  if (watchedDirs.has(dir)) {
    return
  }
  watchedDirs.add(dir)
  void api.fs.watch(dir)
}

/* 取消目录监听 */
function unwatch(dir: string): void {
  if (!watchedDirs.delete(dir)) {
    return
  }
  void api.fs.unwatch(dir)
}

/*
 * 清理已消失的子目录：父目录重载后，若某已监听子目录不再存在，
 * 取消其监听并清空其缓存/展开态（避免残留幽灵节点）。
 */
function cleanupChildren(dir: string, entries: FsEntry[]): void {
  const present = new Set(entries.map((entry) => norm(entry.path)))
  const next = { ...childrenMap.value }
  let changed = false
  for (const watched of [...watchedDirs]) {
    if (norm(parentDir(watched)) === norm(dir) && !present.has(norm(watched))) {
      unwatch(watched)
      if (next[watched] !== undefined) {
        delete next[watched]
        changed = true
      }
      expandedMap.value = { ...expandedMap.value, [watched]: false }
    }
  }
  if (changed) {
    childrenMap.value = next
  }
}

/* 加载目录子项（force=true 时强制重载）；成功后注册监听并清理消失的子目录 */
async function loadDir(path: string, force = false): Promise<void> {
  const root = props.root
  if (!root || (!force && (childrenMap.value[path] || loadingMap.value[path]))) {
    return
  }
  loadingMap.value = { ...loadingMap.value, [path]: true }
  try {
    const entries = await api.fs.list(root, path)
    childrenMap.value = { ...childrenMap.value, [path]: entries }
    registerWatch(path)
    cleanupChildren(path, entries)
  } catch (error) {
    /* 目录可能已被删除：清空并停止监听；否则提示错误 */
    childrenMap.value = { ...childrenMap.value, [path]: [] }
    unwatch(path)
    if (!force) {
      ElMessage.error((error as Error).message)
    }
  } finally {
    loadingMap.value = { ...loadingMap.value, [path]: false }
  }
}

/* 选中的文件在磁盘上变化（或被删除）时回读；编辑中（dirty）不覆盖 */
async function refreshSelected(): Promise<void> {
  const root = props.root
  const entry = selected.value
  if (!root || !entry || dirty.value) {
    return
  }
  try {
    const loaded = await api.fs.read(root, entry.path)
    file.value = loaded
    original.value = loaded.content
    draft.value = loaded.content
  } catch {
    /* 文件已被删除：清空内容 */
    selected.value = null
    file.value = null
    fileError.value = ''
    original.value = ''
    draft.value = ''
  }
}

/* 重载单个已加载目录，并在必要时刷新选中文件 */
async function reloadDir(dir: string): Promise<void> {
  if (reloading.has(dir)) {
    return
  }
  reloading.add(dir)
  try {
    await loadDir(dir, true)
    if (selected.value && parentDir(selected.value.path) === norm(dir)) {
      await refreshSelected()
    }
  } finally {
    reloading.delete(dir)
  }
}

/* 目录变更回调：匹配已加载目录并刷新 */
function onFsChange(dir: string): void {
  const target = Object.keys(childrenMap.value).find((key) => norm(key) === norm(dir))
  if (target !== undefined) {
    void reloadDir(target)
  }
}

/* 展开/收起目录 */
function toggle(entry: FsEntry): void {
  const open = !expandedMap.value[entry.path]
  expandedMap.value = { ...expandedMap.value, [entry.path]: open }
  if (open) {
    void loadDir(entry.path)
  }
}

/* 选中文件并加载内容（有未保存修改时先确认） */
async function select(entry: FsEntry): Promise<void> {
  const root = props.root
  if (!root) {
    return
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
      return
    }
  }
  selected.value = entry
  fileLoading.value = true
  fileError.value = ''
  preview.value = false
  original.value = ''
  draft.value = ''
  try {
    const loaded = await api.fs.read(root, entry.path)
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
}

/* 保存编辑内容到磁盘 */
async function save(): Promise<void> {
  const root = props.root
  if (!root || !file.value || !editable.value || saving.value || !dirty.value) {
    return
  }
  saving.value = true
  try {
    await api.fs.write(root, file.value.path, draft.value)
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

/* 编辑器按键：⌘/Ctrl+S 保存；Tab 插入两个空格 */
function onEditorKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
    return
  }
  if (event.key === 'Tab') {
    event.preventDefault()
    const el = editorRef.value
    if (!el) {
      return
    }
    const { selectionStart, selectionEnd } = el
    draft.value = `${draft.value.slice(0, selectionStart)}  ${draft.value.slice(selectionEnd)}`
    void nextTick(() => {
      el.selectionStart = el.selectionEnd = selectionStart + 2
    })
  }
}

/* 编辑区滚动 → 同步行号栏与高亮层的偏移，保持内容对齐 */
function syncGutter(): void {
  const editor = editorRef.value
  if (!editor) {
    return
  }
  if (gutterRef.value) {
    gutterRef.value.scrollTop = editor.scrollTop
  }
  if (highlightRef.value) {
    highlightRef.value.scrollTop = editor.scrollTop
    highlightRef.value.scrollLeft = editor.scrollLeft
  }
}

/* 重置面板状态并在根目录变化时重新加载 */
function reset(): void {
  for (const dir of [...watchedDirs]) {
    unwatch(dir)
  }
  watchedDirs.clear()
  childrenMap.value = {}
  expandedMap.value = {}
  loadingMap.value = {}
  selected.value = null
  file.value = null
  fileError.value = ''
  preview.value = false
  original.value = ''
  draft.value = ''
  keyword.value = ''
  if (props.root) {
    void loadDir(props.root)
  }
}

watch(() => props.root, reset, { immediate: true })

/* 开始过滤时预加载根目录下各子目录一层，提升筛选命中率 */
watch(keyword, (word) => {
  if (!word.trim()) {
    return
  }
  for (const entry of rootChildren.value) {
    if (entry.isDir) {
      void loadDir(entry.path)
    }
  }
})

/* 面包屑：项目名 > 相对根目录的各级路径 */
const breadcrumb = computed(() => {
  const parts: string[] = []
  if (props.projectName) {
    parts.push(props.projectName)
  }
  if (props.root && file.value) {
    const root = props.root.replace(/\\/g, '/').replace(/\/$/, '')
    const full = file.value.path.replace(/\\/g, '/')
    const rel = full.startsWith(root) ? full.slice(root.length + 1) : full
    parts.push(...rel.split('/').filter(Boolean))
  }
  return parts
})

/* 代码行数：编辑态取草稿，预览/只读取文件内容 */
const lineCount = computed(() => {
  if (!file.value) {
    return 0
  }
  const text = editable.value ? draft.value : file.value.content
  return text.split('\n').length
})

/* 编辑区语法高亮：按文件名推断语言，末尾补换行以对齐最后一行高度 */
const highlightedDraft = computed(() => {
  if (!file.value) {
    return ''
  }
  /* 超大文件跳过着色，避免逐键重算造成卡顿 */
  if (draft.value.length > MAX_EDITOR_HIGHLIGHT) {
    return `${escapeHtml(draft.value)}\n`
  }
  return `${highlightCode(draft.value, languageOf(file.value.name))}\n`
})

/* 打开所在的文件夹：优先文件所在目录，未选中文件时打开项目根目录 */
function revealFolder(): void {
  const target = file.value?.path ?? props.root
  if (target) {
    void api.shell.reveal(target)
  }
}

/* 复制文件绝对路径 */
async function copyPath(): Promise<void> {
  if (!file.value) {
    return
  }
  await navigator.clipboard.writeText(file.value.path)
  ElMessage.success(t('panel.copied'))
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
</script>

<template>
  <div class="file-panel">
    <!-- 工具栏：面包屑 + 预览/打开操作 -->
    <div class="file-toolbar">
      <div class="file-breadcrumb">
        <template v-for="(seg, index) in breadcrumb" :key="index">
          <span v-if="index > 0" class="crumb-sep">›</span>
          <span class="crumb" :class="{ current: index === breadcrumb.length - 1 }">{{ seg }}</span>
        </template>
      </div>
      <div class="file-actions">
        <button
          v-if="editable"
          class="panel-btn"
          :class="{ active: dirty }"
          :disabled="!dirty || saving"
          :title="t('panel.saveHint')"
          @click="save"
        >
          <el-icon><Finished /></el-icon>
          <span>{{ t('panel.save') }}</span>
        </button>
        <button
          v-if="canPreview"
          class="panel-btn"
          :class="{ active: showPreview }"
          :title="showPreview ? t('panel.code') : t('panel.preview')"
          @click="preview = !preview"
        >
          <el-icon><Document /></el-icon>
          <span>{{ showPreview ? t('panel.code') : t('panel.preview') }}</span>
        </button>
        <button
          class="panel-btn"
          :disabled="!file && !root"
          :title="file ? t('panel.openFolder') : t('panel.openProjectFolder')"
          @click="revealFolder"
        >
          <el-icon><FolderOpened /></el-icon>
        </button>
        <el-dropdown trigger="click" :disabled="!file" @command="onOpenCommand">
          <button class="panel-btn" :disabled="!file">
            <el-icon><DocumentAdd /></el-icon>
            <span>{{ t('panel.open') }}</span>
            <el-icon class="chevron"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="default">
                <el-icon><Document /></el-icon>{{ t('panel.openDefault') }}
              </el-dropdown-item>
              <el-dropdown-item
                v-for="app in openApps"
                :key="app.path"
                :command="`app:${app.path}`"
              >
                <el-icon><Monitor /></el-icon>{{ app.name }}
              </el-dropdown-item>
              <el-dropdown-item command="folder" divided>
                <el-icon><FolderOpened /></el-icon>{{ t('panel.openFolder') }}
              </el-dropdown-item>
              <el-dropdown-item command="copy" divided>
                <el-icon><CopyDocument /></el-icon>{{ t('panel.copyPath') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="file-main">
      <!-- 左：文件内容 -->
      <div class="file-viewer">
        <div v-if="!root" class="viewer-empty">{{ t('panel.needProject') }}</div>
        <div v-else-if="fileLoading" class="viewer-empty">
          <el-icon class="spin"><Loading /></el-icon>
        </div>
        <div v-else-if="fileError" class="viewer-empty error">{{ fileError }}</div>
        <div v-else-if="!file" class="viewer-empty">{{ t('panel.noSelection') }}</div>
        <template v-else>
          <div v-if="file.truncated" class="viewer-banner">{{ t('panel.truncated') }}</div>
          <div v-if="showPreview && isImage && file.dataUrl" class="viewer-image">
            <img :src="file.dataUrl" :alt="file.name" />
          </div>
          <div
            v-else-if="showPreview && isMarkdown"
            class="viewer-markdown markdown-body"
            v-html="renderMarkdown(file.content)"
            @click="onCodeCopyClick"
          ></div>
          <div v-else-if="file.binary" class="viewer-empty">{{ t('panel.binary') }}</div>
          <!-- 可编辑：带行号的纯文本编辑器（⌘/Ctrl+S 保存），高亮层置于文本域下方 -->
          <div v-else-if="editable" class="editor">
            <div ref="gutterRef" class="editor-gutter">
              <span v-for="n in lineCount" :key="n">{{ n }}</span>
            </div>
            <div class="editor-code">
              <pre
                ref="highlightRef"
                class="editor-highlight hljs"
                aria-hidden="true"
              ><code v-html="highlightedDraft"></code></pre>
              <textarea
                ref="editorRef"
                v-model="draft"
                class="editor-input"
                wrap="off"
                spellcheck="false"
                @scroll="syncGutter"
                @keydown="onEditorKeydown"
              ></textarea>
            </div>
          </div>
          <!-- 只读（如超大文件被截断）：纯文本展示 -->
          <div v-else class="code-scroll">
            <div class="code-inner">
              <div class="code-gutter">
                <span v-for="n in lineCount" :key="n">{{ n }}</span>
              </div>
              <pre class="code-pre">{{ file.content }}</pre>
            </div>
          </div>
        </template>
      </div>

      <!-- 右：项目目录树 -->
      <div class="file-tree">
        <div class="tree-filter">
          <el-input
            v-model="keyword"
            size="small"
            clearable
            :placeholder="t('panel.filterPlaceholder')"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
        <div class="tree-body">
          <div v-if="!root" class="tree-empty">{{ t('panel.needProject') }}</div>
          <template v-else>
            <FileTreeNode
              v-for="entry in visibleRoot"
              :key="entry.path"
              :entry="entry"
              :depth="0"
              :children-map="childrenMap"
              :expanded-map="expandedMap"
              :loading-map="loadingMap"
              :selected-path="selected?.path ?? ''"
              :keyword="keyword"
              @select="select"
              @toggle="toggle"
            />
            <div v-if="childrenMap[root] && rootChildren.length === 0" class="tree-empty">{{ t('panel.emptyTree') }}</div>
            <div v-else-if="childrenMap[root] && visibleRoot.length === 0" class="tree-empty">{{ t('panel.emptyTree') }}</div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.file-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* 工具栏：面包屑居左，操作居右 */
.file-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px 8px 16px;
  border-bottom: 1px solid var(--desk-border);
}

.file-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  color: var(--desk-text-tertiary);
}

.crumb {
  flex-shrink: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crumb.current {
  color: var(--desk-text);
  flex-shrink: 1;
}

.crumb-sep {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

.file-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 通用面板按钮 */
.panel-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--desk-border);
  border-radius: 8px;
  background: var(--desk-bg);
  color: var(--desk-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.panel-btn:hover:not(:disabled) {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.panel-btn.active {
  background: var(--desk-segment-bg);
  color: var(--desk-text);
  border-color: var(--desk-segment-border);
}

.panel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.panel-btn .chevron {
  font-size: 12px;
}

/* 主体：左内容 + 右文件树 */
.file-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.file-viewer {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--desk-bg);
}

.viewer-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-size: 13px;
  color: var(--desk-text-tertiary);
  text-align: center;
}

.viewer-empty.error {
  color: var(--desk-danger);
}

.viewer-banner {
  flex-shrink: 0;
  padding: 6px 12px;
  background: var(--desk-bg-elevated);
  border-bottom: 1px solid var(--desk-border);
  font-size: 12px;
  color: var(--desk-text-tertiary);
}

/* 代码阅读区：行号固定左侧，横向滚动仅在代码区 */
.code-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--desk-code-bg);
}

.code-inner {
  display: flex;
  align-items: stretch;
  min-width: max-content;
  min-height: 100%;
}

.code-gutter {
  position: sticky;
  left: 0;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 48px;
  padding: 12px 12px 12px 16px;
  background: var(--desk-code-bg);
  border-right: 1px solid var(--desk-code-border);
  text-align: right;
  color: var(--desk-text-tertiary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.code-gutter span {
  display: block;
  height: 22px;
}

.code-pre {
  flex: 1;
  margin: 0;
  padding: 12px 18px;
  color: var(--desk-code-text);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 22px;
  white-space: pre;
}

/* 可编辑代码区：行号 + 高亮层 + 透明文本域三者叠加（GitHub 代码底色） */
.editor {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  background: var(--desk-code-bg);
}

.editor-gutter {
  flex-shrink: 0;
  overflow: hidden;
  min-width: 52px;
  padding: 12px 14px 12px 16px;
  background: var(--desk-code-bg);
  border-right: 1px solid var(--desk-code-border);
  text-align: right;
  color: var(--desk-text-tertiary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.editor-gutter span {
  display: block;
  height: 22px;
}

/* 代码容器：高亮层与透明文本域完全重叠，保证字符逐一对齐 */
.editor-code {
  position: relative;
  flex: 1;
  min-width: 0;
}

.editor-highlight,
.editor-input {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 12px 18px;
  border: none;
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 22px;
  white-space: pre;
  tab-size: 2;
  overflow: auto;
}

.editor-highlight {
  background: transparent;
  color: var(--desk-code-text);
  overflow: hidden;
  pointer-events: none;
}

.editor-input {
  outline: none;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--desk-text);
}

.editor-input::placeholder {
  color: var(--desk-text-tertiary);
}

.editor-input::selection {
  background: var(--desk-selection);
}

.editor-code:focus-within {
  box-shadow: inset 0 0 0 1px var(--desk-code-border);
}

/* Markdown 预览 */
.viewer-markdown {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
  font-size: 14px;
}

/* 图片预览：居中展示，自适应容器 */
.viewer-image {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: auto;
  background: var(--desk-bg-elevated);
}

.viewer-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--desk-radius-sm);
}

/* 右侧文件树 */
.file-tree {
  flex-shrink: 0;
  width: 240px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--desk-border);
  background: var(--desk-sidebar);
}

.tree-filter {
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--desk-border);
}

.tree-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 6px 12px;
}

.tree-empty {
  padding: 16px 10px;
  font-size: 12px;
  color: var(--desk-text-tertiary);
  text-align: center;
}

.spin {
  animation: viewer-spin 1s linear infinite;
}

@keyframes viewer-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
