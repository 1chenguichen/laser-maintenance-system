# 激光设备售后维修维保系统 (Laser Equipment After-Sales Maintenance System)

## 项目概述

一款美团式派单 + 滴滴式抢单的激光设备售后维修应用，包含三个移动端（客户App、工程师App、客服App）和一个后台管理系统（CS Admin）。

## 技术栈

- **后端**: NestJS + TypeORM + PostgreSQL + WebSocket
- **移动端**: React Native + Expo
- **后台**: React + React Router
- **共享**: TypeScript 类型包

## 项目结构

```
apps/
  customer-app/     # 客户App (Expo)
  engineer-app/     # 工程师App (Expo)
  cs-admin/         # 客服后台 (React Router)
backend/            # NestJS 后端
packages/
  shared/           # 共享类型定义
```

## 快速开始

### 后端

```bash
cd backend
cp .env.example .env
docker-compose up -d  # 启动 PostgreSQL
npm install
npm run build
npm run start:dev
```

### 移动端 (客户/工程师App)

```bash
cd apps/customer-app  # 或 engineer-app
npm install
npx expo start
```

### 客服后台

```bash
cd apps/cs-admin
npm install
npm run dev
```

## 核心功能

### 客户App
- 设备扫码/序列号绑定
- 快速故障报修
- 30% 定金预支付
- 订单追踪
- 评价与退款

### 工程师App
- 状态切换（在线/离线/工作中）
- 订单池抢单
- GPS 实时定位
- 拍照打卡 + 时间戳水印
- 签名确认
- 收益统计（阶梯提成）

### 客服后台
- 工单管理 + 远程诊断
- 客户/工程师/设备管理
- 配件库存管理
- 数据统计

## 提成规则

| 月订单量 | 提成比例 |
|---------|---------|
| 1-10单  | 20%     |
| 11-30单 | 25%     |
| 31+单   | 30%     |

每月1日重置。
