/*
 * 文件编辑器主题：编辑器背景、行号、选区与语法 token 配色。
 *   - auto：跟随应用浅色 / 深色外观（GitHub Light / Dark 语义变量）；
 *   - 其它为固定配色，选择后不再随外观切换。
 *
 * @author xuxueli 2026-11-07
 */

/* 编辑器主题本地存储键：文件工具与笔记共用 */
export const EDITOR_THEME_STORAGE_KEY = 'desk-editor-theme'

/* 主题标识（设置项与下拉菜单共用） */
export const EDITOR_THEME_IDS = [
  'auto',
  'github-light',
  'one-light',
  'solarized-light',
  'github-dark-dimmed',
  'one-dark',
  'solarized-dark',
  'nord',
  'dracula'
] as const

export type EditorThemeId = (typeof EDITOR_THEME_IDS)[number]

/* 主题下拉项 */
export interface EditorThemeOption {
  id: EditorThemeId
  labelKey: string
}

export const EDITOR_THEMES: EditorThemeOption[] = [
  { id: 'auto', labelKey: 'editorTheme.auto' },
  { id: 'github-light', labelKey: 'editorTheme.githubLight' },
  { id: 'one-light', labelKey: 'editorTheme.oneLight' },
  { id: 'solarized-light', labelKey: 'editorTheme.solarizedLight' },
  { id: 'github-dark-dimmed', labelKey: 'editorTheme.githubDarkDimmed' },
  { id: 'one-dark', labelKey: 'editorTheme.oneDark' },
  { id: 'solarized-dark', labelKey: 'editorTheme.solarizedDark' },
  { id: 'nord', labelKey: 'editorTheme.nord' },
  { id: 'dracula', labelKey: 'editorTheme.dracula' }
]

/* 语法与表面配色 */
export interface EditorThemePalette {
  background: string
  text: string
  gutterBg: string
  gutterText: string
  border: string
  activeLine: string
  activeGutter: string
  selection: string
  searchMatch: string
  searchMatchActive: string
  keyword: string
  comment: string
  string: string
  number: string
  type: string
  function: string
  tag: string
  attribute: string
  property: string
  variable: string
  meta: string
  link: string
  invalid: string
}

/* auto：沿用应用 token，跟随浅色 / 深色 */
const AUTO_PALETTE: EditorThemePalette = {
  background: 'var(--desk-surface-content)',
  text: 'var(--desk-code-text)',
  gutterBg: 'var(--desk-surface-panel)',
  gutterText: 'var(--desk-text-tertiary)',
  border: 'var(--desk-border-soft)',
  activeLine: 'color-mix(in srgb, var(--desk-primary) 6%, transparent)',
  activeGutter: 'color-mix(in srgb, var(--desk-primary) 8%, transparent)',
  selection: 'var(--desk-selection)',
  searchMatch: 'color-mix(in srgb, var(--desk-warning) 26%, transparent)',
  searchMatchActive: 'color-mix(in srgb, var(--desk-warning) 62%, transparent)',
  keyword: 'var(--code-red)',
  comment: 'var(--code-comment)',
  string: 'var(--code-string)',
  number: 'var(--code-blue)',
  type: 'var(--code-orange)',
  function: 'var(--code-purple)',
  tag: 'var(--code-green)',
  attribute: 'var(--code-orange)',
  property: 'var(--code-blue)',
  variable: 'var(--desk-code-text)',
  meta: 'var(--code-comment)',
  link: 'var(--code-blue)',
  invalid: 'var(--code-red)'
}

