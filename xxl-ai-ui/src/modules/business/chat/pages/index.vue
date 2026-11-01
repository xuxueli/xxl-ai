<!--
  AgentChat（Agent 公开对话页）
  免登录访问：左侧维护多个对话，右侧对话正文（SSE 流式）
-->
<template>
  <div class="agent-chat-page">
    <!-- 左侧：对话列表（支持折叠/展开） -->
    <aside class="session-panel" :class="{ collapsed }">
      <div class="session-header">
        <div class="agent-title" @click="handleRefresh" :title="t('business.chat.refresh')">
          <img v-if="logo" :src="logo" class="agent-logo" alt="logo" />
          <span class="agent-name">{{ agent?.name || 'Agent' }}</span>
        </div>
        <div class="session-actions">
          <el-button class="new-chat-btn" type="primary" plain round icon="Plus" @click="handleNewChat">
            {{ t('business.chat.newChat') }}
          </el-button>
        </div>
      </div>
      <div class="session-list" v-loading="sessionLoading">
        <div
          v-for="session in sessionList"
          :key="session.id"
          class="session-item"
          :class="{ active: session.id === currentSessionId }"
          @click="selectSession(session.id)"
        >
          <template v-if="editingSessionId === session.id">
            <el-input
              v-model="editingTitle"
              class="session-title-input"
              size="small"
              maxlength="50"
              @click.stop
              @keyup.enter="saveSessionTitle(session)"
              @keyup.esc="cancelSessionTitle"
              @blur="saveSessionTitle(session)"
            />
          </template>
          <template v-else>
            <span class="session-title" :title="session.title">{{ session.title }}</span>
            <el-icon class="session-edit" @click.stop="startEditSessionTitle(session)"><EditPen /></el-icon>
          </template>
          <el-icon class="session-del" @click.stop="deleteSession(session)"><Delete /></el-icon>
        </div>
        <el-empty v-if="!sessionLoading && sessionList.length === 0" :description="t('business.chat.noSession')" :image-size="60" />
      </div>
      <!-- 底部：访客信息 + 全屏切换 -->
      <div class="session-footer">
        <el-dropdown trigger="click" @command="handleVisitorCommand">
          <span class="visitor-trigger" :title="visitorId">
            <el-icon class="visitor-icon"><User /></el-icon>
            <span class="visitor-label">{{ t('business.chat.visitor') }}</span>
            <el-icon class="visitor-arrow"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="'copyVisitor'" :disabled="!visitorId">
                {{ t('business.chat.visitorInfo') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <SvgIcon
          class="footer-fullscreen"
          :icon-class="isFullscreen ? 'exit-fullscreen' : 'fullscreen'"
          :title="isFullscreen ? t('business.chat.exitFullscreen') : t('business.chat.fullscreen')"
          @click="toggleFullscreen"
        />
      </div>
    </aside>

    <!-- 右侧：对话正文 -->
    <main class="chat-panel">
      <div class="chat-header">
        <el-icon
          class="panel-toggle"
          :title="collapsed ? t('business.chat.expandMenu') : t('business.chat.collapseMenu')"
          @click="togglePanel"
        >
          <Expand v-if="collapsed" />
          <Fold v-else />
        </el-icon>
        <span class="chat-intro">{{ agent?.intro || '' }}</span>
      </div>
      <div class="chat-main">
        <div class="chat-body" :class="{ 'has-floating-input': !!currentSessionId }" ref="chatBodyRef" @scroll="handleScroll">
          <template v-if="currentSessionId">
            <div v-for="(msg, index) in messages" :key="index" class="msg-row" :class="msg.role">
              <div class="msg-body">
                <div class="msg-bubble">
                  <!-- 思考过程：可折叠展示（业界常见体验，如 DeepSeek "深度思考"） -->
                  <div v-if="msg.reasoning" class="msg-reasoning">
                    <div class="msg-reasoning-toggle" @click="toggleThinking(index)">
                      <el-icon class="reasoning-icon"><MagicStick /></el-icon>
                      <span class="reasoning-label">{{
                        msg.showThinking ? t('business.chat.hideThinking') : t('business.chat.thinking')
                      }}</span>
                      <el-icon class="reasoning-arrow" :class="{ open: msg.showThinking }"><ArrowDown /></el-icon>
                    </div>
                    <div
                      v-if="msg.showThinking"
                      :ref="(el) => bindReasoningBody(index, el)"
                      class="msg-reasoning-body"
                      @scroll="handleReasoningScroll(index, $event)"
                    >
                      {{ msg.reasoning }}
                    </div>
                  </div>
                  <!-- 回复内容：生成失败（status=2，含主动终止）且无内容时不再显示"思考中" -->
                  <span v-if="!msg.content && msg.status !== 2" class="msg-streaming"
                    >{{ t('business.chat.thinkingStreaming') }}<span class="streaming-dots"><span></span><span></span><span></span></span
                  ></span>
                  <!-- 访客输入：纯文本；模型返回：Markdown 渲染（净化防XSS） -->
                  <MarkdownView v-if="msg.role === 'assistant'" :content="msg.content" />
                  <span v-else>{{ msg.content }}</span>
                  <!-- 异常消息状态提示：生成失败 -->
                  <div v-if="msg.role === 'assistant' && msg.status === 2" class="msg-status-tip">
                    <span>{{ t('business.chat.failed') }}</span>
                  </div>
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
                :placeholder="t('business.chat.inputPlaceholder')"
                @keydown.enter.exact.prevent="handleSend"
              />
              <div class="chat-new-footer">
                <span class="input-tip">{{ t('business.chat.enterTip') }}</span>
                <el-button type="primary" :loading="sending" @click="handleSend">
                  {{ t('business.chat.send') }}
                </el-button>
              </div>
            </div>
          </div>
          <el-empty v-else :description="t('business.chat.selectSession')" :image-size="80" />
        </div>
        <!-- 回到底部按钮：用户上翻阅读时显示，点击平滑吸底并恢复自动跟随 -->
        <button
          v-if="currentSessionId && !nearBottom"
          class="scroll-to-bottom"
          :title="t('business.chat.scrollToBottom')"
          @click="goBottom"
        >
          <el-icon><ArrowDown /></el-icon>
        </button>
      </div>
      <div class="chat-input" v-if="currentSessionId">
        <div class="chat-input-inner">
          <el-input
            v-model="inputText"
            type="textarea"
            :rows="3"
            resize="none"
            :placeholder="t('business.chat.inputPlaceholder')"
            :disabled="sending"
            @keydown.enter.exact.prevent="handleSend"
          />
          <div class="input-footer">
            <span class="input-tip">{{ t('business.chat.enterTip') }}</span>
            <el-button v-if="sending" type="danger" plain @click="handleStop">
              {{ t('business.chat.stop') }}
            </el-button>
            <el-button v-else type="primary" @click="handleSend">
              {{ t('business.chat.send') }}
            </el-button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { t } from '@/i18n'
import logo from '@/assets/images/logo.png'
import { useRoute, useRouter } from 'vue-router'
import { createSession, deleteSession as removeSession, listSession, listMsg, loadAgentInfo, renameSession, stopStream } from '../api'
import { useChatStream } from '../composables/useChatStream'
import MarkdownView from '../components/MarkdownView.vue'
import type { AgentChatInfo } from '../types'
import type { Session, SessionMsg } from '@/modules/business/session/types'
import { parseTime } from '@/utils/common'
import modal from '@/utils/modal'
import { copyText } from '@/utils/clipboard'
import { SvgIcon } from '@/components'
import { useFullscreen } from '@vueuse/core'
import { nextTick, onMounted, ref, type ComponentPublicInstance } from 'vue'

const { sendMessage, resumeMessage, stopMessage } = useChatStream()

const route = useRoute()
const router = useRouter()

/** 浏览器全屏状态与切换（vueuse） */
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()

const uuid = ref<string>(String(route.params.uuid || ''))
const visitorId = ref<string>('')
const agent = ref<AgentChatInfo>()

const sessionList = ref<Session[]>([])
const sessionLoading = ref(false)
const currentSessionId = ref<number | undefined>(undefined)
/** 对话消息（含前端流式字段 showThinking） */
interface SessionMsgItem extends SessionMsg {
  showThinking?: boolean
}
const messages = ref<SessionMsgItem[]>([])
const inputText = ref('')
const sending = ref(false)
const chatBodyRef = ref<HTMLElement>()
/** 是否贴近对话底部（控制「回到底部」按钮显隐与流式自动跟随） */
const nearBottom = ref(true)
/** 新建对话状态：未建会话，中间区域展示输入框 */
const newChat = ref(false)
const newChatInputRef = ref<any>()
/** 左侧对话面板折叠状态 */
const collapsed = ref(false)
/** 对话标题编辑状态 */
const editingSessionId = ref<number | undefined>(undefined)
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
    const res = await loadAgentInfo(uuid.value)
    agent.value = res.data
    document.title = agent.value?.name || 'Agent'
  } catch (e) {
    agent.value = undefined
    return
  }
  ensureVisitorId()
  await loadSessionList()
  // 定位指定对话：优先路径参数 /chat/:uuid/:session，其次查询参数 /chat/:uuid?sessionId=；合法则自动切换，否则默认进入新建对话内容
  const sessionParam = Array.isArray(route.params.session) ? route.params.session[0] : (route.params.session as string | undefined)
  const queryParam = Array.isArray(route.query.sessionId) ? route.query.sessionId[0] : (route.query.sessionId as string | undefined)
  const targetSessionId = Number(sessionParam ?? queryParam)
  if (Number.isInteger(targetSessionId) && targetSessionId > 0 && sessionList.value.some((c) => c.id === targetSessionId)) {
    void selectSession(targetSessionId)
  } else {
    newChat.value = true
  }
}

