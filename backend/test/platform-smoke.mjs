import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);require('dotenv').config({path:new URL('../.env',import.meta.url),quiet:true});
const {Client}=require('pg');
const base=process.env.TEST_API_BASE;if(!base||new URL(base).port!=='8280')throw Error('Use the isolated audit backend on 8280');
const db=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024',database:'laser_audit_20261025'});await db.connect();
await db.query("UPDATE platform.tenants SET employee_limit=5000 WHERE code IN('demo','audit-alpha','audit-beta')");
const results=[],run=String(Date.now()),code='platform-'+run,phone='1951'+run.slice(-7),engineerPhone='1961'+run.slice(-7),expiresAt=new Date(Date.now()+86400000*30).toISOString();
let platform,tenant,admin,customer,engineer,photo,order;
async function raw(token,path,method='GET',body){const r=await fetch(base+path,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data};}
async function call(token,path,method='GET',body){const r=await raw(token,path,method,body);assert(r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
async function denied(token,path,method='GET',body){const r=await raw(token,path,method,body);assert([400,401,403,404,409,429].includes(r.status),`${path}: expected rejection, got ${r.status}`);return r;}
async function login(role,number,tenantCode=code){return call('','/auth/login','POST',{tenantCode,role,phone:number,code:'000000'});}
async function ready(id,status='ACTIVE'){for(let i=0;i<60;i++){const row=await call(platform,'/platform/tenants/'+id);if(row.status===status)return row;if(row.status==='FAILED'&&status!=='FAILED')throw Error(row.provisioningError);await new Promise(r=>setTimeout(r,200));}throw Error('Provisioning timed out');}
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name)}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message)}}
const create={code,name:'平台联动验证企业',adminPhone:phone,contactName:'测试联系人',contactPhone:phone,planCode:'professional',expiresAt,demoAuth:true};
try{
await test('独立平台密码登录，平台与企业凭证不能互换',async()=>{
 platform=(await call('','/platform/auth/login','POST',{username:process.env.PLATFORM_ADMIN_USERNAME,password:process.env.PLATFORM_ADMIN_PASSWORD})).accessToken;
 const legacy=await login('cs_operator','13800138000','demo');
 await denied(legacy.accessToken,'/platform/tenants');await denied(platform,'/admin/customers');await denied('','/platform/overview');
 const profile=await call(platform,'/platform/auth/profile');assert(profile.username);assert(!JSON.stringify(profile).includes('password'));
 await denied('','/platform/auth/login','POST',{username:'invalid-platform-user',password:'000000'});
});
await test('平台提交企业后真实创建数据库与管理员，重复代码和非法输入被拒绝',async()=>{
 tenant=await call(platform,'/platform/tenants','POST',create);assert.equal(tenant.status,'PROVISIONING');assert(!JSON.stringify(tenant).includes('database_name'));
 tenant=await ready(tenant.id);assert.equal(tenant.status,'ACTIVE');assert(tenant.usage.available);assert.equal(tenant.usage.employees,1);assert.equal(tenant.usage.orders,0);
 assert.equal((await raw(platform,'/platform/tenants','POST',create)).status,409);
 await denied(platform,'/platform/tenants','POST',{...create,code:'../escape'});await denied(platform,'/platform/tenants','POST',{...create,code:'bad-phone-'+run,adminPhone:'bad'});
});
await test('新企业三个角色登录，并能操作同一企业设备与维修工单',async()=>{
 admin=await login('cs_operator',phone);customer=await login('customer',phone);
 await call(admin.accessToken,'/admin/engineers','POST',{name:'平台测试工程师',phone:engineerPhone});engineer=await login('engineer',engineerPhone);
 const device=await call(admin.accessToken,'/admin/devices','POST',{serialNumber:code,model:'平台测试激光设备',deviceType:'laser_cutter',customerId:customer.user.id});
 const address=await call(customer.accessToken,'/customer/addresses','POST',{province:'测试省',city:'测试市',district:'测试区',detail:'平台联动测试地址'});
 order=await call(customer.accessToken,'/customer/work-orders','POST',{deviceId:device.id,addressId:address.id,faultType:'平台联动测试',faultDescription:code});
 assert((await call(admin.accessToken,'/admin/work-orders')).some(o=>o.id===order.id));
 await call(admin.accessToken,'/admin/work-orders/'+order.id+'/dispatch','POST',{engineerId:engineer.user.id});
 assert.equal((await call(engineer.accessToken,'/engineer/orders/'+order.id)).id,order.id);
 const other=await login('cs_operator','13800138000','demo');assert(!(await call(other.accessToken,'/admin/work-orders')).some(o=>o.id===order.id));
});
await test('三端业务与附件变化即时反映到平台真实用量',async()=>{
 const form=new FormData();form.append('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSioAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'platform.png');
 photo=await call(customer.accessToken,'/customer/work-orders/photo','POST',form);
 const detail=await call(platform,'/platform/tenants/'+tenant.id);assert.equal(detail.usage.orders,1);assert.equal(detail.usage.customers,1);assert.equal(detail.usage.employees,2);assert(detail.usage.attachmentBytes>0);
 const list=await call(platform,'/platform/tenants?search='+code);assert.equal(list.total,1);assert.equal(list.items[0].usage.orders,1);
});
await test('平台停用立即阻断三个端的旧凭证和附件，恢复后业务数据保留',async()=>{
 await call(platform,'/platform/tenants/'+tenant.id+'/state','PUT',{enabled:false,reason:'测试停用联动'});
 for(const [token,path] of [[admin.accessToken,'/admin/work-orders'],[customer.accessToken,'/customer/work-orders'],[engineer.accessToken,'/engineer/orders']])assert.equal((await denied(token,path)).status,401);
 await denied('',photo.url);await denied('','/auth/login','POST',{tenantCode:code,role:'customer',phone,code:'000000'});
 await call(platform,'/platform/tenants/'+tenant.id+'/state','PUT',{enabled:true,reason:'测试恢复联动'});
 assert((await call(admin.accessToken,'/admin/work-orders')).some(o=>o.id===order.id));assert.equal((await raw('',photo.url)).status,200);
});
await test('套餐降级真实关闭合同财务接口，升级后使用原凭证恢复功能',async()=>{
 const change={planCode:'basic',employeeLimit:10,storageLimitMb:1024,expiresAt,reason:'套餐降级联动验证'};
 await call(platform,'/platform/tenants/'+tenant.id+'/subscription','PUT',change);
 await denied(admin.accessToken,'/operations/contracts');await denied(customer.accessToken,'/operations/finance');
 assert((await call(admin.accessToken,'/admin/work-orders')).some(o=>o.id===order.id));
 await call(platform,'/platform/tenants/'+tenant.id+'/subscription','PUT',{...change,planCode:'professional',reason:'恢复完整业务功能'});
 assert(Array.isArray(await call(customer.accessToken,'/operations/contracts')));assert(await call(admin.accessToken,'/operations/finance'));
});
await test('员工额度在并发创建中生效，平台不允许降到实际用量以下',async()=>{
 const settings={planCode:'professional',employeeLimit:3,storageLimitMb:1024,expiresAt,reason:'并发员工额度验证'};
 await call(platform,'/platform/tenants/'+tenant.id+'/subscription','PUT',settings);
 const responses=await Promise.all(['1971','1981'].map(prefix=>raw(admin.accessToken,'/admin/engineers','POST',{name:'限额并发工程师',phone:prefix+run.slice(-7)})));
 assert.equal(responses.filter(r=>r.status<300).length,1);assert.equal(responses.filter(r=>r.status===400).length,1);
 await denied(platform,'/platform/tenants/'+tenant.id+'/subscription','PUT',{...settings,employeeLimit:2,reason:'拒绝小于实际使用量'});
 assert.equal((await call(platform,'/platform/tenants/'+tenant.id)).usage.employees,3);
});
await test('附件额度真实限制上传，超额文件被清理且平台统计不增加',async()=>{
 await call(platform,'/platform/tenants/'+tenant.id+'/subscription','PUT',{planCode:'professional',employeeLimit:10,storageLimitMb:1,expiresAt,reason:'附件额度验证'});
 const before=(await call(platform,'/platform/tenants/'+tenant.id)).usage.attachmentBytes;
 const form=new FormData();form.append('photo',new Blob([new Uint8Array(1100000)],{type:'image/png'}),'over-quota.png');
 await denied(customer.accessToken,'/customer/work-orders/photo','POST',form);
 assert.equal((await call(platform,'/platform/tenants/'+tenant.id)).usage.attachmentBytes,before);
});
await test('企业到期阻断现有三个端凭证，网页续期接口恢复访问',async()=>{
 await db.query("UPDATE platform.tenants SET expires_at=now()-interval '1 minute' WHERE id=$1",[tenant.id]);
 assert.equal((await call(platform,'/platform/tenants/'+tenant.id)).status,'EXPIRED');
 for(const [token,path] of [[admin.accessToken,'/admin/work-orders'],[customer.accessToken,'/customer/work-orders'],[engineer.accessToken,'/engineer/orders']])assert.equal((await denied(token,path)).status,401);
 await call(platform,'/platform/tenants/'+tenant.id+'/subscription','PUT',{planCode:'professional',employeeLimit:10,storageLimitMb:1024,expiresAt,reason:'到期企业续期恢复'});
 assert.equal((await call(customer.accessToken,'/auth/profile')).tenantCode,code);
});
await test('真实开通失败被持久化，修正配置后可重试且不重复创建管理员',async()=>{
 const id=randomUUID(),retryCode='retry-'+run;
 await db.query("INSERT INTO platform.tenants(id,code,name,database_name,enabled,demo_auth,provisioning_status,admin_phone) VALUES($1,$2,'故障重试测试',$3,false,true,'FAILED',$4)",[id,retryCode,'laser_invalid_'+id.replaceAll('-',''),phone]);
 await call(platform,'/platform/tenants/'+id+'/retry','POST',{reason:'验证故障信息持久化'});const failed=await ready(id,'FAILED');assert(failed.provisioningError);
 await db.query('UPDATE platform.tenants SET database_name=$2 WHERE id=$1',[id,'laser_tenant_'+id.replaceAll('-','')]);
 await call(platform,'/platform/tenants/'+id+'/retry','POST',{reason:'配置已修正，继续开通'});const done=await ready(id);assert.equal(done.usage.employees,1);
 assert.equal((await db.query("SELECT count(*)::int AS count FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator'",[id])).rows[0].count,1);
});
await test('创建、停用、续期和失败重试均有真实审计记录且不泄漏凭证',async()=>{
 const logs=await call(platform,'/platform/logs?tenantId='+tenant.id);const actionNames=logs.items.map(x=>x.action);
 for(const action of ['TENANT_CREATE','TENANT_READY','TENANT_DISABLE','TENANT_ENABLE','TENANT_SUBSCRIPTION'])assert(actionNames.includes(action));
 const change=logs.items.find(x=>x.action==='TENANT_SUBSCRIPTION');assert(change.before.planCode);assert(change.after.planCode);assert(change.reason);
 const text=JSON.stringify(logs);assert(!text.includes(process.env.PLATFORM_ADMIN_PASSWORD));assert(!text.includes('password_hash'));assert(!text.includes('database_name'));
 await denied(platform,'/platform/logs?tenantId=bad');
});
await test('平台分页、筛选、套餐和总览为真实控制表数据',async()=>{
 const overview=await call(platform,'/platform/overview');const count=(await db.query('SELECT count(*)::int AS count FROM platform.tenants')).rows[0].count;assert.equal(overview.total,count);
 assert.equal((await call(platform,'/platform/plans')).length,3);await denied(platform,'/platform/tenants?page=-1');
 const active=await call(platform,'/platform/tenants?status=ACTIVE');assert(active.items.every(t=>t.status==='ACTIVE'));
});
await test('平台密码变更撤销旧平台凭证，且不影响企业凭证',async()=>{
 // A separate audit-only platform admin keeps the real preview operator password unchanged.
 const adminId=randomUUID(),name='audit-'+run;
 const {hashPassword}=await import('../dist/platform/security.js');const oldPassword='Audit-original-'+run,newPassword='Audit-updated-'+run;
 await db.query('INSERT INTO platform.admins(id,username,name,password_hash) VALUES($1,$2,$3,$4)',[adminId,name,'密码测试管理员',await hashPassword(oldPassword)]);
 const token=(await call('','/platform/auth/login','POST',{username:name,password:oldPassword})).accessToken;
 await call(token,'/platform/auth/password','POST',{currentPassword:oldPassword,newPassword});
 await denied(token,'/platform/overview');await denied('','/platform/auth/login','POST',{username:name,password:oldPassword});
 assert((await call('','/platform/auth/login','POST',{username:name,password:newPassword})).accessToken);
 assert.equal((await call(customer.accessToken,'/auth/profile')).tenantCode,code);
});
}finally{await db.end();}
mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});const failed=results.filter(r=>!r.pass).length;
writeFileSync(new URL('../reports/platform-smoke.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),passed:results.length-failed,failed,results},null,2));console.log(`PLATFORM ${results.length-failed}/${results.length} passed`);if(failed)process.exitCode=1;
