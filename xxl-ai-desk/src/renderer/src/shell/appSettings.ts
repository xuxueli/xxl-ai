/*
 * 内置应用设置面板注册：新增应用时在此登记，appCenter 按 appId 取用。
 * @author xuxueli 2026-11-08
 */

import { registerAppSettings } from '@modules/appCenter/renderer'
import { NoteSettingsDrawer } from '@modules/apps/note/renderer'

registerAppSettings('note', NoteSettingsDrawer)