/** 加载对话列表 */
async function loadSessionList() {
  sessionLoading.value = true
  try {
    const res = await listSession(uuid.value, visitorId.value)
    sessionList.value = res.data
  } finally {
    sessionLoading.value = false
  }
}

// --------------------------------- 对话操作 ---------------------------------

/** 新建对话：不立即建会话，进入新建状态并聚焦输入框，输入+发送后才生成对话 */
function handleNewChat() {
  if (sending.value) return
  // 已在新建对话状态：提示并聚焦，不重复进入
  if (newChat.value && !currentSessionId.value) {
    modal.msgWarning(t('business.chat.newChatAlready'))
    newChatInputRef.value?.focus()
    return
  }
  currentSessionId.value = undefined
  messages.value = []
  newChat.value = true
  syncUrlSessionId()
  nextTick(() => newChatInputRef.value?.focus())
}

/** 右上角 Agent 名称区域点击：整体刷新页面 */
function handleRefresh() {
  window.location.reload()
}

/** 折叠/展开左侧对话面板 */
function togglePanel() {
  collapsed.value = !collapsed.value
}

/** 同步 URL 中的 sessionId 查询参数（点击对话/新建对话/发送时体现当前会话） */
function syncUrlSessionId(sessionId?: number) {
  router.replace({ path: `/chat/${uuid.value}`, query: sessionId ? { sessionId: String(sessionId) } : {} })
}

