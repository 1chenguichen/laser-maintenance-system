// 枚举定义 - 与后端共享保持一致

export enum WorkOrderStatus {
  PENDING = 'PENDING',
  DISPATCHED = 'DISPATCHED',
  CONFIRMED = 'CONFIRMED',
  REPAIRING = 'REPAIRING',
  COMPLETED = 'COMPLETED',
  REFUSED = 'REFUSED',
  CANCELLED = 'CANCELLED',
}

export enum EngineerStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  WORKING = 'WORKING',
}

export enum EmergencyLevel {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4,
}

// API 类型
export interface Engineer {
  id: string;
  name: string;
  phone: string;
  status: EngineerStatus;
  monthlyOrders: number;
  monthlyRevenue: number;
  rating: number;
  totalOrders: number;
  totalRevenue: number;
  joinedAt: string;
}

export interface WorkOrder {
  id: string;
  orderNo: string;
  faultType: string;
  faultDescription?: string;
  emergencyLevel: EmergencyLevel;
  status: WorkOrderStatus;
  estimatedAmount: number;
  finalAmount?: number;
  prepayAmount?: number;
  createdAt: string;
  completedAt?: string;
  device?: {
    id: string;
    model: string;
    serialNumber: string;
  };
  address?: {
    province: string;
    city: string;
    district: string;
    detail: string;
    latitude?: number;
    longitude?: number;
  };
  customer?: {
    id: string;
    name: string;
    phone: string;
  };
  engineer?: {
    id: string;
    name: string;
    phone: string;
    rating: number;
  };
}

export interface EngineerStats {
  monthlyOrders: number;
  monthlyRevenue: number;
  pendingOrders: number;
  completedOrders: number;
  commissionRate: number; // 0.2, 0.25, 0.3
}

export interface WorkOrderListItem {
  id: string;
  orderNo: string;
  faultType: string;
  emergencyLevel: number;
  status: string;
  estimatedAmount: number;
  distance?: number;
  createdAt: string;
  device?: { model: string; serialNumber: string };
  address?: { province: string; city: string; district: string; detail: string };
  customer?: { name: string; phone: string };
}
