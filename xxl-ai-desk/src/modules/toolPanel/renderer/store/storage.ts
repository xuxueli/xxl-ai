/* 工具面板状态持久化：版本校验、防抖与失效清理；终端运行时字段不落盘 */

import { createSessionScopedStorage } from '@common/renderer/utils/sessionScopedStorage'
import {
  STORAGE_PREFIX,
  STORAGE_VERSION,
  normalizeState,
  type ToolPanelState
} from '@modules/toolPanel/renderer/store/state'

export const toolPanelStorage = createSessionScopedStorage<ToolPanelState>({
  prefix: STORAGE_PREFIX,
  version: STORAGE_VERSION,
  toStored: (state) => ({
    ...state,
    terminalPanel: { ...state.terminalPanel, tabs: [], activeId: '' }
  }),
  fromStored: (raw) => normalizeState(raw)
})
