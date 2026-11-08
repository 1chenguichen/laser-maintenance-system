import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const require=createRequire(new URL('../backend/package.json',import.meta.url));require('reflect-metadata');const dotenv=require('dotenv'),pg=require('pg'),{JwtService}=require('@nestjs/jwt');
const root=fileURLToPath(new URL('../',import.meta.url));dotenv.config({path:path.join(root,'backend/.env'),quiet:true});const db=new pg.Client({host:process.env.DB_HOST||'localhost',user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:(await fs.readFile(path.join(root,'.local-preview/database.txt'),'utf8')).trim()});await db.connect();
const jwt=new JwtService({secret:process.env.JWT_SECRET}),data=JSON.parse(await fs.readFile(path.join(root,'.local-preview/service-network-demo.json'),'utf8'));
const admin=(await db.query('SELECT * FROM platform.admins WHERE enabled LIMIT 1')).rows[0];const platform=jwt.sign({sub:admin.id,version:admin.version,purpose:'platform_access',role:'platform_admin'},{expiresIn:'1h'});
async function api(url,token,body){const r=await fetch('http://localhost:8180'+url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();if(!r.ok)throw Error(url+' '+r.status+' '+JSON.stringify(v));return v;}
async function company(id){const m=(await db.query("SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND enabled LIMIT 1",[id])).rows[0];return jwt.sign({sub:m.subject_id,membershipId:m.id,tenantId:id,version:m.version,phone:m.phone,purpose:'access',role:'cs_operator'},{expiresIn:'1h'});}
try{
 const customer=await api('/identity/login',null,{phone:'13897000101',code:'000000',role:'customer',name:'服务网络演示客户'});
 const self=data.companies[0],vendor=data.companies[1],selfWorker=await api('/identity/login',null,{phone:self.staff[0][1],code:'000000',role:'engineer'}),vendorWorker=await api('/identity/login',null,{phone:vendor.staff[0][1],code:'000000',role:'engineer'}),vendorToken=await company(vendor.id);
 let market=await api('/market/platform',platform),offer=market.offers.find(o=>!o.tenant_id&&o.category==='welding'&&o.city==='全国'&&o.published);
 if(!offer){await api('/market/platform',platform,{type:'offer',title:'演示·激光焊接设备售后服务',category:'welding',city:'全国',description:'演示平台自营及合作企业调度：先核实故障，再确认报价与安排服务。'});offer=(await api('/market/platform',platform)).offers.find(o=>o.title==='演示·激光焊接设备售后服务');}
 const demos=[];
 async function direct(model){const existing=(await db.query('SELECT id,number FROM market.requests WHERE customer_id=$1 AND device_model=$2',[customer.user.id,model])).rows[0];if(existing)return {...existing,existing:true};return api('/market/requests',customer.accessToken,{offerId:offer.id,deviceModel:model,city:'深圳市',address:'宝安区演示工业园 A 栋（模拟地址）',description:'[售后组织演示] 激光输出异常，请核查冷却、光路及报警信息；非真实维修需求。'});}
 let r=await direct('激光焊接机 LW-500 · 平台自营（演示）');if(!r.existing){const me=await api('/market/me',selfWorker.accessToken);await api('/market/requests/'+r.id+'/action',platform,{action:'assign',version:1,engineerId:selfWorker.user.id,serviceId:me.employers[0].id});}demos.push({id:r.id,number:r.number,scenario:'平台直接指派自营陈工，等待工程师确认'});
 r=await direct('激光焊接机 LW-500 · 区域外包（演示）');if(!r.existing)await api('/market/requests/'+r.id+'/action',platform,{action:'delegate',version:1,providerId:vendor.id,note:'演示：深圳区域需求委托华南企业承接'});demos.push({id:r.id,number:r.number,scenario:'维保云委托华南企业，等待企业确认并派单'});
 r=await direct('激光焊接机 LW-500 · 合作履约（演示）');if(!r.existing){for(const[token,body]of[[platform,{action:'delegate',providerId:vendor.id,note:'演示：区域业务外包合作'}],[vendorToken,{action:'delegate-accept',note:'演示：华南公司确认服务安排'}],[vendorToken,{action:'assign',engineerId:vendorWorker.user.id}],[vendorWorker.accessToken,{action:'accept'}],[vendorWorker.accessToken,{action:'quote',amount:680,note:'演示报价：现场检测与基础光路维护，未经真实诊断。'}],[customer.accessToken,{action:'approve'}],[vendorWorker.accessToken,{action:'start'}]]){const current=await api('/market/requests/'+r.id,platform);await api('/market/requests/'+r.id+'/action',token,{...body,version:current.version});}}demos.push({id:r.id,number:r.number,scenario:'华南企业刘工正在服务，可体验提交完工和客户验收'});
 const addresses=await api('/customer/addresses',customer.accessToken);const address=addresses[0]||await api('/customer/addresses',customer.accessToken,{province:'广东省',city:'深圳市',district:'宝安区',detail:'售后组织演示园区（模拟地址）',isDefault:true});
 for(const[tenant,serial]of[[data.shaohui,'SN-NETWORK-SHAOHUI-001'],[data.huadong,'SN-NETWORK-HUADONG-001']]){
  if(!tenant)continue;const token=await company(tenant.id);let customers=await api('/admin/customers',token),owner=customers.find(c=>c.phone===customer.user.phone);if(!owner)owner=await api('/admin/customers',token,{name:'服务网络演示客户',phone:customer.user.phone});
  let devices=await api('/admin/devices',token),device=devices.find(d=>d.serialNumber===serial);if(!device)device=await api('/admin/devices',token,{customerId:owner.id,serialNumber:serial,model:'激光焊接机 LW-500（关系演示）',deviceType:'激光焊接机'});
  const own=(await api('/customer/devices',customer.accessToken)).find(d=>d.serialNumber===serial);
  let current=(await db.query('SELECT id,number FROM market.requests WHERE customer_id=$1 AND device_ref=$2',[customer.user.id,own.id])).rows[0];if(!current)current=await api('/market/device-repairs',customer.accessToken,{deviceId:own.id,addressId:address.id,faultType:'光路故障',faultDescription:'[售后组织演示] 核验设备关联企业的自营或外包售后安排。',urgency:'normal',preferredTime:'asap',photoIds:[],clientRequestId:randomUUID()});
  demos.push({id:current.id,number:current.number,scenario:tenant.name+'关联设备，根据企业策略安排售后'});
 }
 data.customer={phone:customer.user.phone,name:customer.user.name,code:'000000'};data.orders=demos;await fs.writeFile(path.join(root,'.local-preview/service-network-demo.json'),JSON.stringify(data,null,2));
 console.log('READY 5 条保留的演示服务单，覆盖平台自营、平台外包、合作履约、绍辉外包、华东自营；客户账号 13897000101。');
}finally{await db.end();}
