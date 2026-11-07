<script setup lang="ts">
/*
 * 设置 - 供应商管理：列表展示、启用切换、新增/编辑与删除。
 * @author xuxueli 2026-10-25
 */
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProviderStore } from '@modules/provider/renderer'
import { t } from '@renderer/shell/i18n'
import ProviderEditDialog from '@modules/provider/renderer/components/ProviderEditDialog.vue'
import type { ProviderDTO } from '@modules/provider/shared'

const provider = useProviderStore()

/* 编辑弹窗显隐与当前编辑项（null 表示新增） */
const dialogVisible = ref(false)
const editingProvider = ref<ProviderDTO | null>(null)

/* 打开新增弹窗 */
function openAdd(): void {
  editingProvider.value = null
  dialogVisible.value = true
}

/* 打开编辑弹窗 */
function openEdit(row: ProviderDTO): void {
  editingProvider.value = row
  dialogVisible.value = true
}

/* 删除供应商（二次确认） */
async function removeProvider(row: ProviderDTO): Promise<void> {
  try {
    await ElMessageBox.confirm(t('chat.deleteConfirm'), row.name, {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
    await provider.remove(row.id)
    ElMessage.success(t('common.deleted'))
  } catch {
    /* 取消 */
  }
}

/* 切换供应商启用状态并立即保存 */
async function toggleProvider(row: ProviderDTO, value: boolean): Promise<void> {
  await provider.save({ id: row.id, enabled: value })
}
</script>

<template>
  <div>
    <div class="settings-block-title">{{ t('settings.providerListTitle') }}</div>
    <div class="provider-toolbar">
      <span class="settings-block-tip">{{ t('settings.providerTip') }}</span>
      <el-button type="primary" @click="openAdd">
        <el-icon><Plus /></el-icon>
        {{ t('settings.addProvider') }}
      </el-button>
    </div>
    <el-table :data="provider.providers" style="width: 100%">
      <el-table-column prop="name" :label="t('settings.providerName')" min-width="140" />
      <el-table-column
        prop="baseUrl"
        :label="t('settings.baseUrl')"
        min-width="220"
        :show-overflow-tooltip="true"
      />
      <el-table-column :label="t('settings.models')" min-width="200">
        <template #default="{ row }">
          <el-tooltip v-if="row.models.length > 0" placement="top" :show-after="150" effect="dark">
            <template #content>
              <div class="model-tooltip">
                <div v-for="model in row.models" :key="model.id">
                  {{ model.id }} · {{ model.contextWindow.toLocaleString('en-US') }}
                </div>
              </div>
            </template>
            <div class="model-tags">
              <el-tag v-for="model in row.models" :key="model.id" size="small" class="model-tag">
                {{ model.id }}
              </el-tag>
            </div>
          </el-tooltip>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-switch
            :model-value="row.enabled"
            @update:model-value="(value: boolean) => toggleProvider(row, value)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="170" align="center">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button text type="primary" @click="openEdit(row)">{{ t('common.edit') }}</el-button>
            <el-button text type="danger" @click="removeProvider(row)">
              {{ t('common.delete') }}
            </el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('common.empty')" />
      </template>
    </el-table>

    <ProviderEditDialog v-model:visible="dialogVisible" :provider="editingProvider" />
  </div>
</template>

<style scoped lang="scss">
@use '../../../../common/renderer/styles/settingsBlock.scss';

.provider-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

/* 模型列表：单行展示、溢出省略，悬浮 tooltip 查看全部 */
.model-tags {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  max-width: 100%;
  white-space: nowrap;
}

.model-tags .model-tag {
  margin: 0;
  flex-shrink: 0;
}

/* 模型标签：中性底 + 主题边框，降低表格内高亮色噪声 */
.model-tags :deep(.el-tag.model-tag) {
  --el-tag-bg-color: var(--desk-surface-elevated);
  --el-tag-border-color: var(--desk-border);
  --el-tag-text-color: var(--desk-text-secondary);
}

.model-tooltip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
}

/* 供应商操作列：按钮不换行 */
.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
</style>
