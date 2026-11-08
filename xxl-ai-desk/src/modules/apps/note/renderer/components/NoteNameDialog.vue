<script setup lang="ts">
/*
 * 笔记名称弹框：新建笔记 / 新建目录 / 重命名共用的轻量输入框。
 * @author xuxueli 2026-11-08
 */
import { nextTick, ref, watch } from 'vue'
import { ElInput } from 'element-plus'
import { t } from '@renderer/shell/i18n'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  title: string
  placeholder: string
  initialValue: string
}>()
const emit = defineEmits<{ submit: [name: string] }>()

const name = ref('')
const error = ref('')
const inputRef = ref<InstanceType<typeof ElInput>>()

/* 打开时回填名称并全选，便于直接覆盖输入 */
watch(visible, async (open) => {
  if (!open) {
    return
  }
  name.value = props.initialValue
  error.value = ''
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})

/* 确认：名称非空才提交，空名称就地提示 */
function confirm(): void {
  const value = name.value.trim()
  if (!value) {
    error.value = t('note.nameRequired')
    inputRef.value?.focus()
    return
  }
  visible.value = false
  emit('submit', value)
}
</script>

<template>
  <el-dialog v-model="visible" :title="title" width="380px" align-center append-to-body>
    <el-input
      ref="inputRef"
      v-model="name"
      :placeholder="placeholder"
      maxlength="120"
      @input="error = ''"
      @keyup.enter="confirm"
    />
    <div class="note-name-error">{{ error }}</div>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
/* 预留错误行高度，避免校验提示出现时弹框跳动 */
.note-name-error {
  min-height: 16px;
  margin-top: 6px;
  color: var(--desk-danger);
  font-size: var(--desk-font-xs);
  line-height: 16px;
}
</style>
