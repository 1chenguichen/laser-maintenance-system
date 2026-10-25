# 激光设备售后维修维保系统 SDD

**版本**: 1.0
**日期**: 2026-09-20
**状态**: 初稿

---

## 1. 概述

### 1.1 目的

本文档描述激光设备售后维修维保系统的技术架构、模块设计、接口规范和数据库设计，为开发团队提供详细的实现指导。

### 1.2 范围

- 后端服务：NestJS + TypeORM + PostgreSQL + Redis
- 客户端：Web 版（HTML/CSS/JS）、客服后台（React + Ant Design）
- 实时通信：WebSocket (Socket.IO)
- AI 服务：阿里云百炼（通义千问）

### 1.3 参考文档

- PRD 文档：`docs/PRD.md`

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                              客户端层                                │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│   客户 Web      │   工程师 Web     │      客服后台 (React)           │
│  (HTML/CSS/JS)  │  (HTML/CSS/JS)  │                                │
└────────┬────────┴────────┬────────┴──────────────┬──────────────────┘
         │                 │                        │
         └─────────────────┼────────────────────────┘
                           │ HTTP / WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           网关层 (Nginx)                            │
│                    负载均衡 + SSL 终端 + 静态资源                    │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           应用层 (NestJS)                           │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────────┤
│  Auth    │  WorkOrder │ Dispatch │ Commission│ Inventory│ AI        │
│  Module  │  Module   │ Engine   │ Module   │ Module   │ Service    │
├──────────┴──────────┴──────────┴──────────┴──────────┴─────────────┤
│                      WebSocket Gateway (Socket.IO)                   │
└──────────────────────────────────┬────────────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PostgreSQL    │     │      Redis      │     │   阿里云百炼     │
│   (主数据库)     │     │  (缓存/会话/Pub/Sub) │     │   (AI 服务)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 2.2 部署架构

**云服务器 (120.79.4.28)**

| 服务 | 端口 | 说明 |
|------|------|------|
| Nginx | 80/443 | 静态资源托管、反向代理 |
| NestJS Backend | 8080 | API 服务 |
| 客服后台 | 3000 | React 开发服务器 |
| 客户 Web | 3001 | 静态 HTML |
| 工程师 Web | 3002 | 静态 HTML |
| PostgreSQL | 5432 | Docker 容器 |
| Redis | 6379 | Docker 容器 |

### 2.3 目录结构

```
C:\Users\sh\Desktop\Engineer\
├── apps/
│   ├── customer-app-web/       # 客户 Web 版
│   │   ├── home.html          # 首页
│   │   ├── devices.html       # 设备管理
│   │   ├── repair-form.html   # 报修表单
│   │   ├── orders.html        # 订单列表
│   │   ├── order-progress.html# 订单追踪
│   │   ├── chat.html          # AI 客服聊天
│   │   └── ...
│   ├── engineer-app-web/      # 工程师 Web 版
│   │   ├── tasks.html         # 订单池/任务列表
│   │   ├── grab.html          # 抢单页面
│   │   ├── task-detail.html   # 任务详情
│   │   ├── signature.html     # 签名确认
│   │   ├── stats.html         # 收益统计
│   │   └── ...
│   └── cs-admin/             # 客服后台
│       ├── src/
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── WorkOrders.tsx
│       │   │   ├── ServiceDesk.tsx  # 客服工作台
│       │   │   ├── Customers.tsx
│       │   │   ├── Engineers.tsx
│       │   │   ├── Devices.tsx
│       │   │   └── Inventory.tsx
│       │   └── api.ts
│       └── package.json
├── backend/
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── auth/              # 认证模块
│   │   ├── users/             # 用户模块
│   │   ├── work-order/        # 工单模块
│   │   ├── dispatch/          # 派单引擎
│   │   ├── commission/        # 提成模块
│   │   ├── inventory/         # 库存模块
│   │   ├── device/            # 设备模块
│   │   ├── payment/           # 支付模块
│   │   ├── ai/                # AI 服务模块
│   │   └── websocket/        # WebSocket 模块
│   ├── docker-compose.yml     # PostgreSQL + Redis
│   └── dist/                  # 编译输出
└── packages/
    └── shared/                # 共享类型定义
```

