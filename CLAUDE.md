# 激光设备售后维修维保系统 (Laser Equipment After-Sales Maintenance System)

## 项目概述

一款美团式派单 + 滴滴式抢单的激光设备售后维修应用，包含三个移动端（客户App、工程师App、客服App）和一个后台管理系统（CS Admin）。

## 本地项目结构

```
C:\Users\sh\Desktop\Engineer\
├── apps/
│   ├── customer-app/         # 客户App (React Native/Expo) - 本地开发用
│   ├── engineer-app/         # 工程师App (React Native/Expo) - 本地开发用
│   ├── customer-app-web/    # 客户App Web版 (HTML/CSS/JS)
│   ├── engineer-app-web/    # 工程师App Web版 (HTML/CSS/JS)
│   └── cs-admin/           # 客服后台 (React + Ant Design)
├── backend/                  # NestJS 后端
│   ├── database/            # 种子数据 (seed-data.sql + seed.mjs)
│   ├── docker-compose.yml   # Docker配置 (PostgreSQL + Redis)
│   └── dist/               # 编译后的后端代码
├── packages/
│   └── shared/              # 共享类型定义
├── openspec/                # OpenSpec 变更记录
├── README.md                # 项目说明与快速开始
├── start-local.bat          # 一键启动
└── stop-local.bat           # 一键停止
```

## 本地一键启动脚本

在 `C:\Users\sh\Desktop\Engineer\` 目录下有启动脚本：

- `start-local.bat` - 一键启动本地所有服务
- `stop-local.bat` - 一键停止本地所有服务

## 本地开发流程

### 一键启动
```bash
# 在项目根目录运行
start-local.bat
```

或者手动启动：

### 1. 启动本地数据库（Docker）
```bash
cd backend
docker-compose up -d
```

### 2. 启动后端
```bash
cd backend
cp .env.example .env      # Windows: copy .env.example .env
npm install
npm run build
npm run start:dev
```
首次启动时 TypeORM 会自动建表（`NODE_ENV=development` 下 `synchronize=true`）。

### 3. 导入演示数据（可选）
```bash
cd backend
npm run db:seed
```
会清空业务表并导入 17 客户 / 7 工程师 / 16 设备 / 49 工单等演示数据。
原始数据见 `backend/database/seed-data.sql`。

### 4. 启动客服后台（React开发模式）
```bash
cd apps/cs-admin
npm install
BROWSER=none npm start
```
> 注意：cs-admin 是 CRA 项目，**没有 `dev` 脚本**，只有 `start`/`build`/`test`/`eject`。
> 默认端口 3000，如被占用可 `PORT=3003 BROWSER=none npm start`。

### 5. Web端（客户/工程师App）
用 serve 托管（推荐）：
```bash
cd apps/customer-app-web
npx serve -l 3001 .

cd apps/engineer-app-web
npx serve -l 3002 .
```
- 客户App: http://localhost:3001/login.html
- 工程师App: http://localhost:3002/login.html

也可直接用浏览器打开 HTML 文件（部分接口会受同源策略限制）：
- 客户App: `apps/customer-app-web/home.html`
- 工程师App: `apps/engineer-app-web/tasks.html`

### 6. 移动端（React Native/Expo）
```bash
cd apps/customer-app
npx expo start

cd apps/engineer-app
npx expo start
```

## 云服务器部署

> ⚠️ 原服务器 120.79.4.28 已过期，部署信息仅作参考，重新部署前需确认服务器状态与域名/证书。

服务器IP: 120.79.4.28

### 云端部署目录
- `/var/www/admin/` - 客服后台静态文件
- `/var/www/customer/` - 客户App Web版
- `/var/www/engineer/` - 工程师App Web版
- `/root/laser-maintenance-system/backend/` - 后端代码

### 云端服务管理脚本（/root/）
- `start-laser-system.sh` - 一键启动所有服务（包括Docker）
- `stop-laser-system.sh` - 一键停止所有服务

### 云端访问地址
- 客服后台: http://120.79.4.28:3000
- 客户App: http://120.79.4.28:3001
- 工程师App: http://120.79.4.28:3002
- 后端API: http://120.79.4.28:8080

### 云端部署命令
1. 本地打包: `tar -czf xxx.tar.gz -C build .`
2. 上传到服务器
3. 服务器解压并重启服务: `bash /root/start-laser-system.sh`

## 技术栈

### 后端
- NestJS + TypeORM + PostgreSQL + WebSocket + Socket.IO
- Redis (位置缓存、会话存储、分布式锁)
- Docker (PostgreSQL 16 + Redis 7)
- 阿里云百炼（通义千问）集成

### 前端/移动端
- React Native + Expo (本地开发版)
- HTML/CSS/JS + Tailwind CSS (Web版)
- React + Ant Design Pro (客服后台)

## 核心功能

### 客户App / Web版
- 设备扫码/序列号绑定
- 快速故障报修
- 30% 定金预支付
- 订单追踪
- AI智能客服（通义千问）- 自动诊断+转人工
- 评价与退款
- 实时聊天（Socket.IO）

### 工程师App / Web版
- 状态切换（在线/离线/工作中）
- 订单池抢单
- GPS 实时定位
- 拍照打卡 + 时间戳水印
- 签名确认
- AI助手（通义千问）
- 收益统计（阶梯提成）
- 历史订单收益查询

### 客服后台
- 工单管理 + 远程诊断
- 客服工作台（实时会话、待接入队列）
- 客户/工程师/设备管理
- 配件库存管理
- 数据统计
- AI客服集成（转人工处理）

## 数据库 (Docker)

### 本地开发
```bash
cd backend
docker-compose up -d
```

### Docker配置 (backend/docker-compose.yml)
```yaml
services:
  postgres:
    image: postgres:16
    container_name: laser_postgres
    environment:
      POSTGRES_DB: laser_maintenance
      POSTGRES_USER: laser_user
      POSTGRES_PASSWORD: laser_pass_2024
    ports:
      - "5432:5432"
  redis:
    image: redis:7-alpine
    container_name: laser_redis
    ports:
      - "6379:6379"
```
> 国内网络拉取 Docker Hub 镜像可能失败，可改用镜像加速：
> `docker pull docker.1ms.run/library/redis:7-alpine` 后 `docker tag` 回原名。

## AI服务集成

### 通义千问（客户/工程师AI助手）
- 基于阿里云百炼平台
- 模型: qwen-plus
- 支持流式输出
- 关键词触发转人工: "转人工"、"人工客服"、"投诉"等

## 提成规则

| 月订单量 | 提成比例 |
|---------|---------|
| 1-10单  | 20%     |
| 11-30单 | 25%     |
| 31+单   | 30%     |

每月1日重置。

## 注意事项

### CDN访问限制
- Google Fonts、Tailwind CDN 在国内被屏蔽
- 所有静态资源需本地化：字体、图标、JS库
- Material Symbols 图标字体存放在 `fonts/` 目录

### API配置
- 前端**不写死**后端地址，运行时按当前页面主机名推导，同一份构建产物本地/云端通用：
  ```js
  const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080`;
  ```
- 客服后台可用环境变量 `REACT_APP_API_BASE` 覆盖
- 后端路由**无 `/api` 前缀**：实际路径为 `/auth/*`、`/admin/*`、`/engineer/*`、`/ai/*`
- 不使用前端代理

### 登录测试账号
测试模式验证码固定 `000000`：
- 客服后台 / 客户端：`13800138000`
- 工程师端：`13900000002`

### Docker 容器
- PostgreSQL: 5432端口
- Redis: 6379端口
- 本地开发时需要先启动 Docker
