<script setup lang="ts">
/*
 * 笔记工具栏图标：统一 24 网格细线图标，保证尺寸、线宽与视觉重量一致。
 * @author xuxueli 2026-11-14
 */
import {
  NOTE_TOOLBAR_ICONS,
  type NoteToolbarIconName
} from '@modules/apps/note/renderer/components/toolbarIcons'

defineProps<{
  /* 图标名称 */
  name: NoteToolbarIconName
}>()

/*
 * 光学尺寸补偿：部分图标的实际内容边界不同，
 * 通过裁切 viewBox 让它们在 15px 盒子里看起来一样大。
 */
const ICON_VIEWBOX: Partial<Record<NoteToolbarIconName, string>> = {
  search: '1 1 22 22',
  outline: '1 1 22 22',
  help: '-1 -1 26 26',
  modeEdit: '1 1 22 22',
  modeSplit: '1 1 22 22',
  modePreview: '1 2 22 20'
}
</script>

<template>
  <svg
    class="note-toolbar-icon desk-svg-icon"
    :viewBox="ICON_VIEWBOX[name] ?? '0 0 24 24'"
    aria-hidden="true"
    v-html="NOTE_TOOLBAR_ICONS[name]"
  />
</template>

<style scoped lang="scss">
/* 统一图标尺寸：与项目名左侧图标一致（--desk-font-md = 15px） */
.note-toolbar-icon {
  width: var(--desk-font-md);
  height: var(--desk-font-md);
  flex-shrink: 0;
}
</style>
