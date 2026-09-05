<!--
  Agent（Agent管理）
  Agent 在线配置管理 + 发布/取消发布（发布生成访问 URL）
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="table.showSearch">
        <el-form-item :label="t('business.agent.name')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('common.inputPlaceholder', [t('business.agent.name')])"
            clearable
            style="width: 200px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('business.agent.publishStatus')" prop="publishStatus">
          <el-select v-model="queryParams.publishStatus" :placeholder="t('common.selectPlaceholder')" clearable style="width: 130px">
            <el-option :label="t('common.all')" :value="-1" />
            <el-option :label="t('business.agent.unpublished')" :value="0" />
            <el-option :label="t('business.agent.published')" :value="1" />
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
          <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['agent:default']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="handleUpdate" v-hasPermi="['agent:default']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="handleDelete" v-hasPermi="['agent:default']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- Agent 列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('business.agent.name')" align="center" prop="name" min-width="130" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.agent.intro')" align="center" prop="intro" min-width="200" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.agent.publishStatus')" align="center" width="110">
          <template #default="scope">
            <el-tag :type="scope.row.publishStatus === 1 ? 'success' : 'info'">
              {{ scope.row.publishStatus === 1 ? t('business.agent.published') : t('business.agent.unpublished') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('business.agent.accessUrl')" align="center" min-width="220" :show-overflow-tooltip="true">
          <template #default="scope">
            <span v-if="scope.row.publishStatus === 1 && scope.row.uuid">{{ agentUrl(scope.row.uuid) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" align="center" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'">
              {{ scope.row.status === 0 ? t('common.normal') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="220" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['agent:default']">{{
              t('common.modify')
            }}</el-button>
            <el-button
              v-if="scope.row.publishStatus === 1"
              link
              type="warning"
              icon="CircleClose"
              @click="handleUnpublish(scope.row)"
              v-hasPermi="['agent:default']"
              >{{ t('business.agent.unpublish') }}</el-button
            >
            <el-button
              v-else
              link
              type="success"
              icon="Position"
              @click="handlePublish(scope.row)"
              v-hasPermi="['agent:default']"
              >{{ t('business.agent.publish') }}</el-button
            >
            <el-button
              v-if="scope.row.publishStatus === 1 && scope.row.uuid"
              link
              type="primary"
              icon="CopyDocument"
              @click="copyUrl(scope.row.uuid)"
              >{{ t('business.agent.copyUrl') }}</el-button
            >
            <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['agent:default']">{{
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

    <!-- 添加或修改 Agent 对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="720px" append-to-body>
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="110px">
        <el-form-item :label="t('business.agent.name')" prop="name">
          <el-input v-model="formState.form.name" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('business.agent.intro')" prop="intro">
          <el-input v-model="formState.form.intro" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-divider content-position="left">{{ t('business.agent.coreConfig') }}</el-divider>
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('business.agent.modelSupplier')" prop="modelSupplierId">
              <el-select v-model="formState.form.modelSupplierId" style="width: 100%" @change="handleSupplierChange">
                <el-option v-for="item in supplierOptions" :key="item.id" :label="item.name" :value="item.id as number" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('business.agent.model')" prop="modelId">
              <el-select v-model="formState.form.modelId" style="width: 100%">
                <el-option v-for="item in chatModelOptions" :key="item.id" :label="item.name" :value="item.id as number" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('business.agent.kb')" prop="kbIds">
          <el-select v-model="formState.form.kbIds" multiple filterable style="width: 100%">
            <el-option v-for="item in kbOptions" :key="item.id" :label="item.name" :value="item.id as number" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('business.agent.mcp')" prop="mcpIds">
          <el-select v-model="formState.form.mcpIds" multiple filterable style="width: 100%">
            <el-option v-for="item in mcpOptions" :key="item.id" :label="item.name" :value="item.id as number" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('business.agent.skill')" prop="skillIds">
          <el-select v-model="formState.form.skillIds" multiple filterable style="width: 100%">
            <el-option v-for="item in skillOptions" :key="item.id" :label="item.name" :value="item.id as number" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('business.agent.systemPrompt')" prop="systemPrompt">
          <el-input v-model="formState.form.systemPrompt" type="textarea" :rows="6" :placeholder="t('business.agent.systemPromptPlaceholder')" maxlength="65535" />
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-radio-group v-model="formState.form.status">
            <el-radio :value="0">{{ t('common.normal') }}</el-radio>
            <el-radio :value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="cancel">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Agent' })
import { t } from '@/i18n'
import { listAgent, addAgent, updateAgent, delAgent, publishAgent, unpublishAgent } from '../api'
import { listSupplierBySpace } from '@/modules/business/supplier/api'
import { listModelBySupplier } from '@/modules/business/supplier/api'
import { listMcpBySpace } from '@/modules/business/mcp/api'
import { listSkillBySpace } from '@/modules/business/skill/api'
import { listKnowledgeBaseBySpace } from '@/modules/business/knowledge/base/api'
import { useFormReset } from '@/composables/useFormReset'
import { usePageParams } from '@/composables/usePageParams'
import modal from '@/utils/modal'
import { RightToolbar, Pagination } from '@/components'
import type { FormState, TableState } from '@/types'
import type { Agent, AgentQuery } from '../types'
import type { Supplier } from '@/modules/business/supplier/types'
import type { SupplierModel } from '@/modules/business/supplier/types'
import type { Mcp } from '@/modules/business/mcp/types'
import type { Skill } from '@/modules/business/skill/types'
import type { KnowledgeBase } from '@/modules/business/knowledge/base/types'
import type { FormInstance } from 'element-plus'
import { ref } from 'vue'

const resetForm = useFormReset()

interface AgentForm extends Agent {}

// --------------------------------- ref data ---------------------------------
const formRef = ref<FormInstance>() /* 编辑表单 ref */
const origin = ref(window.location.origin)

const supplierOptions = ref<Supplier[]>([])
const chatModelOptions = ref<SupplierModel[]>([])
const kbOptions = ref<KnowledgeBase[]>([])
const mcpOptions = ref<Mcp[]>([])
const skillOptions = ref<Skill[]>([])

const queryParams = ref<AgentQuery>({ pageNum: 1, pageSize: 10, name: undefined, publishStatus: -1, status: -1 })

const table = ref<TableState<Agent>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

const formState = ref<FormState<AgentForm>>({
  visible: false,
  title: '',
  form: {},
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.agent.name')]), trigger: 'blur' }],
    modelSupplierId: [{ required: true, message: t('common.requiredMsg', [t('business.agent.modelSupplier')]), trigger: 'change' }],
    modelId: [{ required: true, message: t('common.requiredMsg', [t('business.agent.model')]), trigger: 'change' }]
  }
})

// --------------------------------- fun ---------------------------------
function getList() {
  table.value.loading = true
  const params = usePageParams(queryParams)()
  listAgent(params).then((response) => {
    table.value.list = response.data.data
    table.value.total = response.data.total
    table.value.loading = false
  })
}
function loadBindOptions() {
  listSupplierBySpace().then((response) => {
    supplierOptions.value = response.data
  })
  listKnowledgeBaseBySpace().then((response) => {
    kbOptions.value = response.data
  })
  listMcpBySpace().then((response) => {
    mcpOptions.value = response.data
  })
  listSkillBySpace().then((response) => {
    skillOptions.value = response.data
  })
}
/** 供应商切换：加载该供应商下对话模型 */
function handleSupplierChange(supplierId: number) {
  formState.value.form.modelId = undefined
  chatModelOptions.value = []
  if (!supplierId) return
  listModelBySupplier(supplierId).then((response) => {
    chatModelOptions.value = response.data.filter((item) => item.type === 0 && item.status === 0)
  })
}
function reset() {
  formState.value.form = {
    id: undefined,
    name: undefined,
    intro: undefined,
    modelSupplierId: undefined,
    modelId: undefined,
    systemPrompt: undefined,
    kbIds: [],
    mcpIds: [],
    skillIds: [],
    publishStatus: 0,
    uuid: undefined,
    status: 0
  }
  chatModelOptions.value = []
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
function handleSelectionChange(selection: Agent[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function handleAdd() {
  reset()
  loadBindOptions()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.agent.agent')])
}
function handleUpdate(row: any) {
  reset()
  const id = row?.id ?? table.value.ids[0]
  if (id == null) return
  const current = table.value.list.find((item) => item.id === id)
  if (!current) return
  loadBindOptions()
  formState.value.form = { ...current }
  if (current.modelSupplierId) {
    listModelBySupplier(current.modelSupplierId).then((response) => {
      chatModelOptions.value = response.data.filter((item) => item.type === 0 && item.status === 0)
    })
  }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.agent.agent')])
}
function handleDelete(row: any) {
  const ids = row?.id ?? table.value.ids
  if (ids == null || (Array.isArray(ids) && ids.length === 0)) return
  modal
    .confirm(t('business.agent.confirmDelete', [ids]))
    .then(() => delAgent(ids))
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
    const req = submitData.id != null ? updateAgent(submitData) : addAgent(submitData)
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

// --------------------------------- 发布 / 访问 URL ---------------------------------
function agentUrl(uuid: string) {
  return `${origin.value}/agent/chat/${uuid}`
}
function handlePublish(row: any) {
  publishAgent(row.id)
    .then((res) => {
      modal.msgSuccess(t('business.agent.publishSuccess'))
      getList()
      clipboardCopy(agentUrl(res.data))
    })
    .catch(() => {})
}
function handleUnpublish(row: any) {
  modal
    .confirm(t('business.agent.unpublishConfirm'))
    .then(() => unpublishAgent(row.id))
    .then(() => {
      modal.msgSuccess(t('business.agent.unpublishSuccess'))
      getList()
    })
    .catch(() => {})
}
function copyUrl(uuid: string) {
  clipboardCopy(agentUrl(uuid))
}
/** 复制文本：优先 navigator.clipboard，降级 textarea 方案 */
async function clipboardCopy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    modal.msgSuccess(t('business.agent.copySuccess'))
  } catch (e) {
    clampCopyFallback(text)
  }
}
function clampCopyFallback(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
  modal.msgSuccess(t('business.agent.copySuccess'))
}

// --------------------------------- page init ---------------------------------
getList()
</script>