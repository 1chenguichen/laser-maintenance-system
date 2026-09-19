import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DispatchService } from '../dispatch/dispatch.service.js';
import { CsEventsService, WaitingCustomer } from './cs-events.service.js';

interface LocationUpdate {
  engineerId: string;
  longitude: number;
  latitude: number;
  address?: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  private static instance: AppGateway;
  @WebSocketServer()
  server: Server;

  // 工程师在线状态
  private engineerSockets = new Map<string, string>(); // engineerId -> socketId
  private socketEngineers = new Map<string, string>(); // socketId -> engineerId

  // 客服在线状态
  private csSocketIds = new Set<string>(); // 客服 socket IDs

  // 待接入客户队列
  private waitingCustomers = new Map<string, WaitingCustomer>(); // customerId -> info

  constructor(private dispatchService: DispatchService) {
    AppGateway.instance = this;
    console.log('[WebSocket] AppGateway instance stored');

    // 设置工程师广播处理器
    this.dispatchService.setBroadcastHandler((engineerId, event, data) => {
      this.sendToEngineer(engineerId, event, data);
    });
    // 设置客户广播处理器
    this.dispatchService.setCustomerBroadcastHandler((customerId, event, data) => {
      this.sendToCustomer(customerId, event, data);
    });

    // 监听人工客服请求事件
    CsEventsService.onHumanRequest((data: WaitingCustomer) => {
      console.log('[WebSocket] Received human request event:', data.customerName);
      this.waitingCustomers.set(data.customerId, data);
      if (this.server) {
        console.log('[WebSocket] Emitting new_human_request to csOperators');
        this.server.to('csOperators').emit('new_human_request', data);
      } else {
        console.log('[WebSocket] Server not ready, cannot emit');
      }
    });

    // 监听客服发送消息事件，推送给客户
    CsEventsService.onCsMessage((data) => {
      console.log('[WebSocket] Received CS message event:', data);
      if (this.server) {
        console.log('[WebSocket] server is available, calling sendToCustomer');
        this.sendToCustomer(data.customerId, 'cs_message', {
          message: data.message,
          from: 'cs',
          timestamp: Date.now(),
        });
        // 同时广播给所有客服，让他们看到客户发的新消息
        this.server.to('csOperators').emit('customer_message', {
          customerId: data.customerId,
          message: data.message,
          timestamp: Date.now(),
        });
      }
    });

    // 监听客服已发送消息事件，广播给所有客服
    CsEventsService.onCsSentMessage((data) => {
      console.log('[WebSocket] Received CS sent message event:', data);
      if (this.server) {
        this.server.to('csOperators').emit('cs_sent_message', data);
      }
    });

    // 监听客服接入客户事件，通知客户
    CsEventsService.onCsAccepted((data) => {
      console.log('[WebSocket] Received CS accepted event:', data);
      if (this.server) {
        this.sendToCustomer(data.customerId, 'cs_accepted', {
          csOperatorId: data.csOperatorId,
        });
      }
    });
  }

  afterInit() {
    AppGateway.instance = this;
    console.log('[WebSocket] AppGateway afterInit - instance stored');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const engineerId = this.socketEngineers.get(client.id);
    if (engineerId) {
      this.engineerSockets.delete(engineerId);
      this.socketEngineers.delete(client.id);
      console.log(`Engineer ${engineerId} disconnected`);
    }
    // 移除客服socket
    this.csSocketIds.delete(client.id);
    console.log(`Client disconnected: ${client.id}`);
  }

