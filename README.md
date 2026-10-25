# 激光设备售后维修维保系统

美团式派单 + 滴滴式抢单的激光设备售后维修平台，包含 **客户端**、**工程师端**、**客服后台** 三个应用和一套 NestJS 后端。

## 功能概览

| 模块 | 核心能力 |
|---|---|
| 客户 App / Web | 设备扫码绑定、快速故障报修、30% 定金预支付、订单追踪、AI 智能客服、评价与退款、实时聊天 |
| 工程师 App / Web | 在线/离线/工作中状态切换、订单池抢单、GPS 实时定位、拍照打卡（时间戳水印）、签名确认、AI 助手、阶梯提成收益统计 |
| 客服后台 | 工单管理与远程诊断、客服工作台（实时会话 + 待接入队列）、客户/工程师/设备管理、配件库存、数据统计 |
| 后端 | NestJS + TypeORM + PostgreSQL + Redis + Socket.IO，内置阿里云百炼（通义千问）AI 集成 |

## 快速开始

### 环境要求

- Node.js 18+ （推荐 20 LTS）
- Docker Desktop（用于运行 PostgreSQL + Redis）
- npm

### 一键启动（Windows）

```bash
start-local.bat     # 启动全部服务
stop-local.bat      # 停止全部服务
```

脚本会自动完成：复制 `.env.example` → `.env` → 安装依赖 → 启动 Docker 容器 → 启动后端 → 导入演示数据 → 启动三个前端。

### 手动启动

**1. 数据库与缓存**

```bash
cd backend
docker-compose up -d
```

**2. 后端**

```bash
cd backend
cp .env.example .env      # Windows: copy .env.example .env
npm install
npm run build
npm run start:dev          # http://localhost:8080
```

后端首次启动时 TypeORM 会自动建表（`NODE_ENV=development` 下 `synchronize=true`）。

**3. 导入演示数据（可选）**

```bash
cd backend
npm run db:seed
```

会清空业务表并导入 17 个客户、7 个工程师、16 台设备、49 条工单等演示数据。
（也可以用 `psql` 手动执行 `backend/database/seed-data.sql`。）

**4. 客服后台**

```bash
cd apps/cs-admin
npm install
BROWSER=none npm start     # http://localhost:3000
```

**5. Web 端**

```bash
cd apps/customer-app-web  && npx serve -l 3001 .
cd apps/engineer-app-web  && npx serve -l 3002 .
```

- 客户端： http://localhost:3001/login.html
- 工程师端： http://localhost:3002/login.html

也可以直接用浏览器打开 `apps/customer-app-web/home.html`（不经过 HTTP 服务时部分接口会受浏览器同源策略限制，建议用 `serve`）。

**6. 移动端（可选）**

```bash
cd apps/customer-app && npx expo start
cd apps/engineer-app && npx expo start
```

## 测试账号

测试模式下验证码固定为 `000000`，任意手机号 + `000000` 均可登录（客服端为固定虚拟账号）。

| 角色 | 手机号 | 验证码 |
|---|---|---|
| 客服后台 / 客户端 | `13800138000` | `000000` |
| 工程师端 | `13900000002` | `000000` |
| 客户端（其他示例） | `13900000001` | `000000` |

## 目录结构

```
.
├── apps/
│   ├── customer-app/         # 客户 App (React Native / Expo)
│   ├── engineer-app/         # 工程师 App (React Native / Expo)
│   ├── customer-app-web/     # 客户 App Web 版 (HTML + Tailwind CDN→本地化)
│   ├── engineer-app-web/     # 工程师 App Web 版 (HTML + Tailwind CDN→本地化)
│   └── cs-admin/             # 客服后台 (React + Ant Design)
├── backend/                  # NestJS 后端
│   ├── database/
│   │   ├── seed-data.sql     # 演示数据
│   │   └── seed.mjs          # 种子导入脚本
│   ├── docker-compose.yml    # PostgreSQL 16 + Redis 7
│   └── src/
├── packages/shared/          # 共享类型定义
├── openspec/                 # OpenSpec 变更记录
├── start-local.bat
└── stop-local.bat
```

## API 地址自适应

前端不写死后端地址，运行时按当前页面主机名推导：

```js
const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080`;
```

因此同一份构建产物在本地（`localhost`）和云端（服务器 IP）都能工作，无需重新打包。
需要覆盖时设置环境变量 `REACT_APP_API_BASE`（客服后台）。

## 静态资源本地化

Web 端不依赖任何境外 CDN：

- `tailwind.js` —— Tailwind Play CDN v3.4.17 本地副本
- `fonts/main.css` —— 主题样式
- `fonts/material-symbols.css` + `fonts/material-symbols-outlined.woff2` —— Material Symbols 图标字体

图标字体较大（4MB），如需减小仓库体积可考虑 Git LFS。

## 提成规则

| 月订单量 | 提成比例 |
|---------|---------|
| 1-10 单 | 20% |
| 11-30 单 | 25% |
| 31+ 单 | 30% |

每月 1 日重置。

## 常见问题

**页面排版全乱** —— 检查 `tailwind.js` 和 `fonts/` 目录是否存在。缺失时页面会回退到无样式渲染。

**后端报 `[Redis] 连接错误`** —— Redis 容器没起来。执行 `cd backend && docker-compose up -d`，ioredis 会自动重连。

**登录提示「未登录或登录已过期」** —— 这是正常的鉴权行为，需要先登录。登录后 token 存在 `localStorage`（客服端 `cs_admin_token`，客户端 `customer_token`，工程师端 `engineer_token`）。

**接口 404** —— 后端路由没有 `/api` 前缀，实际路径是 `/auth/*`、`/admin/*`、`/engineer/*`、`/ai/*`。

**AI 功能不可用** —— `.env` 里的 `DASHSCOPE_API_KEY` 为空。申请地址：https://bailian.console.aliyun.com/

## 安全提示

- `backend/.env` 已被 `.gitignore` 排除，**不要**提交到版本库
- 生产环境务必替换 `JWT_SECRET`
- `scripts/*.py` 中若包含第三方服务密钥，请改为从环境变量读取
