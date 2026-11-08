/*
 * 笔记应用状态：设置、目录树、当前笔记、自动保存与界面偏好。
 * @author xuxueli 2026-11-08
 */

import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { api } from '@common/renderer/api'
import { LAYOUT } from '@common/renderer/config/layout'
import { t } from '@renderer/shell/i18n'
import type {
  NoteContent,
  NoteEntry,
  NoteSaveImageResult,
  NoteSettings,
  NoteSettingsPatch
} from '@modules/apps/note/shared'
import { parseOutline, type OutlineItem } from '@modules/apps/note/renderer/utils/outline'
import { baseName, isUnder, parentDir } from '@modules/apps/note/renderer/utils/path'

/* 视图模式 */
export type NoteMode = 'edit' | 'split' | 'preview'

/* 合法视图模式 */
function isNoteMode(value: unknown): value is NoteMode {
  return value === 'edit' || value === 'split' || value === 'preview'
}

/* 初始设置：真实目录由主进程解析 */
const EMPTY_SETTINGS: NoteSettings = {
  storageDir: '',
  resolvedStorageDir: '',
  defaultStorageDir: '',
  imageDir: '',
  storageFallback: false
}

/* 界面偏好存储键 */
const UI_KEY = 'desk-note-ui'

/* 界面偏好 */
interface NoteUiState {
  mode: NoteMode
  treeCollapsed: boolean
  treeWidth: number
}

/* 默认界面偏好 */
const DEFAULT_UI: NoteUiState = {
  mode: 'split',
  treeCollapsed: false,
  treeWidth: LAYOUT.note.treeDefaultWidth
}

/* 读取界面偏好：缺失或结构非法时整体回落默认 */
function readUi(): NoteUiState {
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (!raw) {
      return { ...DEFAULT_UI }
    }
    const parsed = JSON.parse(raw) as Partial<NoteUiState>
    return {
      mode: isNoteMode(parsed.mode) ? parsed.mode : DEFAULT_UI.mode,
      treeCollapsed: Boolean(parsed.treeCollapsed),
      treeWidth:
        typeof parsed.treeWidth === 'number' ? parsed.treeWidth : DEFAULT_UI.treeWidth
    }
  } catch {
    return { ...DEFAULT_UI }
  }
}

