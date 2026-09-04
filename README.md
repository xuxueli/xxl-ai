# XXL-AI

XXL-AI 是一个AI应用开发平台，其核心设计目标是开发迅速、学习简单、轻量级、易扩展。现已开放源代码，开箱即用。

## 模块

| 模块 | 说明 |
|---|---|
| `xxl-ai-api` | 后端 API（Spring Boot），端口 8090，SSO 登录态存 Redis |
| `xxl-ai-ui` | Vue3 前端（Element Plus + TypeScript + Vite），端口 3000 |
| `doc/db` | 数据库初始化脚本（`xxl_ai`，含 AI 插件表） |
| `docker` | 一键部署栈（mysql + redis + api + ui） |

## 快速开始

前置环境：JDK 17+、Maven 3.6+、Node 18+、MySQL 8、Redis。

```bash
# 1. 初始化数据库
source doc/db/tables_xxl_ai.sql;                    # 建库 + 框架表 + 种子数据（含 Vue 分离模式菜单图标）

# 2. 启动后端 API（Redis 需先启动）
cd xxl-ai-api && mvn spring-boot:run                # 8090

# 3. 启动前端
cd xxl-ai-ui && npm i && npm run dev                # 3000（代理 /api → 8090）
```

或一键 docker 部署栈（默认账号 admin）：

```bash
cd docker && docker compose up -d --build
```