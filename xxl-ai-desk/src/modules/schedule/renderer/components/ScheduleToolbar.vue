/*
 * 任务列表工具栏：关键词 / 项目 / Agent / 状态筛选、结果计数与新建入口。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { useProjectStore } from '@modules/project/renderer'
import { useAgentStore } from '@modules/agent/renderer'
import { useScheduleStore } from '@modules/schedule/renderer'
import { t } from '@common/renderer/i18n'

const emit = defineEmits<{ create: [] }>()

const schedule = useScheduleStore()
const project = useProjectStore()
const agent = useAgentStore()
</script>

<template>
  <div class="schedule-toolbar">
    <div class="toolbar-filters">
      <el-input
        v-model="schedule.filters.keyword"
        class="filter-search"
        clearable
        :placeholder="t('schedule.searchPlaceholder')"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-select
        v-model="schedule.filters.projectId"
        class="filter-select"
        :placeholder="t('schedule.allProjects')"
      >
        <el-option :label="t('schedule.allProjects')" :value="0" />
        <el-option
          v-for="item in project.projects"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
      <el-select
        v-model="schedule.filters.agentId"
        class="filter-select"
        :placeholder="t('schedule.allAgents')"
      >
        <el-option :label="t('schedule.allAgents')" :value="0" />
        <el-option
          v-for="item in agent.agents"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
      <el-select v-model="schedule.filters.status" class="filter-status">
        <el-option :label="t('schedule.allStatus')" value="all" />
        <el-option :label="t('schedule.status.enabled')" value="enabled" />
        <el-option :label="t('schedule.status.disabled')" value="disabled" />
      </el-select>
      <el-button text class="filter-reset" @click="schedule.resetFilters()">
        <el-icon><Refresh /></el-icon>
        {{ t('schedule.reset') }}
      </el-button>
    </div>

    <div class="toolbar-actions">
      <span class="result-count">{{ t('schedule.total', [schedule.filteredTasks.length]) }}</span>
      <el-button type="primary" @click="emit('create')">
        <el-icon><Plus /></el-icon>
        {{ t('schedule.new') }}
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.schedule-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin-bottom: 14px;
}

.toolbar-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  min-width: 0;
}

.filter-search {
  width: 240px;
}

.filter-select {
  width: 148px;
}

.filter-status {
  width: 132px;
}

.filter-reset {
  padding: 4px 8px;
  color: var(--desk-text-tertiary);
}

.filter-reset:hover {
  color: var(--desk-primary);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
  margin-left: auto;
}

.result-count {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  white-space: nowrap;
}
</style>
