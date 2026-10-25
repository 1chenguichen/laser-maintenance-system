// API service for Engineer App

import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'http://localhost:3000';

const TOKEN_KEY = 'engineer_token';
const USER_KEY = 'engineer_user';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  role: string;
  avatarUrl?: string;
}

interface LoginResponse {
  accessToken: string;
  user: User;
}

// 获取存储的 token
export async function getToken(): Promise<string | null> {
  return await AsyncStorage.getItem(TOKEN_KEY);
}

async function setToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(USER_KEY);
}

// 保存用户信息
async function setUser(user: User) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

// 获取用户信息
export async function getUser(): Promise<User | null> {
  const data = await AsyncStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const result: any = await response.json();

  // 后端返回格式可能是 { code, message, data } 或直接是数据
  if (result && result.code !== undefined && result.code !== 0) {
    throw new Error(result.message || '请求失败');
  }

  // 返回 data 字段（如果存在）或直接返回结果
  return result?.data !== undefined ? result.data : result;
}

// Auth
export async function login(phone: string, code: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, role: 'engineer' }),
  });
  const data = await response.json();

  // 后端返回格式可能是 { accessToken, user } 或 { code, data: { accessToken, user } }
  const token = data?.accessToken || data?.data?.accessToken;
  const user = data?.user || data?.data?.user;

  if (!token) {
    throw new Error(data?.message || data?.error || '登录失败');
  }

  await setToken(token);
  if (user) await setUser(user);
  return { accessToken: token, user };
}

export async function sendCode(phone: string): Promise<void> {
  await fetchApi('/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function logout() {
  await clearToken();
}

// Engineer Profile & Status
export async function getEngineerStatus(): Promise<{ status: string }> {
  return fetchApi('/engineer/status');
}

export async function updateEngineerStatus(status: string): Promise<void> {
  await fetchApi('/engineer/status', {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function updateLocation(latitude: number, longitude: number): Promise<void> {
  await fetchApi('/engineer/location', {
    method: 'PUT',
    body: JSON.stringify({ latitude, longitude }),
  });
}

// Work Orders
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

// 订单池（可抢单）
export async function getGrabPool(): Promise<WorkOrderListItem[]> {
  return fetchApi('/engineer/grab-pool');
}

// 抢单
export async function grabOrder(orderId: string): Promise<void> {
  await fetchApi(`/engineer/grab`, {
    method: 'POST',
    body: JSON.stringify({ workOrderId: orderId }),
  });
}

// 我的订单列表
export async function getMyOrders(): Promise<WorkOrderListItem[]> {
  return fetchApi('/engineer/orders');
}

// 订单详情
export async function getOrderDetail(orderId: string): Promise<any> {
  return fetchApi(`/engineer/orders/${orderId}`);
}

// 开始服务
export async function startRepair(orderId: string): Promise<void> {
  await fetchApi(`/engineer/orders/${orderId}/start`, { method: 'POST' });
}

// 完成服务
export async function completeRepair(orderId: string, data: { signature?: string; photos?: string[]; report?: string }): Promise<void> {
  await fetchApi(`/engineer/orders/${orderId}/complete`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// 收益统计
export async function getEngineerStats(): Promise<{
  currentMonth: {
    orderCount: number;
    revenue: number;
    commissionRate: number;
  };
  history: {
    totalOrders: number;
    totalRevenue: number;
  };
}> {
  return fetchApi('/engineer/stats');
}

// 指派订单
export async function getDesignatedOrders(): Promise<WorkOrderListItem[]> {
  return fetchApi('/engineer/designated-orders');
}

export async function acceptDesignated(orderId: string): Promise<void> {
  await fetchApi(`/engineer/accept-designated`, {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  });
}

export async function refuseDesignated(orderId: string, reason: string): Promise<void> {
  await fetchApi(`/engineer/refuse-designated/${orderId}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
