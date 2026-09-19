import { EventEmitter2 } from '@nestjs/event-emitter';

// 待接入客户队列
export interface WaitingCustomer {
  customerId: string;
  customerName: string;
  lastMessage: string;
  waitingTime: number;
  timestamp: number;
}

// 事件名称
export const CS_EVENTS = {
  NEW_HUMAN_REQUEST: 'cs:new_human_request',
  CS_MESSAGE: 'cs:message',
  CS_SENT_MESSAGE: 'cs:sent_message',
  CS_ACCEPTED: 'cs:accepted',
};

// 共享事件服务 - 供其他模块调用
export class CsEventsService {
  private static emitter = new EventEmitter2();

  static emitHumanRequest(data: WaitingCustomer) {
    this.emitter.emit(CS_EVENTS.NEW_HUMAN_REQUEST, data);
  }

  static onHumanRequest(callback: (data: WaitingCustomer) => void) {
    this.emitter.on(CS_EVENTS.NEW_HUMAN_REQUEST, callback);
  }

  static emitCsMessage(data: { customerId: string; message: string; csOperatorId: string }) {
    this.emitter.emit(CS_EVENTS.CS_MESSAGE, data);
  }

  static onCsMessage(callback: (data: { customerId: string; message: string; csOperatorId: string }) => void) {
    this.emitter.on(CS_EVENTS.CS_MESSAGE, callback);
  }

  static emitCsSentMessage(data: { customerId: string; message: string; csOperatorId: string }) {
    this.emitter.emit(CS_EVENTS.CS_SENT_MESSAGE, data);
  }

  static onCsSentMessage(callback: (data: { customerId: string; message: string; csOperatorId: string }) => void) {
    this.emitter.on(CS_EVENTS.CS_SENT_MESSAGE, callback);
  }

  static emitCsAccepted(data: { customerId: string; csOperatorId: string }) {
    this.emitter.emit(CS_EVENTS.CS_ACCEPTED, data);
  }

  static onCsAccepted(callback: (data: { customerId: string; csOperatorId: string }) => void) {
    this.emitter.on(CS_EVENTS.CS_ACCEPTED, callback);
  }
}
