import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../bootstrap.js';

let nestApp: Awaited<ReturnType<typeof createApp>>;
let baseUrl: string;

beforeAll(async () => {
  nestApp = await createApp();
  await nestApp.listen(0);
  const address = nestApp.getHttpServer().address();
  baseUrl = `http://localhost:${(address as any).port}`;
});

afterAll(async () => {
  if (nestApp) {
    await nestApp.close();
  }
});

describe('Auth API (E2E)', () => {
  const testPhone = '13900000999';

  describe('POST /auth/send-code', () => {
    it('发送验证码成功', async () => {
      const res = await request(baseUrl)
        .post('/auth/send-code')
        .send({ phone: testPhone })
        .expect(201);

      expect(res.body.message).toBe('验证码已发送');
    });
  });

  describe('POST /auth/login (test mode 000000)', () => {
    it('客户登录成功', async () => {
      const res = await request(baseUrl)
        .post('/auth/login')
        .send({ phone: testPhone, code: '000000', role: 'customer' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.phone).toBe(testPhone);
      expect(res.body.user.role).toBe('customer');
    });

    it('工程师登录 - 账号不存在', async () => {
      const res = await request(baseUrl)
        .post('/auth/login')
        .send({ phone: '13999999999', code: '000000', role: 'engineer' })
        .expect(401);

      expect(res.body.message).toContain('不存在');
    });

    it('客服登录成功', async () => {
      const res = await request(baseUrl)
        .post('/auth/login')
        .send({ phone: '01012345678', code: '000000', role: 'cs_operator' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('cs_operator');
    });

    it('无效验证码', async () => {
      const res = await request(baseUrl)
        .post('/auth/login')
        .send({ phone: testPhone, code: '123456', role: 'customer' })
        .expect(400);

      expect(res.body.message).toContain('验证码');
    });
  });

  describe('POST /auth/register', () => {
    it('客户注册成功', async () => {
      const res = await request(baseUrl)
        .post('/auth/register')
        .send({
          phone: '13900000888',
          code: '000000',
          name: '测试客户',
          role: 'customer',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.name).toBe('测试客户');
    });

    it('工程师注册成功', async () => {
      const res = await request(baseUrl)
        .post('/auth/register')
        .send({
          phone: '13900000900',
          code: '000000',
          name: '测试工程师',
          role: 'engineer',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.name).toBe('测试工程师');
      expect(res.body.user.role).toBe('engineer');
    });

    it('手机号已注册', async () => {
      // 先注册
      await request(baseUrl)
        .post('/auth/register')
        .send({ phone: '13900000777', code: '000000', name: '重复', role: 'customer' })
        .expect(201);

      // 再次注册同号码
      const res = await request(baseUrl)
        .post('/auth/register')
        .send({ phone: '13900000777', code: '000000', name: '重复2', role: 'customer' })
        .expect(409);

      expect(res.body.message).toContain('已注册');
    });
  });
});

describe('WorkOrder API (E2E)', () => {
  let customerToken: string;
  let customerId: string;

  beforeAll(async () => {
    // 先登录获取 token
    const loginRes = await request(baseUrl)
      .post('/auth/login')
      .send({ phone: '13900000001', code: '000000', role: 'customer' });

    customerToken = loginRes.body.accessToken;
    customerId = loginRes.body.user.id;
  });

  describe('POST /customer/work-orders', () => {
    it('创建工单需要认证', async () => {
      await request(baseUrl)
        .post('/customer/work-orders')
        .send({ deviceId: 'test', faultType: '设备故障' })
        .expect(401);
    });

    it('创建工单 - 设备不存在', async () => {
      const res = await request(baseUrl)
        .post('/customer/work-orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          deviceId: 'non-existent-id',
          faultType: '设备故障',
          faultDescription: '测试故障',
          addressId: 'some-address',
          emergencyLevel: 1,
        })
        .expect(404);

      expect(res.body.message).toContain('设备不存在');
    });
  });

  describe('GET /customer/work-orders', () => {
    it('获取工单列表需要认证', async () => {
      await request(baseUrl)
        .get('/customer/work-orders')
        .expect(401);
    });

    it('获取工单列表成功', async () => {
      const res = await request(baseUrl)
        .get('/customer/work-orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});

describe('Engineer API (E2E)', () => {
  let engineerToken: string;

  beforeAll(async () => {
    const loginRes = await request(baseUrl)
      .post('/auth/login')
      .send({ phone: '13900000003', code: '000000', role: 'engineer' });

    engineerToken = loginRes.body.accessToken;
  });

  describe('GET /engineer/grab-pool', () => {
    it('获取工单池成功', async () => {
      const res = await request(baseUrl)
        .get('/engineer/grab-pool')
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('工单池排序正确 - 紧急在前', async () => {
      const res = await request(baseUrl)
        .get('/engineer/grab-pool')
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(200);

      const orders = res.body as any[];
      if (orders.length >= 2) {
        // 紧急工单（>=3）应该在前面
        const urgentIndex = orders.findIndex((o: any) => o.emergencyLevel >= 3);
        const normalIndex = orders.findIndex((o: any) => o.emergencyLevel < 3);
        if (urgentIndex !== -1 && normalIndex !== -1) {
          expect(urgentIndex).toBeLessThan(normalIndex);
        }
      }
    });
  });

  describe('PUT /engineer/status', () => {
    it('切换在线状态成功', async () => {
      const res = await request(baseUrl)
        .put('/engineer/status')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({ status: 'ONLINE' })
        .expect(200);

      expect(res.body.status).toBe('ONLINE');
    });
  });
});
