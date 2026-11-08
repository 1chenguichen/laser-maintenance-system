import { registry } from '../tenancy/registry.js';

export async function ensurePlatformSchema() {
  await registry.query(`
    CREATE TABLE IF NOT EXISTS platform.plans (
      code text PRIMARY KEY, name text NOT NULL, employee_limit integer NOT NULL CHECK(employee_limit>0),
      storage_limit_mb integer NOT NULL CHECK(storage_limit_mb>0), features jsonb NOT NULL, description text NOT NULL
    );
    INSERT INTO platform.plans VALUES
      ('basic','基础版',10,1024,'["inventory"]','维修工单、配件库存、工程师移动仓'),
      ('professional','专业版',50,10240,'["inventory","contracts","finance"]','含服务合同、结算与发票'),
      ('enterprise','企业版',200,51200,'["inventory","contracts","finance"]','完整业务功能，更高员工和附件额度') ON CONFLICT DO NOTHING;
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS provisioning_status text NOT NULL DEFAULT 'READY';
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS plan_code text NOT NULL DEFAULT 'professional';
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS employee_limit integer NOT NULL DEFAULT 50;
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS storage_limit_mb integer NOT NULL DEFAULT 10240;
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '["inventory","contracts","finance"]';
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS expires_at timestamptz;
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS company_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS company_logo text;
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS company_version integer NOT NULL DEFAULT 1;
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '';
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '';
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS admin_phone text;
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS provisioning_error text;
    ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 0;
    UPDATE platform.tenants t SET admin_phone=m.phone FROM platform.memberships m
      WHERE m.tenant_id=t.id AND m.role='cs_operator' AND t.admin_phone IS NULL;
    CREATE TABLE IF NOT EXISTS platform.admins (
      id uuid PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
      name text NOT NULL, enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS platform.audit_logs (
      id uuid PRIMARY KEY, actor_id uuid, actor_name text NOT NULL, tenant_id uuid,
      action text NOT NULL, reason text NOT NULL DEFAULT '', before_data jsonb, after_data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS platform_audit_time ON platform.audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS platform_audit_tenant ON platform.audit_logs(tenant_id,created_at DESC);
  `);
}
