<!--
  AgentChat（Agent 公开对话页）
  免登录访问：左侧维护多个对话，右侧对话正文（SSE 流式）
-->
<template>
  <div class="agent-chat-page">
    <!-- 左侧：对话列表 -->
    <aside class="conv-panel">
      <div class="conv-header">
        <div class="agent-title">
          <el-icon class="agent-icon"><ChatDotRound /></el-icon>
          <span class="agent-name">{{ agent?.name || 'Agent' }}</span>
        </div>
        <div class="conv-actions">
          <el-button type="text" icon="Plus" @click="createConv">{{ t('business.agent.newChat') }}</el-button>
        </div>
      </div>
      <div class="conv-list" v-loading="convLoading">
        <div
          v-for="conv in convList"
          :key="conv.id"
          class="conv-item"
          :class="{ active: conv.id === currentConvId }"
          @click="selectConv(conv.id)"
        >
          <el-icon class="conv-icon"><Message /></el-icon>
          <span class="conv-title">{{ conv.title }}</span>
          <el-icon class="conv-del" @click.stop="deleteConv(conv)"><Delete /></el-icon>
        </div>
        <el-empty v-if="!convLoading && convList.length === 0" :description="t('business.agent.noConv')" :image-size="60" />
      </div>
    </aside>

    <!-- 右侧：对话正文 -->
    <main class="chat-panel">
      <div class="chat-header">
        <span class="chat-intro">{{ agent?.intro || '' }}</span>
      </div>
      <div class="chat-body" ref="chatBodyRef">
        <template v-if="currentConvId">
          <div v-for="(msg, index) in messages" :key="index" class="msg-row" :class="msg.role">
            <div class="msg-avatar">
              <el-icon v-if="msg.role === 'assistant'"><ChatDotRound /></el-icon>
              <el-icon v-else><User /></el-icon>
            </div>
            <div class="msg-bubble">
              <!-- 思考过程：可折叠展示（业界常见体验，如 DeepSeek "深度思考"） -->
              <div v-if="msg.reasoning" class="msg-reasoning">
                <div class="msg-reasoning-toggle" @click="toggleThinking(index)">
                  <el-icon class="reasoning-icon"><MagicStick /></el-icon>
                  <span class="reasoning-label">{{ msg.showThinking ? t('business.agent.hideThinking') : t('business.agent.thinking') }}</span>
                  <el-icon class="reasoning-arrow" :class="{ open: msg.showThinking }"><ArrowDown /></el-icon>
                </div>
                <div v-if="msg.showThinking" class="msg-reasoning-body">{{ msg.reasoning }}</div>
              </div>
              <!-- 回复内容 -->
              <span v-if="!msg.content" class="msg-streaming">{{ t('business.agent.thinkingStreaming') }}</span>
              <span class="msg-content">{{ msg.content }}</span>
            </div>            
          </div>
        </template>
        <el-empty v-else :description="t('business.agent.selectConv')" :image-size="80" />
      </div>
      <div class="chat-input">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="3"
          resize="none"
          :placeholder="t('business.agent.inputPlaceholder')"
          :disabled="!currentConvId || sending"
          @keydown.enter.exact.prevent="handleSend"
        />
        <div class="input-footer">
          <span class="input-tip">{{ t('business.agent.enterTip') }}</span>
          <el-button type="primary" :loading="sending" :disabled="!currentConvId || !inputText" @click="handleSend">
            {{ t('business.agent.send') }}
          </el-button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { t } from '@/i18n'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  agentAccessLoad,
  agentAccessConvCreate,
  agentAccessConvList,
  agentAccessMsgList,
  agentAccessConvDelete,
  agentSendStream
} from './api'
import type { AgentChatInfo, AgentConv, AgentMsg } from './types'
import { nextTick, onMounted, ref } from 'vue'

const route = useRoute()

const uuid = ref<string>(String(route.params.uuid || ''))
const visitorId = ref<string>('')
const agent = ref<AgentChatInfo>()

const convList = ref<AgentConv[]>([])
const convLoading = ref(false)
const currentConvId = ref<number | undefined>(undefined)
/** 对话消息（含前端流式字段 showThinking） */
interface ChatMsg extends AgentMsg {
  showThinking?: boolean
}
const messages = ref<ChatMsg[]>([])
const inputText = ref('')
const sending = ref(false)
const chatBodyRef = ref<HTMLElement>()

// --------------------------------- init ---------------------------------

/**
 * 生成访客标识（浏览器维度，localStorage 持久化）
 */
function ensureVisitorId() {
  let id = localStorage.getItem('xxl-ai-agent-visitor')
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem('xxl-ai-agent-visitor', id)
  }
  visitorId.value = id
}

/** 初始化：加载 Agent 元信息 + 对话列表 */
async function init() {
  try {
    const res = await agentAccessLoad(uuid.value)
    agent.value = res.data
    document.title = agent.value?.name || 'Agent'
  } catch (e) {
    agent.value = undefined
    return
  }
  ensureVisitorId()
  loadConvList()
}

/** 加载对话列表 */
async function loadConvList() {
  convLoading.value = true
  try {
    const res = await agentAccessConvList(uuid.value, visitorId.value)
    convList.value = res.data
    if (convList.value.length > 0) {
      selectConv(convList.value[0].id)
    }
  } finally {
    convLoading.value = false
  }
}

// --------------------------------- 对话操作 ---------------------------------

/** 新建对话 */
async function createConv() {
  if (sending.value) return
  const res = await agentAccessConvCreate(uuid.value, visitorId.value)
  await loadConvList()
  selectConv(res.data.id)
}

