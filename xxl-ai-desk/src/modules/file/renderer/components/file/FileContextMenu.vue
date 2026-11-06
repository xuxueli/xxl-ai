<script setup lang="ts">
/*
 * 文件 / 目录右键菜单：跟随鼠标位置展示，提供打开 / 在文件管理器中显示 / 复制路径 / 删除。
 * @author xuxueli 2026-10-31
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '@renderer/shell/i18n'

const props = defineProps<{
  /* 是否展示菜单 */
  visible: boolean
  /* 鼠标位置（视口坐标） */
  x: number
  y: number
  /* 右键目标是否为目录 */
  isDir: boolean
  /* 右键目标是否为项目根目录（根目录不可删除） */
  isRoot?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /* 用默认应用打开 */
  open: []
  /* 打开所在的文件夹 */
  reveal: []
  /* 复制文件路径 */
  copy: []
  /* 删除文件 */
  remove: []
}>()

/* 菜单元素与最终定位（保证不超出视口） */
const menuRef = ref<HTMLElement | null>(null)
const position = ref({ left: 0, top: 0 })

/* 定位：先贴近鼠标，再按菜单实际尺寸向内收拢 */
async function place(): Promise<void> {
  position.value = { left: props.x, top: props.y }
  await nextTick()
  const el = menuRef.value
  if (!el) {
    return
  }
  const left = Math.min(props.x, window.innerWidth - el.offsetWidth - 4)
  const top = Math.min(props.y, window.innerHeight - el.offsetHeight - 4)
  position.value = { left: Math.max(4, left), top: Math.max(4, top) }
}

watch(
  () => [props.visible, props.x, props.y] as const,
  ([visible]) => {
    if (visible) {
      void place()
    }
  },
  { immediate: true }
)

/* 点击菜单外部关闭 */
function onDocumentMouseDown(event: MouseEvent): void {
  if (!props.visible) {
    return
  }
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('update:visible', false)
  }
}

/* Esc 关闭菜单 */
function onDocumentKeydown(event: KeyboardEvent): void {
  if (props.visible && event.key === 'Escape') {
    emit('update:visible', false)
  }
}

/* 滚动 / 窗口尺寸变化 / 失焦时关闭，避免菜单与目标文件错位 */
function closeMenu(): void {
  if (props.visible) {
    emit('update:visible', false)
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown, true)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('scroll', closeMenu, true)
  window.addEventListener('resize', closeMenu)
  window.addEventListener('blur', closeMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('scroll', closeMenu, true)
  window.removeEventListener('resize', closeMenu)
  window.removeEventListener('blur', closeMenu)
})

/* 选择菜单项：先关闭再触发对应动作 */
function choose(action: 'open' | 'reveal' | 'copy' | 'remove'): void {
  emit('update:visible', false)
  if (action === 'open') {
    emit('open')
  } else if (action === 'reveal') {
    emit('reveal')
  } else if (action === 'copy') {
    emit('copy')
  } else {
    emit('remove')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="file-menu"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
      @contextmenu.prevent
    >
      <button class="file-menu-item" @click="choose('open')">
        <el-icon><FolderOpened v-if="isDir" /><Document v-else /></el-icon>
        <span>{{ isDir ? t('panel.openFolder') : t('panel.openDefault') }}</span>
      </button>
      <button v-if="!isDir" class="file-menu-item" @click="choose('reveal')">
        <el-icon><FolderOpened /></el-icon>
        <span>{{ t('panel.openFolder') }}</span>
      </button>
      <button class="file-menu-item" @click="choose('copy')">
        <el-icon><CopyDocument /></el-icon>
        <span>{{ t('panel.copyPath') }}</span>
      </button>
      <template v-if="!isRoot">
        <div class="file-menu-sep"></div>
        <button class="file-menu-item danger" @click="choose('remove')">
          <el-icon><Delete /></el-icon>
          <span>{{ t('common.delete') }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
/* 悬浮菜单：固定定位跟随鼠标，层级高于面板与弹层内容 */
.file-menu {
  position: fixed;
  z-index: 4000;
  min-width: 176px;
  padding: 4px;
  border: 1px solid var(--desk-border);
  border-radius: 10px;
  background: var(--desk-bg-elevated);
  box-shadow: var(--desk-shadow);
}

.file-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  text-align: left;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.file-menu-item:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.file-menu-item.danger {
  color: var(--desk-danger);
}

/* 危险项沿用统一悬浮底色，仅保留红色文字 */
.file-menu-item.danger:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-danger);
}

.file-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--desk-border);
}
</style>
