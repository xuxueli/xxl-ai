import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import {
  ArrowDown,
  ArrowLeft,
  Calendar,
  CaretBottom,
  CaretRight,
  ChatDotRound,
  ChatLineRound,
  Check,
  CircleCheck,
  CircleClose,
  Close,
  CopyDocument,
  Cpu,
  Delete,
  Edit,
  EditPen,
  Expand,
  Fold,
  Folder,
  FolderOpened,
  Loading,
  MoreFilled,
  Plus,
  Promotion,
  Reading,
  Refresh,
  Search,
  Setting,
  Tools,
  User,
  VideoPause
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
  Calendar,
  CaretBottom,
  CaretRight,
  ChatDotRound,
  ChatLineRound,
  Check,
  CircleCheck,
  CircleClose,
  Close,
  CopyDocument,
  Cpu,
  Delete,
  Edit,
  EditPen,
  Expand,
  Fold,
  Folder,
  FolderOpened,
  Loading,
  MoreFilled,
  Plus,
  Promotion,
  Reading,
  Refresh,
  Search,
  Setting,
  Tools,
  User,
  VideoPause
}
for (const [name, component] of Object.entries(icons)) {
  app.component(name, component)
}

app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(ElementPlus)
app.mount('#app')
