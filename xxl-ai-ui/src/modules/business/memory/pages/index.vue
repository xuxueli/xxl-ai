<!--
  Memory（长期记忆）
  按业务空间查看 Agent×访客 的长期记忆（Agent/访客ID 过滤）；「查看记忆」右侧抽屉展示 Markdown 正文，「修改」弹框编辑记忆正文
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
        <el-form-item :label="t('business.memory.agent')" prop="agentId">
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
        <el-form-item :label="t('business.memory.visitorId')" prop="visitorId">
          <el-input
            v-model="queryParams.visitorId"
            :placeholder="t('common.inputPlaceholder', [t('business.memory.visitorId')])"
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

      <!-- 操作按钮 -->
      <el-row :gutter="10" class="mb8">
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="removeMemory()" v-hasPermi="['memory:default']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- 记忆列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="syncSelection">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('common.id')" align="center" prop="id" width="80" />
        <el-table-column :label="t('business.memory.agent')" align="left" prop="agentName" min-width="160" :show-overflow-tooltip="true" />
        <el-table-column
          :label="t('business.memory.visitorId')"
          align="center"
          prop="visitorId"
          min-width="160"
          :show-overflow-tooltip="true"
        />
        <el-table-column :label="t('business.memory.lastMsgId')" align="center" prop="lastMsgId" width="110" />
        <el-table-column :label="t('common.updateTime')" align="center" prop="updateTime" min-width="170" />
        <el-table-column :label="t('common.operation')" align="center" width="220" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="View" @click="openDetail(scope.row)" v-hasPermi="['memory:default']">{{
              t('business.memory.viewMemory')
            }}</el-button>
            <el-button link type="primary" icon="Edit" @click="openEdit(scope.row)" v-hasPermi="['memory:default']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="removeMemory(scope.row)" v-hasPermi="['memory:default']">{{
              t('common.delete')
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

    <!-- 记忆明细抽屉 -->
    <el-drawer v-model="drawer.visible" class="memory-detail-drawer" :title="t('business.memory.detail')" size="760px" append-to-body>
      <div class="memory-detail">
        <div class="memory-detail-meta">
          <div class="meta-head">
            <span class="meta-avatar"
              ><el-icon><Star /></el-icon
            ></span>
            <span class="meta-title" :title="drawer.memory.agentName">{{ drawer.memory.agentName }}</span>
          </div>
          <div class="meta-chips">
            <span class="meta-chip">
              <el-icon><User /></el-icon>
              <span class="meta-chip-label">{{ t('business.memory.visitorId') }}</span>
              <span class="meta-chip-value">{{ drawer.memory.visitorId }}</span>
            </span>
            <span class="meta-chip">
              <el-icon><ChatLineSquare /></el-icon>
              <span class="meta-chip-label">{{ t('business.memory.lastMsgId') }}</span>
              <span class="meta-chip-value">{{ drawer.memory.lastMsgId }}</span>
            </span>
            <span class="meta-chip">
              <el-icon><Clock /></el-icon>
              <span class="meta-chip-label">{{ t('common.updateTime') }}</span>
              <span class="meta-chip-value">{{ drawer.memory.updateTime }}</span>
            </span>
          </div>
        </div>
        <div class="memory-detail-content">
          <MarkdownView v-if="drawer.memory.content" :content="drawer.memory.content" />
          <el-empty v-else :description="t('business.memory.emptyContent')" :image-size="60" />
        </div>
      </div>
    </el-drawer>

    <!-- 修改记忆对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="1000px" append-to-body :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="90px">
        <el-form-item :label="t('business.memory.content')" prop="content">
          <el-input
            v-model="formState.form.content"
            type="textarea"
            :rows="20"
            class="memory-content-input"
            maxlength="65535"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="saveForm">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="closeForm">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Memory' })
import { ref } from 'vue'
import { t } from '@/i18n'
import { Pagination, RightToolbar } from '@/components'
import modal from '@/utils/modal'
import { memoryApi } from '../api'
import { useAgentOptions } from '@/modules/business/agent/composables/useAgentOptions'
import MarkdownView from '@/modules/business/chat/components/MarkdownView.vue'
import type { Memory, MemoryForm, MemoryQuery } from '../types'
import type { FormInstance } from 'element-plus'
import type { FormState, TableState } from '@/types'

// ---------------------- 响应式数据 ----------------------

/** Agent 下拉选项（空间内全部 Agent，与对话管理页共用同一取数逻辑） */
const { agentOptions, loadAgentOptions } = useAgentOptions()

const queryParams = ref<MemoryQuery>({ pageNum: 1, pageSize: 10, agentId: undefined, visitorId: undefined })

const table = ref<TableState<Memory>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], multiple: true })

const drawer = ref<{ visible: boolean; memory: Partial<Memory> }>({ visible: false, memory: {} })

const queryRef = ref<FormInstance>() /* 搜索栏表单 */
const formRef = ref<FormInstance>() /* 修改记忆表单 ref */

// 编辑表单默认值：新增初始值与每次重置共用
const FORM_DEFAULTS: Readonly<MemoryForm> = { content: undefined }

const formState = ref<FormState<MemoryForm>>({
  visible: false,
  title: '',
  form: { ...FORM_DEFAULTS },
  rules: {
    content: [{ required: true, message: t('common.requiredMsg', [t('business.memory.content')]), trigger: 'blur' }]
  }
})

// ---------------------- 分页检索 ----------------------

function getList() {
  table.value.loading = true
  memoryApi
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

function syncSelection(selection: Memory[]) {
  table.value.ids = selection.map((item) => item.id as number)
  table.value.multiple = !selection.length
}

/** 打开记忆明细抽屉 */
function openDetail(row: Memory) {
  drawer.value.memory = row
  drawer.value.visible = true
}

/** 重置编辑表单：重置表单数据为默认值 + 清除校验状态 */
function resetForm() {
  formState.value.form = { ...FORM_DEFAULTS }
  formRef.value?.clearValidate()
}

/** 打开修改记忆弹框：回填记忆正文 */
function openEdit(row: Memory) {
  resetForm()
  formState.value.form = { id: row.id, content: row.content }
  formState.value.title = t('business.memory.editTitle')
  formState.value.visible = true
}

/** 提交修改记忆内容 */
function saveForm() {
  formRef.value?.validate((valid) => {
    if (!valid) return
    const { id, content } = formState.value.form
    memoryApi
      .update({ id, content })
      .then(() => {
        modal.msgSuccess(t('common.updateSuccess'))
        closeForm()
        getList()
      })
      .catch(() => {})
  })
}

/** 关闭弹窗：重置统一交给 @closed */
function closeForm() {
  formState.value.visible = false
}

function removeMemory(row?: Memory) {
  const ids = row ? (row.id != null ? [row.id] : []) : table.value.ids
  if (ids.length === 0) return
  const confirmText = row
    ? t('business.memory.confirmDelete', [row.visitorId ?? String(row.id)])
    : t('business.memory.confirmBatchDelete', [ids.length])
  modal
    .confirm(confirmText)
    .then(() => memoryApi.delete(ids))
    .then(() => {
      if (table.value.list.length === ids.length && queryParams.value.pageNum > 1) {
        queryParams.value.pageNum -= 1
      }
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}

// ---------------------- 页面初始化 ----------------------

loadAgentOptions()
getList()
</script>

<style scoped>
/* 抽屉标题与内容之间：加分隔横线 */
:global(.memory-detail-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:global(.memory-detail-drawer .el-drawer__body) {
  padding-top: 14px;
}

/* 记忆明细：元信息（无背景，底部横线与内容区隔开） */
.memory-detail-meta {
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

.memory-detail-content {
  font-size: 14px;
  line-height: 1.8;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

/* 记忆正文输入框：与知识库文档修改保持一致（超高时内部滚动，弹框高度一致） */
.memory-content-input :deep(.el-textarea__inner) {
  max-height: 52vh;
  overflow-y: auto;
}
</style>
