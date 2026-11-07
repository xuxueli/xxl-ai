/*
 * 项目文件树状态：目录懒加载缓存、展开态、过滤与目录监听生命周期。
 * @author xuxueli 2026-10-25
 */

import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@common/renderer/api'
import { normalizePath, parentDir } from '@modules/file/renderer/utils/path'
import type { FsEntry } from '@modules/file/shared'

export interface UseProjectFileTreeOptions {
  /* 项目根目录（响应式取值，用于路径展示与状态重置） */
  root: () => string | undefined
  /* 项目主键（文件系统 IPC 的唯一边界依据） */
  projectId: () => number | undefined
  /* 外部维护的过滤关键字（按会话隔离时传入；缺省使用组件内部状态） */
  keyword?: Ref<string>
  /* 外部维护的目录展开态（按会话隔离时传入；缺省使用组件内部状态） */
  expanded?: Ref<Record<string, boolean>>
}

export function useProjectFileTree(options: UseProjectFileTreeOptions) {
  /* 目录 → 子项（懒加载缓存）、展开态、加载态 */
  const childrenMap = ref<Record<string, FsEntry[]>>({})
  const expandedMap = options.expanded ?? ref<Record<string, boolean>>({})
  const loadingMap = ref<Record<string, boolean>>({})
  /* 过滤关键字 */
  const keyword = options.keyword ?? ref('')

  /* 已注册监听的目录集合（避免重复 IPC）与正在重载的目录集合 */
  const watchedDirs = new Set<string>()
  const reloading = new Set<string>()
  let offFsChange: (() => void) | null = null

  /* 根目录直接子项 */
  const rootChildren = computed(() => {
    const root = options.root()
    return root ? (childrenMap.value[root] ?? []) : []
  })

  /* 过滤时递归判断节点（或已加载子孙）是否命中 */
  function matchNode(entry: FsEntry, word: string): boolean {
    if (entry.name.toLowerCase().includes(word)) {
      return true
    }
    const kids = childrenMap.value[entry.path]
    return Boolean(kids && kids.some((child) => matchNode(child, word)))
  }

  /* 过滤后的根目录可见子项（无关键字时取全部） */
  const visibleRoot = computed(() => {
    const word = keyword.value.trim().toLowerCase()
    return word ? rootChildren.value.filter((entry) => matchNode(entry, word)) : rootChildren.value
  })

  /* 注册目录监听（幂等） */
  function registerWatch(dir: string): void {
    const projectId = options.projectId()
    if (!projectId || watchedDirs.has(dir)) {
      return
    }
    watchedDirs.add(dir)
    void api.fs.watch(projectId, dir)
  }

  /* 取消目录监听（项目缺失时仍清理本地登记，主进程按目录关闭监听即可） */
  function unwatch(dir: string): void {
    if (!watchedDirs.delete(dir)) {
      return
    }
    void api.fs.unwatch(options.projectId() ?? 0, dir)
  }

  /*
   * 清理已消失的子目录：父目录重载后，若某已监听子目录不再存在，
   * 取消其监听并清空其缓存/展开态（避免残留幽灵节点）。
   */
  function cleanupChildren(dir: string, entries: FsEntry[]): void {
    const present = new Set(entries.map((entry) => normalizePath(entry.path)))
    const next = { ...childrenMap.value }
    let changed = false
    for (const watched of [...watchedDirs]) {
      if (normalizePath(parentDir(watched)) === normalizePath(dir) && !present.has(normalizePath(watched))) {
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
    const root = options.root()
    const projectId = options.projectId()
    if (!root || !projectId || (!force && (childrenMap.value[path] || loadingMap.value[path]))) {
      return
    }
    loadingMap.value = { ...loadingMap.value, [path]: true }
    try {
      const entries = await api.fs.list(projectId, path)
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

  /* 重载单个已加载目录 */
  async function reloadDir(dir: string): Promise<void> {
    if (reloading.has(dir)) {
      return
    }
    reloading.add(dir)
    try {
      await loadDir(dir, true)
    } finally {
      reloading.delete(dir)
    }
  }

  /* 目录变更回调：匹配已加载目录并刷新 */
  function onFsChange(dir: string): void {
    const target = Object.keys(childrenMap.value).find(
      (key) => normalizePath(key) === normalizePath(dir)
    )
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

  /* 重置面板状态并在根目录变化时重新加载（外部展开态/关键字仅随根目录切换清空） */
  let lastRoot: string | undefined
  function reset(): void {
    for (const dir of [...watchedDirs]) {
      unwatch(dir)
    }
    watchedDirs.clear()
    childrenMap.value = {}
    loadingMap.value = {}
    const root = options.root()
    /* 首次挂载保留会话持久化的展开态与关键字；根目录真正变化时才清空 */
    if (lastRoot !== undefined && lastRoot !== root) {
      expandedMap.value = {}
      keyword.value = ''
    }
    lastRoot = root
    if (root) {
      /* 根节点默认展开，保证首次打开即可看到项目文件；用户手动收起后保留会话态 */
      if (expandedMap.value[root] === undefined) {
        expandedMap.value = { ...expandedMap.value, [root]: true }
      }
      void loadDir(root)
      /* 恢复已展开目录的子项（会话切换后保持树展开状态） */
      for (const [dir, open] of Object.entries(expandedMap.value)) {
        if (open && dir !== root) {
          void loadDir(dir)
        }
      }
    }
  }

  watch(options.root, reset, { immediate: true })

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

  /* 窗口重新获得焦点时刷新已加载目录，补充系统 watcher 可能漏掉的变更 */
  function refreshLoadedDirs(): void {
    for (const dir of Object.keys(childrenMap.value)) {
      void reloadDir(dir)
    }
  }

  /* 挂载：监听目录变更 */
  onMounted(() => {
    offFsChange = api.fs.onChange(onFsChange)
    window.addEventListener('focus', refreshLoadedDirs)
  })

  /* 卸载：取消文件变更监听并注销全部目录监听 */
  onBeforeUnmount(() => {
    offFsChange?.()
    window.removeEventListener('focus', refreshLoadedDirs)
    for (const dir of [...watchedDirs]) {
      unwatch(dir)
    }
    watchedDirs.clear()
  })

  return {
    childrenMap,
    expandedMap,
    loadingMap,
    keyword,
    rootChildren,
    visibleRoot,
    toggle
  }
}
