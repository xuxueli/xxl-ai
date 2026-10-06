<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MessageItem from '../../../components/MessageItem.vue'
import ChatComposer from '../../../components/ChatComposer.vue'
import EmptyState from '../../../components/EmptyState.vue'
import { useChatStore } from '../../../stores/chat'
import { useSettingsStore } from '../../../stores/settings'
import { api } from '../../../api'
import { t } from '../../../i18n'

/* 对话主区：模型切换 + 消息流 + 输入框 */
const router = useRouter()
const chat = useChatStore()
const settings = useSettingsStore()
const scrollRef = ref<HTMLElement | null>(null)

const hasMessages = computed(() => chat.messages.length > 0)
const canChat = computed(() => settings.enabledProviders.length > 0)
const title = computed(() => chat.currentSession?.title || t('chat.newChat'))

function scrollToBottom(): void {
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}

watch(
  () => chat.messages.map((message) => message.content.length).reduce((sum, len) => sum + len, 0),
  scrollToBottom
)

onMounted(scrollToBottom)

async function onSend(text: string): Promise<void> {
  if (!canChat.value) {
    ElMessage.warning(t('chat.noModel'))
    router.push('/settings')
    return
  }
  await chat.send(text)
}

async function onPick(text: string): Promise<void> {
  await onSend(text)
}

async function onProviderChange(value: string): Promise<void> {
  await settings.selectProvider(value)
  if (chat.currentId) {
    await api.session.update(chat.currentId, {
      providerId: value,
      modelId: settings.settings.modelId
    })
  }
}

async function onModelChange(value: string): Promise<void> {
  await settings.saveSettings({ modelId: value })
  if (chat.currentId) {
    await api.session.update(chat.currentId, { modelId: value })
  }
}
</script>

<template>
  <div class="chat-page">
    <header class="chat-header">
      <div class="chat-title">{{ title }}</div>
      <div class="chat-model">
        <el-select
          :model-value="settings.settings.providerId"
          size="small"
          class="provider-select"
          :placeholder="t('settings.selectProvider')"
          @update:model-value="onProviderChange"
        >
          <el-option
            v-for="provider in settings.enabledProviders"
            :key="provider.id"
            :label="provider.name"
            :value="provider.id"
          />
        </el-select>
        <el-select
          :model-value="settings.settings.modelId"
          size="small"
          class="model-select"
          :placeholder="t('settings.selectModel')"
          @update:model-value="onModelChange"
        >
          <el-option
            v-for="model in settings.currentModels"
            :key="model"
            :label="model"
            :value="model"
          />
        </el-select>
      </div>
    </header>

    <div v-if="!hasMessages" class="chat-body empty">
      <EmptyState @pick="onPick" />
    </div>
    <div v-else ref="scrollRef" class="chat-body">
      <div class="chat-inner">
        <MessageItem
          v-for="message in chat.messages"
          :key="message.id"
          :message="message"
        />
      </div>
    </div>

    <ChatComposer :streaming="chat.streaming" :disabled="!canChat" @submit="onSend" @stop="chat.abort" />
  </div>
</template>

<style scoped lang="scss">
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.chat-header {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  border-bottom: 1px solid var(--desk-border);
  gap: 16px;
  /* 顶栏可拖拽移动窗口（模型选择器除外） */
  -webkit-app-region: drag;
}

.chat-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-model {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.provider-select {
  width: 168px;
}

.model-select {
  width: 200px;
}

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.chat-body.empty {
  display: flex;
  padding: 0;
}

.chat-inner {
  max-width: 880px;
  margin: 0 auto;
}
</style>