---

## 3. 模块设计

### 3.1 认证模块 (Auth)

**职责**：用户注册、登录、JWT 令牌管理

**接口**：

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/auth/customer/register | 客户注册 |
| POST | /api/auth/customer/login | 客户登录 |
| POST | /api/auth/engineer/register | 工程师注册 |
| POST | /api/auth/engineer/login | 工程师登录 |
| POST | /api/auth/admin/login | 客服登录 |
| POST | /api/auth/refresh | 刷新令牌 |

**数据结构**：

```typescript
// 客户注册
interface CustomerRegisterDto {
  phone: string;
  password: string;
  name: string;
  companyName?: string;
}

// 工程师注册
interface EngineerRegisterDto {
  phone: string;
  password: string;
  name: string;
  idCard: string;
  skills: string[];  // ['激光切割', '激光焊接', ...]
}

// 登录响应
interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    phone: string;
    name: string;
    role: 'customer' | 'engineer' | 'admin';
  };
}
```

### 3.2 工单模块 (WorkOrder)

**职责**：工单全生命周期管理

**工单状态枚举**：

```typescript
enum WorkOrderStatus {
  CREATED = 'created',              // 已创建
  PENDING_DISPATCH = 'pending_dispatch', // 待派单
  GRABBED = 'grabbed',              // 已抢单
  DISPATCHED = 'dispatched',        // 已指派
  PROCESSING = 'processing',        // 维修中
  AWAITING_PAYMENT = 'awaiting_payment', // 待付款
  COMPLETED = 'completed',          // 已完成
  CANCELLED = 'cancelled',          // 已取消
}
```

**接口**：

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/work-orders | 创建工单（客户） |
| GET | /api/work-orders | 获取工单列表 |
| GET | /api/work-orders/:id | 获取工单详情 |
| PUT | /api/work-orders/:id/status | 更新工单状态 |
| POST | /api/work-orders/:id/photos | 上传工单照片 |
| POST | /api/work-orders/:id/quote | 工程师报价 |
| POST | /api/work-orders/:id/confirm | 客户确认报价 |
| POST | /api/work-orders/:id/complete | 完工提交 |

**数据结构**：

```typescript
interface WorkOrder {
  id: string;
  customerId: string;
  engineerId?: string;
  deviceId: string;
  status: WorkOrderStatus;
  
  // 故障信息
  faultType: string;
  faultDescription: string;
  faultPhotos: string[];
  
  // 位置信息
  address: string;
  latitude: number;
  longitude: number;
  
  // 费用信息
  totalAmount: number;      // 总费用
  depositAmount: number;     // 定金 (30%)
  depositPaid: boolean;
  
  // 时间戳
  createdAt: Date;
  grabbedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // 维修信息
  repairPhotos?: string[];
  partsUsed?: PartUsage[];
  signature?: string;
  
  // 评价
  rating?: number;
  comment?: string;
}

interface PartUsage {
  partId: string;
  partName: string;
  quantity: number;
  unitPrice: number;
}
```

### 3.3 派单引擎 (Dispatch)

**职责**：工单分配、抢单逻辑、距离排序

**核心逻辑**：

```
1. 客户创建工单 → 工单进入 PENDING_DISPATCH 状态
2. 派单引擎将工单加入抢单池
3. 在线工程师可查看抢单池
4. 工程师按距离排序抢单
5. 抢单成功后，工单状态变为 GRABBED
6. 客服也可手动指派工程师
```

**接口**：

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/dispatch/available-orders | 获取可抢工单列表（工程师） |
| POST | /api/dispatch/grab/:orderId | 抢单 |
| POST | /api/dispatch/assign/:orderId | 指派工程师（客服） |
| GET | /api/dispatch/nearby-engineers | 获取附近工程师（客服） |

**距离计算**：

