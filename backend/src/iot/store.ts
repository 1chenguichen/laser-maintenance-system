import { Pool } from 'pg';
const database =
  process.env.IOT_DATABASE ||
  `${process.env.DB_DATABASE || 'laser_maintenance'}_iot`;
if (!/^laser_[a-z0-9_]{1,56}$/.test(database))
  throw Error('Invalid IOT_DATABASE');
const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || 'laser_user',
  password: process.env.DB_PASSWORD || 'laser_pass_2024',
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
};
export const iotStore = new Pool({ ...connection, database, max: 5 });
export async function ensureIoTStore() {
  const admin = new Pool({
    ...connection,
    database:
      process.env.TENANT_CONTROL_DATABASE ||
      process.env.DB_DATABASE ||
      'laser_maintenance',
    max: 1,
  });
  try {
    if (
      !(
        await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [
          database,
        ])
      ).rowCount
    )
      await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }
  await iotStore.query(`CREATE SCHEMA IF NOT EXISTS iot;
 CREATE TABLE IF NOT EXISTS iot.subscriptions(tenant_id uuid PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,device_limit integer NOT NULL DEFAULT 100 CHECK(device_limit BETWEEN 1 AND 100000),expires_at timestamptz,retention_days integer NOT NULL DEFAULT 30 CHECK(retention_days BETWEEN 1 AND 3650),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS iot.devices(asset_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,model text NOT NULL,serial text NOT NULL,device_type text NOT NULL DEFAULT '',province text NOT NULL DEFAULT '',city text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '',longitude numeric,latitude numeric,simulated boolean NOT NULL DEFAULT false,enabled boolean NOT NULL DEFAULT true,credential_hash text UNIQUE NOT NULL,credential_version integer NOT NULL DEFAULT 1,metrics jsonb NOT NULL,latest jsonb NOT NULL DEFAULT '{}',latest_at timestamptz,last_received_at timestamptz,offline_after_seconds integer NOT NULL DEFAULT 45 CHECK(offline_after_seconds BETWEEN 10 AND 86400),created_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE iot.devices ADD COLUMN IF NOT EXISTS metric_times jsonb NOT NULL DEFAULT '{}';
 CREATE INDEX IF NOT EXISTS iot_devices_tenant ON iot.devices(tenant_id);
 CREATE TABLE IF NOT EXISTS iot.samples(id bigserial PRIMARY KEY,asset_id uuid NOT NULL REFERENCES iot.devices(asset_id),sample_id uuid NOT NULL,recorded_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),values jsonb NOT NULL,fingerprint text NOT NULL,UNIQUE(asset_id,sample_id));
 CREATE INDEX IF NOT EXISTS iot_samples_time ON iot.samples(asset_id,recorded_at DESC);
 CREATE TABLE IF NOT EXISTS iot.alarms(id uuid PRIMARY KEY,asset_id uuid NOT NULL REFERENCES iot.devices(asset_id),tenant_id uuid NOT NULL,metric text NOT NULL,label text NOT NULL,level text NOT NULL DEFAULT 'warning',value numeric NOT NULL,threshold text NOT NULL,snapshot jsonb NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),recovered_at timestamptz,acknowledged_at timestamptz,acknowledged_by uuid,ack_note text NOT NULL DEFAULT '',ticket_id uuid,ticket_number text,ticket_payload jsonb,ticket_actor jsonb);
 ALTER TABLE iot.alarms ADD COLUMN IF NOT EXISTS resolution_reason text;
 CREATE UNIQUE INDEX IF NOT EXISTS iot_alarm_active ON iot.alarms(asset_id,metric) WHERE recovered_at IS NULL;
 CREATE INDEX IF NOT EXISTS iot_alarm_tenant ON iot.alarms(tenant_id,started_at DESC);
 CREATE TABLE IF NOT EXISTS iot.rule_states(asset_id uuid NOT NULL REFERENCES iot.devices(asset_id),metric text NOT NULL,breach_since timestamptz,PRIMARY KEY(asset_id,metric));
 CREATE TABLE IF NOT EXISTS iot.members(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,person_id uuid NOT NULL,role text NOT NULL CHECK(role IN ('viewer','operator','admin')),asset_ids uuid[],enabled boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,person_id));
 CREATE TABLE IF NOT EXISTS iot.maintenance_state(name text PRIMARY KEY,last_success_at timestamptz NOT NULL,deleted_rows bigint NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS iot.audit(id uuid PRIMARY KEY,tenant_id uuid,actor_id uuid,action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
 `);
}
