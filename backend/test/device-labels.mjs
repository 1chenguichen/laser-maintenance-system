import 'reflect-metadata';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import sharp from 'sharp';
import {JwtService} from '@nestjs/jwt';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));dotenv.config({path:path.join(root,'backend/.env'),quiet:true});
const dbConfig={host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD};
const db=new pg.Client({...dbConfig,database:(await fs.readFile(path.join(root,'.local-preview/database.txt'),'utf8')).trim()});await db.connect();
const jwt=new JwtService({secret:process.env.JWT_SECRET}),require=createRequire(import.meta.url),jsQR=require('../../apps/customer-app-web/vendor/jsQR-1.4.0.js');
const fixtures=[],people=[];let browser,context;
async function api(route,token,body,expected=200){const r=await fetch('http://localhost:8180'+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+(token||''),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(expected>=400)assert.equal(r.status,expected,route+': '+JSON.stringify(v));else assert(r.ok,route+': '+JSON.stringify(v));return v;}
async function login(phone){const v=await api('/identity/login',null,{phone,code:'000000',role:'customer'});people.push(v.user.id);return v;}
try{
 const tenants=(await db.query("SELECT t.*,coalesce(p.service_mode,'PLATFORM') service_mode FROM platform.tenants t LEFT JOIN market.service_profiles p ON p.tenant_id=t.id WHERE t.enabled AND t.demo_auth AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) ORDER BY t.name")).rows;
 const chosen=['SELF','OUTSOURCE','PLATFORM'].map(mode=>tenants.find(t=>t.service_mode===mode));assert(chosen.every(Boolean),'Need three service modes in demo');
 const serial='QR-TEST-'+Date.now();
 for(const t of chosen){const m=(await db.query("SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND enabled LIMIT 1",[t.id])).rows[0];const token=jwt.sign({sub:m.subject_id,tenantId:t.id,membershipId:m.id,version:m.version,phone:m.phone,role:'cs_operator',purpose:'access'},{expiresIn:'10m'});const d=await api('/admin/devices',token,{serialNumber:serial,model:'扫码测试设备',deviceType:'激光焊接机'});fixtures.push({t,token,d});const label=await api('/admin/devices/'+d.id+'/claim-link',token);assert.equal(label.assetKey,(await api('/admin/devices/'+d.id+'/claim-link',token)).assetKey);fixtures.at(-1).label=label;}
 assert.equal(new Set(fixtures.map(f=>f.label.assetKey)).size,3,'Same serial across tenants needs distinct QR IDs');
 const phone='13788'+String(Date.now()).slice(-6),owner=await login(phone),other=await login('13789'+String(Date.now()).slice(-6));
 for(const f of fixtures){const p=await api('/customer/device-label/'+f.label.assetKey,owner.accessToken);assert.equal(p.companyName,f.t.name);assert.equal(p.serviceMode,f.t.service_mode);assert.equal(p.bound,false);assert(!('phone'in p));}
 await api('/admin/devices/'+fixtures[0].d.id+'/claim-link',fixtures[1].token,undefined,404);
 await api('/customer/device-label/not-a-uuid',owner.accessToken,undefined,400);
 await api('/customer/device-label/'+randomUUID(),owner.accessToken,undefined,404);
 await api('/customer/device-label/'+fixtures[0].label.assetKey,null,undefined,401);
 browser=await chromium.connectOverCDP('http://127.0.0.1:9324');context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(t=>{window.print=()=>{};if(location.port==='3100')sessionStorage.setItem('cs_admin_token',t.company);else if(location.port==='3101'){localStorage.setItem('customer_token',t.owner.accessToken);localStorage.setItem('customer_user',JSON.stringify(t.owner.user));}},{company:fixtures[0].token,owner});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:3100/devices');await page.getByPlaceholder('搜索设备型号/序列号...').fill(serial);await page.getByRole('button',{name:'设备二维码',exact:true}).click();await page.locator('.label-qr svg').waitFor();assert(!(await page.getByRole('textbox',{name:'客户端访问地址',exact:true}).inputValue()).includes('localhost'),'Default mobile URL must not use localhost');await page.getByRole('textbox',{name:'客户端访问地址',exact:true}).fill('http://127.0.0.1:3101');
 const qr=await page.locator('.label-qr').screenshot();const raw=await sharp(qr).ensureAlpha().raw().toBuffer({resolveWithObject:true});const decoded=jsQR(new Uint8ClampedArray(raw.data),raw.info.width,raw.info.height);assert(decoded?.data.includes(fixtures[0].label.assetKey));assert(decoded.data.startsWith('http://127.0.0.1:3101/'));const phonePreview=await context.newPage();try{await phonePreview.goto(decoded.data);await phonePreview.getByRole('button',{name:'确认绑定设备',exact:true}).waitFor();}finally{await phonePreview.close();}console.log('PASS rendered QR decodes to configured client URL');
 const [popup]=await Promise.all([context.waitForEvent('page'),page.getByRole('button',{name:'打印标签',exact:true}).click()]);await popup.locator('.device-label-card').waitFor();assert.equal(await popup.locator('.label-sn').innerText(),'SN: '+serial);await popup.close();const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载二维码',exact:true}).click()]);assert(download.suggestedFilename().endsWith('.svg'));await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('checkbox',{name:'选择当前列表全部设备',exact:true}).check();await page.getByRole('button',{name:/打印选中设备码/}).click();await page.locator('.label-qr svg').waitFor();await page.getByRole('button',{name:'关闭',exact:true}).click();console.log('PASS SVG download and selected-device print entry');
 await page.goto('http://localhost:3101/device-scan.html?asset='+fixtures[0].label.assetKey);await page.getByRole('button',{name:'确认绑定设备',exact:true}).click();await page.getByRole('link',{name:'报修这台设备',exact:true}).waitFor();
 const bound=await api('/customer/device-label/'+fixtures[0].label.assetKey,owner.accessToken);assert(bound.ownedByMe&&bound.deviceId);const again=await api('/customer/devices',owner.accessToken,{assetKey:bound.assetKey});assert.equal(again.id,bound.deviceId);const blocked=await api('/customer/device-label/'+bound.assetKey,other.accessToken);assert(blocked.bound&&!blocked.ownedByMe);assert.equal(blocked.deviceId,null);await api('/customer/devices',other.accessToken,{assetKey:bound.assetKey},403);
 const before=(await api('/customer/devices',owner.accessToken)).length;await page.reload();await page.getByRole('link',{name:'报修这台设备',exact:true}).waitFor();assert.equal((await api('/customer/devices',owner.accessToken)).length,before);await page.getByRole('link',{name:'报修这台设备',exact:true}).click();await page.waitForURL('**/repair-form.html?deviceId='+bound.deviceId);
 console.log('PASS preview, ownership, idempotent binding, tenant isolation and device-specific repair entry');
 // Read a generated QR photo through the actual browser file picker.
 await page.goto('http://localhost:3101/device-scan.html');await page.locator('#qr-photo').setInputFiles({name:'device-qr.png',mimeType:'image/png',buffer:qr});await page.getByRole('link',{name:'报修这台设备',exact:true}).waitFor();console.log('PASS photo recognition');
 await page.goto('http://localhost:3101/device-scan.html');
 await page.evaluate(png=>{navigator.mediaDevices.getUserMedia=async()=>{var canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;var ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,480);var image=new Image();image.src='data:image/png;base64,'+png;await image.decode();window.testCamera=canvas.captureStream(10);setTimeout(()=>{window.cameraPaint=setInterval(()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,480);ctx.drawImage(image,210,130,220,220);},100);},700);return window.testCamera;};},qr.toString('base64'));
 await page.getByRole('button',{name:'扫一扫',exact:true}).click();await page.locator('#camera-area').waitFor({state:'visible'});await page.getByRole('link',{name:'报修这台设备',exact:true}).waitFor();assert(await page.evaluate(()=>window.testCamera.getTracks().every(t=>t.readyState==='ended')));console.log('PASS live video-frame QR recognition and camera release');
 await page.goto('http://localhost:3101/device-scan.html');let pickers=0;page.on('filechooser',()=>pickers++);await page.evaluate(()=>Object.defineProperty(window,'isSecureContext',{value:false,configurable:true}));await page.getByRole('button',{name:'扫一扫',exact:true}).click();assert((await page.locator('#scan-status').innerText()).includes('HTTPS'));assert.equal(pickers,0);console.log('PASS insecure address does not open photo picker');

 await page.setViewportSize({width:390,height:844});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),'Mobile scan overflow');
 const guest=await browser.newContext();try{const g=await guest.newPage();await g.goto('http://localhost:3101/device-scan.html?asset='+bound.assetKey);await g.waitForURL('**/login.html?next=*');assert(new URL(g.url()).searchParams.get('next').includes(bound.assetKey));await g.locator('#phone').fill(phone);await g.locator('#smsCode').fill('000000');await g.getByRole('button',{name:'登录',exact:true}).click();await g.getByRole('link',{name:'报修这台设备',exact:true}).waitFor();}finally{await guest.close();}
 assert.deepEqual(errors,[]);console.log('PASS mobile layout and login continuation; no page errors');
}finally{
 await context?.close();await browser?.close();
 for(const f of fixtures){const c=new pg.Client({...dbConfig,database:f.t.database_name});try{await c.connect();const customer=(await c.query('SELECT customer_id FROM devices WHERE id=$1',[f.d.id])).rows[0]?.customer_id;await c.query('DELETE FROM devices WHERE id=$1',[f.d.id]);if(customer){await c.query('DELETE FROM customers WHERE id=$1',[customer]);await db.query('DELETE FROM identity.links WHERE tenant_id=$1 AND local_id=$2',[f.t.id,customer]);await db.query('DELETE FROM platform.memberships WHERE tenant_id=$1 AND subject_id=$2',[f.t.id,customer]);await db.query('DELETE FROM identity.resources WHERE tenant_id=$1 AND local_id=$2',[f.t.id,customer]);}await db.query('DELETE FROM identity.assets WHERE tenant_id=$1 AND local_id=$2',[f.t.id,f.d.id]);await db.query('DELETE FROM identity.resources WHERE tenant_id=$1 AND local_id=$2',[f.t.id,f.d.id]);}finally{await c.end();}}
 for(const id of people)await db.query('DELETE FROM identity.people WHERE id=$1',[id]);await db.end();
}
