/*
 * 编辑器选区信息：供宿主工具栏读取光标 / 选区与所在行内容。
 * @author xuxueli 2026-11-14
 */

export interface EditorSelection {
  /* 选区起点（文档绝对偏移） */
  from: number
  /* 选区终点（文档绝对偏移） */
  to: number
  /* 选中的文本 */
  text: string
  /* 选区覆盖的起始行起点 */
  lineFrom: number
  /* 选区覆盖的结束行终点 */
  lineTo: number
  /* 选区覆盖的完整行文本 */
  lineText: string
}
