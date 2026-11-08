import { ensurePlatformSchema } from '../platform/schema.js';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { UnauthorizedException } from '@nestjs/common';
import { Tenant } from './context.js';

export const registry = new Pool({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USERNAME || 'laser_user', password: process.env.DB_PASSWORD || 'laser_pass_2024', database: process.env.TENANT_CONTROL_DATABASE || process.env.DB_DATABASE || 'laser_maintenance', max: 3 });
export async function initializeRegistry() {
  await registry.query(`CREATE SCHEMA IF NOT EXISTS platform;
    CREATE TABLE IF NOT EXISTS platform.tenants(id uuid PRIMARY KEY, code varchar(40) UNIQUE NOT NULL, name text NOT NULL, database_name text UNIQUE NOT NULL, enabled boolean NOT NULL DEFAULT true, demo_auth boolean NOT NULL DEFAULT false);
    CREATE TABLE IF NOT EXISTS platform.memberships(id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES platform.tenants(id), subject_id text NOT NULL, role text NOT NULL, phone text NOT NULL, name text NOT NULL, enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, UNIQUE(tenant_id, role, phone), UNIQUE(tenant_id, role, subject_id));`);
  await ensurePlatformSchema();
  const database = process.env.DB_DATABASE || 'laser_maintenance';
  await registry.query('INSERT INTO platform.tenants(id,code,name,database_name,demo_auth) VALUES($1,$2,$3,$4,true) ON CONFLICT(code) DO NOTHING', [randomUUID(), 'demo', '默认演示企业', database]);
  const tenant: Tenant = (await registry.query('SELECT * FROM platform.tenants WHERE code=$1',['demo'])).rows[0];
  if (tenant.database_name !== database) throw new Error('Default tenant database mismatch; use a separate TENANT_CONTROL_DATABASE for tests');
  const id = randomUUID();
  await registry.query('INSERT INTO platform.memberships(id,tenant_id,subject_id,role,phone,name) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,role,phone) DO NOTHING', [id,tenant.id,id,'cs_operator',process.env.DEFAULT_ADMIN_PHONE || '13800138000','企业管理员']);
}
export async function resolveTenant(code: string): Promise<Tenant> {
  const result = await registry.query("SELECT * FROM platform.tenants WHERE code=$1 AND enabled=true AND provisioning_status='READY' AND (expires_at IS NULL OR expires_at>now())", [code]);
  if (!result.rows[0]) throw new UnauthorizedException('企业不存在、已停用或已到期');
  return result.rows[0];
}
export async function membership(tenant: Tenant, role: string, user: any) {
  await registry.query('INSERT INTO platform.memberships(id,tenant_id,subject_id,role,phone,name) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,role,phone) DO NOTHING', [randomUUID(),tenant.id,user.id,role,user.phone,user.name || '用户']);
  const { rows } = await registry.query('SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role=$2 AND phone=$3 AND subject_id=$4 AND enabled=true', [tenant.id,role,user.phone,user.id]);
  if (!rows[0]) throw new UnauthorizedException('账号已停用或归属不匹配');
  return rows[0];
}
export async function validateIdentity(payload: any): Promise<Tenant> {
  if (payload?.exp && payload.exp <= Math.floor(Date.now()/1000)) throw new UnauthorizedException('登录已过期');
  if (payload?.purpose !== 'access' || !payload.tenantId || !payload.membershipId) throw new UnauthorizedException('请重新选择企业并登录');
  const { rows } = await registry.query(`SELECT t.* FROM platform.tenants t JOIN platform.memberships m ON m.tenant_id=t.id WHERE t.id=$1 AND t.enabled=true AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) AND m.id=$2 AND m.enabled=true AND m.subject_id=$3 AND m.role=$4 AND m.version=$5`, [payload.tenantId,payload.membershipId,payload.sub,payload.role,payload.version]);
  if (!rows[0]) throw new UnauthorizedException('企业或账号已停用，请重新登录');
  return rows[0];
}
