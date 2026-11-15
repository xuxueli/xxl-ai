<script setup lang="ts">
/*
 * 会话诊断面板：内层两个 Tab（会话消息 / 模型通讯），内容按会话隔离。
 *   - 仅开发者模式可见，入口由 ToolPanel 控制；
 *   - 大列表分页交给子组件，本组件只负责 Tab 切换与切会话复位。
 * @author xuxueli 2026-11-01
 */
import { ref, watch } from 'vue'
import { t } from '@common/renderer/i18n'
import SessionMessageList from '@modules/diagnostics/renderer/components/diagnostics/SessionMessageList.vue'
import ModelTraceList from '@modules/diagnostics/renderer/components/diagnostics/ModelTraceList.vue'

const props = defineProps<{
  /* 当前会话 */
  sessionId: string
  /* 面板是否处于可见激活态（用于按需加载与轮询刷新） */
  active?: boolean
}>()

/* 内层 Tab：会话消息 / 模型通讯 */
const activeTab = ref<'messages' | 'traces'>('messages')

/* 切换会话回到会话消息，避免停留在上一会话的通讯页 */
watch(
  () => props.sessionId,
  () => {
    activeTab.value = 'messages'
  }
)
</script>

<template>
  <div class="diagnostics-panel">
    <el-tabs v-model="activeTab" class="diagnostics-tabs">
      <el-tab-pane :label="t('toolPanel.diagnostics.messages')" name="messages" lazy>
        <SessionMessageList
          :session-id="props.sessionId"
          :active="Boolean(props.active) && activeTab === 'messages'"
        />
      </el-tab-pane>
      <el-tab-pane :label="t('toolPanel.diagnostics.traces')" name="traces" lazy>
        <ModelTraceList
          :session-id="props.sessionId"
          :active="Boolean(props.active) && activeTab === 'traces'"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.diagnostics-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* Tab 头压缩高度，列表占满剩余空间 */
.diagnostics-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* Tab 头与其它工具面板的二级工具栏对齐 */
.diagnostics-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 8px;
  height: var(--desk-toolbar-height);
  background: var(--desk-bg-elevated);
}

.diagnostics-tabs :deep(.el-tabs__item) {
  height: var(--desk-toolbar-height);
  line-height: var(--desk-toolbar-height);
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}

.diagnostics-tabs :deep(.el-tabs__item.is-active) {
  color: var(--desk-primary);
}

/* 底部指示线收敛为 1px，与其它工具条边框一致 */
.diagnostics-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: var(--desk-border);
}

.diagnostics-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.diagnostics-tabs :deep(.el-tab-pane) {
  height: 100%;
}
</style>