  // ==================== 工程师身份绑定 ====================
  @SubscribeMessage('bind_engineer')
  handleBindEngineer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { engineerId: string },
  ) {
    this.engineerSockets.set(data.engineerId, client.id);
    this.socketEngineers.set(client.id, data.engineerId);
    client.emit('bound', { success: true });
    console.log(`Engineer ${data.engineerId} bound to socket ${client.id}`);
  }

  // ==================== 客户身份绑定 ====================
  @SubscribeMessage('bind_customer')
  handleBindCustomer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { customerId: string },
  ) {
    client.join(`customer:${data.customerId}`);
    client.emit('bound', { success: true });
    console.log(`Customer ${data.customerId} joined room`);
  }

  // ==================== GPS位置更新 ====================
  @SubscribeMessage('location_update')
  handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LocationUpdate,
  ) {
    // 广播给所有在线客服（用于监控）
    this.server.to('csOperators').emit('engineer_location', data);

    // 也可以存储到Redis用于附近工程师查询
    console.log(`Location update from ${data.engineerId}: ${data.longitude}, ${data.latitude}`);
  }

  // ==================== 客服订阅监控 ====================
  @SubscribeMessage('cs_subscribe')
  handleCsSubscribe(@ConnectedSocket() client: Socket) {
    client.join('csOperators');
    this.csSocketIds.add(client.id);
    client.emit('subscribed', { success: true });
    // 发送当前等待队列
    client.emit('waiting_customers', Array.from(this.waitingCustomers.values()));
  }

  // ==================== 客户请求转人工 ====================
  @SubscribeMessage('request_human_service')
  handleRequestHumanService(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { customerId: string; customerName: string; message: string },
  ) {
    const waitingInfo: WaitingCustomer = {
      customerId: data.customerId,
      customerName: data.customerName || '客户',
      lastMessage: data.message,
      waitingTime: 0,
      timestamp: Date.now(),
    };
    this.waitingCustomers.set(data.customerId, waitingInfo);

    // 广播给所有客服：有新客户请求人工服务
    this.server.to('csOperators').emit('new_human_request', waitingInfo);
    console.log(`Customer ${data.customerId} requested human service`);
  }

  // ==================== 客服接入客户 ====================
  @SubscribeMessage('cs_accept_customer')
  handleCsAcceptCustomer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { customerId: string; csOperatorId: string },
  ) {
    // 从等待队列移除
    this.waitingCustomers.delete(data.customerId);

    // 通知客户：客服已接入
    this.sendToCustomer(data.customerId, 'cs_accepted', {
      csOperatorId: data.csOperatorId,
    });

    // 通知所有客服：更新等待队列
    this.server.to('csOperators').emit('customer_accepted', { customerId: data.customerId });
    this.server.to('csOperators').emit('waiting_customers', Array.from(this.waitingCustomers.values()));

    console.log(`CS ${data.csOperatorId} accepted customer ${data.customerId}`);
  }

  // ==================== 客服发送消息给客户 ====================
  @SubscribeMessage('cs_send_message')
  handleCsSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { customerId: string; message: string },
  ) {
    // 转发给客户
    this.sendToCustomer(data.customerId, 'cs_message', {
      message: data.message,
      from: 'cs',
      timestamp: Date.now(),
    });
  }

  // ==================== 客户发送消息给客服 ====================
  @SubscribeMessage('customer_send_message')
  handleCustomerSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { customerId: string; message: string },
  ) {
    // 广播给所有客服
    this.server.to('csOperators').emit('customer_message', {
      customerId: data.customerId,
      message: data.message,
      timestamp: Date.now(),
    });

    // 更新等待客户的最后消息
    const waiting = this.waitingCustomers.get(data.customerId);
    if (waiting) {
      waiting.lastMessage = data.message;
      waiting.waitingTime = Math.floor((Date.now() - waiting.timestamp) / 1000);
    }
  }

  // ==================== 发送给指定工程师 ====================
  sendToEngineer(engineerId: string, event: string, data: any) {
    const socketId = this.engineerSockets.get(engineerId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
    }
  }

  // ==================== 发送给指定客户 ====================
  sendToCustomer(customerId: string, event: string, data: any) {
    console.log("[WebSocket] sendToCustomer called:", customerId, event, "instance:", AppGateway.instance ? "yes" : "no");
    AppGateway.instance?.server?.to(`customer:${customerId}`).emit(event, data);
  }

  // ==================== 广播给所有客服 ====================
  broadcastToCsOperators(event: string, data: any) {
    AppGateway.instance?.server?.to('csOperators').emit(event, data);
  }

  // ==================== 广播新订单给所有在线工程师 ====================
  broadcastNewOrder(order: any) {
    this.server.emit('new_order_in_pool', order);
  }

  // ==================== 广播系统消息 ====================
  broadcastSystemMessage(message: string) {
    this.server.emit('system_message', { message, timestamp: Date.now() });
  }
}