/* 错误对象 → 可读文本 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useNoteStore = defineStore('note', () => {
  const ui = readUi()

  /* 设置与加载态 */
  const settings = ref<NoteSettings>({ ...EMPTY_SETTINGS })
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')

  /* 目录树：按绝对目录缓存子项 */
  const childrenMap = ref<Record<string, NoteEntry[]>>({})
  const expanded = ref<Record<string, boolean>>({})
  const keyword = ref('')

  /* 已注册监听的目录与变更监听句柄 */
  const watchedDirs = new Set<string>()
  let offNoteChange: (() => void) | null = null

  /* 当前笔记与草稿 */
  const current = ref<NoteContent | null>(null)
  const draft = ref('')
  const selectedPath = ref('')

  /* 界面偏好 */
  const mode = ref<NoteMode>(ui.mode)
  const treeCollapsed = ref(ui.treeCollapsed)
  const treeWidth = ref(ui.treeWidth)

  /* 根目录与根名称 */
  const rootPath = computed(() => settings.value.resolvedStorageDir)
  const rootName = computed(() => baseName(rootPath.value) || t('note.title'))

  /* 是否未保存 */
  const dirty = computed(() => Boolean(current.value) && draft.value !== current.value?.content)

  /* 大纲 */
  const outline = computed<OutlineItem[]>(() => parseOutline(draft.value))

  /* 当前笔记名称 */
  const currentName = computed(() => (current.value ? baseName(current.value.path) : ''))

  /* 自动保存定时器 */
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  /* 清理自动保存定时器 */
  function clearSaveTimer(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  /* 保存当前笔记（返回是否成功；失败保留草稿） */
  async function save(): Promise<boolean> {
    if (!current.value || !dirty.value) {
      return true
    }
    clearSaveTimer()
    const path = current.value.path
    const content = draft.value
    saving.value = true
    try {
      const saved = await api.note.write(path, content)
      /* 保存期间切走了笔记：只更新基线，不覆盖当前内容 */
      if (current.value?.path === path) {
        current.value = saved
      }
      return true
    } catch (saveError) {
      error.value = messageOf(saveError)
      ElMessage.error(t('note.saveFailed', [error.value]))
      return false
    } finally {
      saving.value = false
    }
  }

  /* 输入停顿后自动保存 */
  watch(draft, () => {
    if (!current.value || draft.value === current.value.content) {
      return
    }
    clearSaveTimer()
    saveTimer = setTimeout(() => {
      saveTimer = null
      void save()
    }, 800)
  })

  /* 持久化界面偏好 */
  watch([mode, treeCollapsed, treeWidth], () => {
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({
        mode: mode.value,
        treeCollapsed: treeCollapsed.value,
        treeWidth: treeWidth.value
      })
    )
  })

  /* 加载设置 */
  async function loadSettings(): Promise<void> {
    try {
      settings.value = await api.note.getSettings()
      loaded.value = true
    } catch (loadError) {
      error.value = messageOf(loadError)
    }
  }

  /* 启动引导入口：只加载一次 */
  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) {
      await loadSettings()
    }
  }

  /* 保存设置（目录变化后重置工作区） */
  async function saveSettings(patch: NoteSettingsPatch): Promise<void> {
    const previousRoot = settings.value.resolvedStorageDir
    settings.value = await api.note.saveSettings(patch)
    if (patch.storageDir !== undefined && settings.value.resolvedStorageDir !== previousRoot) {
      resetWorkspace()
      /* 目录切换后展开笔记树，确保能看到新目录内容 */
      treeCollapsed.value = false
      await loadRoot()
    }
  }

  /* 打开系统目录选择框 */
  async function selectStorageDir(): Promise<string> {
    return api.note.selectStorageDir()
  }

  /* 加载指定目录子项 */
  async function loadChildren(dir: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const entries = await api.note.list(dir)
      childrenMap.value = { ...childrenMap.value, [dir]: entries }
      watchDir(dir)
      cleanupChildren(dir, entries)
    } catch (loadError) {
      error.value = messageOf(loadError)
    } finally {
      loading.value = false
    }
  }

  /* 注册目录监听（幂等） */
  function watchDir(dir: string): void {
    if (!dir || watchedDirs.has(dir)) {
      return
    }
    watchedDirs.add(dir)
    void api.note.watch(dir).catch(() => undefined)
  }

  /* 取消目录监听 */
  function unwatchDir(dir: string): void {
    if (!watchedDirs.delete(dir)) {
      return
    }
    void api.note.unwatch(dir).catch(() => undefined)
  }

  /* 清理父目录下已消失的子目录：停止监听并清空缓存 / 展开态 */
  function cleanupChildren(dir: string, entries: NoteEntry[]): void {
    const present = new Set(entries.map((entry) => entry.path))
    const next = { ...childrenMap.value }
    let changed = false
    for (const watched of [...watchedDirs]) {
      if (parentDir(watched) === dir && !present.has(watched)) {
        unwatchDir(watched)
        if (next[watched] !== undefined) {
          delete next[watched]
          changed = true
        }
        expanded.value = { ...expanded.value, [watched]: false }
      }
    }
    if (changed) {
      childrenMap.value = next
    }
  }

  /* 目录变更：重载对应已加载目录 */
  function onNoteChange(dir: string): void {
    if (childrenMap.value[dir]) {
      void loadChildren(dir)
    }
  }

  /* 窗口重新可见时兜底刷新，弥补 watcher 可能漏掉的变更 */
  function onWindowFocus(): void {
    if (document.visibilityState === 'visible') {
      void reloadTree()
    }
  }

  /* 绑定目录变更监听（笔记页挂载时调用） */
  function bindWatcher(): void {
    if (offNoteChange) {
      return
    }
    offNoteChange = api.note.onChange(onNoteChange)
    window.addEventListener('focus', onWindowFocus)
    document.addEventListener('visibilitychange', onWindowFocus)
  }

  /* 解绑并清理全部目录监听（笔记页卸载时调用） */
  function unbindWatcher(): void {
    offNoteChange?.()
    offNoteChange = null
    window.removeEventListener('focus', onWindowFocus)
    document.removeEventListener('visibilitychange', onWindowFocus)
    for (const dir of [...watchedDirs]) {
      unwatchDir(dir)
    }
  }

  /* 加载根目录 */
  async function loadRoot(): Promise<void> {
    if (!rootPath.value) {
      return
    }
    expanded.value = { ...expanded.value, [rootPath.value]: true }
    await loadChildren(rootPath.value)
  }

  /* 重新拉取目录树：根目录 + 已展开目录，用于感知外部文件变更 */
  let treeReloading = false
  async function reloadTree(): Promise<void> {
    if (!rootPath.value || treeReloading) {
      return
    }
    treeReloading = true
    try {
      await loadRoot()
      for (const dir of Object.keys(childrenMap.value)) {
        if (dir !== rootPath.value && expanded.value[dir]) {
          await loadChildren(dir)
        }
      }
    } finally {
      treeReloading = false
    }
  }

  /* 展开 / 收起目录（展开时重新拉取，感知外部新增文件） */
  async function toggleDir(entry: NoteEntry): Promise<void> {
    const open = !expanded.value[entry.path]
    expanded.value = { ...expanded.value, [entry.path]: open }
    if (open) {
      await loadChildren(entry.path)
    }
  }

  /* 重置工作区（切换存储目录 / 停用时） */
  function resetWorkspace(): void {
    clearSaveTimer()
    for (const dir of [...watchedDirs]) {
      unwatchDir(dir)
    }
    childrenMap.value = {}
    expanded.value = {}
    keyword.value = ''
    selectedPath.value = ''
    current.value = null
    draft.value = ''
    error.value = ''
  }

  /* 打开笔记：未保存内容先落盘，失败则中止切换 */
  async function openNote(path: string): Promise<void> {
    if (current.value?.path === path) {
      return
    }
    if (!(await save())) {
      return
    }
    loading.value = true
    error.value = ''
    try {
      const loadedNote = await api.note.read(path)
      current.value = loadedNote
      draft.value = loadedNote.content
      selectedPath.value = path
    } catch (loadError) {
      error.value = messageOf(loadError)
      ElMessage.error(t('note.loadFailed', [error.value]))
    } finally {
      loading.value = false
    }
  }

  /* 刷新目录树与当前笔记 */
  async function refresh(): Promise<void> {
    if (!rootPath.value) {
      return
    }
    /* 先落盘未保存内容，避免刷新覆盖草稿 */
    if (!(await save())) {
      return
    }
    await loadChildren(rootPath.value)
    for (const dir of Object.keys(childrenMap.value)) {
      if (dir !== rootPath.value && expanded.value[dir]) {
        await loadChildren(dir)
      }
    }
    if (current.value) {
      const path = current.value.path
      try {
        const loadedNote = await api.note.read(path)
        current.value = loadedNote
        draft.value = loadedNote.content
      } catch {
        /* 文件已被删除：回到空态 */
        current.value = null
        draft.value = ''
        selectedPath.value = ''
      }
    }
  }

  /* 新建笔记 */
  async function createNote(dir: string | undefined, name: string): Promise<NoteEntry | null> {
    try {
      const entry = await api.note.createNote(dir, name)
      const parent = dir || rootPath.value
      /* 展开目录树，确保新建结果可见（树可能已被用户收起） */
      treeCollapsed.value = false
      expanded.value = { ...expanded.value, [parent]: true }
      await loadChildren(parent)
      await openNote(entry.path)
      return entry
    } catch (createError) {
      ElMessage.error(messageOf(createError))
      return null
    }
  }

  /* 新建目录 */
  async function createFolder(dir: string | undefined, name: string): Promise<NoteEntry | null> {
    try {
      const entry = await api.note.createFolder(dir, name)
      const parent = dir || rootPath.value
      /* 展开目录树，确保新建结果可见（树可能已被用户收起） */
      treeCollapsed.value = false
      expanded.value = { ...expanded.value, [parent]: true }
      await loadChildren(parent)
      return entry
    } catch (createError) {
      ElMessage.error(messageOf(createError))
      return null
    }
  }

  /* 重命名笔记 / 目录 */
  async function renameEntry(entry: NoteEntry, name: string): Promise<NoteEntry | null> {
    if (!(await save())) {
      return null
    }
    try {
      const renamed = await api.note.rename(entry.path, name)
      if (current.value && isUnder(current.value.path, entry.path)) {
        const path = current.value.path.replace(entry.path, renamed.path)
        const loadedNote = await api.note.read(path)
        current.value = loadedNote
        draft.value = loadedNote.content
        selectedPath.value = loadedNote.path
      }
      await refresh()
      return renamed
    } catch (renameError) {
      ElMessage.error(messageOf(renameError))
      return null
    }
  }

  /* 删除笔记 / 目录（移入废纸篓） */
  async function trashEntry(entry: NoteEntry): Promise<boolean> {
    try {
      await api.note.trash(entry.path)
      if (current.value && isUnder(current.value.path, entry.path)) {
        current.value = null
        draft.value = ''
        selectedPath.value = ''
      }
      await refresh()
      return true
    } catch (trashError) {
      ElMessage.error(messageOf(trashError))
      return false
    }
  }

  /* 选择图片并返回可插入的 Markdown 片段 */
  async function pickImages(): Promise<string[]> {
    if (!current.value) {
      return []
    }
    try {
      const results: NoteSaveImageResult[] = await api.note.pickImages(current.value.path)
      return results.map((item) => item.markdown)
    } catch (imageError) {
      ElMessage.error(t('note.imageFailed', [messageOf(imageError)]))
      return []
    }
  }

  /* 粘贴图片字节并返回可插入的 Markdown 片段 */
  async function saveImageBytes(data: Uint8Array, extension: string): Promise<string> {
    if (!current.value) {
      return ''
    }
    try {
      const result = await api.note.saveImage(current.value.path, data, extension)
      return result.markdown
    } catch (imageError) {
      ElMessage.error(t('note.imageFailed', [messageOf(imageError)]))
      return ''
    }
  }

  /* 收起 / 展开笔记树 */
  function toggleTree(): void {
    treeCollapsed.value = !treeCollapsed.value
  }

  /* 调整笔记树宽度：最小 150px，最大不超过视口 40% */
  function setTreeWidth(width: number): void {
    const max = Math.max(LAYOUT.note.treeMinWidth, Math.round(window.innerWidth * 0.4))
    treeWidth.value = Math.min(max, Math.max(LAYOUT.note.treeMinWidth, Math.round(width)))
  }

  /* 恢复默认宽度 */
  function resetTreeWidth(): void {
    treeWidth.value = LAYOUT.note.treeDefaultWidth
  }

  return {
    settings,
    loading,
    childrenMap,
    expanded,
    keyword,
    current,
    draft,
    selectedPath,
    mode,
    treeCollapsed,
    treeWidth,
    rootPath,
    rootName,
    dirty,
    outline,
    currentName,
    loadSettings,
    ensureLoaded,
    saveSettings,
    selectStorageDir,
    reloadTree,
    toggleDir,
    openNote,
    save,
    createNote,
    createFolder,
    renameEntry,
    trashEntry,
    pickImages,
    saveImageBytes,
    bindWatcher,
    unbindWatcher,
    toggleTree,
    setTreeWidth,
    resetTreeWidth
  }
})
