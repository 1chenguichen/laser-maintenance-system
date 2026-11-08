import 'reflect-metadata';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import {JwtService} from '@nestjs/jwt';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));dotenv.config({path:path.join(root,'backend/.env'),quiet:true});
const config={host:process.env.DB_HOST||'localhost',user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD};
const db=new pg.Client({...config,database:(await fs.readFile(path.join(root,'.local-preview/database.txt'),'utf8')).trim()});await db.connect();
const seed=JSON.parse(await fs.readFile(path.join(root,'.local-preview/service-network-demo.json'),'utf8'));
const jwt=new JwtService({secret:process.env.JWT_SECRET});const admin=(await db.query('SELECT * FROM platform.admins WHERE enabled LIMIT 1')).rows[0];const platform=jwt.sign({sub:admin.id,version:admin.version,role:'platform_admin',purpose:'platform_access'},{expiresIn:'1h'});
const requests=[],offers=[],locals=[];let person,context,browser;
async function api(url,token,body,status=200){const r=await fetch('http://localhost:8180'+url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+(token||''),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();assert.equal(r.ok,status>=200&&status<300,url+' '+r.status+' '+JSON.stringify(v));if(status>=400)assert.equal(r.status,status,url);return v;}
async function company(id){const m=(await db.query("SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND enabled LIMIT 1",[id])).rows[0];return jwt.sign({sub:m.subject_id,tenantId:id,membershipId:m.id,version:m.version,phone:m.phone,role:'cs_operator',purpose:'access'},{expiresIn:'1h'});}
try{
 assert(seed.shaohui&&seed.huadong,'Demo merchant companies are required');
 const self=seed.companies[0],vendor=seed.companies[1],selfToken=await company(self.id),vendorToken=await company(vendor.id),shaohuiToken=await company(seed.shaohui.id),huadongToken=await company(seed.huadong.id);
 const worker=await api('/identity/login',null,{phone:vendor.staff[0][1],code:'000000',role:'engineer'}),ownWorker=await api('/identity/login',null,{phone:self.staff[0][1],code:'000000',role:'engineer'});
 person=await api('/identity/login',null,{phone:'13698'+String(Date.now()).slice(-6),code:'000000',role:'customer'});
 await api('/market/service-network',person.accessToken,undefined,403);
 const title='NETWORK-TEST-'+Date.now();await api('/market/platform',platform,{type:'offer',title,category:'welding',city:'全国',description:'临时服务网络权限及委托闭环验证'});const offer=(await api('/market/platform',platform)).offers.find(o=>o.title===title);offers.push(offer.id);
 async function create(city='深圳市'){const r=await api('/market/requests',person.accessToken,{offerId:offer.id,deviceModel:'网络验证焊接机',city,address:'测试地址（非真实）',description:'验证设备检测与多方服务委托流程'});requests.push(r.id);return api('/market/requests/'+r.id,platform);}
 const outside=await create('北京市');await api('/market/requests/'+outside.id+'/action',platform,{action:'delegate',version:outside.version,providerId:vendor.id,note:'验证超区域委托'},400);
 const r=await create();await api('/market/requests/'+r.id,selfToken,undefined,404);await api('/market/requests/'+r.id+'/action',vendorToken,{action:'delegate',version:r.version,providerId:self.id,note:'验证越权委托'},403);
 browser=await chromium.connectOverCDP('http://127.0.0.1:9324');context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(s=>{if(location.port==='3103')sessionStorage.setItem('platform_admin_token',s.platform);if(location.port==='3100')sessionStorage.setItem('cs_admin_token',s.company);if(location.port==='3101'){localStorage.setItem('customer_token',s.person.accessToken);localStorage.setItem('customer_user',JSON.stringify(s.person.user));}if(location.port==='3102'){localStorage.setItem('engineer_token',s.worker.accessToken);localStorage.setItem('engineer_user',JSON.stringify(s.worker.user));}},{platform,company:vendorToken,person,worker});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3103/service-network.html');const form=page.locator('[data-delegate="'+r.id+'"]');await form.waitFor();await form.locator('[name=providerId]').selectOption(vendor.id);await form.locator('[name=note]').fill('区域业务由华南售后企业承接');await form.getByRole('button',{name:'发送服务委托'}).click();await page.waitForFunction(()=>document.getElementById('notice').textContent==='操作已保存');
 let current=await api('/market/requests/'+r.id,platform);assert.equal(current.delegation_state,'PENDING');
 await api('/market/requests/'+r.id+'/action',selfToken,{action:'delegate-accept',version:current.version,note:'越权接单验证'},403);
 assert(!(await api('/market/pool',worker.accessToken)).some(x=>x.id===r.id));
 await api('/market/requests/'+r.id+'/action',worker.accessToken,{action:'claim',version:current.version},400);
 await page.goto('http://localhost:3100/service-network');const row=page.locator('tr').filter({hasText:r.number});await row.getByRole('button',{name:'接受委托',exact:true}).click();await row.getByRole('button',{name:'指派工程师',exact:true}).waitFor();current=await api('/market/requests/'+r.id,platform);
 await api('/market/requests/'+r.id+'/action',vendorToken,{action:'assign',version:current.version,engineerId:ownWorker.user.id},403);
 await row.locator('[name=engineerId]').selectOption(worker.user.id);await row.getByRole('button',{name:'指派工程师',exact:true}).click();await row.getByText(worker.user.name,{exact:true}).waitFor();
 current=await api('/market/requests/'+r.id,worker.accessToken);assert.equal(current.dispatcher_kind,'company');assert.equal(current.assigned_provider_id,vendor.id);assert.equal(current.service_kind,'OUTSOURCE');
 await page.goto('http://localhost:3102/platform-order.html?id='+r.id);await page.locator('.service-responsibility').getByText(vendor.name,{exact:true}).waitFor();await page.goto('http://localhost:3101/platform-order.html?id='+r.id);await page.locator('.service-responsibility').getByText(vendor.name,{exact:true}).waitFor();
 for(const [actor,action,extra]of [[worker.accessToken,'accept',{}],[worker.accessToken,'quote',{amount:120,note:'仅测试：检测及维修服务报价'}],[person.accessToken,'approve',{}],[worker.accessToken,'start',{}],[worker.accessToken,'complete',{report:'仅测试：完成检测与维修，已核实设备恢复运行'}],[person.accessToken,'confirm',{}]]){current=await api('/market/requests/'+r.id,platform);await api('/market/requests/'+r.id+'/action',actor,{action,version:current.version,...extra});}
 assert.equal((await api('/market/requests/'+r.id,vendorToken)).status,'COMPLETED');
 const direct=await create(),employers=(await api('/market/me',ownWorker.accessToken)).employers;
 await api('/market/requests/'+direct.id+'/action',platform,{action:'assign',engineerId:ownWorker.user.id,serviceId:employers[0].id,version:direct.version});const assigned=await api('/market/requests/'+direct.id,ownWorker.accessToken);assert.equal(assigned.service_kind,'PLATFORM_SERVICE');assert.equal(assigned.dispatcher_kind,'platform');
 console.log('PASS 平台委托→企业确认→本企业派单→报价→客户确认→完工→验收；平台直接指派自营工程师；四端真实界面');
 const address=await api('/customer/addresses',person.accessToken,{province:'广东省',city:'深圳市',district:'宝安区',detail:'服务网络测试地址（模拟）',isDefault:true});
 for(const [tenant,token,expected]of[[seed.shaohui,shaohuiToken,'ENTERPRISE_OUTSOURCE'],[seed.huadong,huadongToken,'ENTERPRISE_SELF']]){
  const customer=await api('/admin/customers',token,{name:'网络临时测试客户',phone:person.user.phone});locals.push({tenant:tenant.id,customerId:customer.id});
  const device=await api('/admin/devices',token,{customerId:customer.id,serialNumber:'NETWORK-'+randomUUID(),model:'网络测试 LW-500',deviceType:'激光焊接机'});
  locals[locals.length-1].deviceId=device.id;
  const devices=await api('/customer/devices',person.accessToken),chosen=devices.find(d=>d.serialNumber===device.serialNumber);assert(chosen);
  const p=await api('/market/service-policy/'+chosen.serviceId,person.accessToken);assert.equal(p.service_mode,expected==='ENTERPRISE_SELF'?'SELF':'OUTSOURCE');
  const created=await api('/market/device-repairs',person.accessToken,{deviceId:chosen.id,addressId:address.id,faultType:'光路故障',faultDescription:'仅测试：核验设备企业售后路由',urgency:'normal',preferredTime:'asap',photoIds:[],clientRequestId:randomUUID()});requests.push(created.id);const detail=await api('/market/requests/'+created.id,platform);assert.equal(detail.dispatch_source,expected);assert.equal(detail.assigned_provider_id,expected==='ENTERPRISE_SELF'?tenant.id:vendor.id);
  await page.goto('http://localhost:3101/repair-form.html?deviceId='+chosen.id);await page.locator('#repairRoutingNote').getByText(expected==='ENTERPRISE_SELF'?/自有售后团队/:/合作承接|承接/).waitFor();
 }
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS 自有团队/外包策略按设备关联企业路由；区域限制；越权查看/接单/派人被阻止；未接委托不进入接单池');
}catch(e){console.error(e);process.exitCode=1;}finally{
 if(context)await context.close();if(browser)await browser.close();
 await db.query('DELETE FROM market.visuals WHERE request_id=ANY($1::uuid[])',[requests]);await db.query('DELETE FROM market.events WHERE request_id=ANY($1::uuid[])',[requests]);await db.query('DELETE FROM market.requests WHERE id=ANY($1::uuid[])',[requests]);await db.query('DELETE FROM market.offers WHERE id=ANY($1::uuid[])',[offers]);
 if(person){for(const local of locals){const tenant=(await db.query('SELECT database_name FROM platform.tenants WHERE id=$1',[local.tenant])).rows[0];const c=new pg.Client({...config,database:tenant.database_name});await c.connect();try{await c.query('DELETE FROM devices WHERE customer_id=$1',[local.customerId]);await c.query('DELETE FROM customers WHERE id=$1',[local.customerId]);}finally{await c.end();}await db.query("DELETE FROM identity.resources WHERE tenant_id=$1 AND local_id=ANY($2::uuid[])",[local.tenant,[local.customerId,local.deviceId].filter(Boolean)]);await db.query("DELETE FROM identity.assets WHERE tenant_id=$1 AND local_id=$2",[local.tenant,local.deviceId]);await db.query("DELETE FROM platform.memberships WHERE tenant_id=$1 AND role='customer' AND subject_id=$2",[local.tenant,local.customerId]);}
 await db.query('DELETE FROM identity.links WHERE person_id=$1',[person.user.id]);await db.query('DELETE FROM identity.addresses WHERE person_id=$1',[person.user.id]);await db.query('DELETE FROM identity.people WHERE id=$1',[person.user.id]);}
 await db.end();console.log('CLEANUP 临时服务单及测试客户已清理，演示企业与工程师保留');
}
