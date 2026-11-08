import {Injectable,HttpException,BadRequestException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {randomUUID} from 'node:crypto';
import {registry,validateIdentity} from '../tenancy/registry.js';
import {IdentityService} from './identity.service.js';
import {personLinks,validatePerson,resource,saveAddress,businessClient,indexPerson} from './store.js';
const keys:Record<string,string>={chatId:'chat',deviceId:'device',deviceIds:'device',workOrderId:'order',contractId:'contract',partId:'part',warehouseId:'warehouse',sourceWarehouseId:'warehouse',targetWarehouseId:'warehouse',customerId:'customer',engineerId:'engineer',ownerEngineerId:'engineer',designatedEngineerId:'engineer',preferredEngineerId:'engineer',addressId:'address'};
const nested:Record<string,string>={device:'device',devices:'device',address:'address',addresses:'address',engineer:'engineer',customer:'customer',part:'part',parts:'part',warehouse:'warehouse',sourceWarehouse:'warehouse',targetWarehouse:'warehouse',inventory:'inventory',requests:'request',consumed:'movement',records:'finance',contracts:'contract',workOrder:'order'};
const uuid=(value:any)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
@Injectable()
export class FederationService {
  constructor(private identity:IdentityService,private jwt:JwtService){}
  middleware(){return async(req:any,res:any,next:any)=>{
    if(req.path==='/iot'||req.path.startsWith('/iot/')||req.path==='/market'||req.path.startsWith('/market/'))return next();
    if(['/identity/login','/identity/send-code','/identity/business-login'].includes(req.path))return next();
    let payload:any;try{const raw=req.headers.authorization?.replace(/^Bearer /,'');if(!raw)return next();payload=this.jwt.verify(raw);}catch{return next();}
    if(payload.purpose!=='unified_access')return next();
    if(req.path.startsWith('/uploads/'))return next();
    try{const result=await this.handle(payload,req);if(result.stream){res.status(result.status);res.setHeader('Content-Type',result.type);const reader=result.stream.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;res.write(value);}}finally{res.end();}}else res.status(result.status||200).json(result.data);}
    catch(error:any){res.status(error.getStatus?.()||500).json({message:error.getResponse?.()?.message||error.message||'服务暂不可用'});}
  };}
  private async internal(link:any,payload:any,path:string,method='GET',body?:any,multipart?:{data:Buffer;type:string}){
    const user=await validatePerson(payload);
    const response=await fetch('http://127.0.0.1:'+Number(process.env.PORT||8080)+path,{method,headers:{Authorization:'Bearer '+this.identity.localToken(link,payload.role,user.phone),...(multipart?{'Content-Type':multipart.type}:{'Content-Type':'application/json'})},body:multipart?multipart.data as unknown as BodyInit:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(response.headers.get('content-type')?.includes('text/event-stream'))return {status:response.status,stream:response.body,type:'text/event-stream'};
    const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=text;}
    if(!response.ok)throw new HttpException(data?.message||'服务企业暂时无法处理此操作',response.status);
    return {status:response.status,data};
  }
  private kind(path:string){
    if(path.startsWith('/customer/devices'))return 'device';if(path.startsWith('/customer/work-orders')||path.includes('/engineer/orders')||path.includes('grab-pool')||path.includes('designated-orders'))return 'order';
    if(path.startsWith('/operations/invoices'))return 'finance';if(path.startsWith('/operations/contracts'))return 'contract';if(path.startsWith('/operations/requests'))return 'request';if(path==='/parts')return 'part';if(path.includes('warehouses'))return 'warehouse';if(path.includes('/ai/chats'))return 'chat';return 'record';
  }
  private async rewrite(value:any,link:any,payload:any,hint:string):Promise<any>{
    if(Array.isArray(value))return Promise.all(value.map(v=>this.rewrite(v,link,payload,hint)));
    if(!value||typeof value!=='object')return value;
    if(hint==='address'&&uuid(value.id))return saveAddress(payload.sub,value,link.id,value.id);
    if(value.address?.id)await saveAddress(payload.sub,value.address,link.id,value.address.id);
    const out:any={};
    for(const [key,v] of Object.entries(value)){
      if(key==='id'&&uuid(v)){let type=hint;if(value.sourceType&&hint==='bill')type=value.sourceType==='CONTRACT'?'contract':'order';out[key]=await resource(link.id,type,v as string);}
      else if(keys[key]&&uuid(v))out[key]=await resource(link.id,keys[key],v as string);
      else if(keys[key]&&Array.isArray(v))out[key]=await Promise.all(v.map(id=>uuid(id)?resource(link.id,keys[key],id):id));
      else if(key==='sourceId'&&uuid(v))out[key]=await resource(link.id,value.sourceType==='CONTRACT'?'contract':'order',v as string);
      else if(key==='bills')out[key]=await this.rewrite(v,link,payload,'bill');
      else out[key]=await this.rewrite(v,link,payload,nested[key]||hint);
    }
    if(value.id){out.serviceName=link.name;out.serviceId=link.link_id;}
    return out;
  }
  private allowed(role:string,path:string,method:string){
    if(role==='customer')return /^\/customer\/(addresses|devices|work-orders|reviews|complaints|refund)(\/|$)/.test(path)||/^\/payment\/(prepay|status|refund)(\/|$)/.test(path)||/^\/operations\/(contracts|finance|invoices)(\/|$)/.test(path)||/^\/ai\/(chat|chats)$/.test(path);
    return /^\/engineer\/(status|location|grab-pool|grab|designated-orders|accept-designated|refuse-designated|orders|stats)(\/|$)/.test(path)||path==='/parts'||/^\/operations\/(mobile|warehouses|requests|consume|journal)(\/|$)/.test(path)||path==='/ai/engineer/chat';
  }
  private merge(rows:any[],path:string,payload:any):any{
    if(!rows.length)return [];
    if(rows.length===1)return rows[0];
    if(rows.every(Array.isArray))return rows.flat().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    if(path==='/operations/mobile')return {warehouse:{id:payload.sub,name:'我的移动仓',kind:'MOBILE'},inventory:rows.flatMap(r=>r.inventory||[]),requests:rows.flatMap(r=>r.requests||[]),consumed:rows.flatMap(r=>r.consumed||[])};
    if(path==='/engineer/stats'){
      const out:any={...rows[0],perService:rows};for(const key of ['monthlyOrders','monthlyRevenue','totalOrders','totalRevenue'])out[key]=rows.reduce((n,r)=>n+Number(r[key]||0),0);out.currentMonth={...rows[0].currentMonth,orderCount:out.monthlyOrders,revenue:out.monthlyRevenue,commissionAmount:rows.reduce((n,r)=>n+Number(r.currentMonth?.commissionAmount||0),0)};out.currentMonth.commissionRate=out.monthlyRevenue?out.currentMonth.commissionAmount/out.monthlyRevenue:rows[0].currentMonth?.commissionRate;out.nextTier=null;out.history={...rows[0].history,totalOrders:out.totalOrders,totalRevenue:out.totalRevenue};return out;
    }
    const out:any={...rows[0]};for(const key of Object.keys(out)){if(rows.every(r=>Array.isArray(r[key])))out[key]=rows.flatMap(r=>r[key]);else if(typeof out[key]==='number')out[key]=rows.reduce((n,r)=>n+Number(r[key]||0),0);else if(out[key]&&typeof out[key]==='object'&&!Array.isArray(out[key]))out[key]=this.merge(rows.map(r=>r[key]),path,payload);}return out;
  }
  private async addresses(payload:any,links:any[],req:any){
    const match=req.path.match(/^\/customer\/addresses(?:\/([0-9a-f-]+))?$/i),id=match?.[1];if(id&&!uuid(id))throw new BadRequestException('地址编号无效');
    if(req.method==='GET'){
      for(const link of links){const data=(await this.internal(link,payload,'/customer/addresses')).data;for(const address of data)await saveAddress(payload.sub,address,link.id,address.id);}
      return {data:(await registry.query('SELECT id,data FROM identity.addresses WHERE person_id=$1 AND NOT deleted ORDER BY id',[payload.sub])).rows.map(r=>({id:r.id,...r.data}))};
    }
    if(req.method==='POST'){return {status:201,data:await saveAddress(payload.sub,this.checkAddress(req.body))};}
    const old=(await registry.query('SELECT * FROM identity.addresses WHERE id=$1 AND person_id=$2',[id,payload.sub])).rows[0];if(!old)throw new NotFoundException('地址不存在');
    if(req.method==='DELETE'){await registry.query('UPDATE identity.addresses SET deleted=true WHERE id=$1 AND person_id=$2',[id,payload.sub]);return {data:{message:'已移除常用地址，历史工单保留原地址'}};}
    if(req.method!=='PUT')throw new BadRequestException('操作无效');
    const data={...old.data,...this.checkAddress(req.body)};await registry.query("UPDATE identity.addresses SET data=$3::jsonb,fingerprint='edited:'||id::text WHERE id=$1 AND person_id=$2",[id,payload.sub,JSON.stringify(data)]);return {data:{id,...data}};
  }
  private checkAddress(body:any){for(const key of ['province','city','district','detail'])if(typeof body?.[key]!=='string'||!body[key].trim()||body[key].length>500)throw new BadRequestException('请填写完整地址');const value:any={};for(const key of ['province','city','district','detail','longitude','latitude','label','isDefault'])if(body[key]!==undefined)value[key]=body[key];return value;}
  private async localAddress(globalId:string,link:any,payload:any){
    const address=(await registry.query('SELECT * FROM identity.addresses WHERE id=$1 AND person_id=$2 AND NOT deleted',[globalId,payload.sub])).rows[0];if(!address)throw new NotFoundException('地址不存在');
    const addressData={...address.data};for(const key of ['longitude','latitude'])if(addressData[key]!==undefined&&addressData[key]!==null)addressData[key]=Number(addressData[key]);
    // Preserve old work order address snapshots: every new repair gets the current personal address values.
    const local=(await this.internal(link,payload,'/customer/addresses','POST',addressData)).data;
    await registry.query('INSERT INTO identity.address_links(address_id,tenant_id,local_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,local_id) DO NOTHING',[globalId,link.id,local.id]);return local.id;
  }
  private async deviceLabel(payload:any,assetId:string){
    if(payload.role!=='customer')throw new ForbiddenException('请使用客户身份扫码');
    if(!uuid(assetId))throw new BadRequestException('设备二维码无效');
    const user=await validatePerson(payload);
    const asset=(await registry.query(`SELECT a.*,t.database_name,t.demo_auth,t.name,coalesce(p.service_mode,'PLATFORM') service_mode,ct.name contractor_name FROM identity.assets a JOIN platform.tenants t ON t.id=a.tenant_id LEFT JOIN market.service_profiles p ON p.tenant_id=t.id LEFT JOIN platform.tenants ct ON ct.id=p.contractor_id WHERE a.id=$1 AND t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now())`,[assetId])).rows[0];
    if(!asset)throw new NotFoundException('设备不存在或服务企业暂不可用');
    if(payload.amr==='demo'&&!asset.demo_auth)throw new ForbiddenException('该服务企业尚未开放演示认证');
    const db=businessClient(asset.database_name);
    try{
      await db.connect();
      const d=(await db.query('SELECT d.id,d.model,d.serial_number,d.device_type,d.warranty_expire,d.customer_id,c.phone FROM devices d LEFT JOIN customers c ON c.id=d.customer_id WHERE d.id=$1',[asset.local_id])).rows[0];
      if(!d)throw new NotFoundException('设备档案不存在');
      const disabled=(await registry.query("SELECT id FROM platform.memberships WHERE tenant_id=$1 AND phone=$2 AND role='customer' AND NOT enabled",[asset.tenant_id,user.phone])).rows.length;
      if(disabled)throw new ForbiddenException('该服务关系已停用');
      const ownedByMe=!!d.customer_id&&d.phone===user.phone;
      return {data:{assetKey:asset.id,model:d.model,serialNumber:d.serial_number,deviceType:d.device_type,companyName:asset.name,serviceMode:asset.service_mode,contractorName:asset.contractor_name||null,warrantyExpire:d.warranty_expire,bound:!!d.customer_id,ownedByMe,deviceId:ownedByMe?await resource(asset.tenant_id,'device',d.id):null}};
    }finally{await db.end();}
  }
  private async claim(payload:any,body:any){
    const user=await validatePerson(payload);let serial=String(body.serialNumber||'').trim(),assetKey=body.assetKey;
    if(/^https?:\/\//.test(serial)){try{const u=new URL(serial);assetKey=u.searchParams.get('asset');const next=u.searchParams.get('next');if(!assetKey&&next)assetKey=new URL(next,'http://local').searchParams.get('asset');}catch{}}
    const knownLinks=await personLinks(payload);if(!assetKey&&!knownLinks.length)throw new BadRequestException('首次绑定请使用服务商提供的设备绑定链接');
    if(assetKey&&!uuid(assetKey))throw new BadRequestException('设备绑定链接无效');
    const rows=(await registry.query(`SELECT a.*,t.database_name,t.demo_auth,t.name FROM identity.assets a JOIN platform.tenants t ON t.id=a.tenant_id WHERE t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) AND (($1::uuid IS NOT NULL AND a.id=$1) OR ($1::uuid IS NULL AND a.serial=$2 AND t.id=ANY($3::uuid[])))`,[assetKey||null,serial,knownLinks.map(l=>l.id)])).rows;
    if(!rows.length)throw new NotFoundException('未找到该设备，请联系服务商建档');if(rows.length>1)throw new BadRequestException('序列号对应多条设备记录，请扫描设备专属绑定二维码');
    const asset=rows[0];const blocked=(await registry.query("SELECT id FROM platform.memberships WHERE tenant_id=$1 AND phone=$2 AND role='customer' AND enabled=false",[asset.tenant_id,user.phone])).rows.length;if(blocked)throw new ForbiddenException('该服务关系已停用');if(payload.amr==='demo'&&!asset.demo_auth)throw new ForbiddenException('该服务企业尚未开放演示认证');
    const db=businessClient(asset.database_name);let local:any;
    try{await db.connect();await db.query('BEGIN');const device=(await db.query('SELECT * FROM devices WHERE id=$1 FOR UPDATE',[asset.local_id])).rows[0];if(!device)throw new NotFoundException('设备不存在');
      if(!device.customer_id&&!assetKey)throw new ForbiddenException('未绑定设备需要使用服务商提供的绑定链接');
      if(device.customer_id){const owner=(await db.query('SELECT phone FROM customers WHERE id=$1',[device.customer_id])).rows[0];if(owner?.phone!==user.phone)throw new ForbiddenException('设备已绑定其他客户');}
      local=(await db.query('SELECT * FROM customers WHERE phone=$1',[user.phone])).rows[0];if(!local)local=(await db.query('INSERT INTO customers(id,phone,name) VALUES($1,$2,$3) RETURNING *',[randomUUID(),user.phone,user.name])).rows[0];
      await db.query('UPDATE devices SET customer_id=$2 WHERE id=$1',[device.id,local.id]);await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
    await indexPerson(asset.tenant_id,'customer',local.id,user.phone,local.name);
    const link=(await personLinks(payload)).find(l=>l.id===asset.tenant_id);if(!link)throw new ForbiddenException('该服务关系不可用');
    const all=(await this.internal(link,payload,'/customer/devices')).data;return {status:201,data:await this.rewrite(all.find((d:any)=>d.id===asset.local_id),link,payload,'device')};
  }
  async socketData(data:any,link:any,payload:any){return {...await this.rewrite(data,link,payload,'order'),serviceId:link.link_id,serviceName:link.name};}
  async handle(payload:any,req:any):Promise<any>{
    await validatePerson(payload);let links=await personLinks(payload);
    const originalPath=req.path,method=req.method;
    if(originalPath==='/identity/switch-role'&&method==='POST')return {data:await this.identity.switchRole(payload,req.body?.role)};
    if(originalPath==='/auth/profile')return {data:await this.identity.profile(payload)};
    if(originalPath==='/identity/services'&&method==='GET')return {data:links.map(l=>({id:l.link_id,name:l.name,shortName:l.company_profile?.shortName||'',logoDataUrl:l.company_logo||null,contactPhone:l.contact_phone||'',serviceHours:l.company_profile?.serviceHours||''}))};
    const labelMatch=originalPath.match(/^\/customer\/device-label\/([^/]+)$/);
    if(labelMatch&&method==='GET')return this.deviceLabel(payload,labelMatch[1]);
    if(payload.role==='engineer'&&!links.length)throw new ForbiddenException('当前工作身份暂不可用，请联系企业管理员');
    if(!this.allowed(payload.role,originalPath,method))throw new ForbiddenException('当前身份无权执行此操作');
    if(payload.role==='customer'&&/^\/customer\/addresses(?:\/|$)/.test(originalPath))return this.addresses(payload,links,req);
    if(payload.role==='customer'&&originalPath==='/customer/devices'&&method==='POST')return this.claim(payload,req.body);
    let body=req.body?structuredClone(req.body):undefined,path=originalPath;
    if(body&&typeof body==='object')for(const key of ['id','customerId','engineerId','tenantId','tenantCode','ownerEngineerId','csOperatorId'])delete body[key];const url=new URL(req.originalUrl,'http://local');
    const targetIds=new Set<string>();
    const resolve=async(id:string,expected?:string)=>{
      if(!uuid(id))throw new BadRequestException('业务编号无效');
      const ref=(await registry.query('SELECT * FROM identity.resources WHERE id=$1',[id])).rows[0];
      if(!ref||(expected&&ref.kind!==expected)||!links.some(l=>l.id===ref.tenant_id))throw new NotFoundException('该业务记录不存在或暂不可用');targetIds.add(ref.tenant_id);return ref.local_id;
    };
    for(const segment of path.split('/'))if(uuid(segment))path=path.replace(segment,await resolve(segment,originalPath.startsWith('/operations/requests')?'request':originalPath.startsWith('/customer/devices')?'device':'order'));
    const service=req.query.serviceId||body?.serviceId;if(service){const binding=links.find(l=>l.link_id===service);if(!binding)throw new NotFoundException('服务关系不存在');targetIds.add(binding.id);if(body)delete body.serviceId;url.searchParams.delete('serviceId');}
    for(const [key,value] of [...url.searchParams.entries()])if(keys[key]&&value){url.searchParams.set(key,await resolve(value,keys[key]));}
    const addressId=body?.addressId;if(addressId)delete body.addressId;
    const translate=async(value:any):Promise<any>=>{if(Array.isArray(value))return Promise.all(value.map(translate));if(value&&typeof value==='object')for(const key of Object.keys(value)){if((keys[key]||key==='sourceId')&&value[key])value[key]=Array.isArray(value[key])?await Promise.all(value[key].map((id:string)=>resolve(id,keys[key]))):await resolve(value[key],keys[key]||(value.sourceType==='CONTRACT'?'contract':'order'));else value[key]=await translate(value[key]);}return value;};
    if(body)body=await translate(body);
    if(targetIds.size>1)throw new BadRequestException('设备、合同和配件必须属于同一家服务企业');
    if(targetIds.size)links=links.filter(l=>targetIds.has(l.id));
    if(!links.length){if(method==='GET')return {data:originalPath==='/operations/finance'?{bills:[],records:[],summary:{receivable:0,received:0,due:0,materialCost:0,pendingInvoices:0}}:[]};throw new BadRequestException('请先绑定服务商已建档的设备');}
    const allWrite=payload.role==='engineer'&&['/engineer/status','/engineer/location'].includes(originalPath);
    if(method!=='GET'&&links.length>1&&!allWrite&&originalPath!=='/ai/engineer/chat')throw new BadRequestException('请选择关联设备、工单或要联系的服务商后操作');
    if(originalPath==='/ai/engineer/chat')links=links.slice(0,1);
    if(body&&links.length===1){
      const media=new Set(['faultPhotos','onSitePhotos','signatureUrl','photoUrl']);
      const check=async(value:any,key=''):Promise<void>=>{
        if(Array.isArray(value)){for(const v of value)await check(v,key);return;}
        if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))await check(v,k);return;}
        if(!media.has(key)||typeof value!=='string'||!value.startsWith('/uploads/'))return;
        try{const url=new URL(value,'http://local'),ticket=this.jwt.verify(url.searchParams.get('ticket')||'');if(ticket.purpose!=='file'||ticket.path!==url.pathname||ticket.tenantId!==links[0].id)throw Error('Foreign file');await validateIdentity({...ticket,purpose:'access'});}catch{throw new BadRequestException('附件查看授权无效，请重新上传或刷新后重试');}
      };await check(body);
    }
    if(addressId){if(links.length!==1)throw new BadRequestException('请先选择设备');body.addressId=await this.localAddress(addressId,links[0],payload);}
    let multipart:any;
    if(req.headers['content-type']?.startsWith('multipart/form-data')){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>12*1048576)throw new HttpException('文件过大',413);chunks.push(chunk);}multipart={data:Buffer.concat(chunks),type:req.headers['content-type']};}
    const query=url.searchParams.toString(),responses:any[]=[];let optionalError:any;
    for(const link of links){
      try{const result=await this.internal(link,payload,path+(query?'?'+query:''),method,body,multipart);if(result.stream)return result;responses.push(await this.rewrite(result.data,link,payload,this.kind(originalPath)));}
      catch(error:any){if(method==='GET'&&error.getStatus?.()===403&&/^\/operations\/(contracts|finance)/.test(path)){optionalError=error;continue;}throw error;}
    }
    if(!responses.length&&optionalError)throw optionalError;
    return {status:method==='POST'?201:200,data:this.merge(responses,originalPath,payload)};
  }
}
