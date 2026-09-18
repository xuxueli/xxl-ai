<!--
  AgentConv（Agent对话管理）
  按 Agent 查看访客对话列表（标题/访客ID 查询），点击行右侧抽屉查看消息明细
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 页头：返回 + Agent 信息 -->
      <el-row class="mb8" align="middle">
        <el-button icon="Back" @click="goBack">{{ t('business.agent.backAgent') }}</el-button>
        <span class="conv-header-title">{{ agentName || t('business.agent.conv') }} · {{ t('business.agent.convListTitle') }}</span>
      </el-row>

      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="table.showSearch">
        <el-form-item :label="t('business.agent.convTitle')" prop="title">
          <el-input
            v-model="queryParams.title"
            :placeholder="t('common.inputPlaceholder', [t('business.agent.convTitle')])"
            clearable
            style="width: 200px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('business.agent.visitorId')" prop="visitorId">
          <el-input
            v-model="queryParams.visitorId"
            :placeholder="t('common.inputPlaceholder', [t('business.agent.visitorId')])"
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
        <el-table-column :label="t('business.agent.convTitle')" align="left" prop="title" min-width="220" :show-overflow-tooltip="true" />
        <el-table-column
          :label="t('business.agent.visitorId')"
          align="center"
          prop="visitorId"
          min-width="160"
          :show-overflow-tooltip="true"
        />
        <el-table-column :label="t('common.addTime')" align="center" prop="addTime" min-width="180" />
        <el-table-column :label="t('common.updateTime')" align="center" prop="updateTime" min-width="180" />
        <el-table-column :label="t('common.operation')" align="center" min-width="120" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="View" @click="openDetail(scope.row)" v-hasPermi="['agent:conv']">{{
              t('business.agent.viewDetail')
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
    <el-drawer v-model="drawer.visible" class="conv-detail-drawer" :title="t('business.agent.convDetail')" size="820px" append-to-body>
      <div class="conv-detail" v-loading="drawer.loading">
        <!-- 元信息卡片：标题 + 访客/时间标签 -->
        <div class="conv-detail-meta">
          <div class="meta-head">
            <span class="meta-avatar"
              ><el-icon><ChatLineSquare /></el-icon
            ></span>
            <span class="meta-title" :title="drawer.conv.title">{{ drawer.conv.title }}</span>
          </div>
          <div class="meta-chips">
            <span class="meta-chip">
              <el-icon><User /></el-icon>
              <span class="meta-chip-label">{{ t('business.agent.visitorId') }}</span>
              <span class="meta-chip-value">{{ drawer.conv.visitorId }}</span>
            </span>
            <span class="meta-chip">
              <el-icon><Clock /></el-icon>
              <span class="meta-chip-label">{{ t('common.addTime') }}</span>
              <span class="meta-chip-value">{{ drawer.conv.addTime }}</span>
            </span>
          </div>
        </div>

        <div class="conv-detail-msgs">
          <div v-for="(msg, index) in drawer.messages" :key="index" class="detail-msg" :class="msg.role">
            <div class="detail-msg-role">{{ msg.role === 'user' ? t('business.agent.roleUser') : t('business.agent.roleAssistant') }}</div>
            <div class="detail-msg-bubble">
              <!-- 思考过程：可折叠展示 -->
              <div v-if="msg.reasoning" class="detail-msg-reasoning">
                <div class="detail-msg-reasoning-toggle" @click="toggleThinking(index)">
                  <el-icon class="reasoning-icon"><MagicStick /></el-icon>
                  <span>{{ msg.showThinking ? t('business.agent.hideThinking') : t('business.agent.thinking') }}</span>
                  <el-icon class="reasoning-arrow" :class="{ open: msg.showThinking }"><ArrowDown /></el-icon>
                </div>
                <div v-if="msg.showThinking" class="detail-msg-reasoning-body">{{ msg.reasoning }}</div>
              </div>
              <!-- 助手内容 Markdown 渲染（净化防XSS），用户内容保持纯文本 -->
              <span v-if="msg.role === 'assistant'" class="detail-msg-content" v-html="renderMarkdown(msg.content)"></span>
              <span v-else class="detail-msg-content">{{ msg.content }}</span>
              <div class="detail-msg-time">{{ msg.addTime }}</div>
            </div>
          </div>
          <el-empty v-if="!drawer.loading && drawer.messages.length === 0" :description="t('common.emptyData')" :image-size="60" />
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AgentConv' })
import { t } from '@/i18n'
import { useRoute, useRouter } from 'vue-router'
import { listAgentConv, listAgentConvMsg } from '../api'
import { useFormReset } from '@/composables/useFormReset'
import { usePageParams } from '@/composables/usePageParams'
import { Pagination } from '@/components'
import type { TableState } from '@/types'
import type { AgentConv, AgentConvQuery, AgentMsg } from '../types'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ref } from 'vue'

const route = useRoute()
const router = useRouter()
const resetForm = useFormReset()

/** 对话消息（含前端折叠状态 showThinking） */
interface ConvMsg extends AgentMsg {
  showThinking?: boolean
}

// --------------------------------- ref data ---------------------------------
const agentId = ref(Number(route.query.agentId) || 0)
const agentName = ref(String(route.query.agentName ?? ''))

const queryParams = ref<AgentConvQuery>({ pageNum: 1, pageSize: 10, title: undefined, visitorId: undefined })

const table = ref<TableState<AgentConv>>({ list: [], total: 0, loading: true, showSearch: true, ids: [] })

const drawer = ref<{
  visible: boolean
  loading: boolean
  conv: AgentConv
  messages: ConvMsg[]
}>({ visible: false, loading: false, conv: {}, messages: [] })

// --------------------------------- fun ---------------------------------
function getList() {
  if (!agentId.value) return
  table.value.loading = true
  const params = usePageParams(queryParams)()
  listAgentConv(agentId.value, params)
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

/** 打开对话明细抽屉：加载消息列表 */
function openDetail(row: AgentConv) {
  drawer.value.conv = row
  drawer.value.messages = []
  drawer.value.visible = true
  if (row.id == null) return
  drawer.value.loading = true
  listAgentConvMsg(agentId.value, row.id)
    .then((response) => {
      drawer.value.messages = response.data.map((msg) => ({ ...msg, showThinking: false }))
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

/** Markdown 渲染（净化防 XSS） */
function renderMarkdown(text: string): string {
  const html = marked.parse(text ?? '') as string
  return DOMPurify.sanitize(html)
}

/** 返回 Agent 管理列表 */
function goBack() {
  router.push({ path: '/agent' })
}

// --------------------------------- page init ---------------------------------
getList()
</script>

<style scoped>
.conv-header-title {
  font-size: 15px;
  font-weight: 600;
  margin-left: 12px;
}

/* 抽屉标题与对话摘要之间：加分隔横线并收紧间距（抽屉挂到 body，需 :global 命中） */
:global(.conv-detail-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:global(.conv-detail-drawer .el-drawer__body) {
  padding-top: 14px;
}

/* 对话明细：元信息（无背景，底部横线与消息区隔开） */
.conv-detail-meta {
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

/* 助手 Markdown 内容样式 */
.detail-msg.assistant .detail-msg-content :deep(p) {
  margin: 4px 0;
}

.detail-msg.assistant .detail-msg-content :deep(h1),
.detail-msg.assistant .detail-msg-content :deep(h2),
.detail-msg.assistant .detail-msg-content :deep(h3),
.detail-msg.assistant .detail-msg-content :deep(h4),
.detail-msg.assistant .detail-msg-content :deep(h5),
.detail-msg.assistant .detail-msg-content :deep(h6) {
  margin: 10px 0 6px;
  font-weight: 600;
  line-height: 1.4;
}

.detail-msg.assistant .detail-msg-content :deep(ul),
.detail-msg.assistant .detail-msg-content :deep(ol) {
  padding-left: 22px;
  margin: 4px 0;
}

.detail-msg.assistant .detail-msg-content :deep(blockquote) {
  margin: 6px 0;
  padding: 2px 12px;
  border-left: 3px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
}

.detail-msg.assistant .detail-msg-content :deep(code) {
  padding: 1px 5px;
  border-radius: 3px;
  background-color: var(--el-fill-color-light);
  font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
}

.detail-msg.assistant .detail-msg-content :deep(pre) {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 8px;
  overflow-x: auto;
  background: #f6f8fa;
  color: #24292f;
  white-space: pre;
  line-height: 1.55;
}

.detail-msg.assistant .detail-msg-content :deep(pre code) {
  padding: 0;
  background-color: transparent;
  color: inherit;
}

.detail-msg.assistant .detail-msg-content :deep(a) {
  color: var(--el-color-primary);
}

.detail-msg.assistant .detail-msg-content :deep(table) {
  width: 100%;
  margin: 8px 0;
  border-collapse: collapse;
  font-size: 13px;
}

.detail-msg.assistant .detail-msg-content :deep(th),
.detail-msg.assistant .detail-msg-content :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--el-border-color-lighter);
}

.detail-msg.assistant .detail-msg-content :deep(th) {
  background-color: var(--el-fill-color-lighter);
  font-weight: 600;
}
</style>
