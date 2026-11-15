/*
 * 会话属性选项：推理等级与权限模式的文案键及下拉选项。
 *   - 输入框与定时任务编辑共用，避免两处各写一份映射；
 *   - 文案统一取 chat.* 词条，保证同一概念在不同入口说法一致。
 * @author xuxueli 2026-11-15
 */

import { t } from '@common/renderer/i18n'
import { REASONING_LEVELS, type ReasoningLevel } from '@common/shared/model'
import { PERMISSION_MODES, type PermissionMode } from '@common/shared/permission'

/* 推理等级文案键：中英文均展示 Default / Low / High / Max 的本地化文案 */
export const REASONING_LABEL_KEYS: Record<ReasoningLevel, string> = {
  default: 'chat.reasoningDefault',
  low: 'chat.reasoningLow',
  high: 'chat.reasoningHigh',
  max: 'chat.reasoningMax'
}

/* 权限模式文案键 */
export const PERMISSION_LABEL_KEYS: Record<PermissionMode, string> = {
  'read-only': 'chat.permissionReadOnly',
  'workspace-write': 'chat.permissionWorkspaceWrite',
  'full-access': 'chat.permissionFullAccess'
}

/* 推理等级下拉选项 */
export function reasoningLevelOptions(): Array<{ value: ReasoningLevel; label: string }> {
  return REASONING_LEVELS.map((level) => ({
    value: level,
    label: t(REASONING_LABEL_KEYS[level])
  }))
}

/* 权限模式下拉选项 */
export function permissionModeOptions(): Array<{ value: PermissionMode; label: string }> {
  return PERMISSION_MODES.map((value) => ({
    value,
    label: t(PERMISSION_LABEL_KEYS[value])
  }))
}
