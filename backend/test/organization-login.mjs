import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);require('dotenv').config({path:new URL('../.env',import.meta.url),quiet:true});
const base=process.env.TEST_API_BASE;if(!base||new URL(base).port!=='8280')throw Error('Use audit backend 8280');
const {Client}=require('pg'),Redis=require('ioredis');
const db=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024',database:'laser_audit_20261025'});await db.connect();
const redis=new Redis({host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379)});
const run=String(Date.now()),phone='1921'+run.slice(-7),organizations=[],results=[];let platform;
async function raw(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();return {status:r.status,data};}
async function call(path,body,token){const r=await raw(path,body,token);assert(r.status<300,JSON.stringify(r));return r.data;}
async function denied(path,body,token){assert([400,401,403].includes((await raw(path,body,token)).status));}
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name)}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL',name,e.message)}}
try{
await test('平台只填企业名称即可自动开通，内部标识自动生成',async()=>{
 platform=(await call('/platform/auth/login',{username:process.env.PLATFORM_ADMIN_USERNAME,password:process.env.PLATFORM_ADMIN_PASSWORD})).accessToken;
 for(const name of ['入口体验甲企业','入口体验乙企业']){
  const t=await call('/platform/tenants',{name:name+run,adminPhone:phone,contactName:'入口测试',planCode:'professional',expiresAt:new Date(Date.now()+86400000*14).toISOString(),demoAuth:true},platform);
  for(let i=0;i<60;i++){const record=await call('/platform/tenants/'+t.id,null,platform);if(record.status==='ACTIVE'){organizations.push(record);break;}assert.notEqual(record.status,'FAILED');await new Promise(r=>setTimeout(r,200));}
 }
 assert.equal(organizations.length,2);assert.notEqual(organizations[0].code,organizations[1].code);
 for(const t of organizations){
  const admin=await call('/auth/login',{organizationId:t.id,phone,code:'000000',role:'cs_operator'});
  await call('/admin/engineers',{name:'入口工程师',phone},admin.accessToken);
  await call('/auth/login',{organizationId:t.id,phone,code:'000000',role:'customer'});
 }
});
await test('专属入口只返回企业名称和必要信息，旧链接兼容且无效入口拒绝',async()=>{
 const a=organizations[0],info=await call('/auth/organization?organizationId='+a.id);assert.equal(info.name,a.name);assert(!('code' in info));assert(!('database_name' in info));
 assert.equal((await call('/auth/organization?tenantCode='+a.code)).id,a.id);
 await denied('/auth/organization?organizationId=invalid');await denied('/auth/organization?organizationId=00000000-0000-4000-8000-000000000000');
});
await test('手机号验证后按角色识别所属企业，首次登录工程师也能找到企业',async()=>{
 for(const role of ['customer','engineer','cs_operator']){const identified=await call('/auth/identify',{phone,code:'000000',role});assert.equal(identified.organizations.length,2);assert(identified.organizations.every(t=>t.name&&!t.code));
  for(const t of organizations){const auth=await call('/auth/login',{organizationId:t.id,phone,code:'000000',role,selectionToken:identified.selectionToken});assert.equal(auth.user.tenantId,t.id);}
 }
});
await test('未验证手机号不能枚举企业，未知账号不会自动加入其他企业',async()=>{
 await denied('/auth/identify',{phone,role:'customer'});await denied('/auth/identify',{phone,role:'customer',code:'123123'});
 const unknown=await call('/auth/identify',{phone:'1919'+run.slice(-7),role:'customer',code:'000000'});assert.deepEqual(unknown.organizations,[]);assert.equal(unknown.selectionToken,null);
});
await test('选择凭证绑定手机号、角色和可选企业，不能作为业务凭证使用',async()=>{
 const selected=await call('/auth/identify',{phone,code:'000000',role:'customer'});
 const demo=(await call('/auth/login',{phone:'13800138000',code:'000000',role:'cs_operator',tenantCode:'demo'})).user;
 await denied('/auth/login',{organizationId:demo.tenantId,phone,code:'000000',role:'customer',selectionToken:selected.selectionToken});
 await denied('/auth/login',{organizationId:organizations[0].id,phone,code:'000000',role:'engineer',selectionToken:selected.selectionToken});
 await denied('/auth/login',{organizationId:organizations[0].id,phone:'1909'+run.slice(-7),code:'000000',role:'customer',selectionToken:selected.selectionToken});
 await denied('/customer/devices',null,selected.selectionToken);
});
await test('通用验证码只能使用一次，换取选择凭证后可正常登录',async()=>{
 await call('/auth/discovery-code',{phone,role:'customer'});const code=await redis.get('organization-login:otp:customer:'+phone);assert(/^\d{6}$/.test(code));
 const identity=await call('/auth/identify',{phone,code,role:'customer'});
 await denied('/auth/identify',{phone,code,role:'customer'});
 assert.equal((await call('/auth/login',{organizationId:organizations[0].id,phone,code,role:'customer',selectionToken:identity.selectionToken})).user.tenantId,organizations[0].id);
});
await test('企业停用后从选择列表消失，旧选择凭证不能绕过企业状态',async()=>{
 const identity=await call('/auth/identify',{phone,code:'000000',role:'customer'}),b=organizations[1];
 const r=await fetch(base+'/platform/tenants/'+b.id+'/state',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+platform},body:JSON.stringify({enabled:false,reason:'测试登录入口状态同步'})});assert(r.ok);
 try{const list=await call('/auth/identify',{phone,code:'000000',role:'customer'});assert.equal(list.organizations.length,1);await denied('/auth/login',{organizationId:b.id,phone,code:'000000',role:'customer',selectionToken:identity.selectionToken});}
 finally{await fetch(base+'/platform/tenants/'+b.id+'/state',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+platform},body:JSON.stringify({enabled:true,reason:'恢复入口验证企业'})});}
});
await test('员工账号停用后不再可选，既有选择票据也无法重新登录',async()=>{
 const identity=await call('/auth/identify',{phone,code:'000000',role:'engineer'}),a=organizations[0];
 await db.query("UPDATE platform.memberships SET enabled=false WHERE tenant_id=$1 AND role='engineer' AND phone=$2",[a.id,phone]);
 try{const list=await call('/auth/identify',{phone,code:'000000',role:'engineer'});assert.equal(list.organizations.length,1);await denied('/auth/login',{organizationId:a.id,phone,code:'000000',role:'engineer',selectionToken:identity.selectionToken});}
 finally{await db.query("UPDATE platform.memberships SET enabled=true WHERE tenant_id=$1 AND role='engineer' AND phone=$2",[a.id,phone]);}
});
}finally{await db.end();redis.disconnect();}
mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});const failed=results.filter(r=>!r.pass).length;
writeFileSync(new URL('../reports/organization-login.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),passed:results.length-failed,failed,results},null,2));
writeFileSync(new URL('../reports/organization-fixture.json',import.meta.url),JSON.stringify({phone,organizations},null,2));console.log('ORGANIZATION LOGIN',results.length-failed+'/'+results.length);if(failed)process.exitCode=1;
