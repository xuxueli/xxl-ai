/*
 * 内嵌浏览器契约：Agent 工具与右侧浏览器面板之间的动作请求 / 结果。
 *   - 主进程把动作请求转发渲染层，由当前标签页 webview 执行并回传结构化结果；
 *   - 结果统一以 ok/error 表达，避免跨进程异常丢失。
 */

/* 表单字段定位与目标值 */
export interface BrowserFillField {
  /* snapshot 返回的元素引用（与 selector 二选一） */
  ref?: string
  /* CSS 选择器（与 ref 二选一，ref 优先） */
  selector?: string
  /* 输入值（文本 / select 选项 / contenteditable 内容） */
  value?: string
  /* 复选框 / 单选框目标状态 */
  checked?: boolean
}

/* 浏览器动作：读取、快照、点击、填写、等待、截图、诊断、标签页与历史导航 */
export type BrowserAction =
  | { type: 'read'; selector?: string; maxChars?: number } /* 读取正文 */
  | { type: 'snapshot'; maxNodes?: number } /* 交互元素快照 */
  | {
      type: 'click'
      ref?: string
      selector?: string
      button?: 'left' | 'right'
      clickCount?: number
    } /* 点击元素 */
  | { type: 'fill'; fields: BrowserFillField[]; submit?: boolean } /* 填写表单 */
  | { type: 'hover'; ref?: string; selector?: string } /* 悬停元素 */
  | { type: 'press'; key: string; ref?: string; selector?: string } /* 按键 */
  | { type: 'select'; ref?: string; selector?: string; value: string } /* 选择下拉选项 */
  | { type: 'scroll'; direction: 'up' | 'down' | 'top' | 'bottom'; amount?: number } /* 滚轮滚动 */
  | { type: 'wait'; selector?: string; text?: string; url?: string; timeoutMs?: number } /* 等待条件 */
  | { type: 'screenshot' } /* 页面截图 */
  | { type: 'diagnostics' } /* 控制台与加载诊断 */
  | { type: 'tabs'; operation: 'list' | 'select' | 'close'; tabId?: string } /* 标签页管理 */
  | { type: 'history'; action: 'back' | 'forward' | 'reload' } /* 历史导航 */

/* 快照中的可交互元素 */
export interface BrowserSnapshotNode {
  /* 元素引用（后续 click / fill 使用） */
  ref: string
  /* 语义角色（button / link / textbox / checkbox 等） */
  role: string
  /* 可访问名称或可见文本 */
  name: string
  /* 当前值（输入框 / 下拉框） */
  value?: string
  /* 是否禁用 */
  disabled?: boolean
  /* 是否选中（复选 / 单选） */
  checked?: boolean
  /* 链接地址（仅链接） */
  href?: string
}

/* 控制台诊断条目 */
export interface BrowserConsoleEntry {
  /* 级别 */
  level: 'warning' | 'error'
  /* 消息文本 */
  message: string
  /* 来源地址 */
  source?: string
  /* 行号 */
  line?: number
}

/* 标签页信息 */
export interface BrowserTabInfo {
  /* 标签页 ID */
  id: string
  /* 标题 */
  title: string
  /* 当前地址 */
  url: string
  /* 是否为当前激活标签页 */
  active: boolean
}

/* 打开标签页请求（主 → 渲染）：sessionId 为空表示页面内 window.open，由当前会话兜底 */
export interface BrowserOpenTabRequest {
  /* 所属会话 ID */
  sessionId: string
  /* 目标地址 */
  url: string
  /* 是否强制新建标签页 */
  newTab: boolean
}

/* 页面动作请求（主 → 渲染）：由对应会话的浏览器执行并回传结果 */
export interface BrowserActionRequest {
  /* 请求 ID（结果回传时配对） */
  requestId: string
  /* 所属会话 ID */
  sessionId: string
  /* 页面动作 */
  action: BrowserAction
}

/* 浏览器动作结果（按动作类型填充对应字段） */
export interface BrowserActionResult {
  /* 是否成功 */
  ok: boolean
  /* 失败原因（ok=false 时） */
  error?: string
  /* 页面标题 */
  title?: string
  /* 当前地址 */
  url?: string
  /* 正文（read） */
  text?: string
  /* 正文是否被截断（read / snapshot 摘要） */
  truncated?: boolean
  /* 交互元素（snapshot） */
  nodes?: BrowserSnapshotNode[]
  /* 交互元素总数（snapshot，可能大于返回条数） */
  totalNodes?: number
  /* 等待条件是否命中（wait） */
  matched?: boolean
  /* 实际等待毫秒数（wait） */
  waitedMs?: number
  /* 截图 data URL（screenshot） */
  screenshot?: string
  /* 截图宽度（screenshot） */
  screenshotWidth?: number
  /* 截图高度（screenshot） */
  screenshotHeight?: number
  /* 控制台消息（diagnostics） */
  console?: BrowserConsoleEntry[]
  /* 加载失败记录（diagnostics） */
  failedLoads?: string[]
  /* 标签页列表（tabs） */
  tabs?: BrowserTabInfo[]
  /* 当前激活标签页 ID（tabs） */
  activeTabId?: string
  /* 已填写字段数（fill） */
  filled?: number
  /* 未找到的字段定位（fill） */
  missing?: string[]
  /* 动作摘要（click / fill / history） */
  summary?: string
}
