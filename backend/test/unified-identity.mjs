import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const require=createRequire(import.meta.url);require('dotenv').config({path:new URL('../.env',import.meta.url),quiet:true});const {Client}=require('pg');
const {io}=createRequire(new URL('../../apps/cs-admin/package.json',import.meta.url))('socket.io-client');
const base=process.env.TEST_API_BASE;if(!base||new URL(base).port!=='8280')throw Error('Use isolated audit server');
const config={host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024'};
const control=new Client({...config,database:'laser_audit_20261025'});await control.connect();
const run=String(Date.now()),phone='1891'+run.slice(-7),engineerPhone='1881'+run.slice(-7),otherPhone='1871'+run.slice(-7),adminPhone='1861'+run.slice(-7),tenants=[],results=[];let platform,customer,engineer,address,devices,orders,other;
async function raw(token,path,method='GET',body){const r=await fetch(base+path,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data};}
async function call(token,path,method='GET',body){const r=await raw(token,path,method,body);assert(r.status<300,path+' '+JSON.stringify(r));return r.data;}
async function denied(token,path,method='GET',body){const r=await raw(token,path,method,body);assert([400,401,403,404,409].includes(r.status),path+' '+JSON.stringify(r));return r;}
async function login(role,number){return call('','/identity/login','POST',{role,phone:number,code:'000000'});}
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL',name,e.message);}}
try{
await test('平台发放独立管理账号，同一联系人两家企业仍由账号唯一识别',async()=>{
 platform=(await call('','/platform/auth/login','POST',{username:process.env.PLATFORM_ADMIN_USERNAME,password:process.env.PLATFORM_ADMIN_PASSWORD})).accessToken;
 for(const suffix of ['甲','乙']){
  const created=await call(platform,'/platform/tenants','POST',{name:'统一身份'+suffix+run,adminPhone,contactName:'统一账号测试',planCode:'professional',expiresAt:new Date(Date.now()+86400000*30).toISOString(),demoAuth:true});assert(created.adminCredentials?.password);
  let ready;for(let i=0;i<60;i++){ready=await call(platform,'/platform/tenants/'+created.id);if(ready.status==='ACTIVE')break;assert.notEqual(ready.status,'FAILED');await new Promise(r=>setTimeout(r,150));}assert.equal(ready.status,'ACTIVE');
  const account=await call('','/identity/business-login','POST',created.adminCredentials);assert.equal(account.user.tenantId,created.id);assert.equal(account.user.tenantName,created.name);
  tenants.push({...ready,credentials:created.adminCredentials,admin:account.accessToken});
 }
 assert.notEqual(tenants[0].credentials.username,tenants[1].credentials.username);
 await denied('','/identity/business-login','POST',{username:tenants[0].credentials.username,password:tenants[1].credentials.password});
});
await test('统一客户账号首次登录不绑定默认企业，可通过设备建立两家服务商关系',async()=>{
 customer=await login('customer',phone);assert(customer.user.unified);assert.equal(customer.user.tenantId,undefined);assert.deepEqual(await call(customer.accessToken,'/customer/devices'),[]);
 for(const t of tenants){t.device=await call(t.admin,'/admin/devices','POST',{serialNumber:'UNIFIED-'+run+'-'+t.id.slice(0,4),model:t.name,deviceType:'laser_cutter'});const claim=await call(t.admin,'/admin/devices/'+t.device.id+'/claim-link');await call(customer.accessToken,'/customer/devices','POST',{assetKey:claim.assetKey});}
 const database=(await control.query('SELECT database_name FROM platform.tenants WHERE id=$1',[tenants[1].id])).rows[0].database_name;
 const duplicate=new Client({...config,database});await duplicate.connect();try{await duplicate.query('UPDATE devices SET id=$2 WHERE id=$1',[tenants[1].device.id,tenants[0].device.id]);}finally{await duplicate.end();}
 await control.query("UPDATE identity.resources SET local_id=$3 WHERE tenant_id=$1 AND kind='device' AND local_id=$2",[tenants[1].id,tenants[1].device.id,tenants[0].device.id]);
 await control.query('UPDATE identity.assets SET local_id=$3 WHERE tenant_id=$1 AND local_id=$2',[tenants[1].id,tenants[1].device.id,tenants[0].device.id]);tenants[1].device.id=tenants[0].device.id;
 devices=await call(customer.accessToken,'/customer/devices');assert.equal(devices.length,2);assert.notEqual(devices[0].id,devices[1].id);assert(devices.every(d=>d.serviceName&&d.serviceId));assert.equal((await call(customer.accessToken,'/identity/services')).length,2);
 const again=await login('customer',phone);assert.equal(again.user.id,customer.user.id);assert.equal((await call(again.accessToken,'/customer/devices')).length,2);
});
await test('一个人的常用地址可用于两家服务商，报修按设备归属自动进入正确企业',async()=>{
 address=await call(customer.accessToken,'/customer/addresses','POST',{province:'测试省',city:'测试市',district:'测试区',detail:'统一账号地址',isDefault:true});orders=[];
 for(const d of devices){const order=await call(customer.accessToken,'/customer/work-orders','POST',{deviceId:d.id,addressId:address.id,faultType:'统一身份联动测试',faultDescription:d.serviceName});orders.push(order);}
 assert.equal((await call(customer.accessToken,'/customer/work-orders')).length,2);
 for(const t of tenants){const localOrders=await call(t.admin,'/admin/work-orders');assert.equal(localOrders.length,1);assert.equal(localOrders[0].faultDescription,t.name);t.order=localOrders[0];}
});
await test('客户可以跨服务商查看自己的工单，企业后台不能访问另一家业务',async()=>{
 for(const order of orders)assert.equal((await call(customer.accessToken,'/customer/work-orders/'+order.id)).orderNo,order.orderNo);
 await denied(tenants[0].admin,'/admin/work-orders/'+tenants[1].order.id);
 other=await login('customer',otherPhone);await denied(other.accessToken,'/customer/work-orders/'+orders[0].id);
 assert.deepEqual(await call(other.accessToken,'/customer/work-orders'),[]);await denied(other.accessToken,'/customer/devices','POST',{serialNumber:tenants[0].device.serialNumber});await denied(customer.accessToken,'/admin/work-orders');await denied(customer.accessToken,'/platform/tenants');
});
await test('工程师按手机号自动关联已开通身份，两家任务与客户端和企业后台互通',async()=>{
 for(const t of tenants){const local=await call(t.admin,'/admin/engineers','POST',{name:'统一身份工程师',phone:engineerPhone});await call(t.admin,'/admin/work-orders/'+t.order.id+'/dispatch','POST',{engineerId:local.id});}
 engineer=await login('engineer',engineerPhone);assert(engineer.user.unified);
 const tasks=await call(engineer.accessToken,'/engineer/orders');assert.equal(tasks.length,2);assert(tasks.every(t=>orders.some(o=>o.id===t.id)));
 await call(engineer.accessToken,'/engineer/orders/'+tasks[0].id+'/start','POST',{});const detail=await call(customer.accessToken,'/customer/work-orders/'+tasks[0].id);assert.equal(detail.status,'ACCEPTED');
 await denied(other.accessToken,'/engineer/orders');
});
await test('统一身份完成报价、付款、维修、评价及开票，财务按原服务商记账',async()=>{
 const task=(await call(engineer.accessToken,'/engineer/orders')).find(o=>o.status==='ACCEPTED');assert(task);
 await call(engineer.accessToken,'/engineer/orders/'+task.id+'/quote','POST',{partsFee:60,laborFee:40});
 await call(customer.accessToken,'/customer/work-orders/'+task.id+'/confirm','POST',{confirm:true});
 await call(customer.accessToken,'/customer/work-orders/'+task.id+'/pay-prepayment','POST');
 await call(engineer.accessToken,'/engineer/orders/'+task.id+'/complete','POST',{partsFee:60,laborFee:40,repairReport:'统一身份完成维修',onSitePhotos:[]});
 await call(customer.accessToken,'/customer/work-orders/'+task.id+'/pay-final','POST');
 assert.equal((await call(customer.accessToken,'/customer/work-orders/'+task.id)).status,'COMPLETED');
 await call(customer.accessToken,'/customer/reviews','POST',{workOrderId:task.id,rating:5,comment:'统一身份评价'});
 const finance=await call(customer.accessToken,'/operations/finance');assert.equal(finance.summary.received,100);
 const invoice=await call(customer.accessToken,'/operations/invoices','POST',{sourceType:'WORK_ORDER',sourceId:task.id,title:'统一身份开票'});
 assert((await call(customer.accessToken,'/operations/finance')).records.some(r=>r.id===invoice.id));
 const owner=tenants.find(t=>t.name===task.serviceName);assert((await call(owner.admin,'/operations/finance')).records.some(r=>r.title==='统一身份开票'));
});
await test('同一企业内他人资源和跨企业配件组合不能借统一账号越权',async()=>{
 const own=devices.find(d=>d.serviceName===tenants[0].name),foreignContract=await call(tenants[1].admin,'/operations/contracts','POST',{customerId:tenants[1].order.customerId,title:'另一企业合同',startDate:'2026-01-01',endDate:'2027-01-01',amount:100,laborIncluded:true,partsDiscount:100,deviceIds:[]});
 await call(tenants[1].admin,'/operations/contracts/'+foreignContract.id+'/status','POST',{status:'ACTIVE'});
 const contracts=await call(customer.accessToken,'/operations/contracts');const foreign=contracts.find(c=>c.number===foreignContract.number);
 await denied(customer.accessToken,'/customer/work-orders','POST',{deviceId:own.id,addressId:address.id,contractId:foreign.id,faultType:'cross',faultDescription:'cross'});
 await denied(customer.accessToken,'/customer/work-orders/'+tenants[0].order.id);
});
await test('常用地址修改和删除不覆盖旧工单地址快照',async()=>{
 await call(customer.accessToken,'/customer/addresses/'+address.id,'PUT',{province:'测试省',city:'测试市',district:'测试区',detail:'修改后的新地址'});
 assert.equal((await call(customer.accessToken,'/customer/addresses')).find(a=>a.id===address.id).detail,'修改后的新地址');
 assert.equal((await call(customer.accessToken,'/customer/work-orders/'+orders[0].id)).address.detail,'统一账号地址');
 await call(customer.accessToken,'/customer/addresses/'+address.id,'DELETE');assert(!(await call(customer.accessToken,'/customer/addresses')).some(a=>a.id===address.id));
});
await test('附件按已选设备自动路由，不能附带到另一家服务商工单',async()=>{
 const form=new FormData();form.append('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSioAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'unified.png');
 const uploaded=await call(customer.accessToken,'/customer/work-orders/photo?deviceId='+devices[0].id,'POST',form);assert.equal((await raw(customer.accessToken,uploaded.url)).status,200);
 const provider=tenants.find(t=>t.name===devices[0].serviceName),foreignDevice=await call(provider.admin,'/admin/devices','POST',{serialNumber:'PRIVATE-FILE-'+run,model:'另一客户设备',deviceType:'laser_cutter'}),claim=await call(provider.admin,'/admin/devices/'+foreignDevice.id+'/claim-link');
 const bound=await call(other.accessToken,'/customer/devices','POST',{assetKey:claim.assetKey}),ownAddress=await call(other.accessToken,'/customer/addresses','POST',{province:'省',city:'市',district:'区',detail:'另一个人的地址'});
 await denied(other.accessToken,'/customer/work-orders','POST',{deviceId:bound.id,addressId:ownAddress.id,faultType:'private-file',faultPhotos:[uploaded.url.split('?')[0]]});
 const target=devices.find(d=>d.serviceId!==devices[0].serviceId),fresh=await call(customer.accessToken,'/customer/addresses','POST',{province:'省',city:'市',district:'区',detail:'另一个地址'});
 await denied(customer.accessToken,'/customer/work-orders','POST',{deviceId:target.id,addressId:fresh.id,faultType:'crossfile',faultDescription:'crossfile',faultPhotos:[uploaded.url]});
});
await test('一个服务商停用不会注销个人账号，也不影响另一家正常业务',async()=>{
 const t=tenants[0];await call(platform,'/platform/tenants/'+t.id+'/state','PUT',{enabled:false,reason:'验证统一账号按服务商限制'});
 try{assert.equal((await call(customer.accessToken,'/customer/devices')).length,1);assert.equal((await call(customer.accessToken,'/auth/profile')).id,customer.user.id);await denied(customer.accessToken,'/customer/work-orders/'+orders.find(o=>o.serviceName===t.name).id);assert.equal((await call(engineer.accessToken,'/engineer/orders')).length,1);}
 finally{await call(platform,'/platform/tenants/'+t.id+'/state','PUT',{enabled:true,reason:'恢复统一身份测试服务'});}
});
await test('统一客服会话按服务商分别发送、记录和推送，不混入另一家',async()=>{
 const services=await call(customer.accessToken,'/identity/services');const socket=await new Promise((resolve,reject)=>{const s=io(base+'/ws',{auth:{token:customer.accessToken},transports:['websocket'],reconnection:false});s.once('connect',()=>resolve(s));s.once('connect_error',reject);});
 try{socket.emit('bind_customer',{customerId:customer.user.id});await new Promise(r=>setTimeout(r,80));await call(customer.accessToken,'/ai/chat','POST',{serviceId:services[0].id,message:'转人工'});
 const tenant=tenants.find(t=>t.name===services[0].name),waiting=await call(tenant.admin,'/ai/cs/waiting');const local=waiting.find(w=>w.customerId===tenant.order.customerId);assert(local);
 await call(tenant.admin,'/ai/cs/accept','POST',{customerId:local.customerId});
 const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Unified socket timeout')),3000);socket.once('cs_message',d=>{clearTimeout(timer);resolve(d);});});
 await call(tenant.admin,'/ai/cs/send','POST',{customerId:local.customerId,message:'统一身份服务回复'});assert.equal((await received).serviceId,services[0].id);
 assert((await call(customer.accessToken,'/ai/chats?serviceId='+services[0].id)).some(c=>c.content==='统一身份服务回复'));assert(!(await call(customer.accessToken,'/ai/chats?serviceId='+services[1].id)).some(c=>c.content==='统一身份服务回复'));
 }finally{socket.close();}
});
await test('一次手机号认证后可按真实已开通角色切换工作身份，不能自行升权',async()=>{
 const personal=await call(engineer.accessToken,'/identity/switch-role','POST',{role:'customer'});assert.equal(personal.user.id,engineer.user.id);assert.equal(personal.user.role,'customer');
 const working=await call(personal.accessToken,'/identity/switch-role','POST',{role:'engineer'});assert.equal(working.user.id,engineer.user.id);
 await denied(other.accessToken,'/identity/switch-role','POST',{role:'engineer'});await denied(other.accessToken,'/identity/switch-role','POST',{role:'cs_operator'});
 const single=(await control.query(`SELECT m.phone FROM identity.business_accounts a JOIN platform.memberships m ON m.id=a.membership_id JOIN platform.tenants t ON t.id=a.tenant_id AND t.enabled AND t.demo_auth AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) GROUP BY m.phone HAVING count(*)=1 LIMIT 1`)).rows[0];
 if(single){const identified=await call('','/identity/login','POST',{phone:single.phone,code:'000000'});assert.equal(identified.user.role,'cs_operator');assert(identified.identityToken);assert((await call(identified.accessToken,'/admin/stats')).totalOrders!==undefined);}
});
await test('原有企业地址的经纬度可导入个人地址并用于另一家设备报修',async()=>{
 const local=(await call('','/auth/login','POST',{tenantCode:tenants[0].code,phone,code:'000000',role:'customer'})).accessToken;
 await call(local,'/customer/addresses','POST',{province:'测试省',city:'测试市',district:'测试区',detail:'经纬度兼容'+run,latitude:22.5431234,longitude:114.0512345});
 const saved=(await call(customer.accessToken,'/customer/addresses')).find(a=>a.detail==='经纬度兼容'+run);assert.equal(typeof saved.latitude,'number');
 const target=devices.find(d=>d.serviceName===tenants[1].name);
 const next=await call(customer.accessToken,'/customer/work-orders','POST',{deviceId:target.id,addressId:saved.id,faultType:'经纬度兼容',faultDescription:'跨服务商使用本人的地址'});assert.equal(next.serviceName,tenants[1].name);
 assert.equal(Number((await call(customer.accessToken,'/customer/work-orders/'+next.id)).address.latitude),22.5431234);
});
await test('原有客户登录可升级为统一账号并保留当前工单链接，后台账号不能升级冒充个人',async()=>{
 const local=await call('','/auth/login','POST',{phone,code:'000000',role:'customer',tenantCode:tenants[0].code});
 const upgraded=await call(local.accessToken,'/identity/upgrade','POST',{hash:'#'+tenants[0].order.id});assert(upgraded.user.unified);assert.equal(upgraded.user.id,customer.user.id);
 assert.equal((await call(upgraded.accessToken,'/customer/work-orders/'+upgraded.resume.hash.slice(1))).orderNo,tenants[0].order.orderNo);
 await denied(tenants[0].admin,'/identity/upgrade','POST',{});
});
await test('平台可重置独立企业管理账号，旧后台凭证失效但个人账号仍可用',async()=>{
 const t=tenants[0],reset=await call(platform,'/platform/tenants/'+t.id+'/admin-password','POST',{reason:'验证账号发放及重置'});
 await denied('','/identity/business-login','POST',t.credentials);await denied(t.admin,'/admin/work-orders');
 const next=await call('','/identity/business-login','POST',reset);t.admin=next.accessToken;t.credentials=reset;assert.equal(next.user.tenantId,t.id);assert.equal((await call(customer.accessToken,'/auth/profile')).id,customer.user.id);
});
}finally{await control.end();}
mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});const failed=results.filter(r=>!r.pass).length;
writeFileSync(new URL('../reports/unified-identity.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),passed:results.length-failed,failed,results},null,2));
writeFileSync(new URL('../reports/unified-fixture.json',import.meta.url),JSON.stringify({phone,engineerPhone,otherPhone,tenants,customer,engineer,orders,devices},null,2));console.log('UNIFIED IDENTITY',results.length-failed+'/'+results.length);if(failed)process.exitCode=1;
