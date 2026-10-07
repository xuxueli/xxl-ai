<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '../i18n'
import { useSettingsStore } from '../stores/settings'
import { useProjectStore } from '../stores/project'
import logo from '../assets/favicon.ico'

/* 空态欢迎页：Logo + 标题 + 项目选择（输入框由对话页居中承载于其下） */
const settings = useSettingsStore()
const project = useProjectStore()

/* 当前项目名（未选择时展示占位文案） */
const currentProjectName = computed(
  () => project.projects.find((item) => item.id === project.currentId)?.name || t('project.selectProject')
)

/* 选择项目；选到「新建项目」时弹出目录选择并自动生成 */
async function onProjectChange(value: string): Promise<void> {
  if (value === '__new__') {
    try {
      await project.createProject()
    } catch (error) {
      ElMessage.error((error as Error).message)
    }
    return
  }
  project.selectProject(value)
}
</script>

<template>
  <div class="empty-state">
    <img class="empty-logo" :src="logo" alt="logo" />
    <h1 class="empty-title">{{ settings.settings.slogan || t('chat.emptyTitle') }}</h1>
    <!-- 新建对话：项目选择（原「示例/输入」提示文案位置） -->
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
</template>

<style scoped lang="scss">
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 24px;
}

.empty-logo {
  width: 51px;
  height: 51px;
  border-radius: 14px;
  object-fit: contain;
  margin-bottom: 24px;
  box-shadow: var(--desk-shadow);
}

.empty-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 10px;
}

/* 项目选择：原空态副标题位置，作为可点击下拉触发器 */
.project-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 420px;
  margin: 0 0 20px;
  padding: 6px 14px;
  border: 1px solid var(--desk-border-soft);
  border-radius: 10px;
  background: var(--desk-bg-elevated);
  color: var(--desk-text-secondary);
  font-size: 14px;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
}

.project-trigger:hover {
  border-color: var(--desk-primary);
  color: var(--desk-primary);
}

.project-trigger .project-icon,
.project-trigger .project-arrow {
  flex-shrink: 0;
  font-size: 14px;
}

.project-trigger .project-name {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
