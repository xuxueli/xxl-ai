/*
 * Markdown 格式化命令：把工具栏动作转换为对编辑器文本的替换与选区定位。
 * @author xuxueli 2026-11-14
 */

import type { EditorSelection } from '@common/renderer/components/CodeEditor/types'

/* 工具栏动作 */
export type MarkdownAction =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'quote'
  | 'link'
  | 'codeBlock'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'table'
  | 'divider'
  | 'formula'
  | 'formulaBlock'
  | 'diagram'

/* Mermaid 图表类型 */
export type MermaidKind =
  | 'flow'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'journey'
  | 'gantt'
  | 'pie'
  | 'mindmap'
  | 'timeline'

/* 一次文本替换：text 为替换内容，selectFrom / selectTo 为相对替换起点的选区 */
export interface MarkdownCommand {
  from: number
  to: number
  text: string
  selectFrom: number
  selectTo: number
}

/* 行内包裹标记 */
const INLINE_MARKERS: Partial<Record<MarkdownAction, string>> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  inlineCode: '`'
}

/* 行首前缀：任务列表要先于普通无序列表匹配 */
const LINE_PREFIX: Record<'quote' | 'bulletList' | 'orderedList' | 'taskList', RegExp> = {
  quote: /^\s*>\s?/,
  bulletList: /^\s*[-*+]\s+(?!\[[ xX]\]\s)/,
  orderedList: /^\s*\d+\.\s+/,
  taskList: /^\s*[-*+]\s+\[[ xX]\]\s+/
}

/* 去掉列表前缀，保留缩进 */
function stripListPrefix(line: string): string {
  return line
    .replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/, '$1')
    .replace(/^(\s*)[-*+]\s+/, '$1')
    .replace(/^(\s*)\d+\.\s+/, '$1')
}

