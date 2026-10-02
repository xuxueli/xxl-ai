import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/* Markdown 渲染 + HTML 消毒 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
})

export function renderMarkdown(text: string): string {
  if (!text) {
    return ''
  }
  return DOMPurify.sanitize(md.render(text))
}
