process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const base=process.env.TEST_API_BASE;if(!base||new URL(base).port!=='8280')throw Error('Use isolated audit backend 8280');
const run=String(Date.now()),fixtureCode='web-'+run,phone='1931'+run.slice(-7),engineerPhone='1941'+run.slice(-7),out=path.join(__dirname,'../reports/platform-browser');fs.mkdirSync(out,{recursive:true});
let code=fixtureCode,browser,platform,admin,customer,engineer,tenant,adminToken,customerToken,engineerToken,platformToken,order,localEngineer;const contexts=[],results=[],errors=[];
async function api(token,url,method='GET',body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert(r.ok,JSON.stringify(data));return data;}
async function page(role,width=1440){const ctx=await browser.newContext({viewport:{width,height:960}});contexts.push(ctx);await ctx.addInitScript(()=>{window.LASER_API_BASE='http://127.0.0.1:8280'});await ctx.route(/^http:\/\/(localhost|127\.0\.0\.1):8180\//,route=>route.continue({url:route.request().url().replace(':8180',':8280')}));const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push({role,error:e.message}));p.on('dialog',d=>d.accept());return p;}
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);}}
async function capture(p,file){await p.bringToFront();await p.screenshot({path:path.join(out,file+'.png'),animations:'disabled',timeout:6000}).catch(e=>console.log('Screenshot unavailable:',e.message.split('\n')[0]));}
async function close(){const dialog=platform.getByRole('dialog');if(await dialog.count())await dialog.getByRole('button',{name:'关闭',exact:true}).last().click();}
async function profileStatus(p,key){return p.evaluate(async({key,base})=>(await fetch(base+'/auth/profile',{headers:{Authorization:'Bearer '+(key==='cs_admin_token'?sessionStorage:localStorage).getItem(key)}})).status,{key,base});}
(async()=>{try{
browser=await chromium.connectOverCDP('http://127.0.0.1:9324');platform=await page('platform');
await test('平台独立登录和真实总览展示',async()=>{
 await platform.goto('http://localhost:3103/',{waitUntil:'domcontentloaded'});await capture(platform,'login');
 await platform.getByLabel('平台账号',{exact:true}).fill(process.env.PLATFORM_ADMIN_USERNAME);await platform.getByLabel('登录密码',{exact:true}).fill(process.env.PLATFORM_ADMIN_PASSWORD);await platform.getByRole('button',{name:'登录控制台 →'}).click();
 await platform.getByRole('heading',{name:'企业运营总览',exact:true}).waitFor();await platform.locator('#totalLabel').filter({hasText:'家'}).waitFor();
 platformToken=await platform.evaluate(()=>sessionStorage.getItem('platform_admin_token'));assert(platformToken);await capture(platform,'overview');
});
await test('网页创建企业、自动开通并展示三个端登录入口',async()=>{
 await platform.getByRole('button',{name:'＋ 新建企业',exact:true}).click();
 await platform.getByLabel('企业名称',{exact:true}).fill('网页联动企业'+run.slice(-5));assert.equal(await platform.locator('#tenantCode').count(),0);await platform.getByLabel('企业管理账号（留空自动生成）',{exact:true}).fill('web_'+run);await platform.getByLabel('初始密码（留空自动生成）',{exact:true}).fill('BrowserTest!'+run);await platform.getByLabel('联系人',{exact:true}).fill('浏览器验收联系人');await platform.getByLabel('联系电话',{exact:true}).fill(phone);await platform.getByLabel('企业管理员手机号',{exact:true}).fill(phone);await capture(platform,'create-enterprise');
 await platform.getByRole('button',{name:'创建并开通企业',exact:true}).click();
 await platform.getByRole('heading',{name:'企业开通信息',exact:true}).waitFor();await platform.getByRole('dialog').getByText('正常',{exact:true}).waitFor({timeout:20000});
 for(const label of ['企业管理后台 ↗','客户端 ↗','工程师端 ↗'])assert(!(await platform.getByRole('link',{name:label,exact:true}).getAttribute('href')).includes('organizationId='));
 tenant=(await api(platformToken,'/platform/tenants?search='+encodeURIComponent('网页联动企业'+run.slice(-5)))).items[0];assert(tenant);code=tenant.code;await capture(platform,'provisioned');
});
await test('从开通信息进入企业后台，客户和工程师也能真实登录',async()=>{
 admin=await page('admin');await admin.goto('http://localhost:3100/login?organizationId='+tenant.id,{waitUntil:'domcontentloaded'});await admin.locator('#username').fill('web_'+run);await admin.locator('#password').fill('BrowserTest!'+run);await admin.getByRole('button',{name:'登录',exact:true}).click();await admin.waitForURL('http://localhost:3100/');adminToken=await admin.evaluate(()=>sessionStorage.getItem('cs_admin_token'));
 localEngineer=await api(adminToken,'/admin/engineers','POST',{name:'网页开通工程师',phone:engineerPhone});
 customer=await page('customer',430);await customer.goto('http://localhost:3101/login.html?organizationId='+tenant.id,{waitUntil:'domcontentloaded'});assert.equal(await customer.locator('#organizationName').count(),0);await customer.locator('#phone').fill(phone);await customer.locator('#smsCode').fill('000000');await customer.locator('#loginBtn').click();await customer.waitForURL('**/home.html');customerToken=await customer.evaluate(()=>localStorage.getItem('customer_token'));
 engineer=await page('engineer',430);await engineer.goto('http://localhost:3102/login.html?organizationId='+tenant.id,{waitUntil:'domcontentloaded'});await engineer.locator('#phone').fill(engineerPhone);await engineer.locator('#code').fill('000000');await engineer.locator('#loginBtn').click();await engineer.waitForURL('**/grab.html');engineerToken=await engineer.evaluate(()=>localStorage.getItem('engineer_token'));
 assert((await api(customerToken,'/auth/profile')).unified);assert((await api(engineerToken,'/auth/profile')).unified);
});
await test('新企业客户真实报修、后台看单、工程师任务与平台用量互通',async()=>{
 const user=await api(customerToken,'/auth/profile'),engineerUser=await api(engineerToken,'/auth/profile');
 const device=await api(adminToken,'/admin/devices','POST',{serialNumber:code,model:'新企业维修样机',deviceType:'laser_cutter',customerId:undefined});const claim=await api(adminToken,'/admin/devices/'+device.id+'/claim-link');await api(customerToken,'/customer/devices','POST',{assetKey:claim.assetKey});await api(customerToken,'/customer/addresses','POST',{province:'测试省',city:'测试市',district:'测试区',detail:'新企业浏览器联动地址',isDefault:true});
 await customer.goto('http://localhost:3101/repair-form.html',{waitUntil:'domcontentloaded'});await customer.locator('#deviceListContainer > div').first().click();await customer.locator('#addressListContainer > div').first().click();await customer.locator('#faultType').selectOption('激光器故障');await customer.locator('#faultDesc').fill('PLATFORM_BROWSER_'+run);await customer.locator('button[onclick="submitRepair()"]').click();await customer.waitForURL('**/orders.html');order=(await api(customerToken,'/customer/work-orders')).find(o=>o.faultDescription==='PLATFORM_BROWSER_'+run);assert(order);
 await admin.goto('http://localhost:3100/orders',{waitUntil:'domcontentloaded'});await admin.getByText(order.orderNo,{exact:true}).waitFor();const localOrder=(await api(adminToken,'/admin/work-orders')).find(o=>o.orderNo===order.orderNo);await api(adminToken,'/admin/work-orders/'+localOrder.id+'/dispatch','POST',{engineerId:localEngineer.id});
 await engineer.goto('http://localhost:3102/tasks.html',{waitUntil:'domcontentloaded'});await engineer.getByText(order.orderNo,{exact:true}).waitFor();
 await close();await platform.locator('#search').fill(tenant.name);const row=platform.locator('tr').filter({hasText:tenant.name});await row.getByRole('button',{name:'开通信息',exact:true}).waitFor();await platform.getByRole('button',{name:'↻ 刷新',exact:true}).click();await row.getByText('2 / 1 / 1',{exact:true}).waitFor();await capture(platform,'live-business-usage');
});
await test('网页停用限制企业业务，个人账号不被其他企业连带注销',async()=>{
 const row=platform.locator('tr').filter({hasText:tenant.name});await row.getByRole('button',{name:'停用',exact:true}).click();await platform.getByLabel('操作原因',{exact:true}).fill('浏览器验证三个端停用联动');await platform.getByRole('button',{name:'确认停用',exact:true}).click();await platform.getByRole('dialog').waitFor({state:'hidden'});await row.getByText('已停用',{exact:true}).waitFor();
 assert.equal(await profileStatus(admin,'cs_admin_token'),401);for(const [p,key] of [[customer,'customer_token'],[engineer,'engineer_token']])assert.equal(await profileStatus(p,key),200);
 await row.getByRole('button',{name:'恢复',exact:true}).click();await platform.getByLabel('操作原因',{exact:true}).fill('浏览器验证恢复服务');await platform.getByRole('button',{name:'确认恢复',exact:true}).click();await platform.getByRole('dialog').waitFor({state:'hidden'});await row.getByText('正常',{exact:true}).waitFor();
 for(const [p,key] of [[admin,'cs_admin_token'],[customer,'customer_token'],[engineer,'engineer_token']])assert.equal(await profileStatus(p,key),200);
 assert((await api(customerToken,'/customer/work-orders')).some(o=>o.id===order.id));
});
await test('网页套餐续期的额度校验和权限变更真实生效',async()=>{
 const row=platform.locator('tr').filter({hasText:tenant.name});await row.getByRole('button',{name:'套餐与续期',exact:true}).click();await platform.getByLabel('服务套餐',{exact:true}).selectOption('basic');await platform.getByLabel('员工额度（人）',{exact:true}).fill('1');await platform.getByLabel('变更原因',{exact:true}).fill('验证不能低于实际员工数');await platform.getByRole('button',{name:'保存变更',exact:true}).click();await platform.locator('#modalError').getByText('新额度低于当前实际用量，请先清理或提高额度',{exact:true}).waitFor();
 await platform.getByLabel('员工额度（人）',{exact:true}).fill('10');await platform.getByRole('button',{name:'保存变更',exact:true}).click();await platform.getByRole('dialog').waitFor({state:'hidden'});await row.getByText('基础版',{exact:true}).waitFor();
 const response=await fetch(base+'/operations/contracts',{headers:{Authorization:'Bearer '+adminToken}});assert.equal(response.status,403);
 // The basic plan still allows customer repair submission without the optional contract selector.
 await customer.goto('http://localhost:3101/repair-form.html',{waitUntil:'domcontentloaded'});await customer.locator('#deviceListContainer').getByText('新企业维修样机',{exact:false}).waitFor();
 await row.getByRole('button',{name:'套餐与续期',exact:true}).click();await platform.getByLabel('服务套餐',{exact:true}).selectOption('professional');await platform.getByLabel('变更原因',{exact:true}).fill('恢复专业版用于演示');await platform.getByRole('button',{name:'保存变更',exact:true}).click();await platform.getByRole('dialog').waitFor({state:'hidden'});await row.getByText('专业版',{exact:true}).waitFor();assert(Array.isArray(await api(adminToken,'/operations/contracts')));
});
await test('网页操作日志可查看真实修改前后内容',async()=>{
 await platform.getByRole('button',{name:'操作日志',exact:true}).click();await platform.getByRole('heading',{name:'操作日志',exact:true}).waitFor();const row=platform.locator('tr').filter({hasText:'套餐与有效期变更'}).filter({hasText:tenant.name}).first();await row.getByRole('button',{name:'查看变更',exact:true}).click();await platform.getByRole('heading',{name:'变更详情'}).waitFor();const text=await platform.getByRole('dialog').innerText();assert(text.includes('professional'));assert(text.includes('basic'));assert(!text.includes('database_name'));await capture(platform,'audit-detail');await close();
});
await test('平台手机布局和模态框无横向溢出，页面无未捕获脚本错误',async()=>{
 await platform.setViewportSize({width:390,height:844});await platform.getByRole('button',{name:'企业管理',exact:true}).click();await platform.getByRole('heading',{name:'企业管理',exact:true}).waitFor();assert(await platform.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await platform.getByRole('button',{name:'＋ 新建企业',exact:true}).click();assert(await platform.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await capture(platform,'mobile-create');await close();assert.deepEqual(errors,[]);
});
}catch(e){results.push({name:'启动平台浏览器验收',pass:false,error:e.message});console.error(e.stack);}finally{
 const failed=results.filter(r=>!r.pass).length;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({date:new Date().toISOString(),passed:results.length-failed,failed,results,errors},null,2));console.log(`PLATFORM BROWSER ${results.length-failed}/${results.length}`,errors);if(failed||errors.length)process.exitCode=1;
 for(const ctx of contexts)await ctx.close();if(browser)await browser.close();
}})();
