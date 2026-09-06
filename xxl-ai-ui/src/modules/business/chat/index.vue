<!--
  AgentChat（Agent 公开对话页）
  免登录访问：左侧维护多个对话，右侧对话正文（SSE 流式）
-->
<template>
  <div class="agent-chat-page">
    <!-- 左侧：对话列表 -->
    <aside class="conv-panel">
      <div class="conv-header">
        <div class="agent-title" @click="handleRefresh" :title="t('business.agent.refresh')">
          <img v-if="logo" :src="logo" class="agent-logo" alt="logo" />
          <span class="agent-name">{{ agent?.name || 'Agent' }}</span>
        </div>
        <div class="conv-actions">
          <el-button type="text" icon="Plus" @click="handleNewChat">{{ t('business.agent.newChat') }}</el-button>
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
          <template v-if="editingConvId === conv.id">
            <el-input
              v-model="editingTitle"
              class="conv-title-input"
              size="small"
              maxlength="50"
              @click.stop
              @keyup.enter="saveConvTitle(conv)"
              @keyup.esc="cancelConvTitle"
              @blur="saveConvTitle(conv)"
            />
          </template>
          <template v-else>
            <span class="conv-title" :title="conv.title">{{ conv.title }}</span>
            <el-icon class="conv-edit" @click.stop="startEditConvTitle(conv)"><EditPen /></el-icon>
          </template>
          <el-icon class="conv-del" @click.stop="deleteConv(conv)"><Delete /></el-icon>
        </div>
        <el-empty v-if="!convLoading && convList.length === 0" :description="t('business.agent.noConv')" :image-size="60" />
      </div>
    </aside>

    <!-- 右侧：对话正文 -->
    <main class="chat-panel">
      <div class="chat-header">
        <span class="chat-intro">{{ agent?.intro || '' }}</span>
        <el-dropdown trigger="click" @command="handleVisitorCommand">
          <span class="visitor-trigger">
            <el-icon class="visitor-icon"><User /></el-icon>
            <span class="visitor-label">{{ t('business.agent.visitor') }}</span>
            <el-icon class="visitor-arrow"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="'copyVisitor'" :disabled="!visitorId">
                {{ t('business.agent.visitorInfo') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div class="chat-main">
        <div class="chat-body" ref="chatBodyRef" @scroll="handleScroll">
          <template v-if="currentConvId">
            <div v-for="(msg, index) in messages" :key="index" class="msg-row" :class="msg.role">
              <div class="msg-avatar">
                <el-icon v-if="msg.role === 'assistant'"><ChatDotRound /></el-icon>
                <el-icon v-else><User /></el-icon>
              </div>
              <div class="msg-body">
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
                  <!-- 访客输入：纯文本；模型返回：Markdown 渲染（净化防XSS） -->
                  <span v-if="msg.role === 'assistant'" class="msg-content" v-html="renderMarkdown(msg.content)"></span>
                  <span v-else class="msg-content">{{ msg.content }}</span>
                </div>
                <!-- 发送时间：鼠标悬浮展示 -->
                <div class="msg-time">{{ timeText(msg) }}</div>
              </div>
            </div>
          </template>
          <!-- 新建对话：中间区域展示输入框，输入+发送后才生成对话 -->
          <div v-else-if="newChat" class="chat-new">
            <div class="chat-new-inner">
              <div class="chat-new-title">{{ agent?.name || 'Agent' }}</div>
              <div v-if="agent?.intro" class="chat-new-sub">{{ agent.intro }}</div>
              <el-input
                ref="newChatInputRef"
                v-model="inputText"
                type="textarea"
                :rows="6"
                resize="none"
                :placeholder="t('business.agent.inputPlaceholder')"
                @keydown.enter.exact.prevent="handleSend"
              />
              <div class="chat-new-footer">
                <span class="input-tip">{{ t('business.agent.enterTip') }}</span>
                <el-button type="primary" :loading="sending" @click="handleSend">
                  {{ t('business.agent.send') }}
                </el-button>
              </div>
            </div>
          </div>
          <el-empty v-else :description="t('business.agent.selectConv')" :image-size="80" />
        </div>
        <!-- 回到底部按钮：用户上翻阅读时显示，点击平滑吸底并恢复自动跟随 -->
        <button
          v-if="currentConvId && !nearBottom"
          class="scroll-to-bottom"
          :title="t('business.agent.scrollToBottom')"
          @click="goBottom"
        >
          <el-icon><ArrowDown /></el-icon>
        </button>
      </div>
      <div class="chat-input" v-if="currentConvId">
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
          <el-button type="primary" :loading="sending" @click="handleSend">
            {{ t('business.agent.send') }}
          </el-button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { t } from '@/i18n'
import logo from '@/assets/images/logo.png'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  agentAccessLoad,
  agentAccessConvCreate,
  agentAccessConvList,
  agentAccessMsgList,
  agentAccessConvDelete,
  agentAccessConvRename,
  agentSendStream
} from './api'
import type { AgentChatInfo, AgentConv, AgentMsg } from './types'
import { parseTime } from '@/utils/common'
import { Renderer, marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { nextTick, onMounted, ref } from 'vue'

const route = useRoute()
const router = useRouter()

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
/** 是否贴近对话底部（控制「回到底部」按钮显隐与流式自动跟随） */
const nearBottom = ref(true)
/** 新建对话状态：未建会话，中间区域展示输入框 */
const newChat = ref(false)
const newChatInputRef = ref<any>()
/** 对话标题编辑状态 */
const editingConvId = ref<number | undefined>(undefined)
const editingTitle = ref('')

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

/** 初始化：加载 Agent 元信息 + 对话列表；带对话参数则定位单个对话，否则默认展示新建对话内容 */
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
  await loadConvList()
  // 定位指定对话：优先路径参数 /chat/:uuid/:conv，其次查询参数 /chat/:uuid?convId=；合法则自动切换，否则默认进入新建对话内容
  const convParam = Array.isArray(route.params.conv) ? route.params.conv[0] : (route.params.conv as string | undefined)
  const queryParam = Array.isArray(route.query.convId) ? route.query.convId[0] : (route.query.convId as string | undefined)
  const targetConvId = Number(convParam ?? queryParam)
  if (Number.isInteger(targetConvId) && targetConvId > 0 && convList.value.some((c) => c.id === targetConvId)) {
    selectConv(targetConvId)
  } else {
    newChat.value = true
  }
}

/** 加载对话列表 */
async function loadConvList() {
  convLoading.value = true
  try {
    const res = await agentAccessConvList(uuid.value, visitorId.value)
    convList.value = res.data
  } finally {
    convLoading.value = false
  }
}

// --------------------------------- 对话操作 ---------------------------------

/** 新建对话：不立即建会话，进入新建状态并聚焦输入框，输入+发送后才生成对话 */
function handleNewChat() {
  if (sending.value) return
  // 已在新建对话状态：提示并聚焦，不重复进入
  if (newChat.value && !currentConvId.value) {
    ElMessage.warning(t('business.agent.newChatAlready'))
    newChatInputRef.value?.focus()
    return
  }
  currentConvId.value = undefined
  messages.value = []
  newChat.value = true
  syncUrlConvId()
  nextTick(() => newChatInputRef.value?.focus())
}

/** 右上角 Agent 名称区域点击：整体刷新页面 */
function handleRefresh() {
  window.location.reload()
}

/** 同步 URL 中的 convId 查询参数（点击对话/新建对话/发送时体现当前会话） */
function syncUrlConvId(convId?: number) {
  router.replace({ path: `/chat/${uuid.value}`, query: convId ? { convId: String(convId) } : {} })
}

/** 选中对话：加载消息 */
async function selectConv(convId: number) {
  currentConvId.value = convId
  newChat.value = false
  syncUrlConvId(convId)
  messages.value = []
  const res = await agentAccessMsgList(convId)
  messages.value = res.data.map((m) => ({ ...m, showThinking: false }))
  await scrollToBottom()
}

// --------------------------------- 对话标题修改 ---------------------------------

/** 进入标题编辑态 */
function startEditConvTitle(conv: AgentConv) {
  editingConvId.value = conv.id
  editingTitle.value = conv.title || ''
}

/** 保存标题（Enter / 失焦触发，最长50个字符） */
function saveConvTitle(conv: AgentConv) {
  if (editingConvId.value !== conv.id) return
  const title = editingTitle.value.trim()
  editingConvId.value = undefined
  editingTitle.value = ''
  if (!title || title === conv.title) return
  agentAccessConvRename(conv.id, title)
    .then(() => {
      conv.title = title
    })
    .catch(() => {})
}

/** 取消标题编辑 */
function cancelConvTitle() {
  editingConvId.value = undefined
  editingTitle.value = ''
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

/** 发送消息（新建状态下首次发送才创建对话；空内容/纯空格提示） */
async function handleSend() {
  const content = inputText.value.trim()
  if (!content) {
    ElMessage.warning(t('business.agent.questionRequired'))
    return
  }
  if (sending.value) return
  inputText.value = ''
  sending.value = true

  // 新建状态：首次发送才创建对话（左侧新增对话，右侧展示正文）
  if (!currentConvId.value) {
    try {
      const res = await agentAccessConvCreate(uuid.value, visitorId.value)
      const convId = res.data.id
      currentConvId.value = convId
      newChat.value = false
      syncUrlConvId(convId)
      // 新对话置顶（列表按 id 倒序）
      convList.value.unshift(res.data)
    } catch (e) {
      ElMessage.error(t('business.agent.sendFail'))
      sending.value = false
      return
    }
  }

  // 本地追加用户消息
  const now = new Date().toISOString()
  const userMsg: ChatMsg = { convId: currentConvId.value, role: 'user', content, showThinking: false, addTime: now }
  messages.value.push(userMsg)
  const assistantMsg: ChatMsg = { convId: currentConvId.value, role: 'assistant', content: '', reasoning: '', showThinking: true, addTime: now }
  const assistantIdx = messages.value.push(assistantMsg) - 1
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
        // 经响应式代理累加思考过程，触发视图逐段更新
        const msg = messages.value[assistantIdx]
        if (msg) msg.reasoning += chunk
        scrollToBottom()
      },
      (chunk) => {
        // 经响应式代理累加回复内容，触发视图逐段更新并按 Markdown 渲染
        const msg = messages.value[assistantIdx]
        if (msg) msg.content += chunk
        scrollToBottom()
      }
    )
    // 流结束后再次滚到底：Markdown 块（代码/表格等）渲染完成后高度变化
    await scrollToBottom()
    requestAnimationFrame(() => scrollToBottom())
  } catch (e) {
    ElMessage.error(t('business.agent.sendFail'))
  } finally {
    sending.value = false
    // 首条消息后后端自动生成了对话标题（首次提问内容，超50字截断补"..."），本地同步刷新左侧标题
    if (currentConvId.value) {
      const conv = convList.value.find((c) => c.id === currentConvId.value)
      if (conv) {
        const title = content.trim()
        conv.title = title.length > 50 ? title.slice(0, 47) + '...' : title
      }
    }
  }
}