/** 选中对话：加载消息 */
async function selectSession(sessionId: number) {
  currentSessionId.value = sessionId
  newChat.value = false
  syncUrlSessionId(sessionId)
  messages.value = []
  await loadMessages(sessionId)
  // 进入会话（含刷新）默认定位到底部，并等待图片等资源加载完成后再校准
  await jumpToBottom()
  pinBottomAfterAssets()
  // 存在生成中的助手消息（如刷新页面/切换对话后）：自动断点续传并展开思考区
  const pending = messages.value.find((m) => m.role === 'assistant' && m.status === 0 && m.id != null)
  if (pending) {
    pending.showThinking = true
    void resumeGenerating(pending)
  }
}

/** 拉取会话消息，并重置前端流式展示状态 */
async function loadMessages(sessionId: number) {
  const res = await listMsg(sessionId)
  messages.value = res.data.map((m) => ({ ...m, showThinking: false }))
}

/** 重新加载当前对话消息（终止后回显后端已落库的终止内容，避免占位一直显示"思考中"） */
async function reloadMessages() {
  const sessionId = currentSessionId.value
  if (!sessionId) return
  await loadMessages(sessionId)
  await followBottom()
}

/**
 * 续传生成中的助手消息：从结果流起点重放全部增量，回填到对应消息
 */
