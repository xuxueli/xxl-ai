/// <reference types="vite/client" />

/* 渲染进程类型声明：为 vite 与 .vue 单文件组件提供类型支持 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
