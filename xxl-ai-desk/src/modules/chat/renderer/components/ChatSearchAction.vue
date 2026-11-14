<script setup lang="ts">
/*
* 顶栏对话搜索入口：唤起会话搜索命令面板
* @author xuxueli 2026-10-25
*/
import { useCommandPalette } from '@modules/chat/renderer/composables/useCommandPalette'
import NavbarIconButton from '@renderer/shell/layout/components/Navbar/NavbarIconButton.vue'
import { t } from '@common/renderer/i18n'

const { openPalette } = useCommandPalette()
</script>

<template>
  <NavbarIconButton :title="t('common.search')" @click="openPalette">
    <el-icon class="search-icon"><Search /></el-icon>
  </NavbarIconButton>
</template>

<style scoped lang="scss">
/* 搜索图标尺寸：与面板图标保持一致 */
.search-icon {
  font-size: var(--desk-icon-md);
}
</style>