```typescript
// 使用 Haversine 公式计算两点间距离
function calculateDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // 地球半径 km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
```

### 3.4 提成模块 (Commission)

**职责**：阶梯提成计算、月度结算

**提成规则**：

| 月订单量 | 提成比例 |
|---------|---------|
| 1-10 单 | 20% |
| 11-30 单 | 25% |
| 31+ 单 | 30% |

**接口**：

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/commission/calculate/:orderId | 计算单笔订单提成 |
| GET | /api/commission/engineer/:id/monthly | 获取工程师月度结算 |
| GET | /api/commission/engineer/:id/stats | 获取工程师收益统计 |

**计算逻辑**：

```typescript
function calculateCommission(monthlyOrders: number, orderAmount: number): number {
  let rate: number;
  if (monthlyOrders <= 10) {
    rate = 0.20;
  } else if (monthlyOrders <= 30) {
    rate = 0.25;
  } else {
    rate = 0.30;
  }
  return orderAmount * rate;
}
```

### 3.5 设备模块 (Device)

**职责**：设备档案管理、设备绑定

**接口**：

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/devices | 创建设备 |
| GET | /api/devices | 获取设备列表 |
| GET | /api/devices/:id | 获取设备详情 |
| PUT | /api/devices/:id | 更新设备 |
| POST | /api/devices/bind | 绑定设备到客户 |
| GET | /api/devices/customer/:customerId | 获取客户的所有设备 |

**数据结构**：

```typescript
interface Device {
  id: string;
  serialNumber: string;     // 序列号
  model: string;            // 设备型号
  deviceType: string;       // 设备类型
  customerId?: string;       // 所属客户
  purchaseDate?: Date;       // 购买日期
  warrantyExpire?: Date;     // 保修到期
  
  // 脱敏后的序列号（用于展示）
  maskedSerialNumber?: string;  // SN2023****XXX
}
```

### 3.6 库存模块 (Inventory)

**职责**：配件库存管理、出入库记录

**接口**：

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/inventory/parts | 获取配件列表 |
| GET | /api/inventory/parts/:id | 获取配件详情 |
| POST | /api/inventory/parts | 添加配件 |
| PUT | /api/inventory/parts/:id | 更新配件 |
| POST | /api/inventory/in | 入库 |
| POST | /api/inventory/out | 出库 |
| GET | /api/inventory/low-stock | 获取低库存预警 |

**数据结构**：

```typescript
interface Part {
  id: string;
  name: string;
  code: string;           // 配件编码
  category: string;       // 分类
  unitPrice: number;      // 单价
  stock: number;          // 当前库存
  minStock: number;       // 安全库存
  unit: string;           // 单位
  supplier?: string;       // 供应商
  expectedRestockDate?: Date; // 预计补货日期
}

interface InventoryLog {
  id: string;
  partId: string;
  type: 'in' | 'out' | 'reserve' | 'release';
  quantity: number;
  orderId?: string;       // 关联工单
  operatorId: string;     // 操作人
  createdAt: Date;
}
```

### 3.7 支付模块 (Payment)

**职责**：定金预付、尾款支付、退款

**接口**：

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/payment/deposit | 支付定金 |
| POST | /api/payment/balance | 支付尾款 |
| POST | /api/payment/refund | 申请退款 |
| GET | /api/payment/status/:orderId | 获取支付状态 |

**支付流程**：

```
1. 工程师报价 → 客户确认
2. 客户支付定金 (30%) → 跳转到微信/支付宝
3. 支付回调 → 工单状态变为 PROCESSING
4. 工程师完工 → 客户支付尾款 (70%)
5. 支付完成 → 工单状态变为 COMPLETED
```

### 3.8 AI 服务模块 (AI)

**职责**：通义千问集成、智能问答、故障诊断

**接口**：

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/ai/chat | AI 问答 |
| POST | /api/ai/diagnose | 故障诊断 |
| GET | /api/ai/transfer | 检查是否需要转人工 |

**转人工关键词**：

