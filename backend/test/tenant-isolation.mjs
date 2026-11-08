import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {Client}=require('pg'),{default:Redis}=await import('ioredis');
const {io}=createRequire(new URL('../../apps/cs-admin/package.json',import.meta.url))('socket.io-client');
const base=process.env.TEST_API_BASE;
if(!base || new URL(base).port!=='8280')throw Error('Run only against the isolated audit server on 8280');
const control=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024',database:'laser_audit_20261025'});
await control.connect();
const redis=new Redis({host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379)});
const run=String(Date.now()),phone='1951'+run.slice(-7),engineerPhone='1961'+run.slice(-7);
const results=[],a={code:'audit-alpha'},b={code:'audit-beta'};
async function raw(token,path,method='GET',body,headers={}){const r=await fetch(base+path,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data};}
async function call(token,path,method='GET',body){const r=await raw(token,path,method,body);assert(r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
async function denied(token,path,method='GET',body){const r=await raw(token,path,method,body);assert([400,401,403,404].includes(r.status),`${path} expected rejection: ${r.status}`);return r;}
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name)}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message)}}
async function login(t,role,number){return call('', '/auth/login','POST',{tenantCode:t.code,role,phone:number,code:'000000'});}
async function connect(token){return new Promise((resolve,reject)=>{const s=io(base+'/ws',{auth:{token},transports:['websocket'],reconnection:false,timeout:2000});s.once('connect',()=>resolve(s));s.once('connect_error',e=>{s.close();reject(e)})})}
try {
await test('两家企业同手机号分别登录，身份和客户数据独立',async()=>{
 for(const t of [a,b]){t.admin=await login(t,'cs_operator','13800138000');t.customer=await login(t,'customer',phone);await call(t.admin.accessToken,'/admin/engineers','POST',{phone:engineerPhone,name:t.code+'工程师'});t.engineer=await login(t,'engineer',engineerPhone);}
 assert.notEqual(a.customer.user.id,b.customer.user.id);assert.notEqual(a.customer.user.tenantId,b.customer.user.tenantId);
 for(const t of [a,b]){const profile=await call(t.customer.accessToken,'/auth/profile');assert.equal(profile.tenantCode,t.code);assert.equal(profile.id,t.customer.user.id);}
});
await test('旧凭证、伪造凭证、跨企业请求头及任意后台手机号被拒绝',async()=>{
 const jwt=require('jsonwebtoken');require('dotenv').config({path:new URL('../.env',import.meta.url),quiet:true});
 const legacy=jwt.sign({sub:a.customer.user.id,role:'customer'},process.env.JWT_SECRET);
 await denied(legacy,'/customer/devices');await denied(a.admin.accessToken.slice(0,-8)+'forged00','/admin/customers');
 assert.equal((await raw(a.admin.accessToken,'/admin/customers','GET',undefined,{'X-Tenant-Code':b.code})).status,403);
 await denied('','/auth/login','POST',{tenantCode:a.code,phone:'13700000099',code:'000000',role:'cs_operator'});
 await denied('','/auth/register','POST',{tenantCode:a.code,phone:'13700000099',code:'000000',role:'engineer'});
});
await test('设备、地址和工单创建在各自企业，交叉详情/写入被拒绝',async()=>{
 for(const t of [a,b]){
  t.device=await call(t.admin.accessToken,'/admin/devices','POST',{serialNumber:'TENANT-'+run,model:t.code,deviceType:'laser_cutter'});
  await call(t.customer.accessToken,'/customer/devices','POST',{serialNumber:t.device.serialNumber});
  t.address=await call(t.customer.accessToken,'/customer/addresses','POST',{province:'隔离测试',city:'测试市',district:'测试区',detail:t.code});
  t.order=await call(t.customer.accessToken,'/customer/work-orders','POST',{deviceId:t.device.id,addressId:t.address.id,faultType:'隔离验证',faultDescription:t.code+'_'+run});
 }
 await denied(b.customer.accessToken,'/customer/work-orders/'+a.order.id);
 await denied(b.customer.accessToken,'/customer/addresses/'+a.address.id,'PUT',{province:'x',city:'x',district:'x',detail:'x'});
 await denied(b.customer.accessToken,'/customer/work-orders','POST',{deviceId:a.device.id,addressId:b.address.id,faultType:'x',faultDescription:'foreign'});
 await denied(b.admin.accessToken,'/admin/work-orders/'+a.order.id);
});
await test('并发列表与统计查询不串库，原生 SQL 报表使用本企业连接',async()=>{
 await Promise.all(Array.from({length:24},async(_,i)=>{const t=i%2?a:b,other=i%2?b:a;const orders=await call(t.admin.accessToken,'/admin/work-orders');assert(orders.some(x=>x.id===t.order.id));assert(!orders.some(x=>x.id===other.order.id));const customers=await call(t.admin.accessToken,'/admin/customers');assert(!customers.some(x=>x.id===other.customer.user.id));}));
 for(const t of [a,b]){assert(await call(t.admin.accessToken,'/admin/stats'));assert(await call(t.admin.accessToken,'/admin/stats/performance'));}
});
await test('配件、库存、移动仓和领退料单按企业隔离',async()=>{
 for(const t of [a,b]){
  t.part=await call(t.admin.accessToken,'/parts','POST',{name:t.code+'配件'+run,code:'ISO-'+run,guidePrice:20,costPrice:10,unit:'件',category:'激光配件'});
  t.warehouse=await call(t.admin.accessToken,'/parts/warehouses','POST',{name:t.code+'仓库'+run,location:'隔离测试'});
  await call(t.admin.accessToken,'/parts/stock-in','POST',{partId:t.part.id,warehouseId:t.warehouse.id,quantity:5});
  t.request=await call(t.engineer.accessToken,'/operations/requests','POST',{kind:'ISSUE',partId:t.part.id,warehouseId:t.warehouse.id,quantity:1});
 }
 assert(!(await call(b.admin.accessToken,'/parts')).some(x=>x.id===a.part.id));
 assert(!(await call(b.admin.accessToken,'/operations/requests')).some(x=>x.id===a.request.id));
 await denied(b.admin.accessToken,'/operations/requests/'+a.request.id+'/approve','POST',{});
 await denied(b.engineer.accessToken,'/operations/requests','POST',{kind:'RETURN',partId:a.part.id,warehouseId:a.warehouse.id,quantity:1});
 assert(!(await call(b.admin.accessToken,'/operations/warehouses')).some(x=>x.ownerEngineerId===a.engineer.user.id));
 assert(!(await call(b.admin.accessToken,'/operations/journal')).some(x=>x.partId===a.part.id));
});
await test('合同、收款与发票跨企业读取和操作均失败',async()=>{
 a.contract=await call(a.admin.accessToken,'/operations/contracts','POST',{customerId:a.customer.user.id,title:'企业A隔离合同'+run,startDate:'2026-01-01',endDate:'2027-12-31',amount:100,laborIncluded:true,partsDiscount:90,deviceIds:[a.device.id]});
 await call(a.admin.accessToken,'/operations/contracts/'+a.contract.id+'/status','POST',{status:'ACTIVE'});
 await call(a.admin.accessToken,'/operations/receipts','POST',{contractId:a.contract.id,amount:100});
 a.invoice=await call(a.customer.accessToken,'/operations/invoices','POST',{sourceType:'CONTRACT',sourceId:a.contract.id,title:'隔离发票'});
 assert(!(await call(b.admin.accessToken,'/operations/contracts')).some(x=>x.id===a.contract.id));
 assert(!JSON.stringify(await call(b.admin.accessToken,'/operations/finance')).includes(a.contract.id));
 await denied(b.admin.accessToken,'/operations/contracts/'+a.contract.id+'/status','POST',{status:'TERMINATED'});
 await denied(b.admin.accessToken,'/operations/receipts','POST',{contractId:a.contract.id,amount:1});
 await denied(b.customer.accessToken,'/operations/invoices','POST',{sourceType:'CONTRACT',sourceId:a.contract.id,title:'越权发票'});
 await denied(b.admin.accessToken,'/operations/invoices/'+a.invoice.id+'/issue','POST',{invoiceNumber:'FOREIGN-'+run});
});
await test('验证码 Redis 键独立，同手机号不能使用另一企业验证码',async()=>{
 await call('','/auth/send-code','POST',{tenantCode:a.code,phone});
 const code=await redis.get('tenant:'+a.customer.user.tenantId+':sms:code:'+phone);assert(/^\d{6}$/.test(code));
 await denied('','/auth/login','POST',{tenantCode:b.code,phone,role:'customer',code});
 await call('','/auth/login','POST',{tenantCode:a.code,phone,role:'customer',code});
});
await test('人工客服队列、会话与聊天历史按企业隔离',async()=>{
 await call(a.customer.accessToken,'/ai/chat','POST',{message:'转人工'});
 assert((await call(a.admin.accessToken,'/ai/cs/waiting')).some(x=>x.customerId===a.customer.user.id));
 assert(!(await call(b.admin.accessToken,'/ai/cs/waiting')).some(x=>x.customerId===a.customer.user.id));
 await denied(b.admin.accessToken,'/ai/cs/chats/'+a.customer.user.id);
 for(const action of ['accept','end','rating','send']) await denied(b.admin.accessToken,'/ai/cs/'+action,'POST',{customerId:a.customer.user.id,message:'cross tenant',rating:5,tags:[]});
 await denied(b.customer.accessToken,'/ai/chat','POST',{message:'foreign order',workOrderId:a.order.id});
 await call(a.admin.accessToken,'/ai/cs/accept','POST',{customerId:a.customer.user.id});
});
await test('同一用户 ID 在不同企业的 WebSocket 房间仍完全隔离',async()=>{
 // Deliberately duplicate a UUID between separate business databases: UUID randomness is not the security boundary.
 const tenant=(await control.query('SELECT database_name FROM platform.tenants WHERE code=$1',[b.code])).rows[0];
 const db=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024',database:tenant.database_name});await db.connect();
 try{await db.query('INSERT INTO customers(id,phone,name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[a.customer.user.id,'1971'+run.slice(-7),'同ID隔离客户']);}finally{await db.end()}
 const duplicate=await login(b,'customer','1971'+run.slice(-7));
 const sa=await connect(a.customer.accessToken),sb=await connect(duplicate.accessToken);let otherMessages=0;
 try {
  sa.emit('bind_customer',{customerId:a.customer.user.id});sb.emit('bind_customer',{customerId:a.customer.user.id});sb.on('cs_message',()=>otherMessages++);await new Promise(r=>setTimeout(r,100));
  const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('own enterprise push timeout')),2000);sa.once('cs_message',message=>{clearTimeout(timer);resolve(message)})});
  await call(a.admin.accessToken,'/ai/cs/send','POST',{customerId:a.customer.user.id,message:'A消息'+run});assert.equal((await received).message,'A消息'+run);await new Promise(r=>setTimeout(r,150));assert.equal(otherMessages,0);
 }finally{sa.close();sb.close()}
});
await test('附件无凭证、跨企业身份、改路径和伪造下载票据被拒绝',async()=>{
 const form=new FormData();form.append('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSioAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'tenant.png');
 a.photo=await call(a.customer.accessToken,'/customer/work-orders/photo','POST',form);assert.equal((await raw('',a.photo.url)).status,200);
 await denied('',a.photo.url.split('?')[0]);await denied(b.customer.accessToken,a.photo.url);
 await denied('',a.photo.url.replace(a.customer.user.tenantId,b.customer.user.tenantId));
 await denied('',a.photo.url.slice(0,-5)+'wrong');
 await denied(b.customer.accessToken,'/customer/work-orders','POST',{deviceId:b.device.id,addressId:b.address.id,faultType:'x',faultDescription:'x',faultPhotos:[a.photo.url]});
});
await test('停用账号使现有 HTTP 与 WebSocket 凭证立即失效',async()=>{
 const payload=JSON.parse(Buffer.from(a.customer.accessToken.split('.')[1],'base64url'));
 const socket=await connect(a.customer.accessToken);
 try{await control.query('UPDATE platform.memberships SET enabled=false WHERE id=$1',[payload.membershipId]);await denied(a.customer.accessToken,'/customer/devices');await assert.rejects(()=>connect(a.customer.accessToken));socket.emit('bind_customer',{customerId:a.customer.user.id});await new Promise(r=>setTimeout(r,100));assert(!socket.connected);}finally{socket.close();await control.query('UPDATE platform.memberships SET enabled=true WHERE id=$1',[payload.membershipId])}
});
await test('停用企业封锁该企业旧凭证，其他企业继续正常工作',async()=>{
 try{await control.query('UPDATE platform.tenants SET enabled=false WHERE id=$1',[a.customer.user.tenantId]);await denied(a.admin.accessToken,'/admin/customers');await denied('','/auth/login','POST',{tenantCode:a.code,phone,role:'customer',code:'000000'});assert.equal((await call(b.customer.accessToken,'/auth/profile')).tenantCode,b.code);}finally{await control.query('UPDATE platform.tenants SET enabled=true WHERE id=$1',[a.customer.user.tenantId])}
});
await test('AI 外部会话标识必须属于当前企业和工程师',async()=>{
 await denied(b.engineer.accessToken,'/ai/engineer/chat','POST',{query:'test',conversation_id:'foreign-'+run});
});
}finally{await control.end();redis.disconnect();}
const failed=results.filter(r=>!r.pass).length;
mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});writeFileSync(new URL('../reports/tenant-isolation.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),passed:results.length-failed,failed,results},null,2));
console.log(`Tenant isolation: ${results.length-failed}/${results.length} passed`);if(failed)process.exitCode=1;
