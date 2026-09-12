// 共享类型定义

// 枚举
export enum EngineerStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  WORKING = 'WORKING',
}

export enum WorkOrderStatus {
  PENDING = 'PENDING',
  DISPATCHED = 'DISPATCHED',
  CONFIRMED = 'CONFIRMED',
  REPAIRING = 'REPAIRING',
  COMPLETED = 'COMPLETED',
  REFUSED = 'REFUSED',
  CANCELLED = 'CANCELLED',
}

export enum DispatchType {
  SYSTEM = 'SYSTEM',
  GRAB = 'GRAB',
  DESIGNATED = 'DESIGNATED',
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

// 故障类型
export const FAULT_TYPES = {
  no_light: '不出光',
  weak_laser: '激光弱',
  abnormal_sound: '异响',
  alarm_e01: '报警E01',
  reset_restart: '复位重启',
  burning: '工件烧焦',
  misalignment: '对位不准',
  other: '其他问题',
} as const;

export type FaultType = keyof typeof FAULT_TYPES;

// 通用响应
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 客户
export interface Customer {
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// 地址
export interface Address {
  id: string;
  customerId: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
  label?: string;
}

// 设备
export interface Device {
  id: string;
  customerId: string;
  serialNumber: string;
  model: string;
  deviceType: string;
  purchaseDate?: string;
  warrantyExpire?: string;
  isUnderWarranty?: boolean;
}

// 工程师
export interface Engineer {
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  status: EngineerStatus;
  monthlyOrders: number;
  monthlyRevenue: number;
  rating: number;
  totalOrders: number;
  totalRevenue: number;
  joinedAt: string;
}

// 工单
export interface WorkOrder {
  id: string;
  orderNo: string;
  customerId: string;
  deviceId: string;
  engineerId?: string;
  addressId: string;
  faultType: string;
  faultDescription?: string;
  faultPhotos?: string[];
  emergencyLevel: number;
  status: WorkOrderStatus;
  prepayAmount?: number;
  finalAmount?: number;
  dispatchType?: DispatchType;
  estimatedAmount?: number;
  createdAt: string;
  completedAt?: string;
}

// 工单列表项（简化版）
export interface WorkOrderListItem {
  id: string;
  orderNo: string;
  faultType: string;
  emergencyLevel: number;
  status: WorkOrderStatus;
  prepayAmount?: number;
  estimatedAmount?: number;
  createdAt: string;
  device?: {
    model: string;
    serialNumber: string;
  };
  address?: {
    province: string;
    city: string;
    detail: string;
  };
  customer?: {
    name: string;
    phone: string;
  };
  engineer?: {
    id: string;
    name: string;
    rating: number;
  };
}

// 维修记录
export interface MaintenanceRecord {
  id: string;
  workOrderId: string;
  deviceId: string;
  partsFee: number;
  laborFee: number;
  totalAmount: number;
  commissionRate: number;
  commissionAmount: number;
  partsDetail?: {
    partId: string;
    name: string;
    quantity: number;
    price: number;
  }[];
}

// 配件
export interface Part {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  guidePrice: number;
  isActive: boolean;
  description?: string;
}

// 配件库存
export interface PartsInventory {
  id: string;
  warehouseId: string;
  partId: string;
  quantity: number;
  reservedQuantity: number;
  restockDate?: string;
  part?: Part;
  warehouse?: Warehouse;
}

// 仓库
export interface Warehouse {
  id: string;
  name: string;
  location: string;
  contactPhone?: string;
}

// 评价
export interface Review {
  id: string;
  workOrderId: string;
  customerId: string;
  engineerId: string;
  rating: number;
  content?: string;
  tags?: string[];
  isAnonymous: boolean;
  createdAt: string;
}

// 投诉
export interface Complaint {
  id: string;
  workOrderId?: string;
  customerId: string;
  engineerId?: string;
  complaintType: ComplaintType;
  level?: number;
  refundAmount?: number;
  status: ComplaintStatus;
  content: string;
  handlerId?: string;
  handleResult?: string;
  handleTime?: string;
  createdAt: string;
}

// 消息通知
export interface Notification {
  id: string;
  userId: string;
  userType: UserType;
  type: string;
  title: string;
  content: string;
  payload?: any;
  isRead: boolean;
  workOrderId?: string;
  createdAt: string;
}

// 工程师收益统计
export interface EngineerStats {
  currentMonth: {
    orderCount: number;
    revenue: number;
    commissionRate: number;
    avgRating: number;
  };
  commissionTiers: {
    range: string;
    rate: string;
    nextTier: string | null;
  }[];
  history: {
    totalOrders: number;
    totalRevenue: number;
    avgRating: number;
  };
}

// API 请求类型
export interface LoginRequest {
  phone: string;
  code: string;
  role: 'customer' | 'engineer' | 'cs_operator';
}

export interface CreateWorkOrderRequest {
  deviceId: string;
  addressId: string;
  faultType: string;
  faultDescription?: string;
  faultPhotos?: string[];
  hasPreferredEngineer?: boolean;
  preferredEngineerId?: string;
}

export interface AcceptOrderRequest {
  type: 'grab' | 'designated';
}

export interface CompleteOrderRequest {
  partsFee: number;
  laborFee: number;
  partsDetail?: {
    partId: string;
    name: string;
    quantity: number;
    price: number;
  }[];
  onSitePhotos?: string[];
  signatureUrl?: string;
  repairReport?: string;
}

export interface CreateReviewRequest {
  workOrderId: string;
  rating: number;
  content?: string;
  tags?: string[];
}

export interface CreateComplaintRequest {
  workOrderId?: string;
  complaintType: ComplaintType;
  level?: number;
  refundAmount?: number;
  content: string;
}
