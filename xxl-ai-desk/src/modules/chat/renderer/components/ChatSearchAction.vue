<script setup lang="ts">
/*
* 顶栏对话搜索入口：唤起会话搜索命令面板
* @author xuxueli 2026-10-25
*/
import { useCommandPalette } from '@modules/chat/renderer/composables/useCommandPalette'
import { t } from '@renderer/shell/i18n'

const { openPalette } = useCommandPalette()
</script>

<template>
  <!-- 悬浮提示即时展示：与左侧图标栏保持一致，关闭延迟与过渡 -->
  <el-tooltip
    :content="t('common.search')"
    placement="bottom"
    effect="light"
    popper-class="desk-tooltip"
    :show-after="0"
    :hide-after="0"
    :offset="8"
    transition=""
  >
    <button class="icon-button" :aria-label="t('common.search')" @click="openPalette">
      <el-icon class="search-icon"><Search /></el-icon>
    </button>
  </el-tooltip>
</template>

<style scoped lang="scss">
/* 搜索图标尺寸：与面板图标保持一致 */
.search-icon {
  font-size: var(--desk-icon-md);
}
</style>
