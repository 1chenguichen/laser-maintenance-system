import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { WorkOrderStatus } from '../types';
import { getWorkOrders, WorkOrderListItem } from '../api';

const STATUS_OPTIONS = ['全部', '待处理', '已派单', '服务中', '已完成', '已取消'];

const STATUS_TEXT: Record<string, string> = {
  [WorkOrderStatus.PENDING]: '待处理',
  [WorkOrderStatus.DISPATCHED]: '已派单',
  [WorkOrderStatus.CONFIRMED]: '已确认',
  [WorkOrderStatus.REPAIRING]: '服务中',
  [WorkOrderStatus.COMPLETED]: '已完成',
  [WorkOrderStatus.REFUSED]: '已拒绝',
  [WorkOrderStatus.CANCELLED]: '已取消',
};

const BADGE_CLASS: Record<string, string> = {
  [WorkOrderStatus.PENDING]: 'badge-pending',
  [WorkOrderStatus.DISPATCHED]: 'badge-dispatched',
  [WorkOrderStatus.CONFIRMED]: 'badge-confirmed',
  [WorkOrderStatus.REPAIRING]: 'badge-working',
  [WorkOrderStatus.COMPLETED]: 'badge-completed',
  [WorkOrderStatus.REFUSED]: 'badge-refused',
  [WorkOrderStatus.CANCELLED]: 'badge-cancelled',
};

// 状态筛选映射
const STATUS_FILTER_MAP: Record<string, string> = {
  '待处理': WorkOrderStatus.PENDING,
  '已派单': WorkOrderStatus.DISPATCHED,
  '服务中': WorkOrderStatus.REPAIRING,
  '已完成': WorkOrderStatus.COMPLETED,
  '已取消': WorkOrderStatus.CANCELLED,
};

export default function Orders() {
  const [filter, setFilter] = useState('全部');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<WorkOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, [filter]);

  async function loadOrders() {
    try {
      setLoading(true);
      setError(null);
      const statusFilter = filter === '全部' ? undefined : STATUS_FILTER_MAP[filter];
      const data = await getWorkOrders(statusFilter);
      setOrders(data || []);
    } catch (err) {
      console.error('Failed to load orders:', err);
      setError('加载工单失败');
    } finally {
      setLoading(false);
    }
  }

  const filtered = orders.filter((o) => {
    if (search && !o.orderNo.toLowerCase().includes(search.toLowerCase())
        && !o.device?.model?.includes(search)) return false;
    return true;
  });

  if (loading) {
    return <div className="card"><div className="loading">加载中...</div></div>;
  }

  if (error) {
    return <div className="card"><div className="error">{error}</div></div>;
  }

  return (
    <div>
      <div className="card">
        <div className="filter-bar">
          <input
            className="search-input"
            placeholder="搜索工单号/设备..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              className={`btn btn-default btn-small ${filter === s ? 'btn-primary' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>工单号</th>
              <th>设备</th>
              <th>客户</th>
              <th>地址</th>
              <th>创建时间</th>
              <th>预估费用</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{textAlign: 'center', padding: '20px'}}>
                  暂无工单数据
                </td>
              </tr>
            ) : (
              filtered.map((order) => (
                <tr key={order.id}>
                  <td>{order.orderNo}</td>
                  <td>{order.device?.model || '-'}</td>
                  <td>{order.customer?.name || '-'}</td>
                  <td>{order.address ? `${order.address.city}${order.address.detail}` : '-'}</td>
                  <td>{new Date(order.createdAt).toLocaleString('zh-CN')}</td>
                  <td>¥{order.estimatedAmount || 0}</td>
                  <td><span className={`badge ${BADGE_CLASS[order.status] || ''}`}>{STATUS_TEXT[order.status] || order.status}</span></td>
                  <td>
                    <Link to={`/orders/${order.id}`} className="btn btn-primary btn-small">详情</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
