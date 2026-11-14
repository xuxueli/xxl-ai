/*
 * 浏览器 Agent 动作可视化：光标位置、目标轮廓与动作记录。
 *   - 光标常驻：面板打开后始终显示在页面上，空闲时弱化，动作时强化并展示状态文案；
 *   - 仅渲染层使用，按会话保存最近动作与动作列表，不落库、不跨进程；
 *   - 全部写入为 best-effort：可视化异常自行吞掉，不参与动作结果与超时。
 * @author xuxueli 2026-11-15
 */

import { reactive } from 'vue'

/* 动作类型：指针类动作驱动光标移动，读取 / 等待类动作只切换状态文案 */
export type BrowserActionKind =
  | 'move'
  | 'click'
  | 'fill'
  | 'type'
  | 'press'
  | 'scroll'
  | 'read'
  | 'snapshot'
  | 'wait'
  | 'navigate'
  | 'screenshot'
  | 'tabs'
  | 'history'

/* 目标元素轮廓（webview 视口坐标） */
export interface BrowserCursorBox {
  x: number
  y: number
  width: number
  height: number
}

/* 光标状态 */
export interface BrowserCursorState {
  /* 光标是否可见（完成首次定位后常驻） */
  visible: boolean
  /* 是否正在执行动作：决定状态文案、目标轮廓与高亮强度 */
  busy: boolean
  /* 光标位置 */
  x: number
  y: number
  /* 已完成首次定位（避免每次打开面板都重置位置） */
  placed: boolean
  /* 停靠在右下角：未被指针动作移动过，尺寸变化时继续吸附角落 */
  docked: boolean
  /* 动作类型（决定图标） */
  kind: BrowserActionKind
  /* 执行中的状态文案（光标旁展示） */
  status: string
  /* 目标元素轮廓 */
  box: BrowserCursorBox | null
  /* 涟漪序号：递增触发一次点击动画 */
  ripple: number
  /* 动作序号：递增触发一次指针弹跳，连续动作也有反馈 */
  pulse: number
}

/* 动作记录（面板动作条展示） */
export interface BrowserActionRecord {
  /* 记录 ID */
  id: string
  /* 动作类型 */
  kind: BrowserActionKind
  /* 动作标签 */
  label: string
  /* 开始时间（毫秒时间戳） */
  startedAt: number
  /* 耗时（毫秒），执行中为 0 */
  durationMs: number
  /* 是否仍在执行 */
  running: boolean
  /* 是否成功 */
  ok: boolean
  /* 失败原因 */
  error?: string
}

/* 单会话记录上限：只保留最近几步，避免长期运行占内存 */
const MAX_RECORDS = 5
/* 动作结束后状态文案的保留时间（毫秒）：留足阅读时间，持续操作会不断续期 */
const STATUS_LINGER = 4500
/* 光标距内容区边缘的最小留白 */
const EDGE_GAP = 12

/* 指针本体尺寸：由浮层按 CSS 变量传入，用于把光标完整收进可视范围 */
export interface BrowserCursorPointSize {
  width: number
  height: number
}

/* 会话 ID → 光标状态 */
const cursors = reactive<Record<string, BrowserCursorState>>({})
/* 会话 ID → 动作记录（新的在前） */
const records = reactive<Record<string, BrowserActionRecord[]>>({})
/* 会话 ID → 状态收尾定时器 */
const lingerTimers = new Map<string, ReturnType<typeof setTimeout>>()
/* 记录自增序号 */
let recordSeq = 0

/* 确保会话光标状态存在，返回响应式代理 */
function ensureCursor(sessionId: string): BrowserCursorState {
  if (!cursors[sessionId]) {
    cursors[sessionId] = {
      visible: false,
      busy: false,
      x: 0,
      y: 0,
      placed: false,
      docked: true,
      kind: 'click',
      status: '',
      box: null,
      ripple: 0,
      pulse: 0
    }
  }
  return cursors[sessionId]
}