async function resumeGenerating(msg: SessionMsgItem) {
  if (msg.id == null) return
  const idx = messages.value.indexOf(msg)
  sending.value = true
  try {
    await resumeMessage(
      msg.id,
      (chunk) => {
        const m = messages.value[idx]
        if (m) m.reasoning = (m.reasoning || '') + chunk
        stickReasoning(idx)
        followBottom()
      },
      (chunk) => {
        const m = messages.value[idx]
        if (m) m.content += chunk
        followBottom()
      },
      // 续传过程中生成失败：同样回读后端失败态消息，终止"思考中"占位
      () => reloadMessages()
    )
  } catch (e) {
    // 续传失败保留已展示内容
  } finally {
    sending.value = false
    await followBottom()
  }
}

// --------------------------------- 对话标题修改 ---------------------------------

/** 进入标题编辑态 */
function startEditSessionTitle(session: Session) {
  editingSessionId.value = session.id
  editingTitle.value = session.title || ''
}

/** 保存标题（Enter / 失焦触发，最长50个字符） */
function saveSessionTitle(session: Session) {
  if (editingSessionId.value !== session.id) return
  const title = editingTitle.value.trim()
  editingSessionId.value = undefined
  editingTitle.value = ''
  if (!title || title === session.title) return
  renameSession(session.id, title)
    .then(() => {
      session.title = title
    })
    .catch(() => {})
}

/** 取消标题编辑 */
function cancelSessionTitle() {
  editingSessionId.value = undefined
  editingTitle.value = ''
}

/** 删除对话 */
function deleteSession(session: Session) {
  modal
    .confirm(t('business.chat.deleteSessionConfirm', [session.title]))
    .then(async () => {
      await removeSession(session.id)
      if (currentSessionId.value === session.id) {
        currentSessionId.value = undefined
        messages.value = []
      }
      void loadSessionList()
    })
    .catch(() => {})
}

// --------------------------------- 消息发送（SSE） ---------------------------------

/**
 * 确保存在可写入的会话
 *   - 新建状态下首次发送才创建对话（左侧列表新增、右侧展示正文）；
 *   - 创建失败返回 null，并结束发送态。
 */
async function ensureSession(): Promise<number | null> {
  if (currentSessionId.value) return currentSessionId.value
  try {
    const res = await createSession(uuid.value, visitorId.value)
    const session = res.data
    currentSessionId.value = session.id
    newChat.value = false
    syncUrlSessionId(session.id)
    // 新对话置顶（列表按 id 倒序）
    sessionList.value.unshift(session)
    return session.id
  } catch (e) {
    modal.msgError(t('business.chat.sendFail'))
    sending.value = false
    return null
  }
}