/**
 * 流式读取：按 SSE 事件解析（thinking=思考过程，message=回复内容），逐事件回调
 *
 * Spring SseEmitter 会将含换行的内容按行拆成多条 data: 行，同一事件内的 data: 内容必须以换行连接还原，
 * 否则多行/段落（如 ## 标题 + 正文）会被拼成单行，导致 markdown 实时渲染格式错乱（而刷新后从库中读取完整内容正常）。
 */
async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onThinking: (text: string) => void,
  onContent: (text: string) => void
) {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let eventName = 'message'
  // 待拼装的事件数据（同一事件内的多条 data: 行）
  let dataLines: string[] = []

  /** 派发单个事件：命中结束/错误标志返回 true，终止读取 */
  const dispatch = (data: string): boolean => {
    if (!data) return false
    if (data === '[DONE]') return true
    if (data.startsWith('__ERROR__')) {
      ElMessage.error(data.slice(9))
      return true
    }
    if (eventName === 'thinking') {
      onThinking(data)
    } else {
      onContent(data)
    }
    return false
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // 按 SSE 行切分（兼容 \r\n / \r / \n），末尾不完整行留在 buffer 下次拼接
    const lines = buffer.split(/\r\n|\r|\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      // 空行为事件结束标志：拼装完整内容后统一派发
      if (line === '') {
        if (dataLines.length > 0) {
          const data = dataLines.join('\n')
          dataLines = []
          if (dispatch(data)) return
        }
        continue
      }
      if (line.startsWith('event:')) {
        eventName = line.substring(6).trim()
        continue
      }
      if (line.startsWith('data:')) {
        // 保留原始内容：不做 trim，避免丢失 Markdown 空行/缩进（多行内容由 join('\n') 还原）
        dataLines.push(line.substring(5))
        continue
      }
      // 忽略其它字段（id / retry / 注释行等）
    }
  }
  // 流结束兜底：派发未以空行收尾的残留数据（如最后一个事件未换行结尾）
  if (dataLines.length > 0) {
    dispatch(dataLines.join('\n'))
  }
}