/* 同步内容区尺寸：未操作过时吸附右下角，操作过则只把光标收进可视范围 */
export function syncBrowserCursorViewport(
  sessionId: string,
  width: number,
  height: number,
  point: BrowserCursorPointSize = { width: 0, height: 0 }
): void {
  try {
    if (!(width > 0) || !(height > 0)) {
      return
    }
    const cursor = ensureCursor(sessionId)
    /* 指针本体有固定尺寸：上限要把本体让出来，否则箭头会伸出右 / 下边缘被裁掉 */
    const maxX = Math.max(EDGE_GAP, width - point.width - EDGE_GAP)
    const maxY = Math.max(EDGE_GAP, height - point.height - EDGE_GAP)
    /* 停靠态（首次出现、空闲或未操作过）：始终跟随右下角，窗口 / 面板缩放时也吸附 */
    if (!cursor.placed || cursor.docked || !cursor.busy) {
      cursor.x = Math.round(maxX)
      cursor.y = Math.round(maxY)
      cursor.placed = true
      cursor.docked = true
      cursor.visible = true
      return
    }
    cursor.x = Math.min(Math.max(cursor.x, EDGE_GAP), maxX)
    cursor.y = Math.min(Math.max(cursor.y, EDGE_GAP), maxY)
    cursor.visible = true
  } catch {
    /* 可视化失败不影响动作 */
  }
}

/* 开始一个动作：返回记录 ID，供结束时回填结果 */
export function beginBrowserAction(input: {
  sessionId: string
  kind: BrowserActionKind
  label: string
  status: string
  point?: { x: number; y: number }
  box?: BrowserCursorBox | null
  ripple?: boolean
}): string {
  try {
    const id = `act-${++recordSeq}`
    const { sessionId } = input
    const previousTimer = lingerTimers.get(sessionId)
    if (previousTimer) {
      clearTimeout(previousTimer)
      lingerTimers.delete(sessionId)
    }
    /* 经由响应式代理读写；直接改原始对象不会触发视图更新 */
    const cursor = ensureCursor(sessionId)
    cursor.kind = input.kind
    cursor.status = input.status
    cursor.box = input.box ?? null
    cursor.busy = true
    cursor.visible = true
    cursor.pulse += 1
    if (input.point) {
      cursor.x = Math.round(input.point.x)
      cursor.y = Math.round(input.point.y)
      cursor.placed = true
      /* 指针动作把光标带到目标位置：此后尺寸变化不再拉回右下角 */
      cursor.docked = false
    }
    if (input.ripple) {
      cursor.ripple += 1
    }
    if (!records[sessionId]) {
      records[sessionId] = []
    }
    /* 经由响应式代理写入，确保动作条实时刷新 */
    const targetList = records[sessionId]
    targetList.unshift({
      id,
      kind: input.kind,
      label: input.label,
      startedAt: Date.now(),
      durationMs: 0,
      running: true,
      ok: true
    })
    if (targetList.length > MAX_RECORDS) {
      targetList.length = MAX_RECORDS
    }
    return id
  } catch {
    /* 可视化失败不影响动作 */
    return ''
  }
}

/* 结束一个动作：回填耗时与结果，延时收起状态文案与轮廓（光标保留） */
export function endBrowserAction(
  sessionId: string,
  id: string,
  result: { ok: boolean; error?: string }
): void {
  try {
    const record = records[sessionId]?.find((item) => item.id === id)
    if (record) {
      record.durationMs = Math.max(0, Date.now() - record.startedAt)
      record.running = false
      record.ok = result.ok
      record.error = result.error
    }
    const cursor = cursors[sessionId]
    if (!cursor) {
      return
    }
    const previousTimer = lingerTimers.get(sessionId)
    if (previousTimer) {
      clearTimeout(previousTimer)
    }
    /* 动作结束立即停止脉冲；状态文案与目标轮廓再保留一段时间，避免"还没看到就消失" */
    cursor.busy = false
    lingerTimers.set(
      sessionId,
      setTimeout(() => {
        lingerTimers.delete(sessionId)
        const current = cursors[sessionId]
        if (current) {
          current.box = null
          current.status = ''
        }
      }, STATUS_LINGER)
    )
  } catch {
    /* 可视化失败不影响动作 */
  }
}

/* 读取会话光标状态 */
export function cursorOf(sessionId: string): BrowserCursorState | null {
  return cursors[sessionId] ?? null
}

/* 读取会话动作记录（新的在前） */
export function actionsOf(sessionId: string): BrowserActionRecord[] {
  return records[sessionId] ?? []
}

/* 释放会话可视化状态（会话删除 / 宿主清理时调用） */
export function disposeBrowserCursor(sessionId: string): void {
  const timer = lingerTimers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    lingerTimers.delete(sessionId)
  }
  delete cursors[sessionId]
  delete records[sessionId]
}