/** 发送消息（新建状态下首次发送才创建对话；空内容/纯空格提示） */
async function handleSend() {
  const content = inputText.value.trim()
  if (!content) {
    modal.msgWarning(t('business.chat.questionRequired'))
    return
  }
  if (sending.value) return
  inputText.value = ''
  sending.value = true

  const sessionId = await ensureSession()
  if (sessionId == null) return

  // 本地追加用户消息
  const now = new Date().toISOString()
  const userMsg: SessionMsgItem = { sessionId, role: 'user', content, showThinking: false, addTime: now }
  messages.value.push(userMsg)
  const assistantMsg: SessionMsgItem = {
    sessionId,
    role: 'assistant',
    content: '',
    reasoning: '',
    showThinking: true,
    addTime: now
  }
  const assistantIdx = messages.value.push(assistantMsg) - 1
  await jumpToBottom()

  try {
    await sendMessage(
      { uuid: uuid.value, visitorId: visitorId.value, sessionId, content },
      (chunk) => {
        // 经响应式代理累加思考过程，触发视图逐段更新
        const msg = messages.value[assistantIdx]
        if (msg) msg.reasoning += chunk
        stickReasoning(assistantIdx)
        followBottom()
      },
      (chunk) => {
        // 经响应式代理累加回复内容，触发视图逐段更新并按 Markdown 渲染
        const msg = messages.value[assistantIdx]
        if (msg) msg.content += chunk
        followBottom()
      },
      // 生成失败：参考终止逻辑，从后端回读失败态消息（status=2 + 失败提示），终止"思考中"占位
      () => reloadMessages()
    )
    // 流结束后再次校准：Markdown 块（代码/表格等）渲染完成后高度变化
    await followBottom()
    requestAnimationFrame(() => followBottom())
  } catch (e) {
    modal.msgError(t('business.chat.sendFail'))
  } finally {
    sending.value = false
    // 首条消息后后端自动生成了对话标题（首次提问内容，超50字截断补"..."），本地同步刷新左侧标题
    const session = sessionList.value.find((c) => c.id === sessionId)
    if (session) {
      const title = content.trim()
      session.title = title.length > 50 ? title.slice(0, 47) + '...' : title
    }
  }
}

/**
 * 终止生成：先中断前端流（本地立即生效），再通知后端终止生成并清理工具调用进程
 * 后端终止失败时重试，仍失败则提示并重新拉取消息与后端状态收敛
 */
async function handleStop() {
  const sessionId = currentSessionId.value
  if (!sending.value || !sessionId) return
  // 先中断前端流（避免继续渲染、不再自动续传），后端终止为独立请求不影响此步
  stopMessage()
  // 通知后端终止（失败重试），成功后再回读落库内容
  const stopped = await requestStop(sessionId)
  if (!stopped) {
    modal.msgError(t('business.chat.stopFail'))
  }
  // 稍候重新拉取消息：回显后端已落库的内容（status=2），避免占位一直显示"思考中"
  setTimeout(() => {
    if (currentSessionId.value === sessionId) {
      reloadMessages()
    }
  }, 500)
}

/**
 * 请求后端终止会话（最多重试 3 次，退避 300/600ms），返回是否成功
 */
async function requestStop(sessionId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await stopStream(sessionId)
      return true
    } catch (e) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
      }
    }
  }
  return false
}

/** 展开/收起思考过程 */
function toggleThinking(index: number) {
  const msg = messages.value[index]
  if (msg) msg.showThinking = !msg.showThinking
  // 展开且仍在生成中：直接定位到最新内容
  if (msg?.showThinking) stickReasoning(index)
}

/** 思考正文容器：消息下标 → 元素（生成中吸底用） */
const reasoningBodies = new Map<number, HTMLElement>()
/** 思考区是否跟随底部：用户上翻后暂停跟随，回到底部附近恢复 */
const reasoningSticky = new Map<number, boolean>()

/** 登记思考正文容器（v-for 中 ref 需用函数形式）；首次挂载即定位到最新内容 */
function bindReasoningBody(index: number, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) {
    reasoningBodies.set(index, el)
    if (reasoningSticky.get(index) !== false) {
      el.scrollTop = el.scrollHeight
    }
  } else {
    reasoningBodies.delete(index)
  }
}

/** 用户滚动思考区：据距底距离决定是否继续跟随 */
function handleReasoningScroll(index: number, event: Event) {
  const el = event.target as HTMLElement
  reasoningSticky.set(index, el.scrollHeight - el.scrollTop - el.clientHeight < 24)
}

/** 思考区吸底：内容增长时始终展示最新内容（用户上翻查看时不打扰） */
async function stickReasoning(index: number) {
  if (reasoningSticky.get(index) === false) return
  await nextTick()
  const el = reasoningBodies.get(index)
  if (el) el.scrollTop = el.scrollHeight
}

