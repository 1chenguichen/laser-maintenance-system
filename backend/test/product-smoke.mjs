import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
const base = process.env.TEST_API_BASE;
if (!base || new URL(base).port !== '8280') throw new Error('Set TEST_API_BASE=http://127.0.0.1:8280; run only against the isolated audit database.');
const require = createRequire(new URL('../../apps/cs-admin/package.json', import.meta.url));
const { io } = require('socket.io-client');
const run = String(Date.now()).slice(-7);
const phones = ['1911','1921','1931','1941'].map(p => p + run);
const results = [], tokens = {}, users = {};
let order, device, address;
async function call(role, path, method='GET', body, expected) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tokens[role] ? { Authorization: 'Bearer ' + tokens[role] } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  if (expected !== undefined) assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  else assert(response.ok, `${method} ${path}: ${response.status} ${text}`);
  return data;
}
async function test(name, fn) { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch(error) { results.push({ name, pass: false, error: error.message }); console.log('FAIL', name, error.message); } }
async function login(key, role, phone) { const l = await call('', '/auth/login', 'POST', { phone, code:'000000', role }); tokens[key] = l.accessToken; users[key] = l.user; return l; }
async function newOrder(extra={}) { return call('customer', '/customer/work-orders', 'POST', { deviceId:device.id, addressId:address.id, faultType:'自动回归测试', faultDescription:'AUDIT_' + run, ...extra }); }
async function threeState(id, status) { for (const [role,path] of [['customer','/customer/work-orders/'],['admin','/admin/work-orders/'],['engineer','/engineer/orders/']]) assert.equal((await call(role,path+id)).status,status); }
async function openPage(app, name, hash = '') {
 const root=new URL('../../apps/'+app+'/',import.meta.url);
 const html=readFileSync(new URL(name,root),'utf8');
 const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>{if(!error.message.includes('navigation'))console.error(error.message)});
 const dom=new JSDOM(html,{virtualConsole,url:'http://localhost:'+(app==='customer-app-web'?'3101':'3102')+'/'+name+hash,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;await new Promise(r=>setTimeout(r,0));
 w.LASER_API_BASE=base;w.LASER_DISABLE_SESSION_UPGRADE=true;w.fetch=(url,opts)=>fetch(url,opts);w.alert=()=>{};w.confirm=()=>true;w.tailwind={};w.setInterval=()=>0;
 w.localStorage.setItem('customer_token',tokens.customer);w.localStorage.setItem('engineer_token',tokens.engineer);w.localStorage.setItem('engineer_user',JSON.stringify(users.engineer));
 w.localStorage.setItem('laser_organization',JSON.stringify({id:users.engineer.tenantId,name:users.engineer.tenantName}));
 w.eval(readFileSync(new URL('app-config.js',root),'utf8'));
 if(name==='login.html')w.eval(readFileSync(new URL('organization-login.js',root),'utf8'));
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if(match[1].trim())w.eval(match[1]);
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return dom;
}
async function until(check) { for(let i=0;i<40;i++){if(check())return;await new Promise(r=>setTimeout(r,50))}assert(check(),'DOM did not render expected result'); }
function connect(token) { return new Promise((resolve,reject) => { const s=io(base+'/ws',{auth:{token},transports:['websocket'],timeout:3000,reconnection:false}); s.once('connect',()=>resolve(s));s.once('connect_error',e=>{s.close();reject(e)}); }); }
try {
await test('三个角色登录、两个客户数据隔离准备', async()=>{
 await login('admin','cs_operator','13800138000');await login('customer','customer',phones[0]);await login('other','customer',phones[1]);
 for (const [key,phone] of [['engineer',phones[2]],['engineer2',phones[3]]]) { await call('admin','/admin/engineers','POST',{name:'回归工程师'+key,phone}); await login(key,'engineer',phone); await call(key,'/engineer/status','PUT',{status:'ONLINE'}); }
});
await test('未登录401、客户访问客服/库存403、工程师访问客户403', async()=>{
 await call('','/admin/work-orders','GET',undefined,401);await call('customer','/admin/work-orders','GET',undefined,403);await call('customer','/ai/cs/waiting','GET',undefined,403);await call('engineer','/customer/devices','GET',undefined,403);await call('customer','/parts','GET',undefined,403);
});
await test('工程师获取验证码按钮确实请求服务，验证码只可使用一次',async()=>{
 const dom=await openPage('engineer-app-web','login.html');
 const Redis=(await import('ioredis')).default;const redis=new Redis({host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379)});
 try{dom.window.document.getElementById('phone').value=users.engineer.phone;await dom.window.sendCode();const code=await redis.get('identity-auth:otp:'+users.engineer.phone);assert(/^\d{6}$/.test(code));await call('','/identity/login','POST',{phone:users.engineer.phone,code,role:'engineer'});await call('','/identity/login','POST',{phone:users.engineer.phone,code,role:'engineer'},400);}finally{dom.window.close();redis.disconnect()}
});
await test('非法手机号和负数报价被拒绝',async()=>{ await call('','/auth/login','POST',{phone:'bad',code:'000000',role:'customer'},400); });
await test('客服建档→客户扫码绑定→地址新增与修改',async()=>{
 device=await call('admin','/admin/devices','POST',{serialNumber:'AUDIT-'+run,model:'TEST-100',deviceType:'laser_cutter'});
 const bound=await call('customer','/customer/devices','POST',{serialNumber:device.serialNumber});assert.equal(bound.customerId,users.customer.id);
 await call('other','/customer/devices','POST',{serialNumber:device.serialNumber},400);
 address=await call('customer','/customer/addresses','POST',{province:'测试省',city:'测试市',district:'测试区',detail:'隔离测试地址',isDefault:true});
 address=await call('customer','/customer/addresses/'+address.id,'PUT',{province:'测试省',city:'测试市',district:'测试区',detail:'更新后的测试地址',isDefault:true});assert.equal(address.detail,'更新后的测试地址');
});
await test('客户报修→客服分类→工程师抢单池',async()=>{
 order=await newOrder();assert((await call('admin','/admin/work-orders')).some(x=>x.id===order.id));
 await call('admin',`/admin/work-orders/${order.id}/classify`,'PUT',{faultType:'自动回归测试',emergencyLevel:0,estimatedAmount:100,dispatchType:'SYSTEM'});
 assert((await call('engineer','/engineer/grab-pool')).some(x=>x.id===order.id));
 await call('other','/customer/work-orders/'+order.id,'GET',undefined,404);
});
await test('两名工程师并发抢单，恰好一人成功',async()=>{
 const requests=await Promise.all(['engineer','engineer2'].map(role=>fetch(base+'/engineer/grab',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens[role]},body:JSON.stringify({workOrderId:order.id})})));
 assert.equal(requests.filter(r=>r.ok).length,1);
 if(requests[1].ok){[tokens.engineer,tokens.engineer2]=[tokens.engineer2,tokens.engineer];[users.engineer,users.engineer2]=[users.engineer2,users.engineer]}
 await threeState(order.id,'DISPATCHED');
});
await test('上门→拒绝负数报价→有效报价三端一致',async()=>{
 await call('engineer','/engineer/orders/'+order.id+'/start','POST');
 await call('engineer','/engineer/orders/'+order.id+'/quote','POST',{partsFee:-10,laborFee:100},400);
 await call('engineer','/engineer/orders/'+order.id+'/quote','POST',{partsFee:60,laborFee:40});await threeState(order.id,'PENDING_PAYMENT');
});
await test('客户订单详情DOM显示真实报价100元及确认按钮',async()=>{
 const dom=await openPage('customer-app-web','order-progress.html','#'+order.id);try{await until(()=>dom.window.document.getElementById('totalFee').textContent==='¥100.00');assert(!dom.window.document.getElementById('confirmQuoteBtn').classList.contains('hidden'));}finally{dom.window.close()}
});
await test('报价确认页DOM金额/设备真实，无虚构减免或失效付款接口',async()=>{
 const dom=await openPage('customer-app-web','quote-confirm.html','#'+order.id);try{await until(()=>dom.window.document.getElementById('totalAmount').textContent==='100.00');assert.equal(dom.window.document.getElementById('deviceModel').textContent,'TEST-100');assert(!dom.window.document.getElementById('discount'));}finally{dom.window.close()}
});
await test('报价确认前不能付定金、客户确认后仍为未付款',async()=>{
 await call('customer','/customer/work-orders/'+order.id+'/pay-prepayment','POST',undefined,400);
 const confirmed=await call('customer','/customer/work-orders/'+order.id+'/confirm','POST',{confirm:true});assert.equal(Number(confirmed.prepayAmount),30);
 assert.equal((await call('customer','/payment/status/'+order.id)).paid,false);
 const dom=await openPage('customer-app-web','pay.html','?orderId='+order.id+'&status=success');try{await until(()=>dom.window.document.getElementById('statusTitle').textContent==='待支付定金')}finally{dom.window.close()}
 await call('other','/payment/status/'+order.id,'GET',undefined,403);
});
await test('模拟定金→维修中→完工→等待尾款三端一致',async()=>{
 await call('customer','/customer/work-orders/'+order.id+'/pay-prepayment','POST');await threeState(order.id,'REPAIRING');
 await call('customer','/customer/work-orders/'+order.id+'/confirm','POST',{confirm:true},400);
 await call('engineer','/engineer/orders/'+order.id+'/complete','POST',{partsFee:60,laborFee:40,repairReport:'隔离数据库维修报告',onSitePhotos:[]});await threeState(order.id,'PENDING_FINAL_PAYMENT');
});
await test('并发支付尾款只成功一次，收益只累计一次',async()=>{
 const before=await call('engineer','/engineer/stats');
 const rs=await Promise.all([0,1].map(()=>fetch(base+'/customer/work-orders/'+order.id+'/pay-final',{method:'POST',headers:{Authorization:'Bearer '+tokens.customer}})));
 assert.equal(rs.filter(r=>r.ok).length,1);await threeState(order.id,'COMPLETED');
 const after=await call('engineer','/engineer/stats');assert.equal(after.currentMonth.orderCount,before.currentMonth.orderCount+1);assert.equal(Number(after.history.totalRevenue)-Number(before.history.totalRevenue),100);
});
await test('工程师统计页DOM显示真实订单数量和100元收入',async()=>{
 const dom=await openPage('engineer-app-web','stats.html');try{await until(()=>dom.window.document.getElementById('monthlyOrders').textContent==='1');assert.equal(dom.window.document.getElementById('monthlyRevenue').textContent,'¥100.00');}finally{dom.window.close()}
});
await test('评价同步客服，重复评价/跨客户投诉被拒绝',async()=>{
 await call('customer','/customer/reviews','POST',{workOrderId:order.id,rating:5,content:'自动回归评价'});
 await call('customer','/customer/reviews','POST',{workOrderId:order.id,rating:5},400);
 await call('other','/customer/complaints','POST',{workOrderId:order.id,complaintType:'COMPLAINT',content:'越权测试'},404);
 assert.equal(Number((await call('customer','/customer/work-orders/'+order.id)).review.rating),5);
});
await test('退款金额校验、客户退款申请→客服投诉列表',async()=>{
 await call('customer','/customer/refund','POST',{workOrderId:order.id,amount:-1,reason:'测试'},400);
 const dom=await openPage('customer-app-web','refund.html');
 try{await until(()=>[...dom.window.document.getElementById('orderSelect').options].some(x=>x.value===order.id));dom.window.document.getElementById('orderSelect').value=order.id;dom.window.loadOrderInfo();assert.equal(dom.window.document.getElementById('refundPaid').textContent,'¥ 100.00');dom.window.document.querySelector('input[name=refund_reason]').checked=true;await dom.window.submitRefund();}finally{dom.window.close()}
 const complaint=await call('customer','/customer/refund/'+order.id);
 assert((await call('admin','/admin/complaints')).some(x=>x.id===complaint.id));
 await call('customer','/customer/refund','POST',{workOrderId:order.id,amount:10,reason:'重复申请'},400);
});
await test('客服指定派单→工程师待接单→接受→任务列表',async()=>{
 await call('engineer','/engineer/status','PUT',{status:'ONLINE'});
 const designated=await newOrder({hasPreferredEngineer:true,preferredEngineerId:users.engineer.id});
 await call('admin',`/admin/work-orders/${designated.id}/classify`,'PUT',{faultType:'指定派单测试',emergencyLevel:0,estimatedAmount:100,dispatchType:'DESIGNATED',designatedEngineerId:users.engineer.id});
 assert((await call('engineer','/engineer/designated-orders')).some(x=>x.id===designated.id));
 const dom=await openPage('engineer-app-web','tasks.html');try{await until(()=>dom.window.document.getElementById('taskList').textContent.includes('接受指派'));await dom.window.acceptDesignated(designated.id);assert((await call('engineer','/engineer/orders')).some(x=>x.id===designated.id));}finally{dom.window.close()}
 await call('customer','/customer/work-orders/'+designated.id+'/cancel','POST',{reason:'测试取消'});assert.equal((await call('admin','/admin/work-orders/'+designated.id)).status,'CANCELLED');
});
await test('关联地址不可误删、解绑设备保留历史工单',async()=>{
 await call('customer','/customer/addresses/'+address.id,'DELETE',undefined,400);
 await call('customer','/customer/devices/'+device.id,'DELETE');assert(!(await call('customer','/customer/devices')).some(x=>x.id===device.id));assert.equal((await call('admin','/admin/devices/'+device.id)).serialNumber,device.serialNumber);
});
await test('人工队列→客服接入→HTTP历史及WebSocket收到客服回复',async()=>{
 const socket=await connect(tokens.customer);socket.emit('bind_customer',{customerId:users.customer.id});await new Promise(r=>setTimeout(r,80));
 try {await call('customer','/ai/chat','POST',{message:'转人工'});assert((await call('admin','/ai/cs/waiting')).some(x=>x.customerId===users.customer.id));
 await call('admin','/ai/cs/accept','POST',{customerId:users.customer.id,csOperatorId:users.admin.id});
 const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WebSocket timeout')),2500);socket.once('cs_message',d=>{clearTimeout(timer);resolve(d)})});
 await call('admin','/ai/cs/send','POST',{customerId:users.customer.id,message:'回归客服回复_'+run});assert.equal((await received).message,'回归客服回复_'+run);
 assert((await call('customer','/ai/chats')).some(x=>x.content==='回归客服回复_'+run));
 await call('customer','/ai/cs/end','POST',{customerId:users.customer.id},403);
 const ended=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Session-end event timeout')),2500);socket.once('cs_ended',()=>{clearTimeout(timer);resolve()})});
 await call('admin','/ai/cs/end','POST',{customerId:users.customer.id});await ended;
 const transfer=await call('customer','/ai/chat','POST',{message:'转人工'});assert.equal(transfer.needHuman,true);
 await call('admin','/ai/cs/accept','POST',{customerId:users.customer.id,csOperatorId:users.admin.id});
 await call('admin','/ai/cs/rating','POST',{customerId:users.customer.id,rating:5,tags:[]});
 }finally{socket.close()}
});
await test('WebSocket拒绝未认证连接',async()=>{await assert.rejects(()=>connect(undefined));});
await test('AI服务未配置时返回明确错误，匿名调用拒绝',async()=>{
 await call('','/ai/engineer/chat','POST',{query:'测试'},401);await call('engineer','/ai/engineer/chat','POST',{query:'测试'},503);
});
await test('客服统计/客户/工程师/设备/库存列表和健康接口',async()=>{
 for(const path of ['/admin/stats','/admin/stats/trend','/admin/stats/performance','/admin/stats/engineers/ranking','/admin/stats/complaint-rate','/admin/customers','/admin/engineers','/admin/devices','/admin/parts','/monitor/health'])await call('admin',path);
});
await test('全部HTML页面内联脚本语法及本地资源扫描',async()=>{
 let pages=0;
 for(const app of ['customer-app-web','engineer-app-web']){
 const root=fileURLToPath(new URL('../../apps/'+app+'/',import.meta.url));
 for(const name of readdirSync(root).filter(x=>x.endsWith('.html'))){pages++;const html=readFileSync(path.join(root,name),'utf8');
 for(const [i,m] of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(m[1],{filename:app+'/'+name+':'+i});
 for(const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){const url=m[1];if(/^(https?:|data:|#|javascript:|tel:|mailto:)/.test(url)||url.includes("' +"))continue;const clean=url.split(/[?#]/)[0];if(clean)assert(existsSync(path.join(root,clean.replace(/^\//,''))),app+'/'+name+' missing '+url)}
 }
 }assert(pages>=28);
});
await test('共享网页配置端口映射和HTTP失败提示',async()=>{
 const config=readFileSync(new URL('../../apps/customer-app-web/app-config.js',import.meta.url),'utf8');
 const context={window:{fetch:async()=>{},addEventListener:()=>{}},location:{port:'3101',hostname:'localhost',protocol:'http:'}};vm.runInNewContext(config,context);assert.equal(context.window.APP_API_BASE,'http://localhost:8180');
 await assert.rejects(()=>context.window.readApiResponse({ok:false,status:400,json:async()=>({message:'模拟错误'})}),/模拟错误/);
});
await test('照片上传后可访问，非图片上传被拒绝',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 const form=new FormData();form.append('photo',new Blob([png],{type:'image/png'}),'audit.png');
 const r=await fetch(base+'/customer/work-orders/photo',{method:'POST',headers:{Authorization:'Bearer '+tokens.customer},body:form});assert(r.ok);const data=await r.json();assert((await fetch(base+data.url)).ok);
 const bad=new FormData();bad.append('photo',new Blob(['<html>test</html>'],{type:'text/html'}),'audit.html');
 const invalid=await fetch(base+'/customer/work-orders/photo',{method:'POST',headers:{Authorization:'Bearer '+tokens.customer},body:bad});assert.equal(invalid.status,400);
});
await test('库存新增/预留/释放/调拨、负数校验、失败不丢库存',async()=>{
 const part=await call('admin','/parts','POST',{name:'测试配件',code:'P'+run,category:'test',unit:'个',guidePrice:10});
 const a=await call('admin','/parts/warehouses','POST',{name:'源仓'+run,location:'测试地址'});const b=await call('admin','/parts/warehouses','POST',{name:'目标仓'+run,location:'测试地址'});
 const stock={partId:part.id,warehouseId:a.id,quantity:10};
 await call('admin','/parts/stock-in','POST',{...stock,quantity:-1},400);await call('admin','/parts/stock-in','POST',stock);
 await call('admin','/parts/reserve','POST',{...stock,quantity:2});await call('admin','/parts/release','POST',{...stock,quantity:1});
 const moved=await call('admin','/parts/transfer','POST',{partId:part.id,fromWarehouseId:a.id,toWarehouseId:b.id,quantity:3});assert.equal(moved.from.quantity,7);assert.equal(moved.to.quantity,3);
 await call('admin','/parts/transfer','POST',{partId:part.id,fromWarehouseId:a.id,toWarehouseId:'00000000-0000-0000-0000-000000000000',quantity:2},404);
 const inventory=await call('admin','/parts/inventory?warehouseId='+a.id);assert.equal(inventory.find(x=>x.partId===part.id).quantity,7);
 await call('admin','/parts/reserve','POST',{...stock,quantity:-2},400);
 await Promise.all([1,2].map(()=>call('admin','/parts/stock-in','POST',{...stock,quantity:1})));
 assert.equal((await call('admin','/parts/inventory?warehouseId='+a.id)).find(x=>x.partId===part.id).quantity,9);
 const dom=await openPage('engineer-app-web','inventory.html');try{await until(()=>dom.window.document.getElementById('warehouseName').textContent.includes('移动仓'));assert.equal(Number(dom.window.document.getElementById('availableCount').textContent),0);assert(!dom.window.document.getElementById('inventoryList').textContent.includes('源仓'+run))}finally{dom.window.close()}
});
await test('提成0/10/11/30/31单边界与下一档提示',async()=>{
 const {CommissionService}=await import('../dist/commission/commission.service.js');const service=Object.create(CommissionService.prototype);service.TIERS=[{min:1,max:10,rate:.2,name:'20%'},{min:11,max:30,rate:.25,name:'25%'},{min:31,max:Infinity,rate:.3,name:'30%'}];
 for(const [count,rate] of [[0,.2],[10,.2],[11,.25],[30,.25],[31,.3]]){assert.equal(service.calculateCommission(count,100).rate,rate)}assert.equal(service.getCurrentTier(10).nextTier.remaining,1);
});
await test('工单输入中的HTML在客户/工程师列表中显示为文本',async()=>{
 await call('customer','/customer/devices','POST',{serialNumber:device.serialNumber});
 const malicious=await newOrder({faultType:'<img id="injected-order" src=x>',faultDescription:'<img id="injected-description" src=x>'});
 try{
 const customerDom=await openPage('customer-app-web','orders.html');try{await until(()=>customerDom.window.document.getElementById('orderList').textContent.includes('injected-order'));assert(!customerDom.window.document.getElementById('injected-order'));assert(!customerDom.window.document.getElementById('injected-description'));}finally{customerDom.window.close()}
 await call('admin','/admin/work-orders/'+malicious.id+'/dispatch','POST',{engineerId:users.engineer.id});
 const engineerDom=await openPage('engineer-app-web','tasks.html');try{await until(()=>engineerDom.window.document.getElementById('taskList').textContent.includes('injected-order'));assert(!engineerDom.window.document.getElementById('injected-order'));}finally{engineerDom.window.close()}
 }finally{await call('admin','/admin/work-orders/'+malicious.id,'DELETE')}
});
await test('删除含评价、退款记录的测试工单保持事务完整',async()=>{await call('admin','/admin/work-orders/'+order.id,'DELETE');});
} finally {
 const failed=results.filter(x=>!x.pass);const report={date:new Date().toISOString(),base,passed:results.length-failed.length,failed:failed.length,results};
 mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});writeFileSync(new URL('../reports/product-smoke.json',import.meta.url),JSON.stringify(report,null,2));
 console.log(`RESULT ${report.passed}/${results.length} passed`);if(failed.length)process.exitCode=1;
}