/* 固定主题：只用于编辑器，不影响应用外壳 */
const PALETTES: Record<Exclude<EditorThemeId, 'auto'>, EditorThemePalette> = {
  'github-light': {
    background: '#ffffff',
    text: '#1f2328',
    gutterBg: '#f6f8fa',
    gutterText: '#6e7781',
    border: '#d0d7de',
    activeLine: '#f3f5f8',
    activeGutter: '#eaeef2',
    selection: '#b6d7ff',
    searchMatch: 'rgba(255, 213, 0, 0.35)',
    searchMatchActive: 'rgba(255, 176, 0, 0.65)',
    keyword: '#cf222e',
    comment: '#6e7781',
    string: '#0a3069',
    number: '#0550ae',
    type: '#953800',
    function: '#8250df',
    tag: '#116329',
    attribute: '#0550ae',
    property: '#0550ae',
    variable: '#1f2328',
    meta: '#6e7781',
    link: '#0969da',
    invalid: '#cf222e'
  },
  'one-dark': {
    background: '#282c34',
    text: '#abb2bf',
    gutterBg: '#21252b',
    gutterText: '#5c6370',
    border: '#3a3f4b',
    activeLine: '#2c313a',
    activeGutter: '#323842',
    selection: '#3e4451',
    searchMatch: 'rgba(229, 192, 123, 0.35)',
    searchMatchActive: 'rgba(229, 192, 123, 0.7)',
    keyword: '#c678dd',
    comment: '#5c6370',
    string: '#98c379',
    number: '#d19a66',
    type: '#e5c07b',
    function: '#61afef',
    tag: '#e06c75',
    attribute: '#d19a66',
    property: '#61afef',
    variable: '#abb2bf',
    meta: '#56b6c2',
    link: '#61afef',
    invalid: '#e06c75'
  },
  nord: {
    background: '#2e3440',
    text: '#d8dee9',
    gutterBg: '#2b303b',
    gutterText: '#616e88',
    border: '#3b4252',
    activeLine: '#3b4252',
    activeGutter: '#434c5e',
    selection: '#434c5e',
    searchMatch: 'rgba(235, 203, 139, 0.35)',
    searchMatchActive: 'rgba(235, 203, 139, 0.7)',
    keyword: '#81a1c1',
    comment: '#616e88',
    string: '#a3be8c',
    number: '#b48ead',
    type: '#8fbcbb',
    function: '#88c0d0',
    tag: '#81a1c1',
    attribute: '#8fbcbb',
    property: '#88c0d0',
    variable: '#d8dee9',
    meta: '#5e81ac',
    link: '#88c0d0',
    invalid: '#bf616a'
  },
  dracula: {
    background: '#282a36',
    text: '#f8f8f2',
    gutterBg: '#21222c',
    gutterText: '#6272a4',
    border: '#44475a',
    activeLine: '#44475a',
    activeGutter: '#4d5066',
    selection: '#44475a',
    searchMatch: 'rgba(241, 250, 140, 0.3)',
    searchMatchActive: 'rgba(241, 250, 140, 0.65)',
    keyword: '#ff79c6',
    comment: '#6272a4',
    string: '#f1fa8c',
    number: '#bd93f9',
    type: '#8be9fd',
    function: '#50fa7b',
    tag: '#ff79c6',
    attribute: '#50fa7b',
    property: '#8be9fd',
    variable: '#f8f8f2',
    meta: '#ffb86c',
    link: '#8be9fd',
    invalid: '#ff5555'
  },
  'solarized-light': {
    background: '#fdf6e3',
    text: '#586e75',
    gutterBg: '#eee8d5',
    gutterText: '#93a1a1',
    border: '#eee8d5',
    activeLine: '#eee8d5',
    activeGutter: '#e6dfc9',
    selection: '#d5e1e6',
    searchMatch: 'rgba(181, 137, 0, 0.3)',
    searchMatchActive: 'rgba(181, 137, 0, 0.6)',
    keyword: '#859900',
    comment: '#93a1a1',
    string: '#2aa198',
    number: '#d33682',
    type: '#b58900',
    function: '#268bd2',
    tag: '#268bd2',
    attribute: '#b58900',
    property: '#268bd2',
    variable: '#586e75',
    meta: '#cb4b16',
    link: '#268bd2',
    invalid: '#dc322f'
  },
  'one-light': {
    background: '#fafafa',
    text: '#383a42',
    gutterBg: '#f0f0f0',
    gutterText: '#9d9d9f',
    border: '#e5e5e6',
    activeLine: '#f0f0f0',
    activeGutter: '#e8e8e8',
    selection: '#d0d8f0',
    searchMatch: 'rgba(230, 180, 0, 0.3)',
    searchMatchActive: 'rgba(230, 180, 0, 0.6)',
    keyword: '#a626a4',
    comment: '#a0a1a7',
    string: '#50a14f',
    number: '#986801',
    type: '#c18401',
    function: '#4078f2',
    tag: '#e45649',
    attribute: '#986801',
    property: '#4078f2',
    variable: '#383a42',
    meta: '#986801',
    link: '#4078f2',
    invalid: '#e45649'
  },
  'solarized-dark': {
    background: '#002b36',
    text: '#839496',
    gutterBg: '#073642',
    gutterText: '#586e75',
    border: '#073642',
    activeLine: '#073642',
    activeGutter: '#0b3d4a',
    selection: '#0e4b5a',
    searchMatch: 'rgba(181, 137, 0, 0.3)',
    searchMatchActive: 'rgba(181, 137, 0, 0.6)',
    keyword: '#859900',
    comment: '#586e75',
    string: '#2aa198',
    number: '#d33682',
    type: '#b58900',
    function: '#268bd2',
    tag: '#268bd2',
    attribute: '#b58900',
    property: '#268bd2',
    variable: '#839496',
    meta: '#cb4b16',
    link: '#268bd2',
    invalid: '#dc322f'
  },
  'github-dark-dimmed': {
    background: '#22272e',
    text: '#adbac7',
    gutterBg: '#1c2128',
    gutterText: '#768390',
    border: '#444c56',
    activeLine: '#2d333b',
    activeGutter: '#373e47',
    selection: '#3b5070',
    searchMatch: 'rgba(210, 153, 34, 0.3)',
    searchMatchActive: 'rgba(210, 153, 34, 0.65)',
    keyword: '#f47067',
    comment: '#768390',
    string: '#96d0ff',
    number: '#6cb6ff',
    type: '#f69d50',
    function: '#dcbdfb',
    tag: '#8ddb8c',
    attribute: '#6cb6ff',
    property: '#6cb6ff',
    variable: '#adbac7',
    meta: '#768390',
    link: '#539bf5',
    invalid: '#f47067'
  },
}

/* 取主题配色：非法标识回落 auto */
export function editorPalette(id: string | undefined): EditorThemePalette {
  if (!id || id === 'auto') {
    return AUTO_PALETTE
  }
  return PALETTES[id as Exclude<EditorThemeId, 'auto'>] ?? AUTO_PALETTE
}

/* 是否为合法主题标识（持久化读取时校验） */
export function isEditorThemeId(value: unknown): value is EditorThemeId {
  return typeof value === 'string' && (EDITOR_THEME_IDS as readonly string[]).includes(value)
}
