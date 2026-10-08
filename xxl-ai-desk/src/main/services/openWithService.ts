/*
 * 「打开方式」应用探测与调用。
 *   - macOS：探测常见编辑器应用（存在即列出），经 `open -a` 指定应用打开。
 *   - 其它平台：不提供服务清单，回退系统默认应用（shell.openPath）。
 */

import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { shell } from 'electron'
import type { OpenWithApp } from '../../shared/ipc'

/* macOS 常见可打开文本/代码的应用（按存在性过滤） */
const MAC_APPS: OpenWithApp[] = [
  { name: 'Visual Studio Code', path: '/Applications/Visual Studio Code.app' },
  { name: 'Cursor', path: '/Applications/Cursor.app' },
  { name: 'Sublime Text', path: '/Applications/Sublime Text.app' },
  { name: 'Typora', path: '/Applications/Typora.app' },
  { name: 'IntelliJ IDEA', path: '/Applications/IntelliJ IDEA.app' },
  { name: 'WebStorm', path: '/Applications/WebStorm.app' },
  { name: 'Xcode', path: '/Applications/Xcode.app' },
  { name: 'TextEdit', path: '/System/Applications/TextEdit.app' }
]

/* 列出本机可用的「打开方式」应用 */
export function listOpenWithApps(): OpenWithApp[] {
  if (process.platform !== 'darwin') {
    return []
  }
  return MAC_APPS.filter((item) => existsSync(item.path))
}

/* 用指定应用打开文件；未提供应用时回退系统默认应用 */
export async function openWith(appPath: string, file: string): Promise<void> {
  if (process.platform === 'darwin' && appPath) {
    await new Promise<void>((resolve, reject) => {
      execFile('open', ['-a', appPath, file], (error) => (error ? reject(error) : resolve()))
    })
    return
  }
  await shell.openPath(file)
}
