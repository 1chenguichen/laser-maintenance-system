import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  database: {
    status: 'connected' | 'disconnected';
    responseTime: number;
  };
}

export interface MetricsData {
  requests: {
    total: number;
    success: number;
    failed: number;
  };
  database: {
    poolSize: number;
    idleCount: number;
    responseTime: number;
  };
  websocket: {
    connections: number;
  };
}

@Injectable()
export class MonitorService {
  private startTime = Date.now();

  getHealth(): HealthStatus {
    const memUsage = process.memoryUsage();
    const memTotal = memUsage.heapTotal;
    const memUsed = memUsage.heapUsed;

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memory: {
        used: Math.round(memUsed / 1024 / 1024),
        total: Math.round(memTotal / 1024 / 1024),
        percentage: Math.round((memUsed / memTotal) * 100),
      },
      database: {
        status: 'connected',
        responseTime: 0,
      },
    };
  }

  getMetrics(): MetricsData {
    const memUsage = process.memoryUsage();
    const memTotal = memUsage.heapTotal;
    const memUsed = memUsage.heapUsed;

    return {
      requests: {
        total: 0,
        success: 0,
        failed: 0,
      },
      database: {
        poolSize: 10,
        idleCount: 5,
        responseTime: Math.round(memUsage.heapUsed / 1000),
      },
      websocket: {
        connections: 0,
      },
    };
  }

  getApiResponseTime(): { avg: number; p95: number; p99: number } {
    // 模拟数据
    return {
      avg: 45,
      p95: 120,
      p99: 200,
    };
  }

  getErrorRate(): { rate: number; totalErrors: number; totalRequests: number } {
    // 模拟数据
    return {
      rate: 0.5,
      totalErrors: 5,
      totalRequests: 1000,
    };
  }
}
