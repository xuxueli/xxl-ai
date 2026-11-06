/*
 * 终端运行时：会话级终端标签、PTY 挂载/回放与 xterm 生命周期。
 *   - 会话切换时仅卸载 xterm，PTY 保持存活；
 *   - 组件只负责标签栏与画布布局，运行时细节集中在此。
 * @author xuxueli 2026-10-25
 */
import { computed, nextTick, onBeforeUnmount, watch, type ComponentPublicInstance } from 'vue'
import { ElMessage } from 'element-plus'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from '@common/renderer/api'
import { useToolPanelStore } from '@modules/toolPanel/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import type { TerminalEvent } from '@modules/terminal/shared'

/* 终端运行时入参：均以 getter 传入，跟随组件 props 变化 */
export interface SessionTerminalOptions {
  /* 当前会话 id */
  sessionId: () => string
  /* 终端工作目录 */
  cwd: () => string | undefined
  /* 项目名（标签名兜底） */
  title: () => string | undefined
  /* 面板是否可见 */
  visible: () => boolean
}

export function useSessionTerminals(options: SessionTerminalOptions) {
  /* 工具面板 store：终端标签与激活项按会话隔离 */
  const toolPanel = useToolPanelStore()
  /* 设置 store：主题 / 外观变化时同步 xterm 配色 */
  const settings = useSettingsStore()
  /* 当前会话的终端状态 */
  const terminalPanel = computed(() => toolPanel.sliceOf(options.sessionId()).terminalPanel)
  /* 当前会话的终端标签与激活项 */
  const tabs = computed(() => terminalPanel.value.tabs)
  const activeId = computed(() => terminalPanel.value.activeId)

  /* 标签 id → xterm 容器 DOM */
  const containers = new Map<string, HTMLDivElement>()

  /* 标签 id → xterm 运行时（实例、fit、监听句柄、回放序号、待处理事件） */
  interface TerminalRuntime {
    term: Terminal
    fit: FitAddon
    observer: ResizeObserver
    offData: { dispose(): void }
    lastSeq: number
    ready: boolean
    pending: TerminalEvent[]
  }
  const runtimes = new Map<string, TerminalRuntime>()
  let offEvent: (() => void) | undefined

  /* 当前已挂载标签的会话：会话切换时先卸载旧会话的 xterm（PTY 保留） */
  let mountedSessionId = ''

  /* 读取设计令牌的实际值（自定义属性计算值） */
  function token(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value || fallback
  }

  /* 按当前主题选择 xterm 配色（深浅色与设计令牌一致） */
  function xtermTheme(): ITheme {
    return {
      background: token('--theme-content', '#ffffff'),
      foreground: token('--theme-text', '#0d0d0d'),
      cursor: token('--theme-brand', '#0d0d0d'),
      selectionBackground: token('--desk-terminal-selection', 'rgba(0, 0, 0, 0.18)')
    }
  }

  /* 主题 / 外观切换后同步所有已创建终端的配色 */
  watch(
    () => [settings.settings.themePreset, settings.settings.appearance],
    () => {
      const theme = xtermTheme()
      for (const runtime of runtimes.values()) {
        runtime.term.options.theme = theme
      }
    }
  )

  /* 容器 ref 回调：记录/清理标签 DOM */
  function setContainer(id: string, el: Element | ComponentPublicInstance | null): void {
    if (el instanceof HTMLDivElement) {
      containers.set(id, el)
    } else {
      containers.delete(id)
    }
  }

  /* 对指定终端执行自适应尺寸并同步回主进程 */
  function fitTerminal(id: string): void {
    const runtime = runtimes.get(id)
    const el = containers.get(id)
    if (!runtime || !el || el.clientWidth === 0 || el.clientHeight === 0) {
      return
    }
    try {
      runtime.fit.fit()
      void api.terminal.resize(id, runtime.term.cols, runtime.term.rows)
    } catch {
      /* 容器尺寸异常时忽略 */
    }
  }

  /* 取目录名（跨平台分隔符），用于终端标签命名 */
  function folderName(dir: string): string {
    const parts = dir.split(/[\\/]/).filter(Boolean)
    return parts[parts.length - 1] || dir
  }

  /* 在已挂载的容器上创建并绑定 xterm 实例，并回放主进程历史输出 */
  async function mountTerminal(id: string): Promise<void> {
    if (runtimes.has(id)) {
      fitTerminal(id)
      return
    }
    const el = containers.get(id)
    if (!el) {
      return
    }
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace",
      scrollback: 3000,
      theme: xtermTheme(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    /* 用户输入 → 主进程 PTY */
    const offData = term.onData((data) => {
      void api.terminal.write(id, data)
    })
    /* 容器尺寸变化 → 自适应并同步尺寸 */
    const observer = new ResizeObserver(() => fitTerminal(id))
    observer.observe(el)
    const runtime: TerminalRuntime = {
      term,
      fit,
      observer,
      offData,
      lastSeq: 0,
      ready: false,
      pending: [],
    }
    runtimes.set(id, runtime)
    fitTerminal(id)

    /* 回放历史输出：attach 返回截止 seq 与历史片段，之后的事件按 seq 续接 */
    const attached = await api.terminal.attach(id)
    const current = runtimes.get(id)
    if (!current) {
      return
    }
    if (!attached) {
      /* PTY 已退出（应用重启或后台退出）：提示并停止后续绑定 */
      current.ready = true
      current.term.write(`\r\n${t('toolPanel.terminalExited', ['-1'])}\r\n`)
      return
    }
    for (const chunk of attached.chunks) {
      current.term.write(chunk.data)
    }
    current.lastSeq = attached.seq
    current.ready = true
    /* 回放期间收到的实时事件：按序号补齐 */
    for (const event of current.pending) {
      if (event.type === 'data' && event.data != null && event.seq > current.lastSeq) {
        current.lastSeq = event.seq
        current.term.write(event.data)
      }
    }
    current.pending = []
    fitTerminal(id)
  }

  /* 清理单个 xterm 运行时（不销毁 PTY） */
  function detachRuntime(id: string): void {
    const runtime = runtimes.get(id)
    if (!runtime) {
      return
    }
    runtime.observer.disconnect()
    runtime.offData.dispose()
    runtime.term.dispose()
    runtimes.delete(id)
  }

  /* 卸载当前会话的全部 xterm 运行时（PTY 保留在主进程） */
  function detachSession(): void {
    for (const id of [...runtimes.keys()]) {
      detachRuntime(id)
    }
    containers.clear()
    mountedSessionId = ''
  }

  /* 新建终端：创建 PTY → 以当前文件夹命名标签 → 挂载 xterm 并聚焦 */
  async function createTerminalFor(sessionId: string): Promise<void> {
    try {
      const dto = await api.terminal.create({ sessionId, cwd: options.cwd() })
      const title = folderName(dto.cwd) || options.title() || t('toolPanel.terminal')
      toolPanel.addTerminalTab(sessionId, { id: dto.id, title })
      if (sessionId !== options.sessionId()) {
        return
      }
      await nextTick()
      await mountTerminal(dto.id)
      fitTerminal(dto.id)
      runtimes.get(dto.id)?.term.focus()
    } catch (error) {
      console.warn('创建终端失败：', error)
      /* 区分「单会话上限 / 全局上限 / 其它失败」，直接展示主进程返回的原因 */
      ElMessage.warning(ipcErrorMessage(error) || t('toolPanel.terminalLimit'))
    }
  }

  /* 新建当前会话的终端（标签栏「+」） */
  async function openTerminal(): Promise<void> {
    await createTerminalFor(options.sessionId())
  }

  /* 确保会话的终端标签可用：清理已退出标签，全部失效时补开一个 */
  async function ensureTabs(sessionId: string): Promise<void> {
    const state = toolPanel.sliceOf(sessionId).terminalPanel
    if (state.tabs.length === 0) {
      const alive = await api.terminal.list(sessionId)
      if (alive.length > 0) {
        toolPanel.setTerminalTabs(
          sessionId,
          alive.map((item) => ({
            id: item.id,
            title: folderName(item.cwd) || options.title() || t('toolPanel.terminal'),
          })),
        )
        return
      }
      await createTerminalFor(sessionId)
      return
    }

    /* 已有标签：用轻量 list 校验 PTY 存活（避免每次切换会话都回放 256KB 缓冲） */
    const alive = await api.terminal.list(sessionId)
    const aliveIds = new Set(alive.map((item) => item.id))
    const missing = state.tabs.filter((tab) => !aliveIds.has(tab.id))
    const kept = state.tabs.filter((tab) => aliveIds.has(tab.id))
    if (missing.length > 0) {
      /* 兜底校验：草稿终端迁移到新会话的短暂窗口内，list 可能尚未包含该实例 */
      const checks = await Promise.all(missing.map((tab) => api.terminal.attach(tab.id)))
      missing.forEach((tab, index) => {
        if (checks[index]) {
          kept.push(tab)
        }
      })
    }
    if (kept.length !== state.tabs.length) {
      toolPanel.setTerminalTabs(sessionId, kept)
    }
    if (kept.length === 0) {
      await createTerminalFor(sessionId)
    }
  }

  /* 挂载当前会话的激活标签 */
  async function mountActive(sessionId: string): Promise<void> {
    let active = toolPanel.sliceOf(sessionId).terminalPanel.activeId
    if (!active) {
      const last = toolPanel.sliceOf(sessionId).terminalPanel.tabs.at(-1)
      if (last) {
        toolPanel.setActiveTerminal(sessionId, last.id)
        active = last.id
      }
    }
    if (!active) {
      return
    }
    await nextTick()
    await mountTerminal(active)
    fitTerminal(active)
    runtimes.get(active)?.term.focus()
  }

  /* 激活会话：切换会话时仅重建 xterm，不触碰 PTY */
  async function activateSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      return
    }
    if (mountedSessionId !== sessionId) {
      detachSession()
      mountedSessionId = sessionId
    }
    await ensureTabs(sessionId)
    await mountActive(sessionId)
  }

  /* 切换标签：展示并聚焦，重新自适应 */
  async function activate(id: string): Promise<void> {
    toolPanel.setActiveTerminal(options.sessionId(), id)
    await nextTick()
    await mountTerminal(id)
    fitTerminal(id)
    runtimes.get(id)?.term.focus()
  }

  /* 关闭并回收单个终端（显式关闭才销毁 PTY） */
  function disposeTab(id: string): void {
    detachRuntime(id)
    containers.delete(id)
    void api.terminal.dispose(id)
    toolPanel.removeTerminalTab(options.sessionId(), id)
  }

  /* 统一订阅终端事件：按 id 路由到对应 xterm；回放未完成时先入队 */
  offEvent = api.terminal.onEvent((event) => {
    const runtime = runtimes.get(event.id)
    if (!runtime) {
      return
    }
    if (!runtime.ready) {
      runtime.pending.push(event)
      return
    }
    if (event.seq <= runtime.lastSeq) {
      return
    }
    runtime.lastSeq = event.seq
    if (event.type === 'data' && event.data != null) {
      runtime.term.write(event.data)
    } else if (event.type === 'exit') {
      runtime.term.write(`\r\n${t('toolPanel.terminalExited', [String(event.exitCode ?? 0)])}\r\n`)
    }
  })

  /* 面板显示时确保终端已就绪；会话切换时重建当前会话的 xterm */
  watch(
    () => options.visible(),
    (visible) => {
      if (visible) {
        void activateSession(options.sessionId())
      }
    },
    { immediate: true },
  )

  watch(
    () => options.sessionId(),
    (sessionId) => {
      if (options.visible()) {
        void activateSession(sessionId)
      }
    },
  )

  onBeforeUnmount(() => {
    offEvent?.()
    /* 仅销毁 xterm；PTY 由主进程在应用退出 / 会话删除时统一回收 */
    detachSession()
  })

  return { tabs, activeId, setContainer, activate, openTerminal, disposeTab }
}
