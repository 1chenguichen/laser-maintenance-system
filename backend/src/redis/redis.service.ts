import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.client.on('error', (err) => {
      console.error('[Redis] 连接错误:', err.message);
    });

    this.client.on('connect', () => {
      console.log('[Redis] 已连接');
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // 基础操作
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  // 验证码存储（5分钟过期）
  async setCode(phone: string, code: string): Promise<void> {
    await this.client.set(`sms:code:${phone}`, code, 'EX', 300);
  }

  async getCode(phone: string): Promise<string | null> {
    return this.client.get(`sms:code:${phone}`);
  }

  async delCode(phone: string): Promise<void> {
    await this.client.del(`sms:code:${phone}`);
  }

  // Session 存储
  async setSession(sessionId: string, data: string, ttlSeconds = 86400): Promise<void> {
    await this.client.set(`session:${sessionId}`, data, 'EX', ttlSeconds);
  }

  async getSession(sessionId: string): Promise<string | null> {
    return this.client.get(`session:${sessionId}`);
  }

  async delSession(sessionId: string): Promise<void> {
    await this.client.del(`session:${sessionId}`);
  }

  // 工程师在线状态（位置信息）
  async setEngineerLocation(engineerId: string, lat: number, lng: number, address?: string): Promise<void> {
    const data = JSON.stringify({ lat, lng, address, updatedAt: Date.now() });
    await this.client.set(`engineer:location:${engineerId}`, data, 'EX', 300); // 5分钟过期
  }

  async getEngineerLocation(engineerId: string): Promise<{ lat: number; lng: number; address?: string } | null> {
    const data = await this.client.get(`engineer:location:${engineerId}`);
    return data ? JSON.parse(data) : null;
  }

  // 缓存工单池（减少数据库查询）
  async cacheOrderPool(key: string, data: string, ttlSeconds = 30): Promise<void> {
    await this.client.set(`orderpool:${key}`, data, 'EX', ttlSeconds);
  }

  async getCachedOrderPool(key: string): Promise<string | null> {
    return this.client.get(`orderpool:${key}`);
  }

  async invalidateOrderPool(): Promise<void> {
    const keys = await this.client.keys('orderpool:*');
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}
