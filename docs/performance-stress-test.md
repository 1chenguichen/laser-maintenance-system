# 性能压测报告

## 概述

本文档记录激光设备售后维修维保系统的性能压测方案与结果，确保系统在预期负载下稳定运行。

---

## 1. 压测目标

| 指标 | 目标值 |
|------|--------|
| API 平均响应时间 | < 200ms |
| API 99 分位响应时间 | < 500ms |
| 系统并发处理能力 | ≥ 200 QPS |
| WebSocket 并发连接数 | ≥ 500 |
| 错误率 | < 1% |
| CPU 使用率（峰值） | < 70% |
| 内存使用率（峰值） | < 80% |

---

## 2. 压测环境

### 2.1 硬件配置

| 组件 | 配置 | 数量 |
|------|------|------|
| API 服务器 | 2核4GB | 2台（负载均衡） |
| 数据库 | 4核8GB SSD | 1台 |
| Redis | 2核4GB | 1台 |

### 2.2 软件版本

- Node.js: v20.x
- NestJS: v10.x
- PostgreSQL: 16.x
- Redis: 7.x

### 2.3 压测工具

- **wrk** / **k6** — HTTP API 压测
- **Socket.IO 客户端** — WebSocket 压测

---

## 3. 压测场景

### 3.1 登录接口

```
POST /auth/login
Body: { "phone": "13900000001", "code": "000000", "role": "customer" }
```

**预期**: 验证码缓存命中，Redis GET 操作，响应 < 50ms

### 3.2 工单池查询（高频）

```
GET /engineer/grab-pool
Header: Authorization: Bearer <token>
```

**预期**: 返回待抢单工单列表，紧急工单优先，响应 < 200ms

### 3.3 工单创建

```
POST /customer/work-orders
Header: Authorization: Bearer <token>
Body: { "deviceId": "...", "faultType": "...", "emergencyLevel": 1 }
```

**预期**: 创建工单 + 写 PostgreSQL + 清除 Redis 缓存，响应 < 500ms

### 3.4 WebSocket 实时推送

**场景**: 工程师 GPS 位置每 10s 上报一次，客服端实时接收

**预期**: 消息延迟 < 100ms，并发连接 500 无断连

### 3.5 工单列表查询（带分页）

```
GET /customer/work-orders?page=1&limit=20
```

**预期**: 响应 < 300ms，支持 1000 并发

---

## 4. 压测脚本（k6 示例）

```javascript
// login-stress.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // 预热
    { duration: '2m', target: 100 },  // 正式压测
    { duration: '1m', target: 200 },  // 峰值
    { duration: '1m', target: 0 },    // 降载
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = 'http://localhost:8080';

export default function () {
  // 登录
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    phone: '13900000001',
    code: '000000',
    role: 'customer',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    '登录成功': (r) => r.status === 201,
    '有 token': (r) => JSON.parse(r.body).accessToken !== undefined,
  });

  const token = JSON.parse(loginRes.body).accessToken;

  // 工单池查询
  const poolRes = http.get(`${BASE_URL}/engineer/grab-pool`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(poolRes, {
    '工单池查询成功': (r) => r.status === 200,
  });

  sleep(1);
}
```

```javascript
// websocket-stress.js
import ws from 'k6/ws';

export const options = {
  scenarios: {
    connections: {
      executor: 'constant-vus',
      vus: 100,
      duration: '2m',
    },
  },
  thresholds: {
    ws_connect: ['count>0'],
    ws_error: ['rate<0.01'],
  },
};

const WS_URL = 'ws://localhost:8080';

export default function () {
  const wsRes = ws.connect(WS_URL, {}, function (socket) {
    socket.on('open', () => {
      // 发送位置上报
      socket.send(JSON.stringify({
        type: 'GPS_REPORT',
        engineerId: 'test-engineer-id',
        latitude: 31.2304,
        longitude: 121.4737,
      }));
    });

    socket.on('message', (msg) => {
      // 收到派单通知
      console.log('收到消息:', msg);
    });

    socket.on('error', (e) => {
      console.error('WebSocket 错误:', e);
    });
  });
}
```

---

## 5. 数据库压测（pgbench）

```bash
# 初始化压测数据库
pgbench -i -s 50 laser_maintenance

# 运行压测
pgbench -c 20 -j 4 -t 1000 laser_maintenance

# 结果解读
# tps = transactions per second
# latency = 平均延迟
```

**基准目标**:
- 50 并发连接下 TPS ≥ 2000
- 平均延迟 < 10ms

---

## 6. Redis 压测

```bash
# 简单性能测试
redis-benchmark -n 100000 -c 50 -q

# 测试 SET/GET 延迟
redis-benchmark --latency -n 10000
```

**目标**: 10万次操作/秒，P99延迟 < 5ms

---

## 7. 压测执行计划

| 阶段 | 内容 | 时长 |
|------|------|------|
| 1. 基准测试 | 单接口无并发，测出最大容量 | 30min |
| 2. 预热压测 | 逐步增加并发到目标 QPS | 60min |
| 3. 峰值压测 | 200% 目标负载持续 10min | 10min |
| 4. 稳定性测试 | 目标 QPS 持续运行 | 4h |
| 5. 恢复测试 | 压测后系统自动恢复验证 | 30min |

---

## 8. 性能优化建议

### 8.1 数据库优化

- [ ] 对高频查询添加索引（参考 `docs/database-index.md`）
- [ ] 配置 PostgreSQL `shared_buffers = 2GB`
- [ ] 开启 `wal_buffers = 16MB` 减少 WAL 写入
- [ ] 连接池配置: `max_connections = 200`

### 8.2 Redis 优化

- [ ] `maxmemory` 设置为物理内存的 70%
- [ ] `appendonly yes` 使用 AOF 持久化
- [ ] 验证码 key 设置 TTL 自动过期

### 8.3 NestJS 优化

- [ ] 开启 Response Compress 中间件
- [ ] 对 `/engineer/grab-pool` 添加 Redis 缓存（TTL 5s）
- [ ] 使用 `@nestjs/bull` 队列处理异步任务（WebSocket 推送）
- [ ] 关闭不必要的 Swagger 在生产环境

### 8.4 水平扩展

- [ ] API 服务部署 2+ 实例，Nginx 负载均衡
- [ ] PostgreSQL 主从复制，读写分离
- [ ] Redis Cluster 模式（数据量增长后）

---

## 9. 监控指标

压测期间使用以下指标判断系统状态:

```yaml
关键指标:
  - API QPS: prometheus_http_requests_total
  - 响应时间: prometheus_http_request_duration_seconds
  - WebSocket 连接数: socketio_connected
  - 数据库连接池: pg_stat_activity
  - Redis 内存: redis_memory_used_bytes
  - 错误率: error_count / total_count
```

---

## 10. 记录结果

> **注意**: 压测结果需在实际压测后填写此表。

| 场景 | QPS | 平均响应 | P99响应 | 错误率 | 状态 |
|------|-----|---------|---------|--------|------|
| 登录接口 | 待测 | 待测 | 待测 | 待测 | - |
| 工单池查询 | 待测 | 待测 | 待测 | 待测 | - |
| 工单创建 | 待测 | 待测 | 待测 | 待测 | - |
| WebSocket连接 | 待测 | 待测 | 待测 | 待测 | - |

**压测结论**: （压测完成后填写）

---

## 附录: 本地快速压测

```bash
# 使用 wrk 快速压测
wrk -t12 -c400 -d30s http://localhost:8080/auth/login

# 使用 ab（Apache Bench）
ab -n 10000 -c 100 -p login.json -T application/json \
   http://localhost:8080/auth/login
```
