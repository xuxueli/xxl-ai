/* 快捷操作快捷键工具：绑定串 ↔ 键盘事件 / 展示文案 */

/* 是否 macOS（决定 mod 映射为 ⌘ / Ctrl） */
export const isMac = navigator.userAgent.includes('Mac')

/* 修饰键 token 集合 */
const MODIFIER_TOKENS = new Set(['mod', 'ctrl', 'alt', 'shift', 'meta'])

/* 方向键展示文案 */
const ARROW_LABELS: Record<string, string> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→'
}

/* 修饰键展示文案 */
function modifierLabel(token: string): string {
  if (token === 'mod') return isMac ? '⌘' : 'Ctrl'
  if (token === 'ctrl') return isMac ? '⌃' : 'Ctrl'
  if (token === 'alt') return isMac ? '⌥' : 'Alt'
  if (token === 'shift') return isMac ? '⇧' : 'Shift'
  if (token === 'meta') return isMac ? '⌘' : 'Win'
  return token
}

/* 主键展示文案 */
function keyLabel(key: string): string {
  if (key === 'space') return 'Space'
  if (ARROW_LABELS[key]) return ARROW_LABELS[key]
  if (key.length === 1) return key.toUpperCase()
  return key.charAt(0).toUpperCase() + key.slice(1)
}

/* 将绑定串格式化为展示文案（如 ⌘P / Ctrl+P） */
export function formatShortcut(binding?: string): string {
  if (!binding) {
    return ''
  }
  const labels = binding
    .split('+')
    .filter(Boolean)
    .map((token) => (MODIFIER_TOKENS.has(token) ? modifierLabel(token) : keyLabel(token)))
  return isMac ? labels.join('') : labels.join('+')
}

/* 键盘事件按平台折算出的修饰键 token 集合 */
function eventModifiers(event: KeyboardEvent): Set<string> {
  const mods = new Set<string>()
  if (isMac) {
    if (event.metaKey) mods.add('mod')
    if (event.ctrlKey) mods.add('ctrl')
  } else {
    if (event.ctrlKey) mods.add('mod')
    if (event.metaKey) mods.add('meta')
  }
  if (event.altKey) mods.add('alt')
  if (event.shiftKey) mods.add('shift')
  return mods
}

/* 键盘事件的主键 token（小写；空格归一为 space） */
function eventKey(event: KeyboardEvent): string {
  const key = event.key.toLowerCase()
  return key === ' ' ? 'space' : key
}

/* 是否为纯修饰键按下（录制时忽略，等待主键） */
export function isModifierKey(event: KeyboardEvent): boolean {
  return ['control', 'meta', 'alt', 'shift'].includes(event.key.toLowerCase())
}

/* 由键盘事件生成绑定串（修饰键按固定顺序排列，主键置尾） */
export function eventToBinding(event: KeyboardEvent): string {
  const order = ['mod', 'ctrl', 'alt', 'shift', 'meta']
  const actual = eventModifiers(event)
  return [...order.filter((token) => actual.has(token)), eventKey(event)].join('+')
}

/* 判断键盘事件是否命中绑定 */
export function matchShortcut(event: KeyboardEvent, binding?: string): boolean {
  if (!binding) {
    return false
  }
  const tokens = binding.split('+').filter(Boolean)
  const key = tokens.find((token) => !MODIFIER_TOKENS.has(token))
  if (!key || key !== eventKey(event)) {
    return false
  }
  const expected = new Set(tokens.filter((token) => MODIFIER_TOKENS.has(token)))
  const actual = eventModifiers(event)
  if (expected.size !== actual.size) {
    return false
  }
  for (const token of expected) {
    if (!actual.has(token)) {
      return false
    }
  }
  return true
}
