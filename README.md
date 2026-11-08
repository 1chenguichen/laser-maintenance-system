# 激光设备售后维修维保系统

美团式派单 + 滴滴式抢单的激光设备售后维修平台，包含 **客户端 H5**、**工程师端 H5**、**企业管理后台**、**维保云平台端** 四个使用端和一套 NestJS 后端。


## 当前演示版本（2026-11）

本项目处于业务验证与作品集演示阶段。手机端当前为 H5，不是已上架的原生 App；物联网使用模拟设备上报，尚未接入真实硬件。在线支付、真实短信及 AI 能力需要分别配置相应服务，不表示所有第三方能力已完成生产验收。

| 使用端 | 本地演示入口 | 用途 |
|---|---|---|
| 企业管理后台 | http://localhost:3100 | 企业客户、设备、工程师、工单、库存、合同与设备监控 |
| 客户端／企业手机工作台 | http://localhost:3101 | 客户报修及服务查询；获授权企业账号查看本企业监测 |
| 工程师端 | http://localhost:3102 | 任务处理、移动仓、培训与维修辅助 |
| 维保云平台 | http://localhost:3103 | 企业开通、服务组织与委托、平台服务运营及全国监测 |

四端共用后端（当前本地演示为 8180 端口）。企业业务数据按租户隔离；平台协作订单另按业务关系授权。物联网代码分别位于 `backend/src/iot`、`apps/iot-ingest`、`packages/iot-contracts` 和 `packages/iot-web`。

- 当前 Windows 演示脚本：`start-preview.cmd`；需要先安装项目依赖、配置数据库和环境变量。脚本不会代替安装依赖或准备已有演示数据库。
- 企业开通与登录：[平台管理](docs/PLATFORM-ADMIN.md)、[统一身份](docs/UNIFIED-IDENTITY.md)、[租户隔离](docs/TENANCY.md)。
- 数据导入与手机工作台：[客户 Excel 导入](docs/CUSTOMER-IMPORT.md)、[手机工作空间](docs/MOBILE-WORKSPACES.md)。
- 业务与验收：[服务市场](docs/SERVICE-MARKET.md)、[物联网首期交付](docs/iot-planning/delivery-v1.md)、[测试说明](docs/TESTING.md)。
- 本地预览、数据库数据、上传附件、账号凭据、API 密钥、cpolar 认证及临时公网地址不随源码提交。新环境需要自行初始化并配置；切勿将本机凭据文件公开。
- 免费公网穿透仍在测试，尚未通过稳定远程演示验收。后续源码修改不会自动同步到 GitHub，需要再次提交和推送。

以下快速开始保留原始基础开发流程；多租户演示请同时参考上述文档。

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

### 本地演示与三端回归（2026-10-25）

- `start-preview.cmd`：启动 3100/3101/3102 与后端 8180（先启动数据库/Redis，且端口应空闲）。
- `test-product.cmd`：在独立数据库和 8280 端口执行三端回归。
- 范围、结果与未覆盖项见 `docs/TESTING.md`。真实支付/短信及延保交易仍需后续服务接入。

### 业务管理第一版（2026-10-27）

新增仓储与移动仓、服务合同、结算与发票，包含可实际操作的领料/退料/工单用料流程。入口与体验数据见 `docs/BUSINESS-PREVIEW.md`。本地预览切换到独立业务库，原始数据保留。

### 企业租户隔离（2026-10-27）

三个端登录支持企业代码。原有数据位于 `demo`，另有空业务演示企业 `trial`。每企业独立数据库，登录、库存合同财务、聊天、缓存和附件均具有企业边界。开通维护命令、测试和当前限制见 `docs/TENANCY.md`。升级后需重新登录，默认后台管理员 `13800138000`，演示验证码 `000000`。

### 平台管理后台（2026-10-27）

新增独立入口 `http://localhost:3103/`，支持企业自动开通、真实用量、套餐有效期、停用恢复、失败重试和操作日志。平台身份与企业身份分离，变更同步作用于现有三个端。初始化账号见本机 `.local-preview/platform-credentials.json`，使用和测试见 `docs/PLATFORM-ADMIN.md`。

### 统一账号与设备绑定

企业后台（3100）使用独立管理账号密码；客户端（3101）先登录个人账号再绑定设备；工程师端（3102）按已开通的手机号身份进入工作台。一个客户可同时拥有多家服务商的设备与工单，企业后台仍只访问自己的业务。

企业管理账号可在平台（3103）的“开通信息”查看或重置密码。个人端当前为演示验证码认证。使用、现有会话升级、设备绑定入口和测试边界见 `docs/UNIFIED-IDENTITY.md`。

### 全国售后服务市场（2026-11-06）

客户新增“找服务”和平台服务单；工程师新增工作台、按资质接单、培训与服务身份；企业后台新增“平台服务协作”；维保云新增服务发布、工程师审核、培训考核和指派入口。原企业业务继续隔离，市场工单按协作关系授权。流程、测试与首版范围见 [服务市场说明](docs/SERVICE-MARKET.md)。
