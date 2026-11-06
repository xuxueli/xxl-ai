import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

/* XXL-AI-Desk 构建配置：主/预加载/渲染三进程统一由 electron-vite 管理 */
export default defineConfig({
  main: {
    /* 主进程：Pi 运行时与本地依赖保持外部化，不打包进 bundle */
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@preload': resolve('src/preload'),
        '@common': resolve('src/common'),
        '@modules': resolve('src/modules')
      }
    },
    build: {
      rollupOptions: {
        /* 双入口：主进程 + Agent 运行时进程（utilityProcess） */
        input: {
          index: resolve('src/main/index.ts'),
          'agent/worker/worker': resolve('src/modules/agent/worker/worker.ts')
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
        '@common': resolve('src/common'),
        '@modules': resolve('src/modules'),
        /* 项目级静态资源（图标等），需与 electron-builder 打包资源保持一致 */
        '@resources': resolve('resources'),
        '@': resolve('src/renderer/src')
      }
    },
    /* 渲染根目录为 src/renderer，允许读取项目根下的 resources 目录 */
    server: {
      fs: { allow: [resolve('.')] }
    },
    plugins: [vue()]
  }
})