/** 选中对话：加载消息 */
async function selectConv(convId: number) {
  currentConvId.value = convId
  messages.value = []
  const res = await agentAccessMsgList(convId)
  messages.value = res.data.map((m) => ({ ...m, showThinking: false }))
  await scrollToBottom()
}

/** 删除对话 */
function deleteConv(conv: AgentConv) {
  ElMessageBox.confirm(t('business.agent.deleteConvConfirm', [conv.title]), t('modal.title'), {
    confirmButtonText: t('modal.confirmButton'),
    cancelButtonText: t('modal.cancelButton'),
    type: 'warning'
  })
    .then(async () => {
      await agentAccessConvDelete(conv.id)
      if (currentConvId.value === conv.id) {
        currentConvId.value = undefined
        messages.value = []
      }
      loadConvList()
    })
    .catch(() => {})
}

// --------------------------------- 消息发送（SSE） ---------------------------------

/** 发送消息 */
async function handleSend() {
  const content = inputText.value.trim()
  if (!content || !currentConvId.value || sending.value) return
  inputText.value = ''
  sending.value = true

  // 本地追加用户消息
  const userMsg: ChatMsg = { convId: currentConvId.value, role: 'user', content, showThinking: false }
  messages.value.push(userMsg)
  const assistantMsg: ChatMsg = { convId: currentConvId.value, role: 'assistant', content: '', reasoning: '', showThinking: true }
  messages.value.push(assistantMsg)
  await scrollToBottom()

  try {
    const reader = await agentSendStream(uuid.value, visitorId.value, currentConvId.value, content)
    if (!reader) {
      ElMessage.error(t('business.agent.sendFail'))
      sending.value = false
      return
    }
    await readStream(
      reader,
      (chunk) => {
        assistantMsg.reasoning += chunk
        scrollToBottom()
      },
      (chunk) => {
        assistantMsg.content += chunk
        scrollToBottom()
      }
    )
  } catch (e) {
    ElMessage.error(t('business.agent.sendFail'))
  } finally {
    sending.value = false
  }
}

/** 流式读取：按 SSE 事件名分流（thinking=思考过程，message=回复内容），逐事件解析 data */
async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onThinking: (text: string) => void,
  onContent: (text: string) => void
) {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let eventName = 'message'
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // 按 SSE 换行切分
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.substring(6).trim()
        continue
      }
      if (!line.startsWith('data:')) continue
      const data = line.substring(5).trim()
      if (!data) continue
      if (data === '[DONE]') return
      if (data.startsWith('__ERROR__')) {
        ElMessage.error(data.slice(9))
        return
      }
      if (eventName === 'thinking') {
        onThinking(data)
      } else {
        onContent(data)
      }
    }
  }
}

/** 展开/收起思考过程 */
function toggleThinking(index: number) {
  const msg = messages.value[index]
  if (msg) msg.showThinking = !msg.showThinking
}

// --------------------------------- 滚动 ---------------------------------

async function scrollToBottom() {
  await nextTick()
  if (chatBodyRef.value) {
    chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
  }
}

// --------------------------------- page init ---------------------------------
onMounted(() => init())
</script>

<style scoped>
.agent-chat-page {
  display: flex;
  height: 100vh;
  width: 100%;
  background: #f5f6fa;
}

.conv-panel {
  width: 260px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}

.conv-header {
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.agent-icon {
  color: var(--el-color-primary);
  font-size: 18px;
}

.agent-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.conv-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  color: #606266;

  &:hover {
    background: #f5f7fa;
  }

  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
}

.conv-icon {
  flex-shrink: 0;
}

.conv-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.conv-del {
  visibility: hidden;
  cursor: pointer;
}

.conv-item:hover .conv-del {
  visibility: visible;
}

.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header {
  height: 50px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  padding: 0 20px;
  color: #909399;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.msg-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;

  &.assistant {
    justify-content: flex-start;
  }

  &.user {
    justify-content: flex-end;
  }

  .msg-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--el-color-primary-light-8);
    color: var(--el-color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 16px;
  }

  &.user .msg-avatar {
    background: #e2e9f3;
    color: #5591e8;
  }

  .msg-bubble {
    max-width: 76%;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.7;
    word-break: break-word;
    white-space: pre-wrap;
  }

  &.assistant .msg-bubble {
    background: #fff;
    border: 1px solid #e4e7ed;
    color: #303133;
  }

  &.user .msg-bubble {
    background: var(--el-color-primary);
    color: #fff;
  }
}

/* 思考过程（可折叠，业界常见体验） */
.msg-reasoning {
  margin-bottom: 8px;
  border: 1px dashed #dfcfa6;
  background: #faf6ec;
  border-radius: 6px;
  overflow: hidden;

  .msg-reasoning-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    font-size: 12px;
    color: #a0884f;
    cursor: pointer;
    user-select: none;

    .reasoning-icon {
      font-size: 13px;
    }

    .reasoning-label {
      font-weight: 600;
    }

    .reasoning-arrow {
      font-size: 11px;
      transition: transform 0.2s;

      &.open {
        transform: rotate(180deg);
      }
    }
  }

  .msg-reasoning-body {
    margin: 0 10px 8px;
    padding-top: 6px;
    border-top: 1px dashed #eadfcb;
    font-size: 12.5px;
    color: #8a8370;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.msg-streaming {
  color: #b0b3b8;
  font-style: italic;
}

.chat-input {
  background: #fff;
  border-top: 1px solid #e4e7ed;
  padding: 12px 20px;
}

.input-footer {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .input-tip {
    font-size: 12px;
    color: #909399;
  }
}
</style>