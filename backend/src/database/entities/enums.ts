// 数据库枚举类型定义

export enum EngineerStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  WORKING = 'WORKING',
}

export enum WorkOrderStatus {
  PENDING = 'PENDING',         // 待派单
  DISPATCHED = 'DISPATCHED',  // 已派单
  ACCEPTED = 'ACCEPTED',      // 工程师已确认上门
  CONFIRMED = 'CONFIRMED',    // 已确认(legacy)
  PENDING_PAYMENT = 'PENDING_PAYMENT', // 等待客户付款（30%定金）
  REPAIRING = 'REPAIRING',    // 维修中
  PENDING_FINAL_PAYMENT = 'PENDING_FINAL_PAYMENT', // 待付尾款
  COMPLETED = 'COMPLETED',     // 已完成
  REFUSED = 'REFUSED',        // 客户拒绝报价
  CANCELLED = 'CANCELLED',    // 已取消
}

export enum DispatchType {
  SYSTEM = 'SYSTEM',       // 系统派单池
  GRAB = 'GRAB',           // 抢单
  DESIGNATED = 'DESIGNATED', // 指定工程师
}

export enum ComplaintType {
  COMPLAINT = 'COMPLAINT',
  REFUND = 'REFUND',
  BOTH = 'BOTH',
}

export enum ComplaintStatus {
  PENDING = 'PENDING',
  HANDLED = 'HANDLED',
  REJECTED = 'REJECTED',
}

export enum ChatDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum UserType {
  CUSTOMER = 'CUSTOMER',
  ENGINEER = 'ENGINEER',
  CS_OPERATOR = 'CS_OPERATOR',
}

export enum DeviceType {
  LASER_CUTTER = 'laser_cutter',
  LASER_WELDER = 'laser_welder',
  LASER_ENGRAVER = 'laser_engraver',
  LASER_CLEANER = 'laser_cleaner',
}
