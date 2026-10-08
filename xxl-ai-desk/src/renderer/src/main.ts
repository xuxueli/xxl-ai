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
  Calendar,
  CaretBottom,
  CaretRight,
  ChatDotRound,
  ChatLineRound,
  Check,
  CircleCheck,
  CircleClose,
  Clock,
  Close,
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
  FolderOpened,
  FullScreen,
  Loading,
  Monitor,
  MoreFilled,
  Plus,
  Promotion,
  Reading,
  Refresh,
  Search,
  Setting,
  ScaleToOriginal,
  Tools,
  TopRight,
  User,
  VideoPause,
  WarningFilled
} from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import './styles/index.scss'

/* 渲染进程入口 */
const app = createApp(App)

/* 按需注册图标（避免全量引入整套图标，减小打包体积） */
const icons = {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CaretBottom,
  CaretRight,
  ChatDotRound,
  ChatLineRound,
  Check,
  CircleCheck,
  CircleClose,
  Clock,
  Close,
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
  FolderOpened,
  FullScreen,
  Loading,
  Monitor,
  MoreFilled,
  Plus,
  Promotion,
  Reading,
  Refresh,
  Search,
  Setting,
  ScaleToOriginal,
  Tools,
  TopRight,
  User,
  VideoPause,
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
app.mount('#app')
