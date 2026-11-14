/*
 * 笔记树过滤：按名称关键字递归匹配已加载节点。
 * @author xuxueli 2026-11-14
 */

import type { NoteEntry } from '@modules/apps/note/shared'

/* 关键字命中：自身命中，或任一已加载子项命中 */
export function matchesNoteEntry(
  entry: NoteEntry,
  keyword: string,
  childrenMap: Record<string, NoteEntry[]>
): boolean {
  const word = keyword.trim().toLowerCase()
  if (!word) {
    return true
  }
  const name = entry.isDir ? entry.name : entry.name.replace(/\.md$/i, '')
  if (name.toLowerCase().includes(word)) {
    return true
  }
  const children = childrenMap[entry.path]
  return Boolean(children && children.some((child) => matchesNoteEntry(child, word, childrenMap)))
}
