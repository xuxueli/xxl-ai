/*
 * Markdown 第三方插件类型补充：markdown-it-task-lists / markdown-it-footnote 未随包提供声明文件。
 * @author xuxueli 2026-10-31
 */

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'

  /* 插件选项：enabled 是否允许勾选（本应用只读，固定 false） */
  interface TaskListOptions {
    enabled?: boolean
    label?: boolean
    labelAfter?: boolean
  }

  export default function taskLists(md: MarkdownIt, options?: TaskListOptions): void
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it'

  export default function footnote(md: MarkdownIt): void
}
