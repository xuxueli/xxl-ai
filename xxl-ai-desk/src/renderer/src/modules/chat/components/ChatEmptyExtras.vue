<script setup lang="ts">
/*
 * 对话空态扩展：项目选择与示例入口（位于输入框下方）。
 * @author xuxueli 2026-10-25
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@renderer/stores/project'
import { ipcErrorMessage } from '@renderer/utils/ipcError'
import { t } from '@renderer/i18n'

const emit = defineEmits<{ example: [text: string] }>()

const project = useProjectStore()

/* 空态项目选择：当前项目名（未选择时展示占位文案） */
const currentProjectName = computed(
  () => project.currentProject?.name || t('project.selectProject')
)

/* 选择项目；选到「新建项目」时弹出目录选择并自动生成 */
async function onProjectChange(value: string): Promise<void> {
  if (value === '__new__') {
    try {
      await project.createProject()
    } catch (error) {
      ElMessage.error(ipcErrorMessage(error))
    }
    return
  }
  project.selectProject(value)
}

/* 空态示例：点击直接以该内容发起新对话 */
const examples = ['chat.suggestion1', 'chat.suggestion2', 'chat.suggestion3']
</script>

<template>
  <!-- 空态：项目选择（输入框下方、左对齐输入框左边、固定宽度） -->
  <div class="empty-project">
    <div class="empty-project-inner">
      <el-dropdown trigger="click" @command="onProjectChange">
        <span class="project-trigger" :title="t('project.label')">
          <el-icon class="project-icon"><Folder /></el-icon>
          <span class="project-name">{{ currentProjectName }}</span>
          <el-icon class="project-arrow"><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="__new__">+ {{ t('project.new') }}</el-dropdown-item>
            <el-dropdown-item v-for="item in project.projects" :key="item.id" :command="item.id">
              {{ item.name }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>

  <!-- 空态示例：输入框下方以文字入口平铺，点击直接发起对话 -->
  <div class="empty-examples">
    <span class="examples-label">{{ t('chat.examplesLabel') }}</span>
    <template v-for="(key, index) in examples" :key="key">
      <span v-if="index > 0" class="examples-sep">{{ t('chat.examplesSep') }}</span>
      <a class="example-link" @click="emit('example', t(key))">{{ t(key) }}</a>
    </template>
  </div>
</template>

<style scoped lang="scss">
/* 空态项目选择：紧贴输入框下沿，宽度比输入框略窄、居中 */
.empty-project {
  flex-shrink: 0;
  /* 抵消输入框容器底部 22px 内边距，使背景框紧贴输入框 */
  margin-top: -22px;
  /* 与输入框容器相同的左右留白，保证两者同宽居中 */
  padding: 0 calc(var(--desk-chat-gutter) + var(--desk-scrollbar-size)) 10px;
}

/* 背景框：比输入框（880px）略窄、居中；浅灰底、圆角，内容靠左 */
.empty-project-inner {
  max-width: 840px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 34px;
  padding: 0 10px;
  background: var(--desk-segment-bg);
  border-radius: 0 0 12px 12px;
}

/* 项目选择：可点击下拉触发器，固定宽度不随项目名长短变化 */
.project-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 150px;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-base);
  cursor: pointer;
  outline: none;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.project-trigger:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.project-trigger .project-icon,
.project-trigger .project-arrow {
  flex-shrink: 0;
  font-size: var(--desk-font-base);
}

.project-trigger .project-name {
  flex: 1;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 空态示例：与输入框同宽居中，纯文字入口（无背景框） */
.empty-examples {
  flex-shrink: 0;
  width: 100%;
  max-width: var(--desk-chat-width);
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0 calc(var(--desk-chat-gutter) + var(--desk-scrollbar-size)) 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}

.examples-label {
  color: var(--desk-text-tertiary);
}

.examples-sep {
  color: var(--desk-text-tertiary);
  margin: 0 2px;
}

.example-link {
  color: var(--desk-text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.example-link:hover {
  color: var(--desk-primary);
  text-decoration: underline;
}
</style>
