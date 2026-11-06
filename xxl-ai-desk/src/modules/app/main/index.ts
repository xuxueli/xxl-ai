/*
 * app 模块主进程公共出口。
 * @author xuxueli 2026-11-07
 */

export { buildRuntimePath, getRuntimeShellDir, runtimePathPrefix } from './envService'
export { registerAppIpc } from './ipc'
export { registerLocalFileProtocol } from './localFileProtocol'
