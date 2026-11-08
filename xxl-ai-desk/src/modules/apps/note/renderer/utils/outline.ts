/*
 * Markdown 标题大纲解析：跳过代码围栏，输出层级、文本与行号。
 * @author xuxueli 2026-11-08
 */

/* 大纲项 */
export interface OutlineItem {
  /* 标题层级 1~6 */
  level: number
  /* 展示文本（去除常见行内标记） */
  text: string
  /* 所在行号（1 起） */
  line: number
}

/* 大纲树节点 */
export interface OutlineNode extends OutlineItem {
  /* 下级标题 */
  children: OutlineNode[]
}

/* 扁平大纲 → 层级树 */
export function buildOutlineTree(items: OutlineItem[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  for (const item of items) {
    const node: OutlineNode = { ...item, children: [] }
    /* 回溯到最近的上级标题：层级严格大于当前项 */
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
    stack.push(node)
  }
  return roots
}

/* 去除行内 Markdown 标记，便于大纲展示 */
function plainText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

/* 解析标题：仅识别 ATX 标题，忽略代码块内内容 */
export function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = []
  let inFence = false
  let marker = ''
  content.split(/\r?\n/).forEach((line, index) => {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      const current = fence[1][0]
      if (!inFence) {
        inFence = true
        marker = current
      } else if (current === marker) {
        inFence = false
      }
      return
    }
    if (inFence) {
      return
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      items.push({
        level: heading[1].length,
        text: plainText(heading[2]),
        line: index + 1
      })
    }
  })
  return items
}
