<!--
  Session（对话管理）
  按业务空间查看访客对话列表（Agent/标题/访客ID 过滤），点击行右侧抽屉查看消息明细
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
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
        <el-table-column :label="t('common.id')" align="center" prop="id" min-width="80" />
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
            <el-button link type="primary" icon="View" @click="openDetail(scope.row as SessionDTO)" v-hasPermi="['session:default']">{{
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
              <!-- 思考过程：可折叠展示 -->
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
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Session' })
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '@/i18n'
import { Pagination } from '@/components'
import { sessionApi } from '../api'
import { useAgentOptions } from '@/modules/business/agent/composables/useAgentOptions'
import MarkdownView from '@/modules/business/chat/components/MarkdownView.vue'
import type { SessionDTO, SessionMsg, SessionQuery } from '../types'
import type { FormInstance } from 'element-plus'
import type { TableState } from '@/types'

const route = useRoute()

/** 对话消息（含前端折叠状态 showThinking） */
interface SessionMsgItem extends SessionMsg {
  showThinking?: boolean
}

// ---------------------- 响应式数据 ----------------------

const queryRef = ref<FormInstance>() /* 搜索栏表单 */

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

// ---------------------- 分页检索 ----------------------

function getList() {
  table.value.loading = true
  sessionApi
    .pageList(queryParams.value)
    .then((response) => {
      table.value.list = response.data.data
      table.value.total = response.data.total
    })
    .catch(() => {
      // 错误已由请求层提示，继续走到 finally 复位 loading
    })
    .finally(() => {
      table.value.loading = false
    })
}

function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

function resetQuery() {
  queryRef.value?.resetFields()
  handleQuery()
}

// ---------------------- 数据操作（增删改） ----------------------

/** 打开对话明细抽屉：重置分页并加载消息 */
function openDetail(row: SessionDTO) {
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
  sessionApi
    .msgList({
      sessionId: drawer.value.session.id,
      agentId: queryParams.value.agentId,
      pageNum: drawer.value.pageNum,
      pageSize: drawer.value.pageSize
    })
    .then((response) => {
      drawer.value.messages = response.data.data.map((msg) => ({ ...msg, showThinking: false }))
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

// ---------------------- 页面初始化 ----------------------

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

/* 助手 Markdown：重置块间源码换行的额外渲染，避免行距异常 */
.detail-msg.assistant .detail-msg-content {
  white-space: normal;
}

.detail-msg-time {
  margin-top: 6px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.detail-msg-id {
  margin-left: 10px;
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
