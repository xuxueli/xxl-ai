/*
 * 笔记应用 IPC 通道。
 * @author xuxueli 2026-11-08
 */

export const NOTE_IPC = {
  getSettings: 'desk:note:get-settings',
  saveSettings: 'desk:note:save-settings',
  selectStorageDir: 'desk:note:select-storage-dir',
  list: 'desk:note:list',
  read: 'desk:note:read',
  write: 'desk:note:write',
  createNote: 'desk:note:create-note',
  createFolder: 'desk:note:create-folder',
  rename: 'desk:note:rename',
  trash: 'desk:note:trash',
  pickImages: 'desk:note:pick-images',
  saveImage: 'desk:note:save-image',
  watch: 'desk:note:watch',
  unwatch: 'desk:note:unwatch',
  change: 'desk:note:change'
} as const
