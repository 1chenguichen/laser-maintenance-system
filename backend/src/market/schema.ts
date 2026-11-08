import { registry } from '../tenancy/registry.js';
export const CATEGORIES = [
  'cutting',
  'welding',
  'marking',
  'maintenance',
  'installation',
  'inspection',
];
export async function ensureMarketSchema() {
  await registry.query(`CREATE SCHEMA IF NOT EXISTS market;
CREATE TABLE IF NOT EXISTS market.offers(id uuid PRIMARY KEY,tenant_id uuid REFERENCES platform.tenants(id),title text NOT NULL,category text NOT NULL,city text NOT NULL,description text NOT NULL DEFAULT '',published boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS market.engineers(person_id uuid PRIMARY KEY REFERENCES identity.people(id),mode text NOT NULL DEFAULT 'ORG',cities jsonb NOT NULL DEFAULT '[]',introduction text NOT NULL DEFAULT '',state text NOT NULL DEFAULT 'PENDING',review_note text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS market.courses(id uuid PRIMARY KEY,title text NOT NULL,skill text NOT NULL,city text NOT NULL,center_name text NOT NULL,address text NOT NULL,start_date date NOT NULL,capacity integer NOT NULL CHECK(capacity>0),published boolean NOT NULL DEFAULT false,description text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS market.enrollments(id uuid PRIMARY KEY,course_id uuid NOT NULL REFERENCES market.courses(id),person_id uuid NOT NULL REFERENCES identity.people(id),state text NOT NULL DEFAULT 'ENROLLED',note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(course_id,person_id));
CREATE TABLE IF NOT EXISTS market.qualifications(id uuid PRIMARY KEY,person_id uuid NOT NULL REFERENCES identity.people(id),skill text NOT NULL,expires_at timestamptz NOT NULL,source text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(person_id,skill));
CREATE TABLE IF NOT EXISTS market.requests(id uuid PRIMARY KEY,number text UNIQUE NOT NULL,customer_id uuid NOT NULL REFERENCES identity.people(id),offer_id uuid NOT NULL REFERENCES market.offers(id),commissioner_id uuid REFERENCES platform.tenants(id),provider_id uuid REFERENCES platform.tenants(id),assigned_provider_id uuid REFERENCES platform.tenants(id),engineer_id uuid REFERENCES identity.people(id),device_ref uuid,device_model text NOT NULL,category text NOT NULL,city text NOT NULL,address text NOT NULL,description text NOT NULL,status text NOT NULL DEFAULT 'REQUESTED',quote_amount numeric(12,2),quote_note text NOT NULL DEFAULT '',report text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS market.events(id uuid PRIMARY KEY,request_id uuid REFERENCES market.requests(id),actor_id uuid,action text NOT NULL,note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS market.service_profiles(tenant_id uuid PRIMARY KEY REFERENCES platform.tenants(id) ON DELETE CASCADE,kind text NOT NULL DEFAULT 'MERCHANT' CHECK(kind IN ('MERCHANT','PLATFORM_SERVICE','OUTSOURCE')),service_mode text NOT NULL DEFAULT 'PLATFORM' CHECK(service_mode IN ('SELF','PLATFORM','OUTSOURCE')),contractor_id uuid REFERENCES platform.tenants(id),cities jsonb NOT NULL DEFAULT '["全国"]',categories jsonb NOT NULL DEFAULT '["cutting","welding","marking","maintenance","installation","inspection"]',updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS market_platform_service_company ON market.service_profiles(kind) WHERE kind='PLATFORM_SERVICE';
CREATE TABLE IF NOT EXISTS market.service_agreements(id uuid PRIMARY KEY,client_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,provider_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACTIVE','REJECTED','ENDED')),cities jsonb NOT NULL,categories jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(client_id<>provider_id));
CREATE UNIQUE INDEX IF NOT EXISTS market_service_agreement_open ON market.service_agreements(client_id,provider_id) WHERE state IN ('PENDING','ACTIVE');
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS delegation_state text NOT NULL DEFAULT 'NONE';
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS dispatch_source text NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS dispatcher_kind text;
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS service_kind_snapshot text;
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS dispatcher_id uuid;
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS agreement_id uuid REFERENCES market.service_agreements(id);
ALTER TABLE market.offers ADD COLUMN IF NOT EXISTS system_only boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS market_system_offer ON market.offers(category) WHERE system_only AND tenant_id IS NULL;
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS device_serial text;
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS intake jsonb NOT NULL DEFAULT '{}';
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS submission_key uuid;
ALTER TABLE market.requests ADD COLUMN IF NOT EXISTS submission_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS market_submission ON market.requests(customer_id,submission_key) WHERE submission_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS market.attachments(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES identity.people(id),request_id uuid REFERENCES market.requests(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS market.visuals(id uuid PRIMARY KEY,kind text NOT NULL,entity_id uuid NOT NULL,tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,request_id uuid REFERENCES market.requests(id) ON DELETE CASCADE,slot text NOT NULL,actor_kind text NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS market_visual_entity ON market.visuals(kind,entity_id,created_at);
CREATE INDEX IF NOT EXISTS market_requests_customer ON market.requests(customer_id,created_at DESC);CREATE INDEX IF NOT EXISTS market_requests_engineer ON market.requests(engineer_id,status);`);
}
