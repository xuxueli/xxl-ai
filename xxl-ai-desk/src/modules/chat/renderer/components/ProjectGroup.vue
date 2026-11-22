<script setup lang="ts">
/*
 * 会话侧栏 - 单个项目分组：项目行（重命名 / 删除 / 打开所在文件夹）与其下会话列表。
 * @author xuxueli 2026-10-25
 */
import { ref } from 'vue'
import { ElMessage, ElMessageBox, type DropdownInstance } from 'element-plus'
import { useChatStore } from '@modules/chat/renderer'
import { useProjectStore } from '@modules/project/renderer'
import SidebarRow from '@renderer/shell/layout/components/Sidebar/SidebarRow.vue'
import { DeskTooltip } from '@common/renderer/components'
import { t } from '@common/renderer/i18n'
import type { ProjectDTO } from '@modules/project/shared'
import type { SessionDTO, SessionStatus } from '@modules/chat/shared'

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
const projectStore = useProjectStore()

/* 会话状态点：仅展示需要用户关注的运行态 / 异常态 */
const STATUS_LABEL_KEYS: Record<SessionStatus, string> = {
  idle: 'chat.status.idle',
  running: 'chat.status.running',
  'waiting-confirm': 'chat.status.waitingConfirm',
  completed: 'chat.status.completed',
  failed: 'chat.status.failed',
  aborted: 'chat.status.aborted'
}

/* 仅运行中 / 待确认 / 失败展示提示：进行中给反馈，需要用户时才常驻 */
function statusVisible(status: SessionStatus): boolean {
  return status === 'running' || status === 'waiting-confirm' || status === 'failed'
}

function statusLabel(status: SessionStatus): string {
  return t(STATUS_LABEL_KEYS[status])
}

/* 项目行下拉实例：右键项目名与悬浮「...」共用同一菜单 */
const projectMenu = ref<DropdownInstance>()

/* 会话行下拉实例：按会话 id 记录，右键会话名与悬浮「...」共用同一菜单 */
const sessionMenus = new Map<number, DropdownInstance>()

/* 打开项目操作菜单（右键项目名时调用，菜单锚定在行内「...」上） */
function openProjectMenu(): void {
  projectMenu.value?.handleOpen()
}

/* 绑定 / 解绑会话下拉实例 */
function bindSessionMenu(id: number, el: unknown): void {
  if (el) {
    sessionMenus.set(id, el as DropdownInstance)
  } else {
    sessionMenus.delete(id)
  }
}

/* 会话下拉 ref 绑定函数：按会话 id 缓存，避免每次渲染重建导致 ref 抖动 */
const sessionMenuRefs = new Map<number, (el: unknown) => void>()
function sessionMenuRef(id: number): (el: unknown) => void {
  let binder = sessionMenuRefs.get(id)
  if (!binder) {
    binder = (el: unknown): void => bindSessionMenu(id, el)
    sessionMenuRefs.set(id, binder)
  }
  return binder
}

/* 打开会话操作菜单（右键会话名时调用，菜单锚定在行内「...」上） */
function openSessionMenu(id: number): void {
  sessionMenus.get(id)?.handleOpen()
}

/* 会话操作下拉：重命名 / 删除 */
function onSessionCommand(session: SessionDTO, command: string): void {
  if (command === 'rename') {
    void onRenameSession(session)
  } else if (command === 'delete') {
    void onDeleteSession(session.id)
  }
}

/* 项目操作下拉：重命名 / 删除 / 打开所在文件夹 */
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
    <SidebarRow
      :title="project.path"
      @click="emit('toggle')"
      @contextmenu.prevent="openProjectMenu"
    >
      <template #icon>
        <el-icon class="project-icon">
          <FolderOpened v-if="expanded" />
          <FolderAdd v-else />
        </el-icon>
      </template>
      {{ project.name }}
      <template #actions>
        <span class="project-actions" @click.stop>
          <DeskTooltip :content="t('common.actions')">
            <el-dropdown ref="projectMenu" trigger="click" @command="onProjectCommand">
              <el-icon class="op"><MoreFilled /></el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">
                    <el-icon><EditPen /></el-icon>{{ t('project.rename') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="delete">
                    <el-icon><Delete /></el-icon>{{ t('project.delete') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="reveal" divided>
                    <el-icon><FolderOpened /></el-icon>{{ t('project.openFolder') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </DeskTooltip>
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
        @contextmenu.prevent="openSessionMenu(session.id)"
      >
        <span class="session-label">
          <span class="session-title">{{ session.title || t('chat.newChat') }}</span>
          <el-icon
            v-if="session.triggerType === 'schedule'"
            class="schedule-session-icon"
            :title="t('schedule.sessionBadge')"
          >
            <AlarmClock />
          </el-icon>
        </span>
        <template #actions>
          <span class="session-actions" @click.stop>
            <DeskTooltip :content="t('common.actions')">
              <el-dropdown
                :ref="sessionMenuRef(session.id)"
                trigger="click"
                @command="(command: string) => onSessionCommand(session, command)"
              >
                <el-icon class="op"><MoreFilled /></el-icon>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="rename">
                      <el-icon><EditPen /></el-icon>{{ t('chat.renameSession') }}
                    </el-dropdown-item>
                    <el-dropdown-item command="delete">
                      <el-icon><Delete /></el-icon>{{ t('chat.deleteSession') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </DeskTooltip>
            <span
              v-if="statusVisible(session.status)"
              class="session-status"
              :class="`session-status--${session.status}`"
              role="img"
              :title="statusLabel(session.status)"
              :aria-label="statusLabel(session.status)"
            >
              <span class="session-status-dot" />
            </span>
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
  /* 与扩展中心 / 设置等子菜单项图标同尺寸（14px） */
  font-size: var(--desk-icon-sm);
}

/* 行内操作：内容本身横排（悬浮展示由 SidebarRow 统一控制） */
.project-actions,
.session-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 会话行状态点：运行中单点闪烁，待确认 / 失败单点常驻，完成与终止不打扰 */
/* 状态点位于行尾操作区：操作图标隐藏时仍保持可见，靠右对齐 */
.session-status {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  visibility: visible;
}

.session-status-dot {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.session-status--waiting-confirm {
  color: var(--desk-info);
  opacity: 0.55;
}

.session-status--failed {
  color: var(--desk-danger);
  opacity: 0.55;
}

/* 运行中：单点闪烁，结束后自动消失 */
.session-status--running .session-status-dot {
  background: var(--desk-warning);
  animation: session-status-blink 1s ease-in-out infinite;
}

@keyframes session-status-blink {
  0%,
  100% {
    opacity: 0.2;
  }

  50% {
    opacity: 0.9;
  }
}

/* 减少动效偏好下保持静态可见，不做呼吸动画 */
@media (prefers-reduced-motion: reduce) {
  .session-status--running .session-status-dot {
    opacity: 0.55;
    animation: none;
  }
}

.session-empty {
  padding: 6px 12px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

/* 会话标题与定时标记：标题过长时省略，闹钟始终可见 */
.session-label {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.session-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 定时任务会话标记：标题后追加闹钟，不改变行高 */
.schedule-session-icon {
  flex-shrink: 0;
  font-size: var(--desk-icon-sm);
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
