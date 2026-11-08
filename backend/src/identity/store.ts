import {randomUUID,randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {Client} from 'pg';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {UnauthorizedException} from '@nestjs/common';
import {registry} from '../tenancy/registry.js';
import {hashPassword,checkPassword} from '../platform/security.js';

export function sealCredential(value:string){
  if(!process.env.JWT_SECRET)throw Error('JWT_SECRET required');
  const key=createHash('sha256').update(process.env.JWT_SECRET).digest(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');
}
export function openCredential(value?:string|null){
  if(!value)return null;
  const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64'));
  const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(process.env.JWT_SECRET||'').digest(),iv);
  decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
export async function ensureIdentitySchema(){
  await registry.query(`CREATE SCHEMA IF NOT EXISTS identity;
    CREATE TABLE IF NOT EXISTS identity.people(id uuid PRIMARY KEY,phone text UNIQUE NOT NULL,name text NOT NULL,enabled boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS identity.links(id uuid PRIMARY KEY,person_id uuid NOT NULL REFERENCES identity.people(id),tenant_id uuid NOT NULL REFERENCES platform.tenants(id),role text NOT NULL,local_id uuid NOT NULL,UNIQUE(tenant_id,role,local_id),UNIQUE(person_id,tenant_id,role));
    CREATE TABLE IF NOT EXISTS identity.business_accounts(id uuid PRIMARY KEY,tenant_id uuid UNIQUE NOT NULL REFERENCES platform.tenants(id),membership_id uuid,username text UNIQUE NOT NULL,password_hash text NOT NULL,enabled boolean NOT NULL DEFAULT true);
    CREATE TABLE IF NOT EXISTS identity.resources(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,kind text NOT NULL,local_id uuid NOT NULL,UNIQUE(tenant_id,kind,local_id));
    CREATE TABLE IF NOT EXISTS identity.addresses(id uuid PRIMARY KEY,person_id uuid NOT NULL REFERENCES identity.people(id),fingerprint text NOT NULL,data jsonb NOT NULL,deleted boolean NOT NULL DEFAULT false,UNIQUE(person_id,fingerprint));
    CREATE TABLE IF NOT EXISTS identity.address_links(address_id uuid NOT NULL REFERENCES identity.addresses(id),tenant_id uuid NOT NULL,local_id uuid NOT NULL,UNIQUE(tenant_id,local_id));
    CREATE TABLE IF NOT EXISTS identity.assets(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES platform.tenants(id),local_id uuid NOT NULL,serial text NOT NULL,UNIQUE(tenant_id,local_id));
    ALTER TABLE identity.business_accounts ADD COLUMN IF NOT EXISTS initial_password_encrypted text;
    ALTER TABLE identity.business_accounts ADD COLUMN IF NOT EXISTS issued_password_encrypted text;
    CREATE INDEX IF NOT EXISTS identity_asset_serial ON identity.assets(serial);
    CREATE INDEX IF NOT EXISTS identity_links_person ON identity.links(person_id,role);
  `);
}
export async function person(phone:string,name='新用户'){
  return (await registry.query(`INSERT INTO identity.people(id,phone,name) VALUES($1,$2,$3) ON CONFLICT(phone) DO UPDATE SET name=CASE WHEN identity.people.name IN ('新用户','新客户') AND EXCLUDED.name NOT IN ('新用户','新客户') THEN EXCLUDED.name ELSE identity.people.name END RETURNING *`,[randomUUID(),phone,name])).rows[0];
}
export async function indexPerson(tenantId:string,role:string,localId:string,phone:string,name:string){
  if(!/^[0-9a-f-]{36}$/i.test(localId))return;
  const user=await person(phone,name);
  await registry.query('INSERT INTO identity.links(id,person_id,tenant_id,role,local_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,role,local_id) DO UPDATE SET person_id=EXCLUDED.person_id',[randomUUID(),user.id,tenantId,role,localId]);
  const updated=await registry.query('UPDATE platform.memberships SET version=version+CASE WHEN phone<>$4 THEN 1 ELSE 0 END,phone=$4,name=$5 WHERE tenant_id=$1 AND role=$2 AND subject_id=$3 RETURNING id',[tenantId,role,localId,phone,name]);
  if(!updated.rows.length)await registry.query('INSERT INTO platform.memberships(id,tenant_id,subject_id,role,phone,name) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,role,phone) DO NOTHING',[randomUUID(),tenantId,localId,role,phone,name]);
  return user;
}
export async function indexAsset(tenantId:string,localId:string,serial:string){
  return (await registry.query('INSERT INTO identity.assets(id,tenant_id,local_id,serial) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,local_id) DO UPDATE SET serial=EXCLUDED.serial RETURNING *',[randomUUID(),tenantId,localId,serial])).rows[0];
}
export function businessClient(database:string){
  if(!/^laser_[a-z0-9_]+$/.test(database))throw Error('Invalid database');
  return new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024',database,connectionTimeoutMillis:5000,statement_timeout:10000});
}
export async function createBusinessAccount(tenantId:string,membershipId:string|null,preferred?:string,password?:string,client:any=registry){
  const existing=(await client.query('SELECT username FROM identity.business_accounts WHERE tenant_id=$1',[tenantId])).rows[0];
  if(existing)return {username:existing.username};
  const username=preferred||'u'+randomBytes(5).toString('hex');
  const initialPassword=password||randomBytes(12).toString('base64url');
  await client.query('INSERT INTO identity.business_accounts(id,tenant_id,membership_id,username,password_hash,initial_password_encrypted,issued_password_encrypted) VALUES($1,$2,$3,$4,$5,$6,$6)',[randomUUID(),tenantId,membershipId,username,await hashPassword(initialPassword),sealCredential(initialPassword)]);
  return {username,password:initialPassword};
}
export async function initializeIdentity(){
  await ensureIdentitySchema();
  const file=join(process.cwd(),'..','.local-preview','business-accounts-'+(process.env.DB_DATABASE||'default')+'.json');
  let credentials:any[]=[];try{credentials=JSON.parse(await readFile(file,'utf8'));}catch{}
  const tenants=(await registry.query("SELECT * FROM platform.tenants WHERE provisioning_status='READY' ORDER BY CASE WHEN code='demo' THEN 0 ELSE 1 END,created_at,id")).rows;
  for(const t of tenants){
    const db=businessClient(t.database_name);
    try{
      await db.connect();
      await db.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb");
      for(const [table,role] of [['customers','customer'],['engineers','engineer']]){
        const rows=(await db.query('SELECT id,phone,name FROM '+table)).rows;
        for(const row of rows)await indexPerson(t.id,role,row.id,row.phone,row.name);
      }
      for(const asset of (await db.query('SELECT id,serial_number FROM devices')).rows)await indexAsset(t.id,asset.id,asset.serial_number);
      const admin=(await registry.query("SELECT id,phone FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' ORDER BY id LIMIT 1",[t.id])).rows[0];
      if(admin){
        const used=(await registry.query('SELECT 1 FROM identity.business_accounts WHERE username=$1',[admin.phone])).rows.length;
        const account=await createBusinessAccount(t.id,admin.id,used?undefined:admin.phone);
        if(account.password)credentials.push({tenantName:t.name,tenantId:t.id,...account});
      }
    }finally{await db.end();}
  }
  await mkdir(join(process.cwd(),'..','.local-preview'),{recursive:true});
  await writeFile(file,JSON.stringify(credentials,null,2));
  for(const entry of credentials){
    if(!entry.password)continue;
    const row=(await registry.query('SELECT password_hash FROM identity.business_accounts WHERE tenant_id=$1 AND username=$2',[entry.tenantId,entry.username])).rows[0];
    const matches=!!row&&await checkPassword(entry.password,row.password_hash);
    await registry.query('UPDATE identity.business_accounts SET initial_password_encrypted=$3,issued_password_encrypted=CASE WHEN $4 THEN $3 ELSE issued_password_encrypted END WHERE tenant_id=$1 AND username=$2 AND initial_password_encrypted IS NULL',[entry.tenantId,entry.username,sealCredential(entry.password),matches]);
  }
  console.log('[Identity] Business account delivery file:',file);
}
export async function validatePerson(payload:any){
  if(payload?.purpose!=='unified_access'||!['customer','engineer'].includes(payload.role)||payload.exp<=Date.now()/1000)throw new UnauthorizedException('请重新登录');
  const user=(await registry.query('SELECT * FROM identity.people WHERE id=$1 AND version=$2 AND enabled=true',[payload.sub,payload.version])).rows[0];
  if(!user)throw new UnauthorizedException('账号已停用，请重新登录');
  return user;
}
export async function personLinks(payload:any){
  const user=await validatePerson(payload);
  return (await registry.query(`SELECT l.id AS link_id,l.local_id,m.id AS membership_id,m.version AS membership_version,t.* FROM identity.links l
    JOIN platform.memberships m ON m.tenant_id=l.tenant_id AND m.subject_id=l.local_id::text AND m.role=l.role AND m.phone=$3 AND m.enabled
    JOIN platform.tenants t ON t.id=l.tenant_id AND t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now())
    WHERE l.person_id=$1 AND l.role=$2 AND ($4<>'demo' OR t.demo_auth) ORDER BY t.created_at,t.id`,[user.id,payload.role,user.phone,payload.amr||'demo'])).rows;
}
export async function resource(tenantId:string,kind:string,localId:string){
  if(kind==='address'){
    const known=(await registry.query('SELECT address_id FROM identity.address_links WHERE tenant_id=$1 AND local_id=$2',[tenantId,localId])).rows[0];
    if(known)return known.address_id;
  }
  return (await registry.query('INSERT INTO identity.resources(id,tenant_id,kind,local_id) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,kind,local_id) DO UPDATE SET local_id=EXCLUDED.local_id RETURNING id',[randomUUID(),tenantId,kind,localId])).rows[0].id;
}
export async function saveAddress(personId:string,data:any,tenantId?:string,localId?:string){
  if(tenantId&&localId){const known=(await registry.query('SELECT address_id FROM identity.address_links WHERE tenant_id=$1 AND local_id=$2',[tenantId,localId])).rows[0];if(known)return {...data,id:known.address_id};}
  const value:any={};for(const key of ['province','city','district','detail','longitude','latitude','label','isDefault'])if(data[key]!==undefined)value[key]=data[key];
  for(const key of ['longitude','latitude'])if(value[key]!==undefined&&value[key]!==null)value[key]=Number(value[key]);
  const fingerprint=createHash('sha256').update(JSON.stringify(Object.keys(value).sort().map(k=>[k,value[k]]))).digest('hex');
  const row=(await registry.query('INSERT INTO identity.addresses(id,person_id,fingerprint,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(person_id,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING *',[randomUUID(),personId,fingerprint,JSON.stringify(value)])).rows[0];
  if(tenantId&&localId)await registry.query('INSERT INTO identity.address_links(address_id,tenant_id,local_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[row.id,tenantId,localId]);
  return {id:row.id,...row.data};
}