// --------------------------------- 访客信息 ---------------------------------

/** 访客下拉：复制访客信息并提示 */
async function handleVisitorCommand() {
  if (!visitorId.value) return
  const tip = t('business.chat.visitorIdTip', [visitorId.value])
  await copyText(tip)
  modal.msgSuccess(t('business.chat.copySuccess'))
}

// --------------------------------- 会话消息 ---------------------------------

/** 消息发送时间（无值时返回空，悬浮时展示） */
function timeText(msg: SessionMsgItem) {
  return msg.addTime ? parseTime(msg.addTime) || '' : ''
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

/** 回到对话底部（用户点击「回到底部」按钮，平滑滚动并恢复自动跟随） */
function goBottom() {
  const el = chatBodyRef.value
  if (!el) return
  nearBottom.value = true
  smoothScrollBottom(el)
}

/**
 * 自动跟随底部：仅当用户停留在底部附近时瞬时吸底
 *   - 流式输出逐 chunk 保持贴底，不打断用户上翻阅读。
 */
async function followBottom() {
  if (!nearBottom.value) return
  await jumpToBottom()
}

/**
 * 立即定位到底部（进入/切换会话、发送消息、刷新恢复）
 *   - 不依赖 nearBottom：这些场景应强制贴底。
 */
async function jumpToBottom() {
  nearBottom.value = true
  await nextTick()
  const el = chatBodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

/**
 * 资源加载完成后校准吸底
 *   - 刷新进入会话时，Markdown 图片 / 字体等异步加载会撑高正文，首次渲染的滚动高度不完整；
 *   - 仅在用户仍停留在底部附近时校准，避免打断上翻阅读。
 */
function pinBottomAfterAssets() {
  const body = chatBodyRef.value
  if (!body) return
  const pin = () => {
    if (nearBottom.value) void jumpToBottom()
  }
  // 再等一帧，确保首屏布局稳定
  requestAnimationFrame(pin)
  body.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', pin, { once: true })
  })
  if (document.readyState !== 'complete') {
    window.addEventListener('load', pin, { once: true })
  }
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

// --------------------------------- page init ---------------------------------
onMounted(() => {
  init()
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

.session-panel {
  width: 220px;
  flex-shrink: 0;
  height: 100%;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition:
    width 0.25s ease,
    border-right-color 0.25s ease;

  /* 折叠：面板收窄至 0，内容随之隐藏 */
  &.collapsed {
    width: 0;
    border-right-color: transparent;
  }
}

.session-header {
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  gap: 14px;
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

/* 新建对话：按钮形式，水平居中于左侧面板 */
.session-actions {
  display: flex;
  justify-content: center;
}

.session-actions .new-chat-btn {
  width: 100%;
  font-weight: 500;
  /* 淡色主题：常态/悬浮/按下均取浅色调，观感柔和；不描边 */
  --el-button-bg-color: var(--el-color-primary-light-9);
  --el-button-border-color: transparent;
  --el-button-text-color: var(--el-color-primary-light-3);
  --el-button-hover-bg-color: var(--el-color-primary-light-8);
  --el-button-hover-border-color: transparent;
  --el-button-hover-text-color: var(--el-color-primary-light-3);
  --el-button-active-bg-color: var(--el-color-primary-light-8);
  --el-button-active-border-color: transparent;
  --el-button-active-text-color: var(--el-color-primary-light-3);
}

.session-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
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

.session-edit {
  visibility: hidden;
  cursor: pointer;
  flex-shrink: 0;
}

.session-item:hover .session-edit {
  visibility: visible;
}

.session-title-input {
  flex: 1;
}

.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.session-del {
  visibility: hidden;
  cursor: pointer;
}

.session-item:hover .session-del {
  visibility: visible;
}

/* 左侧面板底部：访客信息 + 全屏切换 */
.session-footer {
  flex-shrink: 0;
  padding: 14px 16px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 全屏切换图标（与访客图标保持同尺寸） */
.footer-fullscreen {
  width: 14px;
  height: 14px;
  color: #606266;
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: var(--el-color-primary);
  }
}

.chat-panel {
  /* 对话内容列宽：页面变宽时保持最大宽度，页面变窄时随容器收缩 */
  --chat-column-width: 860px;
  /* 底部浮动输入框预留高度：正文底部留白与回到底部按钮共用 */
  --chat-input-reserve: 180px;
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
}

.chat-header {
  height: 50px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 20px;
  color: #909399;
  font-size: 13px;
  overflow: hidden;
}

/* 左侧面板折叠/展开按钮 */
.panel-toggle {
  flex-shrink: 0;
  font-size: 18px;
  color: #606266;
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: var(--el-color-primary);
  }
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
  padding: 24px;
  background: #fff;
}

/* 底部输入框为浮层时，预留其高度避免遮挡最后一条消息 */
.chat-body.has-floating-input {
  padding-bottom: var(--chat-input-reserve);
}

/* 回到底部按钮（内容列右侧悬浮，圆胶囊提升点击区域与观感） */
.scroll-to-bottom {
  position: absolute;
  right: max(26px, calc((100% - var(--chat-column-width)) / 2 + 8px));
  bottom: calc(var(--chat-input-reserve) - 24px);
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
  max-width: var(--chat-column-width);
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

/* 新建对话输入框：圆角 */
:deep(.chat-new .el-textarea__inner) {
  border-radius: 12px;
}

/* 底部输入框：浮层内卡片式输入，宽度与内容列保持一致 */
.chat-input {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9;
  display: flex;
  justify-content: center;
  padding: 12px 24px 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, #fff 32%);
  pointer-events: none;
}

.chat-input-inner {
  width: 100%;
  max-width: var(--chat-column-width);
  padding: 10px 12px 8px;
  background: #f7f8fa;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  pointer-events: auto;
  transition:
    border-color 0.2s,
    background-color 0.2s;

  &:focus-within {
    background: #fff;
    border-color: var(--el-color-primary);
  }
}

:deep(.chat-input .el-textarea__inner) {
  padding: 4px;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 14px;
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
  /* 内容列整体居中：宽屏保持最大宽度，窄屏随容器收缩 */
  width: 100%;
  max-width: var(--chat-column-width);
  margin: 0 auto 20px;

  &.assistant {
    justify-content: flex-start;
  }

  &.user {
    justify-content: flex-end;
  }

  .msg-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* 模型回复：宽度占满内容列，左对齐 */
  &.assistant .msg-body {
    flex: 1;
    max-width: 100%;
  }

  /* 用户输入：靠右对齐，最宽不超过内容列的 80% */
  &.user .msg-body {
    align-items: flex-end;
    max-width: 80%;
  }

  .msg-bubble {
    max-width: 100%;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.75;
    word-break: break-word;
    white-space: pre-wrap;
  }

  &.assistant .msg-bubble {
    padding: 0;
    background: transparent;
    color: #303133;
  }

  &.user .msg-bubble {
    padding: 10px 16px;
    background: #e8f0fe;
    color: #303133;
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
    /* 单次思考限高：超长思考在区内滚动，避免整页被持续撑高 */
    max-height: min(360px, 42vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    border-top: 1px dashed #eadfcb;
    font-size: 12.5px;
    color: #8a8370;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.msg-streaming {
  display: inline-flex;
  align-items: center;
  color: #b0b3b8;
  font-style: italic;
}

/* 消息状态提示：生成失败 */
.msg-status-tip {
  display: inline-flex;
  align-items: center;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #f56c6c;
  background: #fef0f0;
}

/* 思考中：省略号逐点跳动，呈现滚动加载效果 */
.streaming-dots {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  margin-left: 3px;
}

.streaming-dots span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  animation: streaming-scroll 1.2s infinite ease-in-out;
}

.streaming-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.streaming-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes streaming-scroll {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.25;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
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
