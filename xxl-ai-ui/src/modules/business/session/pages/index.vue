<!--
  Session（对话管理）
  按业务空间查看访客对话列表（Agent/标题/访客ID 过滤），点击行右侧抽屉查看消息明细与全链路可观测追踪
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="table.showSearch">
        <el-form-item :label="t('business.session.agent')" prop="agentId">
          <el-select
            v-model="queryParams.agentId"
            :placeholder="t('common.selectPlaceholder')"
            clearable
            filterable
            style="width: 200px"
            @change="handleQuery"
          >
            <el-option v-for="a in agentOptions" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('business.session.sessionTitle')" prop="title">
          <el-input
            v-model="queryParams.title"
            :placeholder="t('common.inputPlaceholder', [t('business.session.sessionTitle')])"
            clearable
            style="width: 200px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('business.session.visitorId')" prop="visitorId">
          <el-input
            v-model="queryParams.visitorId"
            :placeholder="t('common.inputPlaceholder', [t('business.session.visitorId')])"
            clearable
            style="width: 200px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>

      <!-- 对话列表：仅点击「查看明细」查看，行点击不触发 -->
      <el-table v-loading="table.loading" :data="table.list">
        <el-table-column :label="t('common.serialNo')" align="center" type="index" min-width="70" />
        <el-table-column :label="t('business.session.agent')" align="left" prop="agentName" min-width="160" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.session.sessionTitle')" align="left" prop="title" min-width="220" :show-overflow-tooltip="true" />
        <el-table-column
          :label="t('business.session.visitorId')"
          align="center"
          prop="visitorId"
          min-width="160"
          :show-overflow-tooltip="true"
        />
        <el-table-column :label="t('common.addTime')" align="center" prop="addTime" min-width="180" />
        <el-table-column :label="t('common.updateTime')" align="center" prop="updateTime" min-width="180" />
        <el-table-column :label="t('common.operation')" align="center" min-width="120" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="View" @click="openDetail(scope.row)" v-hasPermi="['session:default']">{{
              t('business.session.viewDetail')
            }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <Pagination
        v-show="table.total > 0"
        :total="table.total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="getList"
      />
    </div>

    <!-- 对话明细抽屉 -->
    <el-drawer v-model="drawer.visible" class="session-detail-drawer" :title="t('business.session.detail')" size="820px" append-to-body>
      <div class="session-detail" v-loading="drawer.loading">
        <!-- 元信息卡片：标题 + 访客/时间标签 -->
        <div class="session-detail-meta">
          <div class="meta-head">
            <span class="meta-avatar"
              ><el-icon><ChatLineSquare /></el-icon
            ></span>
            <span class="meta-title" :title="drawer.session.title">{{ drawer.session.title }}</span>
          </div>
          <div class="meta-chips">
            <span class="meta-chip">
              <el-icon><User /></el-icon>
              <span class="meta-chip-label">{{ t('business.session.visitorId') }}</span>
              <span class="meta-chip-value">{{ drawer.session.visitorId }}</span>
            </span>
            <span class="meta-chip">
              <el-icon><Clock /></el-icon>
              <span class="meta-chip-label">{{ t('common.addTime') }}</span>
              <span class="meta-chip-value">{{ drawer.session.addTime }}</span>
            </span>
          </div>
        </div>

        <div class="session-detail-msgs">
          <div v-for="(msg, index) in drawer.messages" :key="index" class="detail-msg" :class="msg.role">
            <div class="detail-msg-role">{{ msg.role === 'user' ? t('business.chat.roleUser') : t('business.chat.roleAssistant') }}</div>
            <div class="detail-msg-bubble">
              <!-- 1、RAG 知识库引用折叠卡片 -->
              <div
                v-if="msg.role === 'assistant' && msg.extData?.references && msg.extData.references.length > 0"
                class="detail-msg-references"
              >
                <div class="detail-msg-references-toggle" @click="toggleReferences(index)">
                  <el-icon><Collection /></el-icon>
                  <span>{{
                    msg.showReferences
                      ? t('business.chat.hideReferences', [msg.extData.references.length])
                      : t('business.chat.referencesTitle', [msg.extData.references.length])
                  }}</span>
                  <el-icon class="reasoning-arrow" :class="{ open: msg.showReferences }"><ArrowDown /></el-icon>
                </div>
                <div v-if="msg.showReferences" class="detail-msg-references-body">
                  <div
                    v-for="(refItem, rIdx) in msg.extData.references"
                    :key="rIdx"
                    class="detail-ref-item"
                    @click="openTraceDrawer(msg, 'references')"
                  >
                    <div class="detail-ref-head">
                      <span>[{{ rIdx + 1 }}] {{ refItem.kbName }} / {{ refItem.docName }}</span>
                      <span>{{ t('business.chat.refScore', [Number(refItem.score || 0).toFixed(2)]) }}</span>
                    </div>
                    <div class="detail-ref-snippet">{{ refItem.content }}</div>
                  </div>
                </div>
              </div>

              <!-- 2、工具调用证据胶囊列表 -->
              <div
                v-if="msg.role === 'assistant' && msg.extData?.toolTraces && msg.extData.toolTraces.length > 0"
                class="detail-msg-tools"
              >
                <div
                  v-for="tool in msg.extData.toolTraces"
                  :key="tool.callId"
                  class="detail-tool-pill"
                  :class="'status-' + (tool.status || 'SUCCESS').toLowerCase()"
                  @click="openTraceDrawer(msg, 'tools')"
                >
                  <span class="pill-type">{{ tool.toolType }}</span>
                  <span class="pill-name">{{ tool.toolName }}</span>
                  <span class="pill-ms" v-if="tool.elapsedMs != null">{{ formatMs(tool.elapsedMs) }}</span>
                </div>
              </div>

              <!-- 3、思考过程：可折叠展示 -->
              <div v-if="msg.reasoning" class="detail-msg-reasoning">
                <div class="detail-msg-reasoning-toggle" @click="toggleThinking(index)">
                  <el-icon class="reasoning-icon"><MagicStick /></el-icon>
                  <span>{{ msg.showThinking ? t('business.chat.hideThinking') : t('business.chat.thinking') }}</span>
                  <el-icon class="reasoning-arrow" :class="{ open: msg.showThinking }"><ArrowDown /></el-icon>
                </div>
                <div v-if="msg.showThinking" class="detail-msg-reasoning-body">{{ msg.reasoning }}</div>
              </div>
              <!-- 助手内容 Markdown 渲染（净化防XSS），用户内容保持纯文本 -->
              <MarkdownView v-if="msg.role === 'assistant'" class="detail-msg-content" :content="msg.content" />
              <span v-else class="detail-msg-content">{{ msg.content }}</span>
              <div class="detail-msg-time">
                <span>{{ msg.addTime }}</span>
                <span class="detail-msg-id">{{ t('business.session.msgId') }}：{{ msg.id }}</span>
                <template v-if="msg.role === 'assistant' && hasTraceMeta(msg)">
                  <span v-if="msg.extData?.runMeta?.modelName" class="detail-trace-tag">
                    {{ msg.extData.runMeta.modelName }}
                  </span>
                  <span v-if="msg.extData?.runMeta?.totalElapsedMs" class="detail-trace-tag">
                    {{ formatMs(msg.extData.runMeta.totalElapsedMs) }}
                  </span>
                  <span v-if="msg.extData?.tokenUsage?.totalTokens" class="detail-trace-tag">
                    Tokens {{ msg.extData.tokenUsage.totalTokens }}
                  </span>
                  <span class="detail-trace-btn" @click="openTraceDrawer(msg, 'waterfall')">
                    <el-icon><DataAnalysis /></el-icon>
                    <span>{{ t('business.chat.viewTrace') }}</span>
                  </span>
                </template>
              </div>
            </div>
          </div>
          <el-empty v-if="!drawer.loading && drawer.messages.length === 0" :description="t('common.emptyData')" :image-size="60" />
        </div>
      </div>
      <template #footer>
        <Pagination
          v-show="drawer.total > 0"
          :total="drawer.total"
          v-model:page="drawer.pageNum"
          v-model:limit="drawer.pageSize"
          @pagination="loadMessages"
        />
      </template>
    </el-drawer>

    <!-- 全链路可观测追踪抽屉 -->
    <TraceInspectorDrawer
      v-model:visible="traceDrawer.visible"
      :msg-id="traceDrawer.msgId"
      :trace-data="traceDrawer.data"
      :default-tab="traceDrawer.tab"
    />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Session' })
import { t } from '@/i18n'
import { useRoute } from 'vue-router'
import { listSessionMsg, pageSession } from '../api'
import { useAgentOptions } from '@/modules/business/agent/composables/useAgentOptions'
import MarkdownView from '@/modules/business/chat/components/MarkdownView.vue'
import TraceInspectorDrawer from '@/modules/business/chat/components/TraceInspectorDrawer.vue'
import { parseSessionMsgExt, type SessionDTO, type SessionMsg, type SessionMsgExt, type SessionQuery } from '../types'
import { useFormReset } from '@/composables/useFormReset'
import { usePageParams } from '@/composables/usePageParams'
import { Pagination } from '@/components'
import type { TableState } from '@/types'
import { ref } from 'vue'

const route = useRoute()
const resetForm = useFormReset()

/** 对话消息（含前端折叠状态与解析后的全链路可观测数据） */
interface SessionMsgItem extends SessionMsg {
  showThinking?: boolean
  showReferences?: boolean
  extData?: SessionMsgExt
}

// --------------------------------- ref data ---------------------------------
/** 指定 Agent 时按 Agent 过滤（从 Agent 列表跳转携带），未指定为 undefined（下拉显示占位符） */
const agentId = ref(Number(route.query.agentId) || 0)

const queryParams = ref<SessionQuery>({
  pageNum: 1,
  pageSize: 10,
  agentId: agentId.value > 0 ? agentId.value : undefined,
  title: undefined,
  visitorId: undefined
})

/** Agent 下拉选项（空间内全部 Agent，与长期记忆页共用同一取数逻辑） */
const { agentOptions, loadAgentOptions } = useAgentOptions()

const table = ref<TableState<SessionDTO>>({ list: [], total: 0, loading: true, showSearch: true, ids: [] })

const drawer = ref<{
  visible: boolean
  loading: boolean
  session: Partial<SessionDTO>
  messages: SessionMsgItem[]
  total: number
  pageNum: number
  pageSize: number
}>({ visible: false, loading: false, session: {}, messages: [], total: 0, pageNum: 1, pageSize: 10 })

const traceDrawer = ref<{
  visible: boolean
  msgId?: number
  data?: SessionMsgExt
  tab: 'waterfall' | 'tools' | 'references' | 'logs'
}>({
  visible: false,
  msgId: undefined,
  data: undefined,
  tab: 'waterfall'
})

// --------------------------------- fun ---------------------------------
function getList() {
  table.value.loading = true
  const params = usePageParams(queryParams)()
  pageSession(params)
    .then((response) => {
      table.value.list = response.data.data
      table.value.total = response.data.total
      table.value.loading = false
    })
    .catch(() => {
      table.value.loading = false
    })
}

function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

function resetQuery() {
  resetForm('queryRef')
  handleQuery()
}

/** 打开对话明细抽屉：重置分页并加载消息 */
function openDetail(row: any) {
  drawer.value.session = row
  drawer.value.messages = []
  drawer.value.total = 0
  drawer.value.pageNum = 1
  drawer.value.visible = true
  if (row.id == null) return
  loadMessages()
}

/** 加载当前分页的对话消息（页面内按时间正序） */
function loadMessages() {
  if (drawer.value.session.id == null) return
  drawer.value.loading = true
  const offset = (drawer.value.pageNum - 1) * drawer.value.pageSize
  listSessionMsg(drawer.value.session.id, queryParams.value.agentId, offset, drawer.value.pageSize)
    .then((response) => {
      drawer.value.messages = response.data.data.map((msg) => ({
        ...msg,
        showThinking: false,
        showReferences: false,
        extData: parseSessionMsgExt(msg.extJson)
      }))
      drawer.value.total = response.data.total
    })
    .finally(() => {
      drawer.value.loading = false
    })
}

/** 展开/收起思考过程 */
function toggleThinking(index: number) {
  const msg = drawer.value.messages[index]
  if (msg) msg.showThinking = !msg.showThinking
}

/** 展开/收起 RAG 引用来源 */
function toggleReferences(index: number) {
  const msg = drawer.value.messages[index]
  if (msg) msg.showReferences = !msg.showReferences
}

function hasTraceMeta(msg: SessionMsgItem): boolean {
  const ext = msg.extData
  if (!ext) return false
  return Boolean(
    ext.runMeta ||
      (ext.tokenUsage && ext.tokenUsage.totalTokens > 0) ||
      (ext.toolTraces && ext.toolTraces.length > 0) ||
      (ext.references && ext.references.length > 0) ||
      (ext.spans && ext.spans.length > 0)
  )
}

function openTraceDrawer(msg: SessionMsgItem, tab: 'waterfall' | 'tools' | 'references' | 'logs' = 'waterfall') {
  traceDrawer.value.msgId = msg.id ?? msg.extData?.runMeta?.runId
  traceDrawer.value.data = msg.extData || parseSessionMsgExt(msg.extJson)
  traceDrawer.value.tab = tab
  traceDrawer.value.visible = true
}

function formatMs(ms?: number): string {
  if (ms == null || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// --------------------------------- page init ---------------------------------
loadAgentOptions()
getList()
</script>

<style scoped>
/* 抽屉标题与对话摘要之间：加分隔横线并收紧间距（抽屉挂到 body，需 :global 命中） */
:global(.session-detail-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:global(.session-detail-drawer .el-drawer__body) {
  padding-top: 14px;
}

/* 对话明细：元信息（无背景，底部横线与消息区隔开） */
.session-detail-meta {
  padding-bottom: 14px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.meta-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.meta-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #fff;
  background: var(--el-color-primary);
}

.meta-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 20px;
}

.meta-chip .el-icon {
  color: var(--el-color-primary);
  font-size: 13px;
}

.meta-chip-label {
  color: var(--el-text-color-secondary);
}

.meta-chip-value {
  color: var(--el-text-color-primary);
  word-break: break-all;
}

/* 对话明细：消息列表 */
.detail-msg {
  margin-bottom: 16px;
}

.detail-msg-role {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.detail-msg-bubble {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.detail-msg.assistant .detail-msg-bubble {
  background: #fff;
  border: 1px solid var(--el-border-color-light);
}

.detail-msg.user .detail-msg-bubble {
  background: var(--el-color-primary-light-9);
}

.detail-msg-content {
  display: block;
}

.detail-msg.user .detail-msg-content {
  white-space: pre-wrap;
}

.detail-msg.assistant .detail-msg-content {
  white-space: normal;
}

.detail-msg-time {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed var(--el-border-color-extra-light);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  color: var(--el-text-color-placeholder);
}

.detail-msg-id {
  margin-left: 2px;
}

.detail-trace-tag {
  font-family: monospace;
  color: var(--el-text-color-secondary);
}

.detail-trace-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-primary);
  font-weight: 500;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
}

/* RAG 引用折叠区 */
.detail-msg-references {
  margin-bottom: 8px;
  border: 1px solid #cce8e3;
  background: #f0fdfa;
  border-radius: 6px;
  overflow: hidden;
}

.detail-msg-references-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #0d9488;
  cursor: pointer;
  user-select: none;
}

.detail-msg-references-body {
  padding: 6px 10px 8px;
  border-top: 1px dashed #bce3dc;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-ref-item {
  padding: 6px 8px;
  border-radius: 5px;
  background: #fff;
  border: 1px solid #e2f2ef;
  cursor: pointer;
  &:hover {
    border-color: #14b8a6;
  }
}

.detail-ref-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: #0f766e;
  margin-bottom: 2px;
}

.detail-ref-snippet {
  font-size: 12px;
  color: #475569;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 工具调用胶囊 */
.detail-msg-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.detail-tool-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #ddd6fe;
  background: #f5f3ff;
  color: #5b21b6;
  &:hover {
    border-color: #8b5cf6;
  }
}

.detail-tool-pill.status-error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #dc2626;
}

.pill-type {
  font-size: 10px;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(139, 92, 246, 0.14);
}

.pill-name {
  font-weight: 600;
}

.pill-ms {
  font-size: 11px;
  opacity: 0.85;
}

/* 思考过程：可折叠 */
.detail-msg-reasoning {
  margin-bottom: 8px;
  border: 1px dashed #dfcfa6;
  background: #faf6ec;
  border-radius: 6px;
  overflow: hidden;
}

.detail-msg-reasoning-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #a0884f;
  cursor: pointer;
  user-select: none;
}

.reasoning-arrow {
  font-size: 11px;
  transition: transform 0.2s;
}

.reasoning-arrow.open {
  transform: rotate(180deg);
}

.detail-msg-reasoning-body {
  margin: 0 10px 8px;
  padding-top: 6px;
  border-top: 1px dashed #eadfcb;
  font-size: 12.5px;
  color: #8a8370;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