```typescript
const TRANSFER_KEYWORDS = [
  '转人工', '人工客服', '人工服务', '投诉',
  '要投诉', '退钱', '退款', '太差', '不满意'
];

function shouldTransfer(message: string): boolean {
  return TRANSFER_KEYWORDS.some(keyword => 
    message.includes(keyword)
  );
}
```

**Prompt 模板**：

```typescript
const DIAGNOSE_PROMPT = `你是一个激光设备维修助手。请根据客户描述的故障现象，提供可能的故障原因和初步排查建议。

故障类型：{faultType}
故障描述：{faultDescription}

请用简洁专业的语言回答，包含：
1. 可能的原因（1-3个）
2. 初步排查步骤
3. 如果需要转人工维修，请说明`;
```

### 3.9 WebSocket 模块

**职责**：实时通信、位置推送、消息推送

**事件列表**：

| 事件名 | 方向 | 描述 |
|--------|------|------|
| engineer:location | Client → Server | 工程师位置上报 |
| order:new | Server → Client | 新工单通知（派单） |
| order:grabbed | Server → Client | 工单被抢通知 |
| order:statusChanged | Server → Client | 工单状态变更 |
| chat:message | Bidirectional | 聊天消息 |
| notification | Server → Client | 系统通知 |

**位置上报**：

```typescript
// 客户端每 30 秒上报一次
socket.emit('engineer:location', {
  engineerId: string,
  latitude: number,
  longitude: number,
  timestamp: number
});

// 服务器存储到 Redis
redis.geoadd('engineer_locations', longitude, latitude, engineerId);
```

---

## 4. 数据库设计

### 4.1 ER 图

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  customers   │     │  engineers   │     │    admins    │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ phone        │     │ phone        │     │ phone        │
│ password     │     │ password     │     │ password     │
│ name         │     │ name         │     │ name         │
│ companyName  │     │ status       │     │ role         │
│ createdAt    │     │ skills       │     │ createdAt    │
└──────┬───────┘     │ idCard       │     └──────────────┘
       │             │ createdAt    │
       │ 1:N         └──────┬───────┘
       │                    │ 1:N
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│   devices    │     │  work_orders │
├──────────────┤     ├──────────────┤
│ id (PK)      │     │ id (PK)      │
│ serialNumber │     │ customer_id   │──────┐
│ model        │     │ engineer_id   │◄─────┼──────┐
│ deviceType   │     │ device_id    │◄─────┘      │
│ customer_id  │─────┤ status       │             │
│ purchaseDate │     │ faultType    │             │
│ warrantyExp  │     │ faultDesc    │             │
│ createdAt    │     │ address      │             │
└──────────────┘     │ latitude     │             │
                     │ longitude    │             │
                     │ totalAmount  │             │
                     │ depositPaid  │             │
                     │ createdAt    │             │
                     │ grabbedAt    │             │
                     │ completedAt  │             │
                     └──────┬───────┘             │
                            │                     │
              ┌─────────────┼─────────────┐       │
              │ 1:N         │ 1:N         │ 1:N  │
              ▼             ▼             ▼       │
     ┌────────────┐ ┌────────────┐ ┌────────────┐ │
     │order_photos│ │part_usage │ │ signatures │ │
     ├────────────┤ ├────────────┤ ├────────────┤ │
     │ id         │ │ id         │ │ id         │ │
     │ order_id   │ │ order_id   │ │ order_id   │ │
     │ url        │ │ part_id    │ │ url        │ │
     │ type       │ │ quantity   │ │ createdAt  │ │
     │ createdAt  │ │ unitPrice  │ └────────────┘ │
     └────────────┘ └────────────┘                 │
                           │                       │
                           │ 1:N                   │
                           ▼                       │
                    ┌──────────────┐               │
                    │    parts     │               │
                    ├──────────────┤               │
                    │ id (PK)      │               │
                    │ name         │               │
                    │ code         │               │
                    │ category     │               │
                    │ unitPrice    │               │
                    │ stock        │               │
                    │ minStock     │               │
                    └──────────────┘               │
                                                  │
                                                  │
                    ┌─────────────────────────────┘
                    │
                    ▼
             ┌──────────────┐
             │   reviews    │
             ├──────────────┤
             │ id (PK)      │
             │ order_id     │──────► work_orders
             │ rating       │
             │ comment      │
             │ createdAt    │
             └──────────────┘
