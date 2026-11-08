import useWorkspaceState from '../components/useWorkspaceState';
import PageHeading from '../components/PageHeading';
import './order-flow.css';
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { WorkOrderStatus } from '../types';
import { getWorkOrders, WorkOrderListItem } from '../api';

const STATUS_OPTIONS = ['全部', '待处理', '已派单', '已上门', '待付定金', '服务中', '待付尾款', '已完成', '已取消'];

const STATUS_TEXT: Record<string, string> = {
  [WorkOrderStatus.PENDING]: '待处理',
  [WorkOrderStatus.ACCEPTED]: '已上门',
  [WorkOrderStatus.PENDING_PAYMENT]: '待确认报价/定金',
  [WorkOrderStatus.PENDING_FINAL_PAYMENT]: '待付尾款',
  [WorkOrderStatus.DISPATCHED]: '已派单',
  [WorkOrderStatus.CONFIRMED]: '已确认',
  [WorkOrderStatus.REPAIRING]: '服务中',
  [WorkOrderStatus.COMPLETED]: '已完成',
  [WorkOrderStatus.REFUSED]: '已拒绝',
  [WorkOrderStatus.CANCELLED]: '已取消',
};

const BADGE_CLASS: Record<string, string> = {
  [WorkOrderStatus.PENDING]: 'badge-pending',
  [WorkOrderStatus.ACCEPTED]: 'badge-working',
  [WorkOrderStatus.PENDING_PAYMENT]: 'badge-pending',
  [WorkOrderStatus.PENDING_FINAL_PAYMENT]: 'badge-pending',
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
  '已上门': WorkOrderStatus.ACCEPTED,
  '待付定金': WorkOrderStatus.PENDING_PAYMENT,
  '待付尾款': WorkOrderStatus.PENDING_FINAL_PAYMENT,
  '已完成': WorkOrderStatus.COMPLETED,
  '已取消': WorkOrderStatus.CANCELLED,
};

export default function Orders() {
  const [filter, setFilter] = useWorkspaceState('orders:filter','全部');
  const [search, setSearch] = useWorkspaceState('orders:search','');
  const [orders, setOrders] = useState<WorkOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    setOrders([]);
    loadOrders();
    const timer = setInterval(() => { if (!document.hidden) loadOrders(true); }, 5000);
    return () => { clearInterval(timer); requestVersion.current++; inFlight.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function loadOrders(silent = false) {
    if (silent && inFlight.current) return;
    const version = ++requestVersion.current;
    inFlight.current = true;
    try {
      if (!silent) setLoading(true);
      setError(null);
      const statusFilter = filter === '全部' ? undefined : STATUS_FILTER_MAP[filter];
      const data = await getWorkOrders(statusFilter);
      if (version !== requestVersion.current) return;
      setOrders(data || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load orders:', err);
      if (version === requestVersion.current) setError(silent ? '自动更新失败，当前保留上次读取的工单' : '加载工单失败');
    } finally {
      if (version === requestVersion.current) { setLoading(false); inFlight.current = false; }
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

  if (error && orders.length === 0) {
    return <div className="card"><div className="error" role="alert">{error}，请检查网络后重试。</div><button className="btn btn-default" onClick={() => loadOrders()}>重新加载工单</button></div>;
  }

  return (
    <div className="order-flow">
      {error && <div className="flow-refresh-notice" role="status">{error}。<button className="btn btn-default btn-small" onClick={() => loadOrders(true)}>重新更新</button></div>}
      <PageHeading title="工单处理" description="先筛选待处理事项，再进入工单核对故障与安排工程师。" actions={<span>{filtered.length} 张当前工单</span>} />
      <div className="card">
        <div className="filter-bar">
          <input
            aria-label="搜索工单号或设备" className="search-input"
            placeholder="搜索工单号/设备..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              aria-pressed={filter === s}
              className="btn btn-filter btn-small"
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flow-table-scroll"><table className="table">
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
                  {search ? '没有匹配的工单，请尝试其他工单号或设备名称。' : '当前筛选下暂无工单，可以切换其他状态查看。'}
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
                  <td className="flow-money">{order.estimatedAmount == null ? '—' : `¥${Number(order.estimatedAmount).toFixed(2)}`}</td>
                  <td><span className={`badge ${BADGE_CLASS[order.status] || ''}`}>{STATUS_TEXT[order.status] || order.status}</span></td>
                  <td>
                    <Link to={`/orders/${order.id}`} className="btn btn-link btn-small">{order.status === WorkOrderStatus.PENDING ? '处理与派单' : '查看工单'}</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
