<!--
  Agent（Agent 管理）
  功能：Agent 的分页查询 + 新增/修改/删除 + 发布/取消发布（发布生成访问 URL）
  @author xuxueli 2026-11-22
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
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
            <el-option v-for="item in publishStatusOptions" :key="item.code" :label="item.title" :value="item.code" />
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
          <el-button type="primary" plain icon="Plus" @click="openCreateForm" v-hasPermi="['agent:default']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="openEditForm()" v-hasPermi="['agent:default']">{{ t('common.modify') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="removeAgent()" v-hasPermi="['agent:default']">{{ t('common.delete') }}</el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- Agent 列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="syncSelection">
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('common.id')" prop="id" align="center" width="80" />
        <el-table-column :label="t('business.agent.name')" align="center" prop="name" min-width="130" show-overflow-tooltip />
        <el-table-column :label="t('business.agent.intro')" align="center" prop="intro" min-width="200" show-overflow-tooltip />
        <el-table-column :label="t('business.agent.modelSupplier')" align="center" prop="modelSupplierName" min-width="140" show-overflow-tooltip />
        <el-table-column :label="t('business.agent.publishStatus')" align="center" width="90">
          <template #default="scope">
            <el-switch v-model="scope.row.publishStatus" :active-value="1" :inactive-value="0" @change="handlePublishChange(scope.row)" />
          </template>
        </el-table-column>
        <el-table-column :label="t('business.agent.accessUrl')" align="center" width="110" show-overflow-tooltip>
          <template #default="scope">
            <el-link v-if="scope.row.publishStatus === 1 && scope.row.uuid" type="primary" underline="always" @click="openAgentUrl(scope.row.uuid)">
              {{ t('business.agent.gotoAgent') }}
            </el-link>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="160" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="openEditForm(scope.row)" v-hasPermi="['agent:default']">{{ t('common.modify') }}</el-button>
            <el-button link type="primary" icon="Delete" @click="removeAgent(scope.row)" v-hasPermi="['agent:default']">{{ t('common.delete') }}</el-button>
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

    <!-- 新增或修改对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="720px" append-to-body :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="110px">
        <el-form-item :label="t('business.agent.name')" prop="name">
          <el-input v-model="formState.form.name" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('business.agent.intro')" prop="intro">
          <el-input v-model="formState.form.intro" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-divider />
        <el-form-item :label="t('business.agent.systemPrompt')" prop="systemPrompt">
          <el-input
            v-model="formState.form.systemPrompt"
            type="textarea"
            :rows="6"
            :placeholder="t('business.agent.systemPromptPlaceholder')"
            maxlength="65535"
          />
        </el-form-item>
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
        <el-form-item :label="t('business.agent.memoryStatus')" prop="memoryStatus">
          <el-switch v-model="formState.form.memoryStatus" :active-value="1" :inactive-value="0" />
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
defineOptions({ name: 'Agent' })
import { ref } from 'vue'
import { t } from '@/i18n'
import { Pagination, RightToolbar } from '@/components'
import { useEnumOption } from '@/composables/useEnumOption'
import modal from '@/utils/modal'
import { agentApi } from '../api'
import { supplierApi, supplierModelApi } from '@/modules/business/supplier/api'
import { mcpApi } from '@/modules/business/mcp/api'
import { skillApi } from '@/modules/business/skill/api'
import { knowledgeBaseApi } from '@/modules/business/knowledge/base/api'
import type { Agent, AgentForm, AgentQuery } from '../types'
import type { Supplier, SupplierModel } from '@/modules/business/supplier/types'
import type { Mcp } from '@/modules/business/mcp/types'
import type { Skill } from '@/modules/business/skill/types'
import type { KnowledgeBase } from '@/modules/business/knowledge/base/types'
import type { FormInstance } from 'element-plus'
import type { FormState, TableState } from '@/types'

// ---------------------- 响应式数据 ----------------------

