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
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="table.showSearch">
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
          <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['knowledge:doc']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-upload
            :show-file-list="false"
            accept=".txt,.md"
            :http-request="handleUpload"
            :disabled="uploading"
          >
            <el-button type="primary" plain icon="Upload" :loading="uploading" v-hasPermi="['knowledge:doc']">{{
              t('business.knowledge.docUpload')
            }}</el-button>
          </el-upload>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="handleUpdate" v-hasPermi="['knowledge:doc']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="handleDelete" v-hasPermi="['knowledge:doc']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="warning" plain icon="MagicStick" :disabled="table.multiple" @click="handleVectorize" v-hasPermi="['knowledge:doc']">
            {{ t('business.knowledge.docVectorize') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="info" plain icon="Search" @click="openSearch" v-hasPermi="['knowledge:doc']">{{ t('business.knowledge.search') }}</el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- 文档列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('business.knowledge.docName')" align="center" prop="name" min-width="200" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.knowledge.docStatus')" align="center" width="110">
          <template #default="scope">
            <el-tag :type="docStatusType(scope.row.status)">
              {{ docStatusTitle(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('business.knowledge.docChunks')" align="center" prop="chunkCount" width="100" />
        <el-table-column :label="t('common.createTime')" align="center" width="170">
          <template #default="scope">
            <span>{{ scope.row.addTime }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="150" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['knowledge:doc']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="MagicStick" @click="handleVectorize(scope.row)" v-hasPermi="['knowledge:doc']">{{
              t('business.knowledge.docVectorize')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['knowledge:doc']">{{
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
    <el-dialog :title="formState.title" v-model="formState.visible" width="720px" append-to-body>
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="90px">
        <el-form-item :label="t('business.knowledge.docName')" prop="name">
          <el-input v-model="formState.form.name" maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('business.knowledge.docContent')" prop="content">
          <el-input
            v-model="formState.form.content"
            type="textarea"
            :rows="14"
            :placeholder="t('business.knowledge.docContentPlaceholder')"
            maxlength="65535"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="cancel">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 向量检索对话框 -->
    <el-dialog :title="t('business.knowledge.search') + '：' + baseName" v-model="search.visible" width="760px" append-to-body>
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
import { t } from '@/i18n'
import { listKnowledgeDoc, addKnowledgeDoc, updateKnowledgeDoc, delKnowledgeDoc, uploadKnowledgeDoc, vectorizeKnowledgeDoc } from '@/modules/business/knowledge/doc/api'
import { searchKnowledgeBase } from '@/modules/business/knowledge/base/api'
import { useEnumOption } from '@/composables/useEnumOption'
import { useFormReset } from '@/composables/useFormReset'
import { usePageParams } from '@/composables/usePageParams'
import modal from '@/utils/modal'
import { useRoute, useRouter } from 'vue-router'
import { RightToolbar, Pagination } from '@/components'
import type { FormState, TableState } from '@/types'
import type { KnowledgeDoc, KnowledgeDocQuery } from '@/modules/business/knowledge/doc/types'
import type { KnowledgeHit } from '@/modules/business/knowledge/base/types'
import type { FormInstance, UploadRequestOptions } from 'element-plus'
import { ref } from 'vue'

const resetForm = useFormReset()
const route = useRoute()
const router = useRouter()

interface KnowledgeDocForm extends KnowledgeDoc {}

// --------------------------------- ref data ---------------------------------
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

const formState = ref<FormState<KnowledgeDocForm>>({
  visible: false,
  title: '',
  form: {},
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.docName')]), trigger: 'blur' }],
    content: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.docContent')]), trigger: 'blur' }]
  }
})

// --------------------------------- fun ---------------------------------
function docStatusTitle(status: number) {
  return docStatusOptions.value.find((i) => i.code === status)?.title ?? String(status)
}
function docStatusType(status: number) {
  return status === 1 ? 'success' : status === 2 ? 'danger' : 'info'
}

function getList() {
  table.value.loading = true
  const params = usePageParams(queryParams)()
  listKnowledgeDoc(params).then((response) => {
    table.value.list = response.data.data
    table.value.total = response.data.total
    table.value.loading = false
  })
}
function reset() {
  formState.value.form = { id: undefined, baseId: baseId.value, name: undefined, content: undefined, chunkCount: 0, status: 0 }
  resetForm('formRef')
}
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}
function resetQuery() {
  resetForm('queryRef')
  handleQuery()
}
function handleSelectionChange(selection: KnowledgeDoc[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function handleAdd() {
  reset()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.knowledge.doc')])
}
function handleUpdate(row: any) {
  reset()
  const id = row?.id ?? table.value.ids[0]
  if (id == null) return
  const current = table.value.list.find((item) => item.id === id)
  if (!current) return
  formState.value.form = { ...current }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.knowledge.doc')])
}
function handleDelete(row: any) {
  const ids = row?.id ?? table.value.ids
  if (ids == null || (Array.isArray(ids) && ids.length === 0)) return
  modal
    .confirm(t('business.knowledge.confirmDeleteDoc', [ids]))
    .then(() => delKnowledgeDoc(ids))
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}
function submitForm() {
  formRef.value!.validate((valid) => {
    if (!valid) return
    const submitData = { ...formState.value.form }
    delete submitData.addTime
    delete submitData.updateTime
    const req = submitData.id != null ? updateKnowledgeDoc(submitData) : addKnowledgeDoc(submitData)
    req.then(() => {
      modal.msgSuccess(submitData.id != null ? t('common.updateSuccess') : t('common.addSuccess'))
      formState.value.visible = false
      getList()
    })
  })
}
function cancel() {
  formState.value.visible = false
  reset()
}

// --------------------------------- 上传 / 向量化 ---------------------------------
/** 文件上传（自定义 http-request，走业务接口） */
async function handleUpload(options: UploadRequestOptions) {
  if (!baseId.value) {
    modal.msgError(t('business.knowledge.searchRequired'))
    return
  }
  uploading.value = true
  await uploadKnowledgeDoc(baseId.value, options.file as File)
    .then(() => {
      modal.msgSuccess(t('common.addSuccess'))
      getList()
    })
    .catch(() => {})
    .finally(() => {
      uploading.value = false
    })
}

/** 向量化：分片 → 嵌入 → 写 Milvus */
function handleVectorize(row: any) {
  const ids = row?.id ?? table.value.ids
  if (ids == null || (Array.isArray(ids) && ids.length === 0)) return
  const id = Array.isArray(ids) ? ids[0] : ids
  modal
    .confirm(t('business.knowledge.vectorizeConfirm'))
    .then(() => vectorizeKnowledgeDoc(id))
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

// --------------------------------- 向量检索 ---------------------------------
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
  searchKnowledgeBase(baseId.value, search.value.query)
    .then((response) => {
      search.value.list = response.data
      search.value.loading = false
    })
    .catch(() => {
      search.value.loading = false
    })
}

// --------------------------------- page init ---------------------------------
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
</style>