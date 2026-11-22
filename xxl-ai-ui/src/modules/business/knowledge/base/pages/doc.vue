<!--
  KnowledgeDoc（知识文档）
  知识库文档管理：粘贴文本 / 上传 txt·md / 向量化 / 向量检索 / 删除
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 页头：知识库信息 + 返回 -->
      <el-row class="mb8" align="middle">
        <el-col :span="12">
          <el-space>
            <el-button icon="Back" @click="goBack">{{ t('business.knowledge.docBack') }}</el-button>
            <span class="doc-header-title">{{ t('business.knowledge.docManage') }}：{{ baseName }}</span>
          </el-space>
        </el-col>
      </el-row>

      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
        <el-form-item :label="t('business.knowledge.docName')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('common.inputPlaceholder', [t('business.knowledge.docName')])"
            clearable
            style="width: 220px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('common.status')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('common.selectPlaceholder')" clearable style="width: 140px">
            <el-option :label="t('common.all')" :value="-1" />
            <el-option v-for="item in docStatusOptions" :key="item.code" :label="item.title" :value="item.code" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>

      <!-- 操作按钮 -->
      <el-row :gutter="10" class="mb8">
        <el-col :span="1.5">
          <el-button type="primary" plain icon="Plus" @click="openCreateForm" v-hasPermi="['knowledge:doc']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-upload
            :show-file-list="false"
            accept=".txt,.md"
            :before-upload="handleBeforeUpload"
            :http-request="handleUpload"
            :disabled="uploading"
          >
            <el-button type="primary" plain icon="Upload" :loading="uploading" v-hasPermi="['knowledge:doc']">{{
              t('business.knowledge.docUpload')
            }}</el-button>
          </el-upload>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="openEditForm()" v-hasPermi="['knowledge:doc']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="removeDoc()" v-hasPermi="['knowledge:doc']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="warning" plain icon="MagicStick" :disabled="table.multiple" @click="handleVectorize()" v-hasPermi="['knowledge:doc']">
            {{ t('business.knowledge.docVectorize') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="warning" plain icon="MagicStick" @click="handleVectorizeAll" v-hasPermi="['knowledge:doc']">
            {{ t('business.knowledge.docVectorizeAll') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="info" plain icon="Search" @click="openSearch" v-hasPermi="['knowledge:doc']">{{ t('business.knowledge.search') }}</el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- 文档列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="syncSelection">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('common.id')" align="center" prop="id" width="80" />
        <el-table-column :label="t('business.knowledge.docName')" align="center" prop="name" min-width="2.5" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.knowledge.docStatus')" align="center" min-width="1">
          <template #default="scope">
            <el-tag :type="docStatusType(scope.row.status)">
              {{ enumTitle(docStatusOptions, scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('business.knowledge.docChunks')" align="center" prop="chunkCount" min-width="1" />
        <el-table-column :label="t('common.createTime')" align="center" min-width="2">
          <template #default="scope">
            <span>{{ scope.row.addTime }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="260" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="MagicStick" @click="handleVectorize(scope.row)" v-hasPermi="['knowledge:doc']">{{
              t('business.knowledge.docVectorize')
            }}</el-button>
            <el-button link type="primary" icon="Edit" @click="openEditForm(scope.row)" v-hasPermi="['knowledge:doc']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="removeDoc(scope.row)" v-hasPermi="['knowledge:doc']">{{
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

    <!-- 添加或修改文档对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="1000px" append-to-body :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="90px">
        <el-form-item :label="t('business.knowledge.docName')" prop="name">
          <el-input v-model="formState.form.name" maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('business.knowledge.docContent')" prop="content">
          <el-input
            v-model="formState.form.content"
            type="textarea"
            :rows="20"
            class="doc-content-input"
            :placeholder="t('business.knowledge.docContentPlaceholder')"
            maxlength="16777215"
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

    <!-- 向量检索对话框 -->
    <el-dialog :title="t('business.knowledge.searchTitle', [baseName])" v-model="search.visible" width="760px" append-to-body>
      <el-form :inline="true">
        <el-form-item :label="t('business.knowledge.searchQuery')" style="width: 100%">
          <el-input
            v-model="search.query"
            :placeholder="t('business.knowledge.searchQueryPlaceholder')"
            clearable
            class="search-query-input"
            @keyup.enter="handleSearchSubmit"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" :loading="search.loading" @click="handleSearchSubmit">{{
            t('business.knowledge.search')
          }}</el-button>
        </el-form-item>
      </el-form>
      <el-table v-loading="search.loading" :data="search.list" max-height="380">
        <el-table-column :label="t('common.serialNo')" align="center" type="index" width="60" />
        <el-table-column :label="t('business.knowledge.docId')" align="center" width="80">
          <template #default="scope">{{ scope.row.docId }}</template>
        </el-table-column>
        <el-table-column :label="t('business.knowledge.score')" align="center" width="110">
          <template #default="scope">
            <el-tag>{{ Number(scope.row.score).toFixed(4) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('business.knowledge.hitContent')" align="left" :show-overflow-tooltip="true">
          <template #default="scope">{{ scope.row.text }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'KnowledgeDoc' })
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { t } from '@/i18n'
import { Pagination, RightToolbar } from '@/components'
import { enumTitle, useEnumOption } from '@/composables/useEnumOption'
import modal from '@/utils/modal'
import { knowledgeDocApi } from '@/modules/business/knowledge/doc/api'
import { knowledgeBaseApi } from '@/modules/business/knowledge/base/api'
import type { KnowledgeDoc, KnowledgeDocForm, KnowledgeDocQuery } from '@/modules/business/knowledge/doc/types'
import type { KnowledgeHit } from '@/modules/business/knowledge/base/types'
import type { FormInstance, UploadRequestOptions } from 'element-plus'
import type { FormState, TableState } from '@/types'

const route = useRoute()
const router = useRouter()

// ---------------------- 响应式数据 ----------------------

const queryRef = ref<FormInstance>() /* 搜索栏表单 */
const formRef = ref<FormInstance>() /* 编辑表单 ref */
const baseId = ref<number>(Number((route.query.baseId as string) ?? 0))
const baseName = ref<string>((route.query.baseName as string) ?? '')
const uploading = ref(false)
const { DocStatusEnum: docStatusOptions } = useEnumOption('DocStatusEnum')

const queryParams = ref<KnowledgeDocQuery>({ pageNum: 1, pageSize: 10, baseId: baseId.value, name: undefined, status: -1 })

const table = ref<TableState<KnowledgeDoc>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

const search = ref({
  visible: false,
  query: '',
  list: [] as KnowledgeHit[],
  loading: false
})

// 编辑表单默认值：新增初始值与每次重置共用
const FORM_DEFAULTS: Readonly<KnowledgeDocForm> = { baseId: baseId.value, chunkCount: 0, status: 0 }

const formState = ref<FormState<KnowledgeDocForm>>({
  visible: false,
  title: '',
  form: { ...FORM_DEFAULTS },
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.docName')]), trigger: 'blur' }],
    content: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.docContent')]), trigger: 'blur' }]
  }
})

// ---------------------- 状态展示 ----------------------

function docStatusType(status?: number) {
  return status === 1 ? 'success' : status === 2 ? 'danger' : 'info'
}

// ---------------------- 分页检索 ----------------------

function getList() {
  table.value.loading = true
  knowledgeDocApi
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

// ---------------------- 数据操作（增删改） ----------------------

/** 重置编辑表单：重置表单数据为默认值 + 清除校验状态 */
function resetForm() {
  formState.value.form = { ...FORM_DEFAULTS }
  formRef.value?.clearValidate()
}
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}
function resetQuery() {
  queryRef.value?.resetFields()
  handleQuery()
}
function syncSelection(selection: KnowledgeDoc[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function openCreateForm() {
  resetForm()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.knowledge.doc')])
}
function openEditForm(row?: KnowledgeDoc) {
  const id = row ? row.id : table.value.ids[0]
  if (id == null) return
  const current = row ?? table.value.list.find((item) => item.id === id)
  if (!current) return
  resetForm()
  formState.value.form = {
    id: current.id,
    baseId: baseId.value,
    name: current.name,
    content: current.content,
    chunkCount: current.chunkCount,
    status: current.status ?? 0
  }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.knowledge.doc')])
}
function removeDoc(row?: KnowledgeDoc) {
  const ids = row ? (row.id != null ? [row.id] : []) : table.value.ids
  if (ids.length === 0) return
  const confirmText = row
    ? t('business.knowledge.confirmDeleteDoc', [row.name ?? String(row.id)])
    : t('business.knowledge.confirmBatchDeleteDoc', [ids.length])
  modal
    .confirm(confirmText)
    .then(() => knowledgeDocApi.delete(ids))
    .then(() => {
      if (table.value.list.length === ids.length && queryParams.value.pageNum > 1) {
        queryParams.value.pageNum -= 1
      }
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}
function saveForm() {
  formRef.value?.validate((valid) => {
    if (!valid) return
    const isEdit = formState.value.form.id != null
    const request = isEdit ? knowledgeDocApi.update(formState.value.form) : knowledgeDocApi.insert(formState.value.form)
    request
      .then(() => {
        modal.msgSuccess(t(isEdit ? 'common.updateSuccess' : 'common.addSuccess'))
        closeForm()
        getList()
      })
      .catch(() => {})
  })
}
function closeForm() {
  formState.value.visible = false
}

// ---------------------- 上传 / 向量化 ----------------------

/** 上传前校验：仅允许 .txt/.md 且不超 10MB */
function handleBeforeUpload(file: File): boolean {
  const ext = (file.name.toLowerCase().match(/\.(\w+)$/) || [])[1]
  if (ext !== 'txt' && ext !== 'md') {
    modal.msgError(t('business.knowledge.docUploadTypeTip'))
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    modal.msgError(t('business.knowledge.docUploadSizeTip'))
    return false
  }
  return true
}

/** 文件上传（自定义 http-request，走业务接口） */
async function handleUpload(options: UploadRequestOptions) {
  if (!baseId.value) {
    modal.msgError(t('business.knowledge.searchRequired'))
    return
  }
  uploading.value = true
  await knowledgeDocApi
    .upload(baseId.value, options.file as File)
    .then(() => {
      modal.msgSuccess(t('common.addSuccess'))
      getList()
    })
    .catch(() => {})
    .finally(() => {
      uploading.value = false
    })
}

/** 向量化：分片 → 嵌入 → 写 Milvus（支持勾选多条批量向量化） */
function handleVectorize(row?: KnowledgeDoc) {
  const raw = row?.id ?? table.value.ids
  const ids = Array.isArray(raw) ? raw : [raw]
  if (ids.length === 0) return
  modal
    .confirm(t('business.knowledge.vectorizeConfirm'))
    .then(async () => {
      let success = 0
      let fail = 0
      for (const id of ids) {
        try {
          await knowledgeDocApi.vectorize(id)
          success++
        } catch (e) {
          fail++
        }
      }
      return { success, fail }
    })
    .then(({ success, fail }) => {
      modal.msgSuccess(t('business.knowledge.vectorizeDone', [success, fail]))
      getList()
    })
    .catch(() => {})
}

/** 整个知识库批量向量化 */
function handleVectorizeAll() {
  if (!baseId.value) return
  modal
    .confirm(t('business.knowledge.vectorizeAllConfirm'))
    .then(() => knowledgeDocApi.vectorizeAll(baseId.value))
    .then((res) => {
      modal.msgSuccess(res.msg)
      getList()
    })
    .catch(() => {})
}

/** 返回知识库列表 */
function goBack() {
  router.push({ path: '/knowledge/base' })
}

// ---------------------- 向量检索 ----------------------

/** 打开向量检索弹窗（检索当前知识库全量文档） */
function openSearch() {
  search.value.visible = true
  search.value.query = ''
  search.value.list = []
}
function handleSearchSubmit() {
  if (!search.value.query) {
    modal.msgWarning(t('business.knowledge.searchRequired'))
    return
  }
  search.value.loading = true
  knowledgeBaseApi
    .search(baseId.value, search.value.query)
    .then((response) => {
      search.value.list = response.data
      search.value.loading = false
    })
    .catch(() => {
      search.value.loading = false
    })
}

// ---------------------- 页面初始化 ----------------------

getList()
</script>

<style scoped>
.doc-header-title {
  font-size: 15px;
  font-weight: 600;
}
.search-query-input {
  width: 420px;
}
.doc-content-input :deep(.el-textarea__inner) {
  max-height: 52vh;
  overflow-y: auto;
}
</style>