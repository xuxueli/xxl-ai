<script setup lang="ts">
/*
 * 会话搜索命令面板：项目会话关键字搜索 + 快捷操作入口。
 * @author xuxueli 2026-10-25
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore } from '@modules/chat/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { useProjectStore } from '@modules/project/renderer'
import { useQuickAction } from '@renderer/shell/composables/useQuickAction'
import { t } from '@renderer/shell/i18n'
import { QUICK_ACTIONS } from '@common/renderer/config/quickActions'
import { formatShortcut } from '@common/renderer/utils/shortcut'
import { GlobeIcon, TerminalIcon } from '@common/renderer/components/icons'
import type { QuickAction } from '@common/shared'

const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ select: [sessionId: number] }>()

const chat = useChatStore()
const settings = useSettingsStore()
const project = useProjectStore()
/* 快捷操作执行器（命令面板「快捷操作」） */
const runQuickAction = useQuickAction()

/* 搜索关键字与输入框引用 */
const searchKeyword = ref('')
const paletteInputRef = ref()

/* 是否已输入关键字 */
const hasKeyword = computed(() => searchKeyword.value.trim().length > 0)

/* 关键字匹配：会话（按标题），最多展示 50 条 */
const matchedSessions = computed(() => {
  const key = searchKeyword.value.trim().toLowerCase()
  if (!key) {
    return []
  }
  return chat.sessions
    .filter((item) => (item.title || '').toLowerCase().includes(key))
    .slice(0, 50)
})

/* 未输入时固定展示最近在用的 5 条会话；输入后展示搜索结果 */
const visibleSessions = computed(() =>
  hasKeyword.value ? matchedSessions.value : chat.sessions.slice(0, 5)
)

/* 项目名（会话结果右侧展示归属） */
function projectNameOf(projectId: number): string {
  return project.projects.find((item) => item.id === projectId)?.name ?? ''
}

/* 打开面板时重置关键字并聚焦输入框 */
watch(visible, (open) => {
  if (open) {
    searchKeyword.value = ''
    nextTick(() => paletteInputRef.value?.focus())
  }
})

/* 关闭面板 */
function close(): void {
  visible.value = false
}

/* 选中会话：通知父组件定位并关闭 */
function onPickSession(sessionId: number): void {
  emit('select', sessionId)
  close()
}

/* 快捷操作：执行并关闭命令面板 */
function onQuickAction(action: QuickAction): void {
  runQuickAction(action)
  close()
}
</script>

<template>
  <teleport to="body">
    <div v-if="visible" class="palette-mask" @mousedown.self="close">
      <div class="palette" @mousedown.stop>
        <div class="palette-input">
          <el-icon class="palette-input-icon"><Search /></el-icon>
          <input
            ref="paletteInputRef"
            v-model="searchKeyword"
            class="palette-input-field"
            :placeholder="t('project.searchPlaceholder')"
            @keydown.esc="close"
          />
        </div>

        <div class="palette-body">
          <template v-if="visibleSessions.length > 0">
            <div class="palette-section">
              {{ hasKeyword ? t('chat.sessions') : t('chat.recentSessions') }}
            </div>
            <div
              v-for="item in visibleSessions"
              :key="item.id"
              class="palette-item"
              @click="onPickSession(item.id)"
            >
              <el-icon class="palette-item-icon"><ChatLineRound /></el-icon>
              <span class="palette-item-title">{{ item.title || t('chat.newChat') }}</span>
              <span class="palette-item-meta">{{ projectNameOf(item.projectId) }}</span>
            </div>
          </template>

          <div v-if="hasKeyword && matchedSessions.length === 0" class="palette-empty">
            {{ t('common.empty') }}
          </div>

          <div class="palette-section">{{ t('project.quickActions') }}</div>
          <div
            v-for="action in QUICK_ACTIONS"
            :key="action.id"
            class="palette-item"
            @click="onQuickAction(action.id)"
          >
            <TerminalIcon v-if="action.svg === 'terminal'" class="palette-item-svg" />
            <GlobeIcon v-else-if="action.svg === 'browser'" class="palette-item-svg" />
            <el-icon v-else class="palette-item-icon">
              <component :is="action.icon" />
            </el-icon>
            <span class="palette-item-title">{{ t(action.labelKey) }}</span>
            <span class="palette-item-meta">
              {{ formatShortcut(settings.settings.shortcuts?.[action.id]) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped lang="scss">
/* --- 搜索命令面板（居中弹框 + 遮罩） --- */
.palette-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--desk-overlay);
}

.palette {
  width: 640px;
  max-width: calc(100vw - 40px);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--desk-bg);
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  box-shadow: var(--desk-shadow);
  overflow: hidden;
}

.palette-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--desk-border);
  color: var(--desk-text-tertiary);
}

.palette-input-field {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--desk-text);
  font-size: var(--desk-font-base);
  font-family: inherit;
}

.palette-input-field::placeholder {
  color: var(--desk-text-tertiary);
}

.palette-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.palette-section {
  padding: 8px 10px 4px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-base);
  transition: background 0.12s ease;
}

.palette-item:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text-secondary);
}

.palette-item-icon {
  flex-shrink: 0;
  font-size: var(--desk-icon-sm);
}

/* 内联 SVG 图标（终端 / 浏览器）：尺寸 */
.palette-item-svg {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}

.palette-item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-item-meta {
  flex-shrink: 0;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.palette-empty {
  padding: 10px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
  text-align: center;
}
</style>
