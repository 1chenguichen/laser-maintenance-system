import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
require('reflect-metadata');
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
const dotenv=require('dotenv');
const pg=require('pg');
const {JwtService}=require('@nestjs/jwt');
const root=fileURLToPath(new URL('../',import.meta.url));
dotenv.config({path:path.join(root,'backend/.env'),quiet:true});
const database=(await fs.readFile(path.join(root,'.local-preview/database.txt'),'utf8')).trim();
const db=new pg.Client({host:process.env.DB_HOST||'localhost',user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database});await db.connect();
const jwt=new JwtService({secret:process.env.JWT_SECRET});
const admin=(await db.query('SELECT * FROM platform.admins WHERE enabled ORDER BY id LIMIT 1')).rows[0];
const platform=jwt.sign({sub:admin.id,version:admin.version,purpose:'platform_access',role:'platform_admin'},{expiresIn:'2h'});
async function api(url,token,body){const r=await fetch('http://localhost:8180'+url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();if(!r.ok)throw Error(url+' '+r.status+' '+JSON.stringify(value));return value;}
async function companyToken(id){const m=(await db.query("SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND enabled LIMIT 1",[id])).rows[0];return jwt.sign({sub:m.subject_id,membershipId:m.id,tenantId:id,version:m.version,phone:m.phone,role:'cs_operator',purpose:'access'},{expiresIn:'2h'});}
const definitions=[{code:'weibao-platform-service',name:'维保云自营技术服务中心（演示）',kind:'PLATFORM_SERVICE',adminPhone:'13897000011',account:'weibao_service_demo',cities:['全国'],staff:[['平台工程师 · 陈工','13690000101'],['平台工程师 · 周工','13690000102']]},{code:'huanan-outsourced-service',name:'华南激光售后服务有限公司（演示）',kind:'OUTSOURCE',adminPhone:'13897000012',account:'huanan_service_demo',cities:['深圳市','东莞市','广州市'],staff:[['华南售后 · 刘工','13690000201'],['华南售后 · 黄工','13690000202']]}];
const result=[];
try{
 for(const d of definitions){
  let t=(await db.query('SELECT * FROM platform.tenants WHERE code=$1',[d.code])).rows[0];
  if(!t){await api('/platform/tenants',platform,{code:d.code,name:d.name,adminPhone:d.adminPhone,adminAccount:d.account,adminPassword:'Demo-'+randomBytes(12).toString('base64url'),contactName:'模拟服务调度员',planCode:'enterprise',expiresAt:new Date(Date.now()+365*864e5).toISOString(),demoAuth:true});}
  for(let i=0;i<40;i++){t=(await db.query('SELECT * FROM platform.tenants WHERE code=$1',[d.code])).rows[0];if(t?.provisioning_status==='READY')break;if(t?.provisioning_status==='FAILED')throw Error(t.provisioning_error);await new Promise(r=>setTimeout(r,500));}
  if(t?.provisioning_status!=='READY')throw Error('企业尚未开通完成：'+d.name);
  const business=await companyToken(t.id);
  await api('/market/service-network',platform,{type:'profile',tenantId:t.id,kind:d.kind,serviceMode:'SELF',cities:d.cities});
  let engineers=await api('/admin/engineers',business);
  for(const [name,phone] of d.staff){
   if(!engineers.some(e=>e.phone===phone)){await api('/admin/engineers',business,{name,phone});engineers=await api('/admin/engineers',business);}
   const person=await api('/identity/login',null,{phone,code:'000000',role:'engineer'});
   const existing=(await db.query('SELECT * FROM market.engineers WHERE person_id=$1',[person.user.id])).rows[0];
   if(!existing){await api('/market/engineer-profile',person.accessToken,{name,mode:'ORG',cities:d.cities,introduction:'模拟培训及审核通过的演示工程师，用于验证派单与服务履约，不代表真实人员或真实技能证书。'});await api('/market/platform',platform,{type:'review',personId:person.user.id,state:'APPROVED',note:'仅演示：模拟培训及身份审核通过'});}
   for(const skill of ['cutting','welding','marking','maintenance','installation','inspection'])await db.query("INSERT INTO market.qualifications(id,person_id,skill,expires_at,source) VALUES($1,$2,$3,now()+interval '1 year','模拟培训考核（仅演示）') ON CONFLICT(person_id,skill) DO NOTHING",[randomUUID(),person.user.id,skill]);
  }
  const info=await api('/platform/tenants/'+t.id,platform);result.push({id:t.id,name:d.name,code:d.code,kind:d.kind,adminAccount:info.adminAccount,initialPassword:info.initialPassword,staff:d.staff});
 }
 const shaohui=(await db.query("SELECT id,name FROM platform.tenants WHERE name LIKE '%绍辉%' AND provisioning_status='READY' ORDER BY created_at LIMIT 1")).rows[0];
 const huadong=(await db.query("SELECT id,name FROM platform.tenants WHERE name LIKE '%华东%' AND provisioning_status='READY' ORDER BY created_at LIMIT 1")).rows[0];
 if(huadong)await api('/market/service-network',platform,{type:'profile',tenantId:huadong.id,kind:'MERCHANT',serviceMode:'SELF'});
 if(shaohui){let a=(await db.query("SELECT * FROM market.service_agreements WHERE client_id=$1 AND provider_id=$2 AND state IN ('PENDING','ACTIVE')",[shaohui.id,result[1].id])).rows[0];if(!a){await api('/market/service-network',platform,{type:'agreement',clientId:shaohui.id,providerId:result[1].id,cities:definitions[1].cities});a=(await db.query("SELECT * FROM market.service_agreements WHERE client_id=$1 AND provider_id=$2 AND state='PENDING'",[shaohui.id,result[1].id])).rows[0];}if(a.state==='PENDING')await api('/market/service-network',await companyToken(result[1].id),{type:'agreement-state',id:a.id,state:'ACTIVE'});await api('/market/service-network',platform,{type:'profile',tenantId:shaohui.id,kind:'MERCHANT',serviceMode:'OUTSOURCE',contractorId:result[1].id});}
 await fs.writeFile(path.join(root,'.local-preview/service-network-demo.json'),JSON.stringify({companies:result,shaohui,huadong},null,2));
 console.log('READY 两家模拟服务企业、4 名工程师、模拟培训资质；华东自营、绍辉与华南外包合作。账号信息保存在维保云企业详情及 .local-preview/service-network-demo.json');
}finally{await db.end();}
