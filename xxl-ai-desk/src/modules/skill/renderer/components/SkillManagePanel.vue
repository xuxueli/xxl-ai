<script setup lang="ts">
/*
 * SKILL 管理面板：技能列表（过滤 / 详情 / 目录 / 删除）与本地目录、Zip 导入。
 * @author xuxueli 2026-10-25
 */
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSkillStore } from '@modules/skill/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import SkillGithubInstallDialog from '@modules/skill/renderer/components/SkillGithubInstallDialog.vue'
import type { SkillDTO, SkillImportResult } from '@modules/skill/shared'

const emit = defineEmits<{
  detail: [id: string]
  discover: []
}>()

const skill = useSkillStore()
/* 从 GitHub 安装弹框 */
const githubVisible = ref(false)

/* 首次进入加载列表（已加载则复用 store 状态） */
onMounted(() => {
  if (!skill.loaded) {
    void skill.loadSkills()
  }
})

/* ISO 时间 → 本地展示 */
function formatTime(iso: string): string {
  if (!iso) {
    return '-'
  }
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

/* 删除技能（二次确认，目录一并删除） */
async function onDelete(row: SkillDTO): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('plugin.skillCenter.deleteConfirm', [row.name]),
      t('plugin.skillCenter.delete'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  try {
    await skill.remove(row.id)
    ElMessage.success(t('plugin.skillCenter.deleted'))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 在文件管理器中显示技能目录 */
async function onReveal(row: SkillDTO): Promise<void> {
  try {
    await skill.reveal(row.id)
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 导入结果汇总：成功与失败逐条列出，便于用户修正后重试 */
async function showImportResult(result: SkillImportResult | null): Promise<void> {
  if (!result) {
    return
  }
  if (result.imported.length === 0 && result.failed.length === 0) {
    ElMessage.warning(t('plugin.skillCenter.importNoSkill'))
    return
  }
  const lines = [
    ...result.imported.map((item) => `✓ ${item.name}`),
    ...result.failed.map((item) => `✗ ${item.name}：${item.reason}`)
  ]
  const summary =
    result.failed.length === 0
      ? t('plugin.skillCenter.importSuccess', [result.imported.length])
      : t('plugin.skillCenter.importSummary', [result.imported.length, result.failed.length])
  try {
    await ElMessageBox.alert(lines.join('\n'), summary, {
      confirmButtonText: t('common.confirm'),
      customClass: 'skill-import-result'
    })
  } catch {
    /* 关闭弹窗不视为失败 */
  }
}

/* 导入技能：目录与 Zip 共用结果处理 */
async function onImport(kind: 'directory' | 'zip'): Promise<void> {
  try {
    const result = kind === 'zip' ? await skill.importZip() : await skill.importDirectory()
    await showImportResult(result)
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 新建 SKILL：下拉选择来源（Zip / 目录 / GitHub / 去市场页浏览） */
function onCreate(command: 'zip' | 'directory' | 'github' | 'discover'): void {
  if (command === 'zip') {
    void onImport('zip')
    return
  }
  if (command === 'directory') {
    void onImport('directory')
    return
  }
  if (command === 'github') {
    githubVisible.value = true
    return
  }
  emit('discover')
}

/* 重新扫描数据目录 */
async function onRefresh(): Promise<void> {
  try {
    await skill.refresh()
    ElMessage.success(t('plugin.skillCenter.refreshed'))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}
</script>

<template>
  <div class="manage-panel">
    <div class="panel-toolbar">
      <el-input
        v-model="skill.keyword"
        class="panel-search"
        clearable
        :placeholder="t('plugin.skillCenter.filterPlaceholder')"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <div class="toolbar-actions">
        <el-dropdown trigger="click" :disabled="skill.importing" @command="onCreate">
          <el-button type="primary" :loading="skill.importing">
            <el-icon><Plus /></el-icon>{{ t('plugin.skillCenter.newSkill') }}
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="directory">
                <el-icon><FolderOpened /></el-icon>{{ t('plugin.skillCenter.installFromDir') }}
              </el-dropdown-item>
              <el-dropdown-item command="zip">
                <el-icon><UploadFilled /></el-icon>{{ t('plugin.skillCenter.installFromZip') }}
              </el-dropdown-item>
              <el-dropdown-item command="github">
                <el-icon><Link /></el-icon>{{ t('plugin.skillCenter.installFromGithub') }}
              </el-dropdown-item>
              <el-dropdown-item command="discover" divided>
                <el-icon><Search /></el-icon>{{ t('plugin.skillCenter.browseDiscover') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-tooltip :content="t('plugin.skillCenter.refreshTip')" placement="top">
          <el-button circle @click="onRefresh">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <el-table :data="skill.visibleSkills" style="width: 100%" row-key="id">
      <el-table-column
        :label="t('plugin.skillCenter.name')"
        min-width="140"
        prop="name"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('plugin.skillCenter.description')"
        min-width="220"
        prop="description"
        :show-overflow-tooltip="{ popperClass: 'skill-cell-tooltip' }"
      >
        <template #default="{ row }">
          {{ row.description || t('plugin.skillCenter.noDescription') }}
        </template>
      </el-table-column>
      <el-table-column
        :label="t('plugin.skillCenter.folderName')"
        min-width="150"
        prop="id"
        :show-overflow-tooltip="{ popperClass: 'skill-cell-tooltip' }"
      >
        <template #default="{ row }">
          <span class="folder-name">/{{ row.id }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('plugin.skillCenter.source')" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="row.source === 'local' ? 'info' : 'success'">
            {{
              row.source === 'local'
                ? t('plugin.skillCenter.sourceLocal')
                : row.source === 'github'
                  ? t('plugin.skillCenter.sourceGithub')
                  : t('plugin.skillCenter.sourceRemote')
            }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('plugin.skillCenter.updateTime')" width="170">
        <template #default="{ row }">{{ formatTime(row.updateTime) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="168" align="center">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button text type="primary" @click="emit('detail', row.id)">
              {{ t('plugin.skillCenter.detail') }}
            </el-button>
            <el-button text type="primary" @click="onReveal(row)">
              {{ t('plugin.skillCenter.folder') }}
            </el-button>
            <el-tooltip
              v-if="row.agentCount > 0"
              :content="t('runtime.error.skillInUse', [row.agentCount])"
              placement="top"
            >
              <span>
                <el-button text type="danger" disabled>{{ t('plugin.skillCenter.delete') }}</el-button>
              </span>
            </el-tooltip>
            <el-button v-else text type="danger" @click="onDelete(row)">
              {{ t('plugin.skillCenter.delete') }}
            </el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('plugin.skillCenter.emptyTitle')">
          <div class="empty-tip">{{ t('plugin.skillCenter.emptyTip') }}</div>
          <el-button type="primary" :loading="skill.importing" @click="onImport('directory')">
            {{ t('plugin.skillCenter.installFromDir') }}
          </el-button>
          <el-button :loading="skill.importing" @click="onImport('zip')">
            {{ t('plugin.skillCenter.installFromZip') }}
          </el-button>
          <el-button @click="emit('discover')">
            {{ t('plugin.skillCenter.browseDiscover') }}
          </el-button>
        </el-empty>
      </template>
    </el-table>

    <SkillGithubInstallDialog v-model:visible="githubVisible" @installed="emit('detail', $event)" />
  </div>
</template>

<style scoped lang="scss">
.manage-panel {
  padding: 0 28px 32px;
  /* 与 MCP 管理列表保持一致的字号 */
  font-size: var(--desk-font-base);
  --el-font-size-base: 14px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 4px 0 14px;
}

.panel-search {
  max-width: 320px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  white-space: nowrap;
}

.row-actions :deep(.el-button) {
  margin-left: 0;
  padding: 4px 6px;
}

.empty-tip {
  margin-bottom: 12px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

/* 导入结果：逐条展示失败原因，需保留换行 */
:global(.skill-import-result .el-message-box__message) {
  white-space: pre-line;
  line-height: 1.7;
}

/* 单元格悬浮提示：限制最大宽度并允许换行，避免长描述把提示框撑得过宽 */
:global(.skill-cell-tooltip) {
  max-width: 360px;
  line-height: 1.6;
  white-space: normal;
  word-break: break-word;
}

/* 文件夹列：等宽字体，便于区分相近目录名 */
.folder-name {
  font-family: var(--el-font-family-mono, monospace);
  font-size: var(--desk-font-xs);
  color: var(--desk-text-secondary);
}
</style>
