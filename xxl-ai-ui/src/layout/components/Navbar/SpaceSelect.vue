<!--
  组件：SpaceSelect（业务空间切换器）
  功能：展示当前业务空间，支持切换当前空间；切换后刷新页面以全局应用新的空间上下文
-->
<template>
  <!-- 有可用空间：展示空间切换下拉 -->
  <el-dropdown
    v-if="spaceStore.spaces.length > 0"
    class="right-menu-item hover-effect space-select-wrapper"
    trigger="hover"
    @command="handleCommand"
  >
    <div class="space-wrapper">
      <el-icon class="space-icon"><Folder /></el-icon>
      <span class="space-name">{{ currentSpaceName }}</span>
      <el-icon class="caret-icon"><ArrowDown /></el-icon>
    </div>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="space in spaceStore.spaces"
          :key="space.id"
          :command="space.id"
          :disabled="space.id === spaceStore.currentSpaceId"
        >
          {{ space.name }}
          <el-icon v-if="space.id === spaceStore.currentSpaceId" class="selected-icon"><Check /></el-icon>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  <!-- 无分配空间：仍展示空间入口占位，提示需管理员分配空间 -->
  <div v-else class="right-menu-item hover-effect space-select-wrapper" :title="noSpaceTip">
    <div class="space-wrapper no-space">
      <el-icon class="space-icon"><Folder /></el-icon>
      <span class="space-name">{{ noSpaceTip }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSpaceStore } from '@/store'
import { t } from '@/i18n'

const spaceStore = useSpaceStore()

/** 当前空间名称 */
const currentSpaceName = computed(() => spaceStore.currentSpace?.name || t('business.space.selectPlaceholder'))

/** 未分配空间提示（无空间时占位展示） */
const noSpaceTip = computed(() => t('business.space.noSpaceTip'))

/**
 * 切换当前空间：持久化后刷新页面，使所有业务模块重新按新空间加载数据
 */
function handleCommand(command: string | number | object) {
  const id = Number(command)
  if (!id || id === spaceStore.currentSpaceId) {
    return
  }
  spaceStore.setCurrentSpace(id)
  location.reload()
}
</script>

<style scoped>
.space-select-wrapper {
  display: flex;
  align-items: center;
}

.space-wrapper {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 8px;
  cursor: pointer;

  .space-icon {
    font-size: 15px;
    margin-right: 5px;
    color: #5a5e66;
  }

  .space-name {
    font-size: 13px;
    color: #5a5e66;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .caret-icon {
    font-size: 12px;
    margin-left: 4px;
  }

  /* 未分配空间占位：弱化样式，提示需管理员授权 */
  &.no-space {
    cursor: not-allowed;

    .space-name {
      color: #a8abb2;
    }
  }
}

.selected-icon {
  margin-left: 6px;
  font-size: 14px;
}
</style>