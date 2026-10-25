// 枚举定义 - 与后端共享保持一致

export enum WorkOrderStatus {
  PENDING = 'PENDING',
  DISPATCHED = 'DISPATCHED',
  CONFIRMED = 'CONFIRMED',
  REPAIRING = 'REPAIRING',
  WORKING = 'REPAIRING', // WORKING 是 REPAIRING 的别名
  COMPLETED = 'COMPLETED',
  REFUSED = 'REFUSED',
  CANCELLED = 'CANCELLED',
}

export enum EngineerStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  WORKING = 'WORKING',
}

export enum DispatchType {
  SYSTEM = 'SYSTEM',
  GRAB = 'GRAB',
  DESIGNATED = 'DESIGNATED',
}