```

### 4.2 表结构

#### customers

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| phone | VARCHAR(20) | UNIQUE, NOT NULL | 手机号 |
| password | VARCHAR(255) | NOT NULL | 密码（bcrypt） |
| name | VARCHAR(100) | NOT NULL | 姓名 |
| company_name | VARCHAR(200) | | 公司名称 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### engineers

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| phone | VARCHAR(20) | UNIQUE, NOT NULL | 手机号 |
| password | VARCHAR(255) | NOT NULL | 密码（bcrypt） |
| name | VARCHAR(100) | NOT NULL | 姓名 |
| status | ENUM | DEFAULT 'offline' | 在线状态：online/offline/working |
| skills | JSON | | 技能数组 |
| id_card | VARCHAR(20) | | 身份证号 |
| monthly_orders | INT | DEFAULT 0 | 本月订单数 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### admins

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| phone | VARCHAR(20) | UNIQUE, NOT NULL | 手机号 |
| password | VARCHAR(255) | NOT NULL | 密码（bcrypt） |
| name | VARCHAR(100) | NOT NULL | 姓名 |
| role | ENUM | DEFAULT 'cs' | 角色：cs（客服）/admin（管理员） |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### devices

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| serial_number | VARCHAR(50) | UNIQUE, NOT NULL | 序列号 |
| model | VARCHAR(100) | NOT NULL | 设备型号 |
| device_type | VARCHAR(50) | | 设备类型 |
| customer_id | UUID | FK(customers) | 所属客户 |
| purchase_date | DATE | | 购买日期 |
| warranty_expire | DATE | | 保修到期 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### work_orders

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| customer_id | UUID | FK(customers) | 客户ID |
| engineer_id | UUID | FK(engineers) | 工程师ID |
| device_id | UUID | FK(devices) | 设备ID |
| status | ENUM | NOT NULL | 工单状态 |
| fault_type | VARCHAR(50) | | 故障类型 |
| fault_description | TEXT | | 故障描述 |
| address | VARCHAR(500) | | 维修地址 |
| latitude | DECIMAL(10,7) | | 纬度 |
| longitude | DECIMAL(10,7) | | 经度 |
| total_amount | DECIMAL(10,2) | | 总费用 |
| deposit_amount | DECIMAL(10,2) | | 定金 |
| deposit_paid | BOOLEAN | DEFAULT FALSE | 定金已付 |
| rating | INT | | 评分 1-5 |
| comment | TEXT | | 评价 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| grabbed_at | TIMESTAMP | | 抢单时间 |
| started_at | TIMESTAMP | | 开始维修时间 |
| completed_at | TIMESTAMP | | 完成时间 |

#### order_photos

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| order_id | UUID | FK(work_orders) | 工单ID |
| url | VARCHAR(500) | NOT NULL | 图片URL |
| type | ENUM | | 类型：fault/repair/signature |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### part_usage

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| order_id | UUID | FK(work_orders) | 工单ID |
| part_id | UUID | FK(parts) | 配件ID |
| quantity | INT | NOT NULL | 数量 |
| unit_price | DECIMAL(10,2) | NOT NULL | 单价 |

#### parts

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| name | VARCHAR(100) | NOT NULL | 配件名称 |
| code | VARCHAR(50) | UNIQUE | 配件编码 |
| category | VARCHAR(50) | | 分类 |
| unit_price | DECIMAL(10,2) | | 单价 |
| stock | INT | DEFAULT 0 | 库存 |
| min_stock | INT | DEFAULT 0 | 安全库存 |
| unit | VARCHAR(20) | | 单位 |
| supplier | VARCHAR(200) | | 供应商 |
| expected_restock_date | DATE | | 预计补货日期 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### inventory_logs

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| part_id | UUID | FK(parts) | 配件ID |
| type | ENUM | | 类型：in/out/reserve/release |
| quantity | INT | NOT NULL | 数量 |
| order_id | UUID | FK(work_orders) | 关联工单 |
| operator_id | UUID | | 操作人 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### reviews

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| order_id | UUID | FK(work_orders) | 工单ID |
| rating | INT | NOT NULL | 评分 1-5 |
| comment | TEXT | | 评价 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

---

## 5. API 接口规范

### 5.1 基础规范

**Base URL**: `http://120.79.4.28:8080/api`

