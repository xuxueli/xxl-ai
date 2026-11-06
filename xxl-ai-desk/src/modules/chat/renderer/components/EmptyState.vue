<script lang="ts">
/* 模块级标记：script setup 内的变量按组件实例重置，无法跨挂载保留，故放在模块作用域 */
let typingPlayed = false
</script>

<script setup lang="ts">
/* 空态欢迎页：Logo + 标题（本次运行首次进入时逐字展示，之后切换仅淡入） */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '@renderer/shell/i18n'
import { useSettingsStore } from '@modules/settings/renderer'
import logo from '@resources/icon.png'

const settings = useSettingsStore()

/* 完整标题文案：优先取用户自定义标语，未设置时回落默认欢迎语 */
const fullTitle = computed(() => settings.settings.slogan || t('chat.emptyTitle'))

/* 已展示的文案（按字符逐个追加，实现打字机效果） */
const displayTitle = ref('')

/* 是否正在逐字展示：打字中展示光标，展示完毕隐藏 */
const typing = ref(false)

/* 打字定时器（组件卸载或重新开始时清理，避免残留） */
let typingTimer: ReturnType<typeof setInterval> | null = null

/* 单字展示间隔（毫秒） */
const TYPE_INTERVAL = 80

/* 停止打字并清理定时器 */
function stopTyping(): void {
  if (typingTimer) {
    clearInterval(typingTimer)
    typingTimer = null
  }
  typing.value = false
}

/* 从空文案开始逐字展示标题（仅本次运行首次进入新建对话页时调用） */
function startTyping(): void {
  stopTyping()
  const text = fullTitle.value
  displayTitle.value = ''
  /* 空文案无需打字 */
  if (!text) {
    return
  }
  typing.value = true
  /* 按字（含标点、空格）逐步展示，防止 emoji 等代理对字符被截断 */
  const chars = Array.from(text)
  let index = 0
  typingTimer = setInterval(() => {
    index += 1
    displayTitle.value = chars.slice(0, index).join('')
    /* 全部展示完毕：停止计时并去除光标 */
    if (index >= chars.length) {
      stopTyping()
    }
  }, TYPE_INTERVAL)
}

/* 文案变化（设置中修改标语）：非打字态下直接整体更新 */
watch(fullTitle, (text) => {
  if (!typing.value) {
    displayTitle.value = text
  }
})

/* 进入新建对话页：本次运行首次逐字展示，之后直接完整展示（配合淡入过渡） */
onMounted(() => {
  if (typingPlayed) {
    displayTitle.value = fullTitle.value
    return
  }
  typingPlayed = true
  startTyping()
})

/* 离开页面：清理定时器，避免后台空转 */
onBeforeUnmount(stopTyping)
</script>

<template>
  <div class="empty-state">
    <img class="empty-logo" :src="logo" alt="logo" />
    <h1 class="empty-title">
      <span>{{ displayTitle }}</span>
      <span v-if="typing" class="empty-caret" aria-hidden="true"></span>
    </h1>
  </div>
</template>

<style scoped lang="scss">
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 24px;
}

.empty-logo {
  width: 51px;
  height: 51px;
  border-radius: 14px;
  object-fit: contain;
  margin-bottom: 24px;
  box-shadow: var(--desk-shadow);
}

.empty-title {
  font-size: var(--desk-font-xl);
  font-weight: 600;
  /* 预留一行高度，逐字展示时页面不抖动 */
  min-height: 32px;
  margin: 0 0 10px;
  /* 每次进入新建对话页的轻量淡入（非首次不再逐字） */
  animation: empty-title-fade-in 0.15s ease-out;
}

@keyframes empty-title-fade-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 打字光标：跟随文字末尾闪烁 */
.empty-caret {
  display: inline-block;
  width: 2px;
  height: 20px;
  margin-left: 2px;
  vertical-align: -3px;
  background: var(--desk-text);
  animation: empty-caret-blink 0.9s step-end infinite;
}

@keyframes empty-caret-blink {
  50% {
    opacity: 0;
  }
}
</style>
