import { personLinks } from '../identity/store.js';
import { FederationService } from '../identity/federation.js';
import { JwtService } from '@nestjs/jwt';
import { Server, Namespace } from 'socket.io';
import { INestApplication } from '@nestjs/common';
import { currentTenant } from '../tenancy/context.js';
import { validateIdentity } from '../tenancy/registry.js';
import { DispatchService } from '../dispatch/dispatch.service.js';
import { CsEventsService } from './cs-events.service.js';

let federation: FederationService;
let io: Server | null = null;
let wsNamespace: Namespace | null = null;
const room = (tenantId: string, role: string, id: string) => `tenant:${tenantId}:${role}:${id}`;
async function emitRoom(target: string, event: string, data: any) {
  for (const socket of await wsNamespace?.in(target).fetchSockets() || []) {
    try { if(socket.data.user.purpose==='unified_access'){const links=await personLinks(socket.data.user);const binding=links.find(l=>target===room(l.id,socket.data.user.role,l.local_id));if(!binding){await socket.leave(target);continue;}socket.emit(event,await federation.socketData(data,binding,socket.data.user));}else{await validateIdentity(socket.data.user);socket.emit(event,data);} }
    catch { socket.disconnect(true); }
  }
}
function publish(role: string, id: string, event: string, data: any) {
  const target = room(currentTenant().id,role,id);
  void emitRoom(target,event,data).catch(error => console.error('[Socket.IO] Delivery failed',error.message));
}
export function setupSocketIO(app: INestApplication) {
  io = new Server(app.getHttpServer(), {cors:{origin:'*'}});
  wsNamespace = io.of('/ws');
  const jwt = app.get(JwtService);
  federation=app.get(FederationService);
  wsNamespace.use(async (socket,next) => {
    try { const user = jwt.verify(socket.handshake.auth?.token); if(user.purpose==='unified_access')await personLinks(user);else await validateIdentity(user); socket.data.user=user; next(); }
    catch { next(new Error('企业或登录身份无效')); }
  });
  wsNamespace.on('connection',socket => {
    const user = socket.data.user;
    socket.use(async (_packet,next) => {try {if(user.purpose==='unified_access')await personLinks(user);else await validateIdentity(user); next();} catch {socket.disconnect(true);}});
    socket.on('bind_customer',async data => {if(user.role!=='customer'||data?.customerId!==user.sub)return;if(user.purpose==='unified_access'){for(const l of await personLinks(user))socket.join(room(l.id,'customer',l.local_id));}else socket.join(room(user.tenantId,'customer',user.sub));});
    socket.on('bind_engineer',async data => {if(user.role!=='engineer'||data?.engineerId!==user.sub)return;if(user.purpose==='unified_access'){for(const l of await personLinks(user))socket.join(room(l.id,'engineer',l.local_id));}else socket.join(room(user.tenantId,'engineer',user.sub));});
    socket.on('cs_subscribe',() => { if(user.role==='cs_operator') socket.join(room(user.tenantId,'cs','all')); });
    // Business writes and chat sends go through guarded HTTP endpoints, never client-selected rooms.
  });
  const dispatch = app.get(DispatchService);
  dispatch.setBroadcastHandler((id,event,data) => publish('engineer',id,event,data));
  dispatch.setCustomerBroadcastHandler(sendToCustomer);
  CsEventsService.onHumanRequest(data => publish('cs','all','new_human_request',data));
  CsEventsService.onCsMessage(data => publish('cs','all','customer_message',data));
  CsEventsService.onCsSentMessage(data => publish('cs','all','cs_sent_message',data));
  return io;
}
export function getSocketIO() {return io;}
export function getWsNamespace() {return wsNamespace;}
export function sendToCustomer(id: string,event: string,data: any) {publish('customer',id,event,data);}
