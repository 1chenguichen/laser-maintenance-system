# 数据库索引策略文档

## 概述

本文档定义了激光设备售后维修维保系统 PostgreSQL 数据库的索引策略，旨在优化查询性能。

---

## 核心表索引

### customers（客户表）

| 索引名 | 列 | 类型 | 用途 |
|--------|-----|------|------|
| idx_customers_phone | phone | UNIQUE | 手机号登录查询 |
| idx_customers_created | created_at | DESC | 按时间排序查询 |

```sql
CREATE UNIQUE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_created ON customers(created_at DESC);
```

---

### engineers（工程师表）

| 索引名 | 列 | 类型 | 用途 |
|--------|-----|------|------|
| idx_engineers_phone | phone | UNIQUE | 工程师登录 |
| idx_engineers_status | status | | 按状态筛选在线工程师 |
| idx_engineers_created | created_at | DESC | 按时间排序 |

```sql
CREATE UNIQUE INDEX idx_engineers_phone ON engineers(phone);
CREATE INDEX idx_engineers_status ON engineers(status);
CREATE INDEX idx_engineers_created ON engineers(created_at DESC);
```

---

### devices（设备表）

| 索引名 | 列 | 类型 | 用途 |
|--------|-----|------|------|
| idx_devices_customer | customer_id | | 客户设备列表查询 |
| idx_devices_serial | serial_number | UNIQUE | 扫码识别设备 |
| idx_devices_type | device_type | | 按类型筛选设备 |

```sql
CREATE UNIQUE INDEX idx_devices_serial ON devices(serial_number);
CREATE INDEX idx_devices_customer ON devices(customer_id);
CREATE INDEX idx_devices_type ON devices(device_type);
```

---

### addresses（地址表）

| 索引名 | 列 | 类型 | 用途 |
|--------|-----|------|------|
| idx_addresses_customer | customer_id | | 客户地址列表查询 |
| idx_addresses_default | customer_id, is_default | | 查询客户默认地址 |

```sql
CREATE INDEX idx_addresses_customer ON addresses(customer_id);
CREATE INDEX idx_addresses_default ON addresses(customer_id, is_default) WHERE is_default = true;
```

---

### work_orders（工单表）

| 索引名 | 列 | 类型 | 用途 |
|--------|-----|------|------|
| idx_wo_customer | customer_id | | 客户工单列表 |
| idx_wo_engineer | engineer_id | | 工程师工单列表 |
| idx_wo_status | status | | 工单状态筛选 |
| idx_wo_pending_dispatch | status, dispatch_type | | 抢单池查询（核心查询） |
| idx_wo_created | created_at | DESC | 按时间排序 |
| idx_wo_emergency | emergency_level | DESC | 紧急工单优先显示 |
| idx_wo_order_no | order_no | UNIQUE | 工单号查询 |

```sql
CREATE UNIQUE INDEX idx_wo_order_no ON work_orders(order_no);
CREATE INDEX idx_wo_customer ON work_orders(customer_id);
CREATE INDEX idx_wo_engineer ON work_orders(engineer_id);
CREATE INDEX idx_wo_status ON work_orders(status);
CREATE INDEX idx_wo_pending_dispatch ON work_orders(status, dispatch_type) 
  WHERE status = 'PENDING' AND dispatch_type = 'SYSTEM';
CREATE INDEX idx_wo_created ON work_orders(created_at DESC);
CREATE INDEX idx_wo_emergency ON work_orders(emergency_level DESC);
```

**复合索引说明**：`idx_wo_pending_dispatch` 是抢单池查询的核心索引，覆盖了最常用的筛选条件。

---

### dispatch_records（派单记录表）

| 索引名 | 列 | 类型 | 用途 |
|--------|-----|------|------|
| idx_dr_work_order | work_order_id | | 工单派单历史查询 |
| idx_dr_engineer | engineer_id | | 工程师派单历史 |

```sql
CREATE INDEX idx_dr_work_order ON dispatch_records(work_order_id);
CREATE INDEX idx_dr_engineer ON dispatch_records(engineer_id);
```

---

### service_chats（聊天记录表）

| 索引名 | 列 | 类型 | 用途 |
|--------|-----|------|------|
| idx_sc_customer | customer_id | | 客户聊天查询 |
| idx_sc_work_order | work_order_id | | 工单关联聊天 |

```sql
CREATE INDEX idx_sc_customer ON service_chats(customer_id);
CREATE INDEX idx_sc_work_order ON service_chats(work_order_id);
```

---

### reviews（评价表）

| 索引名 | 列 | 类型 | 用途 |
|--------|-----|------|------|
| idx_reviews_engineer | engineer_id | | 工程师评分统计 |
| idx_reviews_work_order | work_order_id | UNIQUE | 防止重复评价 |

```sql
CREATE UNIQUE INDEX idx_reviews_work_order ON reviews(work_order_id);
CREATE INDEX idx_reviews_engineer ON reviews(engineer_id);
```

---

### parts_inventory（配件库存表）

| 索引名 | 列 | 类型 | 用途 |
|--------|-----|------|------|
| idx_pi_warehouse | warehouse_id | | 仓库库存查询 |
| idx_pi_part | part_id | | 配件库存查询 |
| idx_pi_status | status | | 按状态筛选可用库存 |

```sql
CREATE INDEX idx_pi_warehouse ON parts_inventory(warehouse_id);
CREATE INDEX idx_pi_part ON parts_inventory(part_id);
CREATE INDEX idx_pi_status ON parts_inventory(status);
```

---

## 索引维护

### 定期分析

```sql
-- 分析表统计信息（建议每周执行）
ANALYZE customers;
ANALYZE engineers;
ANALYZE devices;
ANALYZE work_orders;
ANALYZE dispatch_records;
ANALYZE service_chats;
```

### 索引重建（碎片整理）

```sql
-- 重建碎片化严重的索引
REINDEX INDEX idx_wo_pending_dispatch;
REINDEX INDEX idx_wo_created;
```

### 查看索引使用情况

```sql
-- 查看哪些索引被使用
SELECT indexrelname, idx_scan, idx_tup_read 
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

---

## 未使用索引清理

定期检查并删除从未被使用的索引：

```sql
-- 找出从未被扫描的索引
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname = 'public'
ORDER BY tablename;
```

---

## 注意事项

1. **避免过度索引**：每增加一个索引，写操作（INSERT/UPDATE/DELETE）都会增加维护成本
2. **复合索引顺序**：最常用查询条件放前面
3. **前缀索引**：对长字符串（如地址详情）可考虑前缀索引
4. **分区表**：工单量超过百万级时考虑按月分区
