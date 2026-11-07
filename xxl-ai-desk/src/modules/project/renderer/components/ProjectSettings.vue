<script setup lang="ts">
/*
 * 系统设置 - 项目：项目列表维护（新增 / 重命名 / 定位 / 删除）与项目记忆开关、查看。
 * @author xuxueli 2026-11-07
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@modules/project/renderer/store'
import { useChatStore } from '@modules/chat/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { ProjectMemoryDialog } from '@modules/agent/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import type { ProjectDTO } from '@modules/project/shared'

const project = useProjectStore()
const chat = useChatStore()
const settings = useSettingsStore()

/* 记忆弹窗 */
const memoryVisible = ref(false)
const memoryProject = ref<ProjectDTO | null>(null)

/* 「在文件管理器中显示」文案按运行平台区分 */
const revealLabel = computed(() => {
  if (settings.platform === 'darwin') {
    return t('project.revealMac')
  }
  if (settings.platform === 'win32') {
    return t('project.revealWin')
  }
  return t('project.revealLinux')
})

onMounted(() => {
  void project.loadProjects()
})

/* 新建项目：系统目录选择后自动落库 */
async function onCreate(): Promise<void> {
  try {
    await project.createProject()
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 重命名 */
async function onRename(row: ProjectDTO): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('', t('project.rename'), {
      inputValue: row.name,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
    const name = value?.trim()
    if (name && name !== row.name) {
      await project.renameProject(row.id, name)
      ElMessage.success(t('project.renamed'))
    }
  } catch {
    /* 取消 */
  }
}

/* 在系统文件管理器中显示 */
async function onReveal(row: ProjectDTO): Promise<void> {
  try {
    await project.revealProject(row.id)
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 删除项目：级联删除其下会话与消息 */
async function onDelete(row: ProjectDTO): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('project.deleteConfirm', [row.name]),
      t('project.delete'),
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
    await project.removeProject(row.id)
    await chat.reloadSessions()
    ElMessage.success(t('project.deleted'))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 切换项目记忆开关 */
async function onMemoryToggle(row: ProjectDTO, value: boolean): Promise<void> {
  try {
    await project.setMemoryEnabled(row.id, value)
    ElMessage.success(t('common.saved'))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 查看项目记忆 */
function onViewMemory(row: ProjectDTO): void {
  memoryProject.value = row
  memoryVisible.value = true
}

/* 行操作下拉项：统一分发到具体动作 */
function onAction(row: ProjectDTO, command: string): void {
  if (command === 'memory') {
    onViewMemory(row)
    return
  }
  if (command === 'rename') {
    void onRename(row)
    return
  }
  if (command === 'reveal') {
    void onReveal(row)
    return
  }
  if (command === 'delete') {
    void onDelete(row)
  }
}
</script>

<template>
  <div class="project-settings">
    <div class="panel-toolbar">
      <div class="panel-tip">{{ t('project.settingsTip') }}</div>
      <el-button type="primary" @click="onCreate">
        <el-icon><Plus /></el-icon>{{ t('project.new') }}
      </el-button>
    </div>

    <el-table :data="project.projects" class="project-table" style="width: 100%" row-key="id">
      <!-- 列宽用 min-width 比例分配：项目名 30%、目录 30%、启用记忆 20%、操作 20% -->
      <el-table-column
        :label="t('project.name')"
        min-width="30"
        prop="name"
        show-overflow-tooltip
        class-name="project-name-cell"
      />
      <el-table-column
        :label="t('project.path')"
        min-width="30"
        prop="path"
        class-name="project-path-cell"
        :show-overflow-tooltip="{ popperClass: 'project-path-tooltip' }"
      />
      <el-table-column :label="t('agent.memoryEnabled')" min-width="20" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="row.memoryEnabled"
            @update:model-value="(value: boolean) => onMemoryToggle(row, value)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" min-width="20" align="center">
        <template #default="{ row }">
          <el-dropdown
            trigger="click"
            popper-class="project-action-dropdown"
            @command="(command: string) => onAction(row, command)"
          >
            <el-button text type="primary" class="action-trigger">
              {{ t('common.actions') }}
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="memory">
                  {{ t('agent.memoryView') }}
                </el-dropdown-item>
                <el-dropdown-item command="rename">
                  {{ t('project.rename') }}
                </el-dropdown-item>
                <el-dropdown-item command="reveal">
                  {{ revealLabel }}
                </el-dropdown-item>
                <el-dropdown-item command="delete" divided class="danger-item">
                  {{ t('project.delete') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('project.empty')" :image-size="80" />
      </template>
    </el-table>

    <ProjectMemoryDialog
      v-if="memoryProject"
      v-model:visible="memoryVisible"
      :project-id="memoryProject.id"
      :project-name="memoryProject.name"
      :memory-enabled="memoryProject.memoryEnabled"
    />
  </div>
</template>

<style scoped lang="scss">
.project-settings {
  font-size: var(--desk-font-base);
  --el-font-size-base: 14px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-tip {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.6;
}

/* 项目名：主信息稍加权重 */
.project-table :deep(.project-name-cell .cell) {
  font-weight: 500;
  color: var(--desk-text);
}

/* 目录：次要信息弱化，避免和项目名抢视觉 */
.project-table :deep(.project-path-cell .cell) {
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
}

/* 操作按钮：压缩内边距，避免窄列把下拉箭头截成省略号 */
.action-trigger {
  margin-left: 0;
  padding: 4px 6px;
}

/* 目录 tooltip：限制宽度并允许长路径换行 */
:global(.project-path-tooltip) {
  max-width: 480px;
}

:global(.project-path-tooltip .el-popper__content) {
  line-height: 1.6;
  word-break: break-all;
  white-space: normal;
}

/* 行操作下拉：删除项标红 */
:global(.project-action-dropdown .danger-item) {
  color: var(--el-color-danger);
}
</style>