/** 展开/收起思考过程 */
function toggleThinking(index: number) {
  const msg = messages.value[index]
  if (msg) msg.showThinking = !msg.showThinking
}

// --------------------------------- 访客信息 ---------------------------------

/** 访客下拉：复制访客信息并提示 */
async function handleVisitorCommand() {
  if (!visitorId.value) return
  const tip = t('business.agent.visitorIdTip', [visitorId.value])
  await copyText(tip)
  ElMessage.success(t('business.agent.copySuccess'))
}

/** 复制文本：优先 navigator.clipboard，降级 textarea 方案 */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (e) {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

// --------------------------------- 会话消息 ---------------------------------

/** 转义 HTML 特殊字符（代码块内容/语言标签注入 HTML 前，防止被解释为标签） */
function escapeHtml(text: string): string {
  return (text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Markdown 渲染（净化防 XSS）
 *   - 代码块：浅色主题 + 「语言标签 / 复制按钮」头部，贴合业界常见观感；
 *   - 代码块内容经 HTML 转义后注入，避免非法标签内容被 DOMPurify 误删。
 */
function renderMarkdown(text: string): string {
  const renderer = new Renderer()
  renderer.code = ({ text: body, lang }: Tokens.Code) => {
    const language = escapeHtml(lang || '')
    const label = language || 'code'
    const codeHtml = escapeHtml(body)
    return `<div class="code-block"><div class="code-header"><span class="code-lang">${label}</span><span class="code-copy">${t('business.agent.copyCode')}</span></div><pre><code class="language-${language}">${codeHtml}</code></pre></div>`
  }
  const html = marked.parse(text ?? '', { renderer, gfm: true }) as string
  return DOMPurify.sanitize(html)
}

/** 复制代码块：v-html 注入的复制按钮无法绑定 Vue 事件，用事件委托处理 */
async function handleCopyCode(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest?.('.code-copy')
  if (!target) return
  const codeEl = (target as HTMLElement).closest('.code-block')?.querySelector('code')
  if (!codeEl) return
  await copyText(codeEl.textContent ?? '')
  ElMessage.success(t('business.agent.copySuccess'))
}

/** 消息发送时间（无值时返回空，悬浮时展示） */
function timeText(msg: ChatMsg) {
  return msg.addTime ? (parseTime(msg.addTime) || '') : ''
}

// --------------------------------- 滚动 ---------------------------------

/**
 * 对话区域滚动：计算是否贴近底部
 *   - 非底部（用户上翻阅读中）时显示「回到底部」按钮，流式期间不再强制吸底；
 *   - 贴近底部时保持自动跟随最新内容。
 */
function handleScroll() {
  const el = chatBodyRef.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  nearBottom.value = distance < 80
}

/** 回到对话底部（用户点击按钮，快速平滑吸底并恢复自动跟随） */
function goBottom() {
  scrollToBottom(true)
}

/**
 * 自定义快速平滑滚动到底部（约 260ms）
 *   - 浏览器默认 smooth 在长距离下偏慢，改用 requestAnimationFrame 控制时长与缓动，快而顺滑；
 *   - easeOutCubic 缓动：先快后慢，观感接近主流聊天工具。
 */
function smoothScrollBottom(el: HTMLElement) {
  const targetTop = el.scrollHeight
  const startTop = el.scrollTop
  const distance = targetTop - startTop
  if (distance <= 0) return
  const duration = 260
  const startTime = performance.now()
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
  function tick(now: number) {
    const progress = Math.min((now - startTime) / duration, 1)
    el.scrollTop = startTop + distance * easeOutCubic(progress)
    if (progress < 1) {
      requestAnimationFrame(tick)
    }
  }
  requestAnimationFrame(tick)
}

/**
 * 滚动到底部
 *   - force=true（按钮点击）：忽略当前滚动位置，快速平滑吸底；
 *   - force=false（流式自动跟随）：仅当前贴近底部时瞬时吸底，逐 chunk 保持贴底且不打断用户上翻阅读。
 */
async function scrollToBottom(force = false) {
  await nextTick()
  const el = chatBodyRef.value
  if (!el) return
  if (!force && !nearBottom.value) return
  if (force) {
    smoothScrollBottom(el)
  } else {
    el.scrollTop = el.scrollHeight
  }
  nearBottom.value = true
}

// --------------------------------- page init ---------------------------------
onMounted(() => {
  init()
  // 代码块复制按钮：v-html 注入内容无法直接绑定事件，挂载后统一走事件委托
  chatBodyRef.value?.addEventListener('click', handleCopyCode)
})
</script>

<style scoped>
.agent-chat-page {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  width: 100%;
  background: #f5f6fa;
}

.conv-panel {
  width: 260px;
  flex-shrink: 0;
  height: 100%;
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
  cursor: pointer;
}

.agent-logo {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  flex-shrink: 0;
}

.agent-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-list {
  flex: 1;
  min-height: 0;
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

.conv-edit {
  visibility: hidden;
  cursor: pointer;
  flex-shrink: 0;
}

.conv-item:hover .conv-edit {
  visibility: visible;
}

.conv-title-input {
  flex: 1;
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
  justify-content: space-between;
  padding: 0 20px;
  color: #909399;
  font-size: 13px;
  overflow: hidden;
}

.chat-intro {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 16px;
}

.visitor-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: #606266;
  font-size: 13px;
  outline: none;

  .visitor-icon {
    font-size: 14px;
  }

  .visitor-arrow {
    font-size: 11px;
  }
}

/* 对话正文容器：包裹滚动区与「回到底部」悬浮按钮 */
.chat-main {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
}

/* 回到底部按钮（右下角悬浮，圆胶囊提升点击区域与观感） */
.scroll-to-bottom {
  position: absolute;
  right: 26px;
  bottom: 26px;
  z-index: 10;
  width: 38px;
  height: 38px;
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  background: #fff;
  color: var(--el-text-color-regular);
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: all 0.2s;
  animation: scroll-bottom-in 0.25s ease;

  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
    box-shadow: 0 4px 14px rgba(64, 158, 255, 0.3);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
}

@keyframes scroll-bottom-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 新建对话：中央区域展示输入框（整体居中，向上微调） */
.chat-new {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.chat-new-inner {
  width: 100%;
  max-width: 720px;
  /* 向上挪动：居中基础上通过下边距上移 */
  margin-bottom: 20vh;
}

/* 新建对话：Agent名称（大） + 介绍（中） */
.chat-new-title {
  text-align: center;
  font-size: 26px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-new-sub {
  text-align: center;
  font-size: 17px;
  color: #909399;
  margin-bottom: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 新建对话与底部输入框：圆角 */
:deep(.chat-new .el-textarea__inner),
:deep(.chat-input .el-textarea__inner) {
  border-radius: 12px;
}

.chat-new-footer {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .input-tip {
    font-size: 12px;
    color: #909399;
  }
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

  .msg-body {
    display: flex;
    flex-direction: column;
    max-width: 76%;
  }

  .msg-bubble {
    max-width: 100%;
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

  /* 发送时间：默认隐藏，鼠标悬浮展示 */
  .msg-time {
    margin-top: 4px;
    font-size: 11px;
    color: #c0c4cc;
    line-height: 1.4;
    text-align: left;
    visibility: hidden;
  }

  &.user .msg-time {
    text-align: right;
  }

  &:hover .msg-time {
    visibility: visible;
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

/* Markdown 渲染内容样式（助手气泡内） */
.assistant .msg-bubble .msg-content :deep(p) {
  margin: 4px 0;
}

.assistant .msg-bubble .msg-content :deep(h1),
.assistant .msg-bubble .msg-content :deep(h2),
.assistant .msg-bubble .msg-content :deep(h3),
.assistant .msg-bubble .msg-content :deep(h4),
.assistant .msg-bubble .msg-content :deep(h5),
.assistant .msg-bubble .msg-content :deep(h6) {
  margin: 10px 0 6px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--el-text-color-primary);
}

.assistant .msg-bubble .msg-content :deep(h1) {
  font-size: 20px;
}

.assistant .msg-bubble .msg-content :deep(h2) {
  font-size: 18px;
}

.assistant .msg-bubble .msg-content :deep(h3) {
  font-size: 16px;
}

.assistant .msg-bubble .msg-content :deep(h4),
.assistant .msg-bubble .msg-content :deep(h5),
.assistant .msg-bubble .msg-content :deep(h6) {
  font-size: 14.5px;
}

.assistant .msg-bubble .msg-content :deep(ul),
.assistant .msg-bubble .msg-content :deep(ol) {
  padding-left: 22px;
  margin: 4px 0;
}

.assistant .msg-bubble .msg-content :deep(blockquote) {
  margin: 6px 0;
  padding: 2px 12px;
  border-left: 3px solid var(--el-border-color);
  border-radius: 0 4px 4px 0;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
}

.assistant .msg-bubble .msg-content :deep(code) {
  padding: 1px 5px;
  border-radius: 3px;
  background-color: var(--el-fill-color-light);
  font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
}

/* 代码块：浅色主题 + 语言/复制头部（renderMarkdown 注入 .code-block 结构） */
.assistant .msg-bubble .msg-content :deep(.code-block) {
  margin: 8px 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  background: #f6f8fa;
}

.assistant .msg-bubble .msg-content :deep(.code-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  border-bottom: 1px solid #e4e7ed;
  background: #f6f8fa;
  font-size: 12px;
  color: #57606a;
}

.assistant .msg-bubble .msg-content :deep(.code-lang) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
  text-transform: lowercase;
}

.assistant .msg-bubble .msg-content :deep(.code-copy) {
  cursor: pointer;
  user-select: none;
  color: #57606a;
  transition: color 0.2s;

  &:hover {
    color: var(--el-color-primary);
  }
}

.assistant .msg-bubble .msg-content :deep(pre) {
  margin: 0;
  padding: 10px 12px;
  overflow-x: auto;
  background: transparent;
  color: #24292f;
  white-space: pre;
  word-break: normal;
  line-height: 1.55;
}

.assistant .msg-bubble .msg-content :deep(pre code) {
  padding: 0;
  border-radius: 0;
  background-color: transparent;
  color: inherit;
}

.assistant .msg-bubble .msg-content :deep(a) {
  color: var(--el-color-primary);
}

.assistant .msg-bubble .msg-content :deep(table) {
  width: 100%;
  margin: 8px 0;
  border-collapse: collapse;
  font-size: 13px;
}

.assistant .msg-bubble .msg-content :deep(th),
.assistant .msg-bubble .msg-content :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--el-border-color-lighter);
}

.assistant .msg-bubble .msg-content :deep(th) {
  background-color: var(--el-fill-color-lighter);
  font-weight: 600;
}

.assistant .msg-bubble .msg-content :deep(hr) {
  margin: 10px 0;
  border: none;
  border-top: 1px solid var(--el-border-color-lighter);
}

.assistant .msg-bubble .msg-content :deep(img) {
  max-width: 100%;
  border-radius: 4px;
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