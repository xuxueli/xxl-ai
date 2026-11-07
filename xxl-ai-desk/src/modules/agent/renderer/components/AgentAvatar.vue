<script setup lang="ts">
/*
 * Agent 标识：按预设 id 渲染彩色圆角图标，列表 / 编辑 / 会话选择器 / 顶栏共用。
 * @author xuxueli 2026-11-07
 */
import { computed } from 'vue'
import { resolveAgentAvatar } from '@modules/agent/shared'
import { t } from '@renderer/shell/i18n'

const props = withDefaults(
  defineProps<{
    /* 预设标识 id */
    avatar?: string
    /* 边长（像素） */
    size?: number
    /* 是否展示预设名称 tooltip */
    showTitle?: boolean
  }>(),
  { avatar: '', size: 28, showTitle: true }
)

/* 预设派生图标与颜色（非法值自动回退默认） */
const preset = computed(() => resolveAgentAvatar(props.avatar))

/* 尺寸与底色：标识色属于预设数据，统一由 agentPresets 维护 */
const avatarStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${Math.max(6, Math.round(props.size * 0.3))}px`,
  background: preset.value.color
}))

const iconStyle = computed(() => ({ fontSize: `${Math.round(props.size * 0.56)}px` }))
</script>

<template>
  <span
    class="agent-avatar"
    :style="avatarStyle"
    :title="showTitle ? t(preset.labelKey) : undefined"
  >
    <el-icon :style="iconStyle"><component :is="preset.icon" /></el-icon>
  </span>
</template>

<style scoped lang="scss">
.agent-avatar {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  color: #fff;
  line-height: 1;
}
</style>