**认证方式**: Bearer Token (JWT)

**请求格式**:

```
Content-Type: application/json
Authorization: Bearer <token>
```

**响应格式**:

```typescript
// 成功
{
  "success": true,
  "data": { ... }
}

// 失败
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

### 5.2 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| VALIDATION_ERROR | 400 | 参数校验失败 |
| UNAUTHORIZED | 401 | 未授权 |
| FORBIDDEN | 403 | 无权限 |
| NOT_FOUND | 404 | 资源不存在 |
| ORDER_ALREADY_GRABBED | 409 | 工单已被抢 |
| ORDER_STATUS_ERROR | 409 | 工单状态不允许此操作 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

### 5.3 分页

```typescript
// 请求
GET /api/work-orders?page=1&limit=20

// 响应
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

---

## 6. WebSocket 规范

### 6.1 连接

```javascript
// 客户端连接
const socket = io('http://120.79.4.28:8080', {
  auth: { token: 'Bearer ' + token }
});
```

### 6.2 认证

连接时需携带 JWT token，服务器验证通过后建立连接。

### 6.3 房间（Rooms）

| 房间名 | 说明 |
|--------|------|
| engineer:{id} | 工程师私有房间 |
| order:{id} | 工单房间 |
| cs:{id} | 客服私有房间 |

---

## 7. 安全设计

### 7.1 数据脱敏

| 字段 | 客户可见 | 工程师可见 | 客服可见 |
|------|---------|-----------|---------|
| serialNumber | SN2023****XXX | SN2023****XXX | 全量 |
| name | 张* | 张* | 全量 |
| phone | 138****5678 | 138****5678 | 全量 |
| address | 全量 | 全量（仅关联工单） | 全量 |

### 7.2 JWT 配置

- 有效期：7 天
- 刷新令牌：14 天
- 算法：HS256

### 7.3 密码存储

使用 bcrypt 加密，salt rounds: 10

---

## 8. Redis 使用

### 8.1 数据结构

| Key | 类型 | 说明 | 过期时间 |
|-----|------|------|---------|
| engineer:location:{id} | GEO | 工程师位置 | 5 分钟 |
| engineer:status:{id} | STRING | 工程师状态 | 永不过期 |
| order:grab:lock:{id} | STRING | 抢单锁 | 30 秒 |
| session:{token} | HASH | 会话缓存 | 7 天 |

### 8.2 发布/订阅

| 频道 | 说明 |
|------|------|
| order:new | 新工单发布 |
| order:status:{id} | 工单状态变更 |
| notification:{engineerId} | 工程师通知 |

---

## 9. 环境变量

```bash
# 数据库
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=laser_maintenance

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# 阿里云百炼
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxx

# 支付（微信/支付宝）
# 待配置
```

---

## 10. 部署流程

### 10.1 后端部署

```bash
# 1. 安装依赖
cd backend
npm install

# 2. 编译
npm run build

# 3. 启动
npm run start:prod
```

### 10.2 前端部署

```bash
# 客服后台
cd apps/cs-admin
npm run build
# 将 dist 目录上传到 /var/www/admin/

# Web 版
# 直接上传 HTML/CSS/JS 到对应目录
```

### 10.3 数据库迁移

```bash
# 同步数据库结构
npm run typeorm:sync

# 或使用迁移命令
npm run typeorm:migration:run
```

---

**文档版本历史**

| 版本 | 日期 | 修改内容 |
|------|------|---------|
| 1.0 | 2026-09-20 | 初稿 |