const queryRef = ref<FormInstance>() /* 搜索栏表单 */
const formRef = ref<FormInstance>() /* 编辑表单 */
const origin = ref(window.location.origin) /* 发布访问地址来源 */

// 发布状态选项，由后端枚举接口加载
const { PublishStatusEnum: publishStatusOptions } = useEnumOption('PublishStatusEnum')

// 绑定资源下拉选项，打开弹窗时加载
const supplierOptions = ref<Supplier[]>([])
const chatModelOptions = ref<SupplierModel[]>([])
const kbOptions = ref<KnowledgeBase[]>([])
const mcpOptions = ref<Mcp[]>([])
const skillOptions = ref<Skill[]>([])

// 搜索栏筛选条件与分页参数
const queryParams = ref<AgentQuery>({
  pageNum: 1 /* 当前页码 */,
  pageSize: 10 /* 每页条数 */,
  name: undefined /* Agent 名称 */,
  publishStatus: -1 /* 发布状态筛选，-1 表示全部 */
})

// 列表数据与勾选状态，勾选结果决定顶部按钮是否可用
const table = ref<TableState<Agent>>({
  list: [], // Agent 列表
  total: 0, // 总条数
  loading: true, // 加载状态
  showSearch: true, // 是否显示搜索栏
  ids: [], // 勾选行主键
  single: true, // 修改按钮是否禁用
  multiple: true // 删除按钮是否禁用
})

// 编辑表单默认值：新增初始值与每次重置共用
const FORM_DEFAULTS: Readonly<AgentForm> = {
  memoryStatus: 0,
  kbIds: [],
  mcpIds: [],
  skillIds: []
}

// 编辑弹窗状态
const formState = ref<FormState<AgentForm>>({
  visible: false, // 弹窗显隐
  title: '', // 弹窗标题
  form: { ...FORM_DEFAULTS }, // 表单数据
  rules: {
    // 校验规则
    name: [{ required: true, message: t('common.requiredMsg', [t('business.agent.name')]), trigger: 'blur' }],
    modelSupplierId: [{ required: true, message: t('common.requiredMsg', [t('business.agent.modelSupplier')]), trigger: 'change' }],
    modelId: [{ required: true, message: t('common.requiredMsg', [t('business.agent.model')]), trigger: 'change' }]
  }
})

// ---------------------- 分页检索 ----------------------

