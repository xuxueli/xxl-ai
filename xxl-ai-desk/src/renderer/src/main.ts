/*
* 渲染进程入口：注册 Pinia/路由/i18n/Element Plus 与全局图标后挂载应用
* */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Brush,
  CaretRight,
  ChatDotRound,
  ChatLineRound,
  Check,
  CircleCheck,
  CircleClose,
  Clock,
  Close,
  Coin,
  Connection,
  CopyDocument,
  Cpu,
  Delete,
  Document,
  DocumentAdd,
  Edit,
  EditPen,
  Expand,
  Finished,
  Fold,
  Folder,
  FolderAdd,
  FolderOpened,
  FullScreen,
  Grid,
  HomeFilled,
  InfoFilled,
  Link,
  Loading,
  MagicStick,
  Minus,
  Monitor,
  MoreFilled,
  Notebook,
  Operation,
  PictureRounded,
  Plus,
  Promotion,
  QuestionFilled,
  Reading,
  Refresh,
  Search,
  SetUp,
  ShoppingCartFull,
  ShoppingTrolley,
  Setting,
  Timer,
  Tools,
  TopRight,
  Unlock,
  UploadFilled,
  User,
  VideoPause,
  View,
  WarningFilled
} from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'katex/dist/katex.min.css'
import App from '@renderer/App.vue'
import router from '@renderer/shell/router'
import '@renderer/shell/appSettings'
import { api } from '@common/renderer/api'
import { i18n } from '@renderer/shell/i18n'
import '@common/renderer/styles/index.scss'

/* 渲染进程入口 */
const app = createApp(App)

/* 按需注册图标（避免全量引入整套图标，减小打包体积） */
const icons = {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Brush,
  CaretRight,
  ChatDotRound,
  ChatLineRound,
  Check,
  CircleCheck,
  CircleClose,
  Clock,
  Close,
  Coin,
  Connection,
  CopyDocument,
  Cpu,
  Delete,
  Document,
  DocumentAdd,
  Edit,
  EditPen,
  Expand,
  Finished,
  Fold,
  Folder,
  FolderAdd,
  FolderOpened,
  FullScreen,
  Grid,
  HomeFilled,
  InfoFilled,
  Link,
  Loading,
  MagicStick,
  Minus,
  Monitor,
  MoreFilled,
  Notebook,
  Operation,
  PictureRounded,
  Plus,
  Promotion,
  QuestionFilled,
  Reading,
  Refresh,
  Search,
  SetUp,
  ShoppingCartFull,
  ShoppingTrolley,
  Setting,
  Timer,
  Tools,
  TopRight,
  Unlock,
  UploadFilled,
  User,
  VideoPause,
  View,
  WarningFilled
}
for (const [name, component] of Object.entries(icons)) {
  app.component(name, component)
}

/* 装配全局插件：状态管理、路由、国际化与 Element Plus 组件库 */
app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(ElementPlus)

/* 异常对象 → 可读文本（保留堆栈） */
function formatError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error)
}

/* 全局异常上报：Vue 渲染异常与未处理 Promise 统一写入主进程运行日志 */
app.config.errorHandler = (error, _instance, info) => {
  api.app.logError(`[vue] ${info}: ${formatError(error)}`)
}
window.addEventListener('unhandledrejection', (event) => {
  api.app.logError(`[promise] ${formatError(event.reason)}`)
})

app.mount('#app')
