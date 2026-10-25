// API service for cs-admin
// 本地开发与云端部署自适应：优先读取 REACT_APP_API_BASE，否则按当前页面主机名推导
const API_BASE: string =
  process.env.REACT_APP_API_BASE ||
  `${window.location.protocol}//${window.location.hostname}:8080`;

interface ApiResponse<T> {
  code?: number;
  message?: string;
  data?: T;
}

const TOKEN_KEY = 'cs_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers as Record<string, string>,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '请求失败' }));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  const result = await response.json();
  return result.data !== undefined ? result.data : result;
}

// Auth
export async function login(phone: string, code: string): Promise<{ accessToken: string; user: any }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, role: 'cs_operator' }),
  });
  const data = await response.json();
  if (data.accessToken) {
    setToken(data.accessToken);
    return { accessToken: data.accessToken, user: data.user };
  }
  throw new Error(data.message || '登录失败');
}

export function logout() {
  clearToken();
}

// Stats
export interface Stats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalEngineers: number;
  totalCustomers: number;
}

export async function getStats(): Promise<Stats> {
  return fetchApi<Stats>('/admin/stats');
}

// Work Orders
export interface WorkOrderListItem {
  id: string;
  orderNo: string;
  faultType: string;
  faultDescription?: string;
  emergencyLevel: number;
  status: string;
  prepayAmount?: number;
  estimatedAmount?: number;
  dispatchType?: string;
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

export async function getWorkOrders(status?: string): Promise<WorkOrderListItem[]> {
  const params = status && status !== '全部' ? `?status=${status}` : '';
  return fetchApi<WorkOrderListItem[]>(`/admin/work-orders${params}`);
}

export async function getWorkOrderDetail(id: string): Promise<WorkOrderListItem> {
  return fetchApi<WorkOrderListItem>(`/admin/work-orders/${id}`);
}

export async function classifyWorkOrder(
  id: string,
  data: {
    faultType: string;
    emergencyLevel: number;
    estimatedAmount: number;
    dispatchType: string;
    designatedEngineerId?: string;
  }
): Promise<any> {
  return fetchApi(`/admin/work-orders/${id}/classify`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Engineers
export interface Engineer {
  id: string;
  name: string;
  phone: string;
  status: string;
  monthlyOrders: number;
  monthlyRevenue: number;
  rating: number;
  totalOrders: number;
  totalRevenue: number;
  joinedAt: string;
}

export async function getEngineers(): Promise<Engineer[]> {
  return fetchApi<Engineer[]>('/admin/engineers');
}

export async function getEngineerDetail(id: string): Promise<Engineer> {
  return fetchApi<Engineer>(`/admin/engineers/${id}`);
}

export async function getEngineerStats(id: string): Promise<any> {
  return fetchApi<any>(`/admin/engineers/${id}/stats`);
}

export async function createEngineer(data: { name: string; phone: string }): Promise<Engineer> {
  return fetchApi<Engineer>('/admin/engineers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Customers
export interface Customer {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
}

export async function getCustomers(): Promise<Customer[]> {
  return fetchApi<Customer[]>('/admin/customers');
}

export async function getCustomerDetail(id: string): Promise<any> {
  return fetchApi<any>(`/admin/customers/${id}`);
}

export async function updateCustomer(id: string, data: { name?: string; phone?: string }): Promise<Customer> {
  return fetchApi<Customer>(`/admin/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Devices
export interface Device {
  id: string;
  serialNumber: string;
  model: string;
  deviceType: string;
  customerId: string;
  purchaseDate?: string;
  warrantyExpire?: string;
  customer?: {
    name: string;
    phone: string;
  };
}

export async function getDevices(): Promise<Device[]> {
  return fetchApi<Device[]>('/admin/devices');
}

export async function getDeviceDetail(id: string): Promise<Device> {
  return fetchApi<Device>(`/admin/devices/${id}`);
}

export async function createDevice(data: {
  serialNumber: string;
  model: string;
  deviceType: string;
  customerId?: string;
  purchaseDate?: string;
  warrantyExpire?: string;
}): Promise<Device> {
  return fetchApi<Device>('/admin/devices', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDevice(id: string, data: Partial<Device>): Promise<Device> {
  return fetchApi<Device>(`/admin/devices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Parts
export interface Part {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  guidePrice: number;
  isActive: boolean;
}

export async function getParts(): Promise<Part[]> {
  return fetchApi<Part[]>('/admin/parts');
}

export async function createPart(data: {
  code: string;
  name: string;
  category: string;
  unit: string;
  guidePrice: number;
}): Promise<Part> {
  return fetchApi<Part>('/admin/parts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Stats
export interface TrendStats {
  todayOrders: number;
  weekOrders: number;
  monthOrders: number;
  completedToday: number;
  completedWeek: number;
  completedMonth: number;
}

export interface PerformanceStats {
  completionRate: number;
  avgRepairHours: number;
  totalCompleted: number;
}

export interface EngineerRanking {
  rank: number;
  id: string;
  name: string;
  monthlyOrders: number;
  monthlyRevenue: number;
  rating: number;
}

export interface ComplaintRate {
  totalComplaints: number;
  pendingComplaints: number;
  complaintRate: number;
}

export async function getTrendStats(): Promise<TrendStats> {
  return fetchApi<TrendStats>('/admin/stats/trend');
}

export async function getPerformanceStats(): Promise<PerformanceStats> {
  return fetchApi<PerformanceStats>('/admin/stats/performance');
}

export async function getEngineerRanking(): Promise<EngineerRanking[]> {
  return fetchApi<EngineerRanking[]>('/admin/stats/engineers/ranking');
}

export async function getComplaintRate(): Promise<ComplaintRate> {
  return fetchApi<ComplaintRate>('/admin/stats/complaint-rate');
}

// Complaints
export interface Complaint {
  id: string;
  workOrderId: string;
  customerId: string;
  engineerId?: string;
  complaintType: string;
  level?: number;
  refundAmount?: number;
  status: string;
  content: string;
  handleResult?: string;
  handleTime?: string;
  createdAt: string;
  customer?: {
    name: string;
    phone: string;
  };
  engineer?: {
    name: string;
    phone: string;
  };
  workOrder?: {
    orderNo: string;
    faultType: string;
    finalAmount?: number;
  };
}

export async function getComplaints(status?: string): Promise<Complaint[]> {
  const params = status && status !== '全部' ? `?status=${status}` : '';
  return fetchApi<Complaint[]>(`/admin/complaints${params}`);
}

export async function getComplaintDetail(id: string): Promise<Complaint> {
  return fetchApi<Complaint>(`/admin/complaints/${id}`);
}

export async function handleComplaint(
  id: string,
  data: { status: string; handleResult: string; refundAmount?: number }
): Promise<Complaint> {
  return fetchApi<Complaint>(`/admin/complaints/${id}/handle`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
