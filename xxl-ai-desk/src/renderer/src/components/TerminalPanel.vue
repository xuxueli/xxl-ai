<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from '../api'
import { t } from '../i18n'

/*
 * 底部终端面板：多标签，每个标签一个本地 PTY（主进程 node-pty）+ xterm 实例。
 * 输出经 IPC 事件流写入 xterm，输入/尺寸变化回写主进程。
 */
const props = defineProps<{ cwd?: string; title?: string; visible?: boolean }>()
const emit = defineEmits<{ close: [] }>()

/* 终端标签：id 对应主进程 PTY 会话 */
interface TerminalTab {
  id: string
  title: string
}
const tabs = ref<TerminalTab[]>([])
const activeId = ref('')

/* 标签 id → xterm 容器 DOM */
const containers = new Map<string, HTMLDivElement>()

/* 标签 id → xterm 运行时（实例、fit、监听句柄） */
interface TerminalRuntime {
  term: Terminal
  fit: FitAddon
  observer: ResizeObserver
  offData: { dispose(): void }
}
const runtimes = new Map<string, TerminalRuntime>()
let offEvent: (() => void) | undefined

/* 按当前主题选择 xterm 配色（深浅色与设计令牌一致） */
function xtermTheme(): ITheme {
  const dark = document.documentElement.classList.contains('dark')
  return dark
    ? { background: '#1e1e1e', foreground: '#ececec', cursor: '#ececec', selectionBackground: '#3a3a3a' }
    : { background: '#ffffff', foreground: '#0d0d0d', cursor: '#0d0d0d', selectionBackground: '#d8d8d8' }
}

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

/* 在已挂载的容器上创建并绑定 xterm 实例 */
function mountTerminal(id: string): void {
  const el = containers.get(id)
  if (!el) {
    return
  }
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace",
    scrollback: 3000,
    theme: xtermTheme()
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
  runtimes.set(id, { term, fit, observer, offData })
  fitTerminal(id)
}

/* 取目录名（跨平台分隔符），用于终端标签命名 */
function folderName(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || dir
}

/* 新建终端：创建 PTY → 以当前文件夹命名标签 → 挂载 xterm 并聚焦 */
async function openTerminal(): Promise<void> {
  const dto = await api.terminal.create({ cwd: props.cwd })
  const title = folderName(dto.cwd) || props.title || t('chat.terminal')
  tabs.value.push({ id: dto.id, title })
  activeId.value = dto.id
  await nextTick()
  mountTerminal(dto.id)
  fitTerminal(dto.id)
  runtimes.get(dto.id)?.term.focus()
}

/* 切换标签：展示并聚焦，重新自适应 */
async function activate(id: string): Promise<void> {
  activeId.value = id
  await nextTick()
  fitTerminal(id)
  runtimes.get(id)?.term.focus()
}

/* 关闭并回收单个终端 */
function disposeTab(id: string): void {
  const runtime = runtimes.get(id)
  if (runtime) {
    runtime.observer.disconnect()
    runtime.offData.dispose()
    runtime.term.dispose()
    runtimes.delete(id)
  }
  containers.delete(id)
  void api.terminal.dispose(id)
  tabs.value = tabs.value.filter((tab) => tab.id !== id)
  if (activeId.value === id) {
    activeId.value = tabs.value[tabs.value.length - 1]?.id ?? ''
  }
}

/* 面板重新展示时（v-show 切换）重新自适应 */
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      nextTick(() => fitTerminal(activeId.value))
    }
  }
)

onMounted(() => {
  /* 统一订阅终端事件，按 id 路由到对应 xterm */
  offEvent = api.terminal.onEvent((event) => {
    const runtime = runtimes.get(event.id)
    if (!runtime) {
      return
    }
    if (event.type === 'data' && event.data != null) {
      runtime.term.write(event.data)
    } else if (event.type === 'exit') {
      runtime.term.write(`\r\n${t('chat.terminalExited', [String(event.exitCode ?? 0)])}\r\n`)
    }
  })
  void openTerminal()
})

onBeforeUnmount(() => {
  offEvent?.()
  for (const id of [...runtimes.keys()]) {
    const runtime = runtimes.get(id)
    runtime?.observer.disconnect()
    runtime?.offData.dispose()
    runtime?.term.dispose()
    void api.terminal.dispose(id)
  }
  runtimes.clear()
  containers.clear()
})
</script>

<template>
  <div class="chat-terminal">
    <div class="terminal-header">
      <div class="terminal-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="terminal-tab"
          :class="{ active: tab.id === activeId }"
          :title="tab.title"
          @click="activate(tab.id)"
        >
          <svg class="panel-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
            <path d="M7.5 10l2.5 2.5-2.5 2.5" />
            <path d="M12.5 15H17" />
          </svg>
          <span class="terminal-tab-name">{{ tab.title }}</span>
          <el-icon class="terminal-tab-close" @click.stop="disposeTab(tab.id)"><Close /></el-icon>
        </button>
      </div>
      <div class="terminal-actions">
        <button class="sidebar-toggle" :title="t('chat.newTerminal')" @click="openTerminal">
          <el-icon><Plus /></el-icon>
        </button>
        <button class="sidebar-toggle" :title="t('chat.hideTerminal')" @click="emit('close')">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>
    <div class="terminal-body">
      <div
        v-for="tab in tabs"
        v-show="tab.id === activeId"
        :key="tab.id"
        class="terminal-xterm"
        :ref="(el) => setContainer(tab.id, el)"
      ></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 底部终端面板：横跨主区底部 */
.chat-terminal {
  height: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--desk-border);
  background: var(--desk-bg);
}

.terminal-header {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--desk-border);
}

.terminal-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
}

/* 标签：终端图标 + 名称 + 关闭 */
.terminal-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 6px 4px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  color: var(--desk-text-secondary);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.terminal-tab:hover {
  background: var(--desk-primary-soft);
}

.terminal-tab.active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.terminal-tab-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 终端图标：随文字色着色 */
.panel-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 关闭图标：默认隐藏，悬浮标签时展示 */
.terminal-tab-close {
  font-size: 13px;
  visibility: hidden;
}

.terminal-tab:hover .terminal-tab-close {
  visibility: visible;
}

.terminal-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 终端画布容器：绝对铺满，交由 xterm 绘制 */
.terminal-body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--desk-bg);
}

.terminal-xterm {
  position: absolute;
  inset: 6px 8px;
}
</style>
