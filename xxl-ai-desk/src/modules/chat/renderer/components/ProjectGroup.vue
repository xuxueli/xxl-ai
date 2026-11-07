<script setup lang="ts">
/*
 * 会话侧栏 - 单个项目分组：项目行（重命名 / 显示 / 删除）与其下会话列表。
 * @author xuxueli 2026-10-25
 */
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '@modules/chat/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { useProjectStore } from '@modules/project/renderer'
import SidebarRow from '@renderer/shell/layout/components/Sidebar/SidebarRow.vue'
import { t } from '@renderer/shell/i18n'
import type { ProjectDTO } from '@modules/project/shared'
import type { SessionDTO } from '@modules/chat/shared'

const props = defineProps<{
  /* 项目及其下会话（已按当前排序方式排好） */
  project: ProjectDTO
  sessions: SessionDTO[]
  /* 是否展开 */
  expanded: boolean
  /* 当前选中会话（用于会话行高亮） */
  activeSessionId: number
}>()
const emit = defineEmits<{ toggle: []; select: [sessionId: number] }>()

const chat = useChatStore()
const settings = useSettingsStore()
const projectStore = useProjectStore()


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

/* 项目操作下拉：重命名 / 在文件管理器中显示 / 删除 */
function onProjectCommand(command: string): void {
  if (command === 'rename') {
    void onRenameProject()
  } else if (command === 'reveal') {
    void projectStore.revealProject(props.project.id)
  } else if (command === 'delete') {
    void onDeleteProject()
  }
}

/* 重命名项目 */
async function onRenameProject(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('', t('project.rename'), {
      inputValue: props.project.name,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
    const name = value?.trim()
    if (name && name !== props.project.name) {
      await projectStore.renameProject(props.project.id, name)
      ElMessage.success(t('project.renamed'))
    }
  } catch {
    /* 取消 */
  }
}

/* 删除项目：级联删除其下会话与消息，失败时给出明确反馈 */
async function onDeleteProject(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('project.deleteConfirm', [props.project.name]),
      t('project.delete'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    /* 取消 */
    return
  }
  try {
    await projectStore.removeProject(props.project.id)
    await chat.reloadSessions()
    ElMessage.success(t('project.deleted'))
  } catch (error) {
    ElMessage.error(t('common.deleteFailed', [(error as Error).message]))
  }
}

/* 重命名会话：弹框输入，取消或未改动则保持原值 */
async function onRenameSession(session: SessionDTO): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('', t('chat.renameSession'), {
      inputValue: session.title,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
    await chat.renameSession(session.id, value || session.title)
  } catch {
    /* 取消 */
  }
}

/* 删除会话：二次确认后移除，失败时给出明确反馈 */
async function onDeleteSession(id: number): Promise<void> {
  try {
    await ElMessageBox.confirm(
      chat.isStreaming(id) ? t('chat.deleteConfirmRunning') : t('chat.deleteConfirm'),
      t('chat.deleteSession'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    /* 取消 */
    return
  }
  try {
    await chat.removeSession(id)
    ElMessage.success(t('common.deleted'))
  } catch (error) {
    ElMessage.error(t('common.deleteFailed', [(error as Error).message]))
  }
}
</script>

<template>
  <div class="project-group">
    <SidebarRow :title="project.path" @click="emit('toggle')">
      <template #icon>
        <el-icon class="project-icon">
          <FolderOpened v-if="expanded" />
          <FolderAdd v-else />
        </el-icon>
      </template>
      {{ project.name }}
      <template #actions>
        <span class="project-actions" @click.stop>
          <el-dropdown trigger="click" @command="onProjectCommand">
            <el-icon class="op" :title="t('common.actions')"><MoreFilled /></el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename">
                  <el-icon><EditPen /></el-icon>{{ t('project.rename') }}
                </el-dropdown-item>
                <el-dropdown-item command="reveal">
                  <el-icon><FolderOpened /></el-icon>{{ revealLabel }}
                </el-dropdown-item>
                <el-dropdown-item command="delete" divided>
                  <el-icon><Delete /></el-icon>{{ t('project.delete') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-icon class="op" :title="t('project.rename')" @click="onRenameProject">
            <EditPen />
          </el-icon>
        </span>
      </template>
    </SidebarRow>

    <div v-if="expanded" class="project-sessions">
      <SidebarRow
        v-for="session in sessions"
        :key="session.id"
        dense
        :indent="16"
        :active="session.id === activeSessionId"
        @click="emit('select', session.id)"
      >
        {{ session.title || t('chat.newChat') }}
        <template #actions>
          <span class="session-actions" @click.stop>
            <el-icon class="op" @click="onRenameSession(session)"><EditPen /></el-icon>
            <el-icon class="op" @click="onDeleteSession(session.id)"><Delete /></el-icon>
          </span>
        </template>
      </SidebarRow>
      <div v-if="sessions.length === 0" class="session-empty">
        {{ t('project.noSession') }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.project-group {
  margin-bottom: 2px;
}

.project-icon {
  flex-shrink: 0;
  font-size: var(--desk-font-md);
}

/* 行内操作：内容本身横排（悬浮展示由 SidebarRow 统一控制） */
.project-actions,
.session-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.session-empty {
  padding: 6px 12px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.op {
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}

.op:hover {
  color: var(--desk-primary);
}
</style>
