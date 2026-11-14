/*
 * 笔记树拖拽状态：被拖节点与悬停目录，供树节点与空白区共用。
 * @author xuxueli 2026-11-14
 */

import { ref } from 'vue'
import type { NoteEntry } from '@modules/apps/note/shared'
import { isUnder, parentDir } from '@modules/apps/note/renderer/utils/path'

/* 拖拽中的节点（null 表示未拖拽） */
const dragging = ref<NoteEntry | null>(null)

/* 当前悬停的可接收目录路径（根目录用于空白区投放） */
const dropTargetPath = ref('')

export function useNoteTreeDrag() {
  /* 开始拖拽 */
  function startDrag(entry: NoteEntry): void {
    dragging.value = entry
    dropTargetPath.value = ''
  }

  /* 结束拖拽：清理临时状态 */
  function endDrag(): void {
    dragging.value = null
    dropTargetPath.value = ''
  }

  /* 目标目录是否可接收当前拖拽节点：排除原目录、自身与子目录 */
  function canDropInto(dir: string): boolean {
    const source = dragging.value
    if (!source || !dir) {
      return false
    }
    if (source.isDir && isUnder(dir, source.path)) {
      return false
    }
    return parentDir(source.path) !== dir
  }

  return { dragging, dropTargetPath, startDrag, endDrag, canDropInto }
}