/* 去掉标题前缀 */
function stripHeading(line: string): string {
  return line.replace(/^\s*#{1,6}\s+/, '')
}

/* 匹配光标 / 选区外侧已有的包裹标记 */
function findWrappedRange(
  lineText: string,
  from: number,
  to: number,
  marker: string
): { open: number; closeEnd: number; innerFrom: number; innerTo: number } | null {
  const open = lineText.lastIndexOf(marker, from)
  if (open < 0) {
    return null
  }
  const openEnd = open + marker.length
  if (from < openEnd) {
    return null
  }
  /* 单字符标记需要排除双写标记（** / ~~） */
  if (marker === '*') {
    if (
      lineText[open - 1] === '*' ||
      lineText[openEnd] === '*' ||
      lineText[openEnd] === '~'
    ) {
      return null
    }
  }
  const close = lineText.indexOf(marker, Math.max(to, openEnd))
  if (close < 0) {
    return null
  }
  if (marker === '*') {
    if (lineText[close - 1] === '*' || lineText[close + 1] === '*' || lineText[close + 1] === '~') {
      return null
    }
  }
  return { open, closeEnd: close + marker.length, innerFrom: openEnd, innerTo: close }
}

/* 段落内联包裹：有选区则包裹 / 取消，无选区插入成对标记并定位中间 */
function wrapInline(selection: EditorSelection, marker: string): MarkdownCommand | null {
  const { from, to, text, lineFrom, lineText } = selection
  /* 空标记（如 ****、**）再次点击保持原样，不做取消也不叠加 */
  if (!text && lineText.trim() === `${marker}${marker}`) {
    return null
  }
  /* 选区正好包含包裹标记：再次点击取消（斜体需排除 ** 与 ~~） */
  const wrappedSelection =
    text.length >= marker.length * 2 &&
    text.startsWith(marker) &&
    text.endsWith(marker) &&
    !(marker === '*' && (text.startsWith('**') || text.startsWith('~~')))
  if (wrappedSelection) {
    const inner = text.slice(marker.length, -marker.length)
    /* 没有内容时不取消标记，保留待输入状态 */
    if (!inner.trim()) {
      return null
    }
    return {
      from,
      to,
      text: inner,
      selectFrom: 0,
      selectTo: inner.length
    }
  }
  /* 光标 / 选区位于已有标记内部：再次点击取消 */
  if (!lineText.includes('\n')) {
    const wrapped = findWrappedRange(lineText, from - lineFrom, to - lineFrom, marker)
    if (wrapped) {
      const inner = lineText.slice(wrapped.innerFrom, wrapped.innerTo)
      /* 空标记内部再次点击不做取消 */
      if (!inner.trim()) {
        return null
      }
      const caret = Math.max(0, from - lineFrom - wrapped.innerFrom)
      return {
        from: lineFrom + wrapped.open,
        to: lineFrom + wrapped.closeEnd,
        text: inner,
        selectFrom: to > from ? 0 : Math.min(caret, inner.length),
        selectTo: to > from ? inner.length : Math.min(caret, inner.length)
      }
    }
  }
  if (text) {
    return {
      from,
      to,
      text: `${marker}${text}${marker}`,
      selectFrom: marker.length,
      selectTo: marker.length + text.length
    }
  }
  return {
    from,
    to,
    text: `${marker}${marker}`,
    selectFrom: marker.length,
    selectTo: marker.length
  }
}

/* 行级格式：整行添加 / 取消前缀 */
function toggleLine(
  selection: EditorSelection,
  kind: 'quote' | 'bulletList' | 'orderedList' | 'taskList'
): MarkdownCommand {
  const lines = selection.lineText.split('\n')
  const contentLines = lines.filter((line) => line.trim().length > 0)
  const allApplied = contentLines.length > 0 && contentLines.every((line) => LINE_PREFIX[kind].test(line))
  /* 单行空内容也要添加标记，保证「点击即出现格式」 */
  const singleEmpty = lines.length === 1 && lines[0].trim().length === 0
  let orderedIndex = 0
  const next = lines.map((line) => {
    if (!line.trim() && !singleEmpty) {
      return line
    }
    /* 取消：按当前格式移除对应前缀 */
    if (allApplied) {
      return kind === 'quote' ? line.replace(/^(\s*)>\s?/, '$1') : stripListPrefix(line)
    }
    if (kind === 'quote') {
      return `> ${line}`
    }
    /* 引用块内插入列表：保留引用前缀，列表紧随其后 */
    const quote = /^\s*>\s?/.exec(line)?.[0] ?? ''
    const body = quote ? line.slice(quote.length) : line
    const indent = /^\s*/.exec(body)?.[0] ?? ''
    const content = stripListPrefix(body).slice(indent.length)
    switch (kind) {
      case 'taskList':
        return `${quote}${indent}- [ ] ${content}`
      case 'orderedList':
        orderedIndex += 1
        return `${quote}${indent}${orderedIndex}. ${content}`
      default:
        return `${quote}${indent}- ${content}`
    }
  })
  const text = next.join('\n')
  return {
    from: selection.lineFrom,
    to: selection.lineTo,
    text,
    selectFrom: text.length,
    selectTo: text.length
  }
}

/* 标题：同一级别再次点击取消标题 */
function setHeading(selection: EditorSelection, level: number): MarkdownCommand {
  const lines = selection.lineText.split('\n')
  const current = /^\s*(#{1,6})\s+/.exec(lines[0] ?? '')
  const sameLevel = Boolean(current) && current?.[1].length === level
  const next = lines.map((line) => {
    const content = stripHeading(line)
    return sameLevel ? content : `${'#'.repeat(level)} ${content}`
  })
  const text = next.join('\n')
  return {
    from: selection.lineFrom,
    to: selection.lineTo,
    text,
    selectFrom: text.length,
    selectTo: text.length
  }
}

/* 块级插入：光标落在内容区 */
function insertBlock(selection: EditorSelection, text: string, caret: number): MarkdownCommand {
  return {
    from: selection.to,
    to: selection.to,
    text,
    selectFrom: caret,
    selectTo: caret
  }
}

/* 代码块：选中多行时直接包裹，空选区插入模板 */
function insertCodeBlock(selection: EditorSelection): MarkdownCommand {
  const content = selection.text
  if (content) {
    const text = `\n\`\`\`\n${content}\n\`\`\`\n`
    const caret = 5 + content.length
    return { from: selection.from, to: selection.to, text, selectFrom: caret, selectTo: caret }
  }
  const text = '\n\n```\n\n```\n'
  return {
    from: selection.lineTo,
    to: selection.lineTo,
    text,
    selectFrom: 6,
    selectTo: 6
  }
}

/* 表格：生成表头 + 分隔行 + 空行 */
export function buildTable(selection: EditorSelection, rows: number, cols: number): MarkdownCommand {
  const rowCount = Math.max(1, Math.min(9, rows))
  const colCount = Math.max(1, Math.min(9, cols))
  const emptyRow = `|${'  |'.repeat(colCount)}`
  const separator = `|${' --- |'.repeat(colCount)}`
  const lines = [`|${'  |'.repeat(colCount)}`, separator]
  for (let index = 1; index < rowCount; index += 1) {
    lines.push(emptyRow)
  }
  /* 与上下文之间保留空行，避免表格粘连 */
  const text = `\n${lines.join('\n')}\n`
  const firstCell = text.indexOf('|', 1) + 1
  return {
    from: selection.to,
    to: selection.to,
    text,
    selectFrom: firstCell,
    selectTo: firstCell + 2
  }
}

/* 链接：无内容时生成 [link](url) 模板，并选中 url 占位符 */
function buildLink(selection: EditorSelection): MarkdownCommand {
  const label = selection.text || 'link'
  const value = `[${label}](url)`
  const urlStart = value.length - 4
  return {
    from: selection.from,
    to: selection.to,
    text: value,
    selectFrom: urlStart,
    selectTo: urlStart + 3
  }
}

/* Mermaid 模板：覆盖常用图表类型 */
const MERMAID_TEMPLATES: Record<MermaidKind, string> = {
  flow: 'flowchart LR\n  A[Start] --> B{Condition}\n  B -->|Yes| C[Process]\n  B -->|No| D[End]',
  sequence:
    'sequenceDiagram\n  participant U as User\n  participant S as Service\n  U->>S: Request\n  S-->>U: Response',
  class:
    'classDiagram\n  class Animal {\n    +String name\n    +eat()\n  }\n  class Dog {\n    +bark()\n  }\n  Animal <|-- Dog',
  state:
    'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> Idle: pause\n  Running --> [*]: stop',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : contains',
  journey:
    'journey\n  title User journey\n  section Visit\n    Open app: 5: User\n    Browse: 4: User\n  section Purchase\n    Checkout: 3: User',
  gantt:
    'gantt\n  title Release plan\n  dateFormat YYYY-MM-DD\n  section Design\n  Draft :a1, 2025-01-01, 7d\n  Review :a2, after a1, 5d',
  pie: 'pie title Traffic sources\n  "Direct" : 45\n  "Search" : 35\n  "Social" : 20',
  mindmap:
    'mindmap\n  root((Product))\n    Discovery\n      User research\n      Competitor analysis\n    Design\n      Wireframes\n      Prototype\n    Delivery\n      Build\n      Launch',
  timeline:
    'timeline\n  title Product timeline\n  2024 Q1 : Kickoff\n  2024 Q3 : Prototype\n  2025 Q1 : Beta\n  2025 Q3 : Launch'
}

/* 插入 Mermaid 图表：在光标处补代码围栏 */
export function buildDiagram(selection: EditorSelection, kind: MermaidKind): MarkdownCommand {
  const text = `\n\n\`\`\`mermaid\n${MERMAID_TEMPLATES[kind]}\n\`\`\`\n`
  return {
    from: selection.lineTo,
    to: selection.lineTo,
    text,
    selectFrom: text.length,
    selectTo: text.length
  }
}

/* 执行工具栏动作 */
export function runMarkdownAction(
  action: MarkdownAction,
  selection: EditorSelection
): MarkdownCommand | null {
  const marker = INLINE_MARKERS[action]
  if (marker) {
    return wrapInline(selection, marker)
  }
  if (/^h[1-6]$/.test(action)) {
    return setHeading(selection, Number(action.slice(1)))
  }
  switch (action) {
    case 'quote':
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return toggleLine(selection, action)
    case 'link':
      return buildLink(selection)
    case 'codeBlock':
      return insertCodeBlock(selection)
    case 'table':
      return buildTable(selection, 3, 3)
    case 'divider':
      return {
        from: selection.lineTo,
        to: selection.lineTo,
        text: '\n\n---\n\n',
        selectFrom: 7,
        selectTo: 7
      }
    case 'formula':
      if (selection.text) {
        const text = `$${selection.text}$`
        return {
          from: selection.from,
          to: selection.to,
          text,
          selectFrom: text.length,
          selectTo: text.length
        }
      }
      return insertBlock(selection, '$$', 1)
    case 'formulaBlock':
      return {
        from: selection.lineTo,
        to: selection.lineTo,
        text: '\n\n$$\n\n$$\n',
        selectFrom: 5,
        selectTo: 5
      }
    case 'diagram':
      return buildDiagram(selection, 'flow')
    default:
      return null
  }
}

/* 当前生效的格式：用于工具栏激活态 */
export function resolveActiveFormats(selection: EditorSelection): MarkdownAction[] {
  const result: MarkdownAction[] = []
  const firstLine = selection.lineText.split('\n')[0] ?? ''
  const heading = /^\s*(#{1,6})\s+/.exec(firstLine)
  if (heading) {
    result.push(`h${heading[1].length}` as MarkdownAction)
  }
  if (LINE_PREFIX.quote.test(firstLine)) {
    result.push('quote')
  }
  if (LINE_PREFIX.taskList.test(firstLine)) {
    result.push('taskList')
  } else if (LINE_PREFIX.bulletList.test(firstLine)) {
    result.push('bulletList')
  } else if (LINE_PREFIX.orderedList.test(firstLine)) {
    result.push('orderedList')
  }
  const text = selection.text
  if (text) {
    if (text.startsWith('**') && text.endsWith('**') && text.length > 4) {
      result.push('bold')
    }
    if (text.startsWith('~~') && text.endsWith('~~') && text.length > 4) {
      result.push('strike')
    }
    if (text.startsWith('`') && text.endsWith('`') && text.length > 2) {
      result.push('inlineCode')
    }
    if (
      text.startsWith('*') &&
      text.endsWith('*') &&
      !text.startsWith('**') &&
      !text.startsWith('~~') &&
      text.length > 2
    ) {
      result.push('italic')
    }
  }
  return result
}
