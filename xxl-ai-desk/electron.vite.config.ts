import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

/* XXL-AI Desk 构建配置：主/预加载/渲染三进程统一由 electron-vite 管理 */
export default defineConfig({
  main: {
    /* 主进程：Pi 运行时与本地依赖保持外部化，不打包进 bundle */
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main')
      }
    },
    build: {
      rollupOptions: {
        /* 双入口：主进程 + Agent 运行时进程（utilityProcess） */
        input: {
          index: resolve('src/main/index.ts'),
          'agent/worker': resolve('src/main/agent/worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [vue()]
  }
})
