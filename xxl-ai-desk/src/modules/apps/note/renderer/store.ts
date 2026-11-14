/*
 * 笔记应用状态：设置、目录树、当前笔记、自动保存与界面偏好。
 * @author xuxueli 2026-11-08
 */

import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { api } from '@common/renderer/api'
import { LAYOUT } from '@common/renderer/config/layout'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@common/renderer/i18n'
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

/* 保存状态：idle 未打开笔记，editing 有未保存改动，saving 正在写盘 */
export type NoteSaveState = 'idle' | 'editing' | 'saving' | 'saved' | 'error'

/* 合法视图模式 */
function isNoteMode(value: unknown): value is NoteMode {
  return value === 'edit' || value === 'split' || value === 'preview'
}

/* 初始设置：真实目录由主进程解析 */
const EMPTY_SETTINGS: NoteSettings = {
  storageDir: '',
  resolvedStorageDir: '',
  defaultStorageDir: '',
  imageDir: ''
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
  return ipcErrorMessage(error)
}

/* 笔记修改时间 → 毫秒时间戳；非法时返回 null */
function savedTimeOf(note: NoteContent): number | null {
  const time = Date.parse(note.updateTime)
  return Number.isNaN(time) ? null : time
}

export const useNoteStore = defineStore('note', () => {
  const ui = readUi()

  /* 设置与加载态 */
  const settings = ref<NoteSettings>({ ...EMPTY_SETTINGS })
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  /* 最近一次成功保存的时间（毫秒）；null 表示尚未在本会话保存过 */
  const savedAt = ref<number | null>(null)
  /* 保存失败信息：与加载错误分开，供状态栏展示与重试 */
  const saveError = ref('')

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
  /* 光标位置：状态栏展示行 / 列 */
  const cursorLine = ref(1)
  const cursorColumn = ref(1)
  /* 选中字符数：状态栏展示选中文字长度，0 表示无选区 */
  const selectedLength = ref(0)

  /* 界面偏好 */
  const mode = ref<NoteMode>(ui.mode)
  const treeCollapsed = ref(ui.treeCollapsed)
  const treeWidth = ref(ui.treeWidth)

  /* 根目录 */
  const rootPath = computed(() => settings.value.resolvedStorageDir)

  /* 是否未保存 */
  const dirty = computed(() => Boolean(current.value) && draft.value !== current.value?.content)

  /* 保存状态：状态栏据此展示「编辑中 / 保存中 / 已保存 / 保存失败」 */
  const saveState = computed<NoteSaveState>(() => {
    if (!current.value) {
      return 'idle'
    }
    if (saveError.value) {
      return 'error'
    }
    if (saving.value) {
      return 'saving'
    }
    return dirty.value ? 'editing' : 'saved'
  })

  /* 大纲 */
  const outline = computed<OutlineItem[]>(() => parseOutline(draft.value))

  /* 当前笔记名称 */
  const currentName = computed(() => (current.value ? baseName(current.value.path) : ''))

  /* 更新光标位置：由编辑器选区变化时写入 */
  function setCursor(line: number, column: number): void {
    cursorLine.value = line
    cursorColumn.value = column
  }

  /* 更新选中字符数：由编辑器选区变化时写入 */
  function setSelectionLength(length: number): void {
    selectedLength.value = length > 0 ? length : 0
  }

  /* 重置光标位置：切换 / 清空笔记时回到首行首列并清空选区 */
  function resetCursor(): void {
    cursorLine.value = 1
    cursorColumn.value = 1
    selectedLength.value = 0
  }

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
    /* 重试期间先清空上次失败信息，状态栏显示「保存中」 */
    saveError.value = ''
    try {
      const saved = await api.note.write(path, content)
      /* 保存期间切走了笔记：只更新基线，不覆盖当前内容 */
      if (current.value?.path === path) {
        current.value = saved
        savedAt.value = savedTimeOf(saved)
      }
      return true
    } catch (writeError) {
      saveError.value = messageOf(writeError)
      error.value = saveError.value
      ElMessage.error(t('note.saveFailed', [saveError.value]))
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

  /* 已加载的目录路径：用于判断「全部展开」状态 */
  const loadedDirs = computed(() => {
    const dirs = new Set<string>()
    for (const entries of Object.values(childrenMap.value)) {
      for (const entry of entries) {
        if (entry.isDir) {
          dirs.add(entry.path)
        }
      }
    }
    return [...dirs]
  })

  /* 是否已展开全部已加载目录 */
  const allDirsExpanded = computed(
    () => loadedDirs.value.length > 0 && loadedDirs.value.every((dir) => expanded.value[dir])
  )

  /* 展开全部目录：逐层加载并展开子目录（目录项不含符号链接，不会出现循环） */
  async function expandAllDirs(): Promise<void> {
    if (!rootPath.value) {
      return
    }
    async function walk(dir: string): Promise<void> {
      expanded.value = { ...expanded.value, [dir]: true }
      await loadChildren(dir)
      const subDirs = (childrenMap.value[dir] ?? []).filter((entry) => entry.isDir)
      await Promise.all(subDirs.map((entry) => walk(entry.path)))
    }
    await walk(rootPath.value)
  }

  /* 折叠全部目录：仅保留根目录展开态（根目录不直接展示） */
  function collapseAllDirs(): void {
    expanded.value = rootPath.value ? { [rootPath.value]: true } : {}
  }

  /* 全部展开 / 全部折叠：按当前全部展开状态切换 */
  async function toggleAllDirs(): Promise<void> {
    if (allDirsExpanded.value) {
      collapseAllDirs()
      return
    }
    await expandAllDirs()
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
    saveError.value = ''
    savedAt.value = null
    resetCursor()
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
      savedAt.value = savedTimeOf(loadedNote)
      saveError.value = ''
      resetCursor()
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
        savedAt.value = savedTimeOf(loadedNote)
        saveError.value = ''
      } catch {
        /* 文件已被删除：回到空态 */
        current.value = null
        draft.value = ''
        selectedPath.value = ''
        savedAt.value = null
        saveError.value = ''
        resetCursor()
      }
    }
  }

  /* 新建笔记：失败直接抛出，由弹框就地展示错误 */
  async function createNote(dir: string | undefined, name: string): Promise<NoteEntry> {
    const entry = await api.note.createNote(dir, name)
    const parent = dir || rootPath.value
    /* 展开目录树，确保新建结果可见（树可能已被用户收起） */
    treeCollapsed.value = false
    expanded.value = { ...expanded.value, [parent]: true }
    await loadChildren(parent)
    await openNote(entry.path)
    return entry
  }

  /* 新建目录：失败直接抛出，由弹框就地展示错误 */
  async function createFolder(dir: string | undefined, name: string): Promise<NoteEntry> {
    const entry = await api.note.createFolder(dir, name)
    const parent = dir || rootPath.value
    /* 展开目录树，确保新建结果可见（树可能已被用户收起） */
    treeCollapsed.value = false
    expanded.value = { ...expanded.value, [parent]: true }
    await loadChildren(parent)
    return entry
  }

  /* 重命名笔记 / 目录：失败直接抛出，由弹框就地展示错误 */
  async function renameEntry(entry: NoteEntry, name: string): Promise<NoteEntry> {
    if (!(await save())) {
      throw new Error(t('note.saveFailed', [error.value]))
    }
    const renamed = await api.note.rename(entry.path, name)
    if (current.value && isUnder(current.value.path, entry.path)) {
      const path = current.value.path.replace(entry.path, renamed.path)
      const loadedNote = await api.note.read(path)
      current.value = loadedNote
      draft.value = loadedNote.content
      selectedPath.value = loadedNote.path
      savedAt.value = savedTimeOf(loadedNote)
    }
    await refresh()
    return renamed
  }

  /* 复制笔记 / 目录：在同级目录生成副本并刷新该目录 */
  async function copyEntry(entry: NoteEntry): Promise<NoteEntry | null> {
    try {
      const copied = await api.note.copy(entry.path)
      await loadChildren(parentDir(copied.path))
      return copied
    } catch (copyError) {
      ElMessage.error(messageOf(copyError))
      return null
    }
  }

  /* 移动笔记 / 目录到目标目录：同步更新当前打开笔记的路径 */
  async function moveEntry(entry: NoteEntry, targetDir: string): Promise<boolean> {
    if (!(await save())) {
      return false
    }
    try {
      const moved = await api.note.move(entry.path, targetDir)
      if (current.value && isUnder(current.value.path, entry.path)) {
        const path = current.value.path.replace(entry.path, moved.path)
        const loadedNote = await api.note.read(path)
        current.value = loadedNote
        draft.value = loadedNote.content
        selectedPath.value = loadedNote.path
        savedAt.value = savedTimeOf(loadedNote)
      }
      /* 展开目标目录，确保移动结果可见 */
      expanded.value = { ...expanded.value, [targetDir]: true }
      await loadChildren(targetDir)
      await refresh()
      return true
    } catch (moveError) {
      ElMessage.error(messageOf(moveError))
      return false
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
        savedAt.value = null
        saveError.value = ''
        resetCursor()
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
    cursorLine,
    cursorColumn,
    selectedLength,
    mode,
    treeCollapsed,
    treeWidth,
    rootPath,
    dirty,
    saveState,
    savedAt,
    saveError,
    outline,
    currentName,
    allDirsExpanded,
    loadSettings,
    ensureLoaded,
    saveSettings,
    selectStorageDir,
    reloadTree,
    toggleDir,
    toggleAllDirs,
    openNote,
    save,
    setCursor,
    setSelectionLength,
    createNote,
    createFolder,
    renameEntry,
    copyEntry,
    moveEntry,
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
