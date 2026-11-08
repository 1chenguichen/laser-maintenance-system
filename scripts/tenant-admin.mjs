// Operator-only provisioning; never expose database creation through a public endpoint.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const explicitDatabase=process.env.DB_DATABASE;
require('dotenv').config({path:fileURLToPath(new URL('../backend/.env',import.meta.url)),quiet:true});
const {Client}=require('pg');
const root=fileURLToPath(new URL('../',import.meta.url));
const defaultFile=path.join(root,'.local-preview/database.txt');
process.env.DB_DATABASE = explicitDatabase || (existsSync(defaultFile)?readFileSync(defaultFile,'utf8').trim():process.env.DB_DATABASE || 'laser_maintenance');
const config={host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024'};
const command=process.argv[2];
if(command==='backup') {
  const db=new Client({...config,database:process.env.DB_DATABASE});await db.connect();
  const dir=path.join(root,'.local-preview','backups','tenant-'+new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(dir,{recursive:true});
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const result={database:process.env.DB_DATABASE,tables:{}};
    for(const {tablename} of tables) result.tables[tablename]=(await db.query('SELECT * FROM public."'+tablename.replaceAll('"','""')+'"')).rows;
    writeFileSync(path.join(dir,'data.json'),JSON.stringify(result));
    writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({database:result.database,counts:Object.fromEntries(Object.entries(result.tables).map(([t,rows])=>[t,rows.length]))},null,2));
    await db.query('COMMIT');console.log('Read-only data snapshot:',dir);
  } finally {await db.end();}
} else {
  const {initializeRegistry,registry,resolveTenant}=await import('../backend/dist/tenancy/registry.js');
  await initializeRegistry();
  async function resolveTenantForOperator(code) {const row=(await registry.query('SELECT * FROM platform.tenants WHERE code=$1',[code])).rows[0];if(!row)throw Error('Enterprise not found');return row;}
  try {
    if(command==='create' || command==='ensure-demo') {
      const [code,name,phone,mode]=process.argv.slice(3);
      if(!/^[a-z0-9-]{2,40}$/.test(code||'')||!name||!/^1[3-9]\d{9}$/.test(phone||'')) throw Error('Usage: node scripts/tenant-admin.mjs create <code> <name> <admin-phone> [--demo]');
      if((await registry.query('SELECT 1 FROM platform.tenants WHERE code=$1',[code])).rows.length) { if(command==='ensure-demo' && process.env.DB_DATABASE==='laser_audit_20261025' && code.startsWith('audit-')) { await registry.query("UPDATE platform.tenants SET employee_limit=5000 WHERE code IN ('demo',$1)",[code]); console.log('Audit enterprise exists:',code); await registry.end(); process.exit(0); } throw Error('Enterprise code already exists'); }
      if(command==='ensure-demo' && (process.env.DB_DATABASE!=='laser_audit_20261025' || !code.startsWith('audit-'))) throw Error('ensure-demo is restricted to audit fixtures');
      const id=randomUUID(),database='laser_tenant_'+id.replaceAll('-','');
      const operator=new Client({...config,database:'postgres'});await operator.connect();
      try {await operator.query('CREATE DATABASE "'+database+'"');}finally{await operator.end();}
      const {DataSource}=require('typeorm');
      const source=new DataSource({type:'postgres',...config,username:config.user,database,entities:[path.join(root,'backend/dist/database/entities/*.entity.js')],synchronize:true});
      try {await source.initialize();}finally{if(source.isInitialized)await source.destroy();}
      const member=randomUUID();
      await registry.query(`WITH created AS (INSERT INTO platform.tenants(id,code,name,database_name,demo_auth) VALUES($1,$2,$3,$4,$5) RETURNING id) INSERT INTO platform.memberships(id,tenant_id,subject_id,role,phone,name) SELECT $6::uuid,id,($6::uuid)::text,'cs_operator',$7,'企业管理员' FROM created`,[id,code,name,database,mode==='--demo',member,phone]);
      console.log('Enterprise provisioned:',code,name,mode==='--demo'?'(demo authentication)':'(authentication provider required)');
    } else if(command==='migrate-files') {
      const tenant=await resolveTenant('demo');
      const db=new Client({...config,database:tenant.database_name});await db.connect();
      let copied=0;
      try {
        const {rows}=await db.query('SELECT fault_photos,on_site_photos,signature_url FROM work_orders');
        for(const row of rows) for(const url of [...row.fault_photos||[],...row.on_site_photos||[],row.signature_url].filter(Boolean)) {
          const m=String(url).match(/^\/uploads\/fault-photos\/([a-zA-Z0-9_.-]+)$/);if(!m)continue;
          const from=path.join(root,'backend/uploads/fault-photos',m[1]),to=path.join(root,'backend/uploads',tenant.id,'fault-photos',m[1]);
          if(existsSync(from)&&!existsSync(to)){mkdirSync(path.dirname(to),{recursive:true});copyFileSync(from,to);copied++;}
        }
      }finally{await db.end();}
      console.log('Referenced legacy files copied:',copied);
    } else if(command==='status') {
      const [code,state,phone,role]=process.argv.slice(3);
      if(!['enabled','disabled'].includes(state)) throw Error('Usage: status <code> enabled|disabled [phone role]');
      const tenant=await resolveTenantForOperator(code);
      if(phone) {
        if(!['customer','engineer','cs_operator'].includes(role)) throw Error('Specify account role');
        const changed=await registry.query('UPDATE platform.memberships SET enabled=$1,version=version+1 WHERE tenant_id=$2 AND phone=$3 AND role=$4 RETURNING id',[state==='enabled',tenant.id,phone,role]);
        if(!changed.rows.length)throw Error('Membership not found');
      } else await registry.query('UPDATE platform.tenants SET enabled=$1 WHERE id=$2',[state==='enabled',tenant.id]);
      console.log('Status updated:',code,state,phone||'enterprise');
    } else if(command==='list') {
      console.table((await registry.query('SELECT code,name,enabled,demo_auth FROM platform.tenants ORDER BY code')).rows);
    } else throw Error('Commands: backup | create | migrate-files | list');
  }finally{await registry.end();}
}
