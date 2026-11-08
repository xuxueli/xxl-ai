<script setup lang="ts">
/*
 * 选择面板：单选 / 多选标准组件，支持「其他」自由输入。
 *   - 单选与「其他」互斥，多选可与普通选项叠加；
 *   - 自定义文本与已有选项按标签/值归一，空值按必选规则拦截；
 *   - 自定义项仅对本次交互生效。
 *
 * @author xuxueli 2026-10-31
 */
import { computed, nextTick, ref, watch } from 'vue'
import { t } from '@renderer/shell/i18n'
import type { ChoiceInteractionRequest, InteractionResult } from '@modules/chat/shared'

const props = defineProps<{ request: ChoiceInteractionRequest }>()
const emit = defineEmits<{ respond: [result: InteractionResult] }>()

/* 候选选项 */
const options = computed(() => props.request.options)
/* 是否多选 */
const multiple = computed(() => props.request.multiple)
/* 是否允许自定义项 */
const allowOther = computed(() => props.request.allowOther)

/* 「其他」占位值：与真实选项值区分（真实选项占用时自动追加后缀） */
const OTHER_BASE = '__other__'
const otherValue = computed(() => {
  let value = OTHER_BASE
  while (options.value.some((item) => item.value === value)) {
    value += '_'
  }
  return value
})

/* 单选值 / 多选值 / 自定义文本 / 校验提示 */
const single = ref('')
const multi = ref<string[]>([])
const otherText = ref('')
const error = ref('')

/* 是否展开「其他」输入框 */
const showOther = computed(() =>
  multiple.value ? multi.value.includes(otherValue.value) : single.value === otherValue.value
)

/* 选中「其他」后自动聚焦输入框，减少一次点击 */
const otherInputRef = ref()
watch(showOther, (visible) => {
  if (visible) {
    nextTick(() => otherInputRef.value?.focus())
  }
})

/* 用户重新选择后清空上一次校验提示 */
watch([single, multi, otherText], () => {
  error.value = ''
})

/* 当前已选值（不含「其他」占位） */
function pickedValues(): string[] {
  if (multiple.value) {
    return multi.value.filter((item) => item !== otherValue.value)
  }
  return single.value && single.value !== otherValue.value ? [single.value] : []
}

/* 提交：归一自定义项、去重并做必选校验 */
function submit(): void {
  const picked = pickedValues()

  if (showOther.value) {
    const text = otherText.value.trim().slice(0, 200)
    if (text) {
      const matched = options.value.find((item) => item.label === text || item.value === text)
      picked.push(matched ? matched.value : text)
    }
  }

  const values = [...new Set(picked)]
  if (values.length === 0) {
    error.value = t('chat.interaction.required')
    return
  }
  emit('respond', {
    status: 'submitted',
    value: multiple.value ? values : (values[0] ?? '')
  })
}

/* 取消：按拒绝回传，模型可据此调整 */
function cancel(): void {
  emit('respond', { status: 'denied' })
}
</script>

<template>
  <div class="choice-panel">
    <p v-if="multiple" class="hint">{{ t('chat.interaction.multiHint') }}</p>

    <el-radio-group v-if="!multiple" v-model="single" class="options">
      <el-radio v-for="option in options" :key="option.value" :value="option.value" class="option">
        <span class="option-line">
          <span class="option-label">{{ option.label }}</span>
          <span v-if="option.description" class="option-desc">{{ option.description }}</span>
        </span>
      </el-radio>
      <el-radio v-if="allowOther" :value="otherValue" class="option option-other">
        <span class="option-line">
          <span class="option-label">{{ t('chat.interaction.other') }}</span>
        </span>
      </el-radio>
    </el-radio-group>

    <el-checkbox-group v-else v-model="multi" class="options">
      <el-checkbox v-for="option in options" :key="option.value" :value="option.value" class="option">
        <span class="option-line">
          <span class="option-label">{{ option.label }}</span>
          <span v-if="option.description" class="option-desc">{{ option.description }}</span>
        </span>
      </el-checkbox>
      <el-checkbox v-if="allowOther" :value="otherValue" class="option option-other">
        <span class="option-line">
          <span class="option-label">{{ t('chat.interaction.other') }}</span>
        </span>
      </el-checkbox>
    </el-checkbox-group>

    <el-input
      v-if="showOther"
      ref="otherInputRef"
      v-model="otherText"
      class="other-input"
      maxlength="200"
      :placeholder="t('chat.interaction.otherPlaceholder')"
    />

    <p v-if="error" class="error">{{ error }}</p>

    <div class="footer">
      <span v-if="(request.total ?? 0) > 1" class="round">
        {{ request.round }}/{{ request.total }}
      </span>
      <div class="footer-actions">
        <el-button @click="cancel">{{ t('chat.interaction.cancel') }}</el-button>
        <el-button type="primary" @click="submit">{{ t('chat.interaction.submit') }}</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.choice-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint {
  margin: 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

/* 选项改为可点击卡片：左侧选择控件，右侧标题与说明同一行排布，避免每项占两行 */
.choice-panel .options {
  display: flex;
  flex-direction: column;
  /* Element Plus 默认 flex-wrap: wrap，竖向排列 + 限高会把超出的选项折成新列并产生横向滚动 */
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
  /* 选项可能多达 20 个：限高后只做纵向滚动，保证底部操作区始终可见 */
  max-height: min(320px, 42vh);
  padding-right: 2px;
  overflow-x: hidden;
  overflow-y: auto;
}

.option {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: auto;
  margin: 0;
  padding: 10px 12px;
  align-items: flex-start;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-surface-content);
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.option:hover {
  border-color: var(--desk-input-border-hover);
  background: var(--desk-primary-soft);
}

.option.is-checked {
  border-color: var(--desk-input-border-focus);
  background: color-mix(in srgb, var(--desk-primary) 6%, var(--desk-surface-content));
}

/* 多行说明时选择控件与首行文字对齐 */
.option :deep(.el-radio__input),
.option :deep(.el-checkbox__input) {
  margin-top: 3px;
}

.option :deep(.el-radio__label),
.option :deep(.el-checkbox__label) {
  display: block;
  flex: 1;
  min-width: 0;
  padding-left: 10px;
  line-height: 1.5;
  white-space: normal;
}

.option-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 10px;
  min-width: 0;
}

.option-label {
  color: var(--desk-text);
  font-size: var(--desk-font-base);
}

.option-desc {
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

/* 「其他」是补充入口，用虚线区分；选中后转为实线卡片 */
.option-other {
  border-style: dashed;
}

.option-other.is-checked {
  border-style: solid;
}

.error {
  margin: 0;
  font-size: var(--desk-font-sm);
  color: var(--el-color-danger);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
  padding-top: 14px;
  border-top: 1px solid var(--desk-border-soft);
}

/* 多问题进度：左侧固定展示当前轮次 */
.round {
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  font-variant-numeric: tabular-nums;
}

.footer-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
</style>
