const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.TEST_API_BASE;
if(!base || new URL(base).port!=='8280') throw Error('Use the isolated audit backend on port 8280');
const run=String(Date.now()).slice(-7),customerPhone='1981'+run,engineerPhone='1991'+run;
const results=[],contexts=[];let browser;
async function api(code,role,phone,token,url='/auth/login',body){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body||{tenantCode:code,role,phone,code:'000000'})});const data=await r.json();assert(r.ok,JSON.stringify(data));return data;}
(async()=>{try{
 browser=await chromium.connectOverCDP('http://127.0.0.1:9324');
 for(const code of ['audit-alpha','audit-beta']){const admin=await api(code,'cs_operator','13800138000');await api(code,null,null,admin.accessToken,'/admin/engineers',{name:code+'浏览器工程师',phone:engineerPhone});}
 for(const role of ['customer','engineer','cs_operator']){
  const ctx=await browser.newContext({viewport:{width:role==='cs_operator'?1440:390,height:844}});contexts.push(ctx);
  await ctx.addInitScript(()=>{window.LASER_API_BASE='http://127.0.0.1:8280'});
  await ctx.route(/^http:\/\/(localhost|127\.0\.0\.1):8180\//,route=>route.continue({url:route.request().url().replace(':8180',':8280')}));
  const page=await ctx.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  const admin=role==='cs_operator',port=admin?3100:role==='customer'?3101:3102,login=admin?'/login':'/login.html';
  const key=admin?'cs_admin_token':role+'_token';
  const ids=[];
  for(const code of ['audit-alpha','audit-beta']){
   await page.goto('http://localhost:'+port+login+'?tenantCode='+code,{waitUntil:'domcontentloaded'});
   if(admin){await page.locator('#organizationName').filter({hasText:code==='audit-alpha'?'Audit Alpha':'Audit Beta'}).waitFor();await page.locator('input[type=tel]').fill('13800138000');await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL('http://localhost:3100/');}
   else{await page.locator('#organizationName').filter({hasText:code==='audit-alpha'?'Audit Alpha':'Audit Beta'}).waitFor();await page.locator('#phone').fill(role==='customer'?customerPhone:engineerPhone);await page.locator(role==='customer'?'#smsCode':'#code').fill('000000');await page.locator('#loginBtn').click();await page.waitForURL(role==='customer'?'**/home.html':'**/grab.html');}
   const token=await page.evaluate(key=>(key==='cs_admin_token'?sessionStorage:localStorage).getItem(key),key);assert(token);const identity=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));ids.push(identity.tenantId);
   const response=await fetch(base+'/auth/profile',{headers:{Authorization:'Bearer '+token}});const profile=await response.json();assert.equal(profile.tenantCode,code);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);assert(!overflow,'horizontal overflow');
   if(admin)await page.getByText(code==='audit-alpha'?'👤 Audit Alpha | 退出':'👤 Audit Beta | 退出').waitFor();
  }
  assert.notEqual(ids[0],ids[1]);assert.deepEqual(errors,[]);results.push({name:role+'真实登录及企业切换',pass:true});console.log('PASS',role,'enterprise login and switch');
 }
}catch(e){console.error(e.stack);results.push({name:'企业登录浏览器验证',pass:false,error:e.message});process.exitCode=1;}finally{
 fs.mkdirSync(path.join(__dirname,'../reports'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../reports/tenant-browser.json'),JSON.stringify({date:new Date().toISOString(),results},null,2));
 for(const ctx of contexts)await ctx.close();if(browser)await browser.close();
}})();