/** 查询 Agent 分页数据 */
function getList() {
  table.value.loading = true
  agentApi
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

/** 搜索：回到第一页后查询 */
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

/** 重置搜索条件后重新查询 */
function resetQuery() {
  queryRef.value?.resetFields()
  handleQuery()
}

// ---------------------- 数据操作（增删改） ----------------------

/** 同步表格勾选结果，驱动批量修改/删除按钮状态 */
function syncSelection(selection: Agent[]) {
  table.value.ids = selection.map((item) => item.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}

/** 加载绑定资源选项（供应商 / 知识库 / MCP / SKILL） */
function loadBindOptions() {
  supplierApi.listBySpace().then((response) => {
    supplierOptions.value = response.data
  })
  knowledgeBaseApi.listBySpace().then((response) => {
    kbOptions.value = response.data
  })
  mcpApi.listBySpace().then((response) => {
    mcpOptions.value = response.data
  })
  skillApi.listBySpace().then((response) => {
    skillOptions.value = response.data
  })
}

/** 供应商切换：加载该供应商下对话模型 */
function handleSupplierChange(supplierId: number) {
  formState.value.form.modelId = undefined
  chatModelOptions.value = []
  if (!supplierId) return
  supplierModelApi.listBySupplier(supplierId).then((response) => {
    chatModelOptions.value = response.data.filter((item) => item.type === 0 && item.status === 0)
  })
}

/** 重置编辑表单：重置表单数据为默认值 + 清除表单校验状态 */
function resetForm() {
  formState.value.form = { ...FORM_DEFAULTS, kbIds: [], mcpIds: [], skillIds: [] }
  chatModelOptions.value = []
  formRef.value?.clearValidate()
}

/** 打开新增弹窗 */
function openCreateForm() {
  resetForm()
  loadBindOptions()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.agent.agent')])
}

/**
 * 打开修改弹窗并回填详情
 *
 * 后端无 load 接口，列表行已包含编辑所需字段。
 *
 * @param row 行数据；顶部按钮调用时为空，此时回退到勾选行
 */
function openEditForm(row?: Agent) {
  const id = row ? row.id : table.value.ids[0]
  if (id == null) return
  const current = row ?? table.value.list.find((item) => item.id === id)
  if (!current) return
  resetForm()
  loadBindOptions()
  formState.value.form = {
    id: current.id,
    name: current.name,
    intro: current.intro,
    modelSupplierId: current.modelSupplierId,
    modelId: current.modelId,
    systemPrompt: current.systemPrompt,
    kbIds: current.kbIds ?? [],
    mcpIds: current.mcpIds ?? [],
    skillIds: current.skillIds ?? [],
    memoryStatus: current.memoryStatus ?? 0
  }
  // 回显选中供应商的对话模型
  if (current.modelSupplierId) {
    supplierModelApi.listBySupplier(current.modelSupplierId).then((response) => {
      chatModelOptions.value = response.data.filter((item) => item.type === 0 && item.status === 0)
    })
  }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.agent.agent')])
}

/** 校验通过后保存：有 id 走修改，否则新增 */
function saveForm() {
  formRef.value?.validate((valid) => {
    if (!valid) return
    const isEdit = formState.value.form.id != null
    const request = isEdit ? agentApi.update(formState.value.form) : agentApi.insert(formState.value.form)
    request
      .then(() => {
        modal.msgSuccess(t(isEdit ? 'common.updateSuccess' : 'common.addSuccess'))
        closeForm()
        getList()
      })
      .catch(() => {})
  })
}

/** 关闭弹窗：重置统一交给 @closed，保证 X / ESC / 按钮三条路径一致 */
function closeForm() {
  formState.value.visible = false
}

/**
 * 删除 Agent（单条或批量），成功后刷新列表
 *
 * @param row 行数据；顶部按钮调用时为空，此时删除勾选行
 */
function removeAgent(row?: Agent) {
  const ids = row ? (row.id != null ? [row.id] : []) : table.value.ids
  if (ids.length === 0) return
  const confirmText = row
    ? t('business.agent.confirmDelete', [row.name ?? String(row.id)])
    : t('business.agent.confirmBatchDelete', [ids.length])
  modal
    .confirm(confirmText)
    .then(() => agentApi.delete(ids))
    .then(() => {
      if (table.value.list.length === ids.length && queryParams.value.pageNum > 1) {
        queryParams.value.pageNum -= 1
      }
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}

// ---------------------- 发布 / 访问 URL ----------------------

/** 拼接公开对话页 URL（Hash 模式） */
function agentUrl(uuid: string) {
  return `${origin.value}/#/chat/${uuid}`
}

/** 发布状态快速切换：失败时回滚开关状态 */
function handlePublishChange(row: Agent) {
  const target = Number(row.publishStatus)
  const request = target === 1 ? agentApi.publish(row.id as number) : agentApi.unpublish(row.id as number)
  request
    .then((response) => {
      // 发布接口返回访问 UUID，立即回填以便展示访问 URL
      if (target === 1 && response.data) row.uuid = response.data
      modal.msgSuccess(target === 1 ? t('business.agent.publishSuccess') : t('business.agent.unpublishSuccess'))
      getList()
    })
    .catch(() => {
      row.publishStatus = target === 1 ? 0 : 1
    })
}

/** 打开 Agent 发布页面（新窗口跳转） */
function openAgentUrl(uuid: string) {
  window.open(agentUrl(uuid), '_blank')
}

// ---------------------- 页面初始化 ----------------------

getList()
</script>
