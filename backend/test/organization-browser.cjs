process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.TEST_API_BASE;if(!base||new URL(base).port!=='8280')throw Error('Use audit backend 8280');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../reports/organization-fixture.json'),'utf8'));
const [a,b]=fixture.organizations,out=path.join(__dirname,'../reports/organization-browser');fs.mkdirSync(out,{recursive:true});
let browser;const contexts=[],results=[],errors=[];
async function create(role){const ctx=await browser.newContext({viewport:{width:role==='cs_operator'?1440:430,height:960}});contexts.push(ctx);await ctx.addInitScript(()=>{window.LASER_API_BASE='http://127.0.0.1:8280'});await ctx.route(/^http:\/\/(localhost|127\.0\.0\.1):8180\//,r=>r.continue({url:r.request().url().replace(':8180',':8280')}));const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);}}
async function capture(p,file){await p.bringToFront();await p.screenshot({path:path.join(out,file+'.png'),animations:'disabled',timeout:6000}).catch(()=>{});}
async function profile(p,key){const token=await p.evaluate(key=>(key==='cs_admin_token'?sessionStorage:localStorage).getItem(key),key);const r=await fetch(base+'/auth/profile',{headers:{Authorization:'Bearer '+token}});assert(r.ok);return r.json();}
(async()=>{try{
browser=await chromium.connectOverCDP('http://127.0.0.1:9324');
for(const role of ['customer','engineer','cs_operator'])await test(role+'专属入口显示名称、账号验证后选择企业、切换仍隔离',async()=>{
 const p=await create(role),admin=role==='cs_operator',origin='http://localhost:'+(admin?3100:role==='customer'?3101:3102),login=admin?'/login':'/login.html',key=admin?'cs_admin_token':role+'_token';
 await p.goto(origin+login+'?organizationId='+a.id,{waitUntil:'domcontentloaded'});await p.locator('#organizationName').getByText(a.name,{exact:true}).waitFor();
 assert.equal(await p.locator('#tenantCode').count(),0);assert(!await p.getByText('企业代码',{exact:true}).count());await capture(p,role+'-enterprise-name');
 await p.getByRole('button',{name:'切换企业',exact:true}).click();await p.locator('#organizationName').getByText('使用手机号登录',{exact:true}).waitFor();
 await p.locator('#phone').fill(fixture.phone);await p.locator(role==='customer'?'#smsCode':'#code').fill('000000');await p.locator('#loginBtn').click();
 await p.getByRole('button',{name:b.name,exact:true}).waitFor();await capture(p,role+'-choose-enterprise');await p.getByRole('button',{name:b.name,exact:true}).click();
 await p.waitForURL(admin?origin+'/':role==='customer'?'**/home.html':'**/grab.html');assert.equal((await profile(p,key)).tenantId,b.id);
 await p.goto(origin+login+'?organizationId='+a.id,{waitUntil:'domcontentloaded'});await p.locator('#organizationName').getByText(a.name,{exact:true}).waitFor();await p.locator('#phone').fill(fixture.phone);await p.locator('#loginBtn').click();await p.waitForURL(admin?origin+'/':role==='customer'?'**/home.html':'**/grab.html');assert.equal((await profile(p,key)).tenantId,a.id);
});
await test('新客户从通用入口不能误入其他企业，可粘贴专属链接加入正确企业',async()=>{
 const p=await create('customer'),phone='1918'+String(Date.now()).slice(-7);await p.goto('http://localhost:3101/login.html',{waitUntil:'domcontentloaded'});await p.locator('#phone').fill(phone);await p.locator('#smsCode').fill('000000');await p.locator('#loginBtn').click();await p.locator('#organizationError').getByText('暂未找到你所属的企业。首次报修请使用服务商提供的专属报修链接。',{exact:true}).waitFor();
 await p.getByText('使用企业提供的专属登录链接',{exact:true}).click();await p.locator('#organizationLink').fill('http://localhost:3101/login.html?organizationId='+a.id);await p.getByRole('button',{name:'打开',exact:true}).click();await p.locator('#organizationName').getByText(a.name,{exact:true}).waitFor();await p.locator('#loginBtn').click();await p.waitForURL('**/home.html');assert.equal((await profile(p,'customer_token')).tenantId,a.id);
});
await test('失效专属入口不回退默认企业，旧入口链接可自动转换',async()=>{
 const p=await create('engineer');await p.goto('http://localhost:3102/login.html?tenantCode='+a.code,{waitUntil:'domcontentloaded'});await p.locator('#organizationName').getByText(a.name,{exact:true}).waitFor();assert(p.url().includes('organizationId='));assert(!p.url().includes('tenantCode='));
 await p.goto('http://localhost:3102/login.html?organizationId=00000000-0000-4000-8000-000000000000',{waitUntil:'domcontentloaded'});await p.locator('#organizationError').filter({hasText:'该企业暂不可用'}).waitFor();await p.locator('#phone').fill(fixture.phone);await p.locator('#loginBtn').click();await p.locator('#organizationError').filter({hasText:'当前企业入口不可用'}).waitFor();assert(p.url().includes('login.html'));
});
await test('三端手机登录布局无横向溢出，登录失败恢复按钮状态',async()=>{
 for(const role of ['customer','engineer','cs_operator']){const p=await create(role),admin=role==='cs_operator';await p.setViewportSize({width:390,height:844});await p.goto('http://localhost:'+(admin?3100:role==='customer'?3101:3102)+(admin?'/login':'/login.html')+'?organizationId='+a.id,{waitUntil:'domcontentloaded'});await p.locator('#organizationName').getByText(a.name,{exact:true}).waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await p.locator('#phone').fill(fixture.phone);await p.locator(role==='customer'?'#smsCode':'#code').fill('123123');await p.locator('#loginBtn').click();await p.locator('#organizationError').filter({hasText:'验证码已过期或无效'}).waitFor();assert(await p.locator('#loginBtn').isEnabled());await capture(p,role+'-mobile');}
 assert.deepEqual(errors,[]);
});
}catch(e){results.push({name:'启动登录入口浏览器检查',pass:false,error:e.message});console.error(e.stack);}finally{
const failed=results.filter(r=>!r.pass).length;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({date:new Date().toISOString(),passed:results.length-failed,failed,results,errors},null,2));console.log('ORGANIZATION BROWSER',results.length-failed+'/'+results.length,errors);if(failed||errors.length)process.exitCode=1;for(const c of contexts)await c.close();if(browser)await browser.close();
}})();
