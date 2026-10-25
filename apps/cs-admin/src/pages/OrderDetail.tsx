import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { WorkOrderStatus, DispatchType } from '../types';
import { getWorkOrderDetail, classifyWorkOrder, getEngineers, Engineer } from '../api';

const STATUS_TEXT: Record<string, string> = {
  PENDING: '待分类',
  DISPATCHED: '已派单',
  CONFIRMED: '已确认',
  REPAIRING: '维修中',
  COMPLETED: '已完成',
  REFUSED: '已拒绝',
  CANCELLED: '已取消',
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [engineers, setEngineers] = useState<Engineer[]>([]);

  // 分类表单状态
  const [faultType, setFaultType] = useState('');
  const [emergencyLevel, setEmergencyLevel] = useState(3);
  const [estimatedAmount, setEstimatedAmount] = useState(0);
  const [dispatchType, setDispatchType] = useState('SYSTEM');
  const [designatedEngineerId, setDesignatedEngineerId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      loadOrder();
      loadEngineers();
    }
  }, [id]);

  async function loadOrder() {
    try {
      const data = await getWorkOrderDetail(id!);
      setOrder(data);
      if (data.faultType) setFaultType(data.faultType);
      if (data.emergencyLevel) setEmergencyLevel(data.emergencyLevel);
      if (data.estimatedAmount) setEstimatedAmount(data.estimatedAmount);
      if (data.dispatchType) setDispatchType(data.dispatchType);
    } catch (err) {
      console.error('Failed to load order:', err);
      setError('加载工单详情失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadEngineers() {
    try {
      const data = await getEngineers();
      setEngineers(data || []);
    } catch (err) {
      console.error('Failed to load engineers:', err);
    }
  }

  async function handleClassify() {
    if (!faultType) {
      alert('请选择故障类型');
      return;
    }
    if (estimatedAmount <= 0) {
      alert('请输入预估费用');
      return;
    }

    try {
      setSaving(true);
      await classifyWorkOrder(order.id, {
        faultType,
        emergencyLevel,
        estimatedAmount,
        dispatchType: dispatchType as any,
        designatedEngineerId: dispatchType === 'DESIGNATED' ? designatedEngineerId : undefined,
      });
      alert('分类成功！工单已放入派单池');
      navigate('/orders');
    } catch (err: any) {
      alert(err.message || '分类失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card"><div className="loading">加载中...</div></div>;
  }

  if (error || !order) {
    return <div className="card"><div className="error">{error || '工单不存在'}</div></div>;
  }

  const isPending = order.status === WorkOrderStatus.PENDING;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
      <div>
        {/* 工单详情卡片 */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>工单详情 #{order.orderNo || order.id.slice(0, 8)}</div>
            <span className={`badge badge-${order.status.toLowerCase()}`}>
              {STATUS_TEXT[order.status] || order.status}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div className="form-label">设备型号</div>
              <div>{order.device?.model || '-'}</div>
            </div>
            <div>
              <div className="form-label">设备序列号</div>
              <div>{order.device?.serialNumber || '-'}</div>
            </div>
            <div>
              <div className="form-label">故障类型</div>
              <div>{order.faultType || '-'}</div>
            </div>
            <div>
              <div className="form-label">紧急程度</div>
              <div>{order.emergencyLevel || '-'} 级</div>
            </div>
          </div>

          {order.faultDescription && (
            <div style={{ marginTop: 16 }}>
              <div className="form-label">故障描述</div>
              <div>{order.faultDescription}</div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <div className="form-label">上门地址</div>
            <div>
              {order.address
                ? `${order.address.province || ''}${order.address.city || ''}${order.address.district || ''}${order.address.detail || ''}`
                : '-'}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="form-label">预估费用</div>
            <div className="text-primary" style={{ fontSize: 18, fontWeight: 600 }}>
              ¥{order.estimatedAmount || 0}
            </div>
          </div>
        </div>

        {/* 分类表单 - 仅待分类工单显示 */}
        {isPending && (
          <div className="card">
            <div className="card-title">📋 工单分类</div>

            <div className="form-group">
              <div className="form-label">故障类型 *</div>
              <select
                className="form-input"
                value={faultType}
                onChange={(e) => setFaultType(e.target.value)}
                required
              >
                <option value="">请选择故障类型</option>
                <option value="激光器不发光">激光器不发光</option>
                <option value="功率不稳定">功率不稳定</option>
                <option value="冷水机故障">冷水机故障</option>
                <option value="激光校准偏差">激光校准偏差</option>
                <option value="设备异响">设备异响</option>
                <option value="其他故障">其他故障</option>
              </select>
            </div>

            <div className="form-group">
              <div className="form-label">紧急程度 *</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`btn ${emergencyLevel === level ? 'btn-primary' : 'btn-default'} btn-small`}
                    onClick={() => setEmergencyLevel(level)}
                  >
                    {level === 1 ? '普通' : level === 3 ? '较急' : level === 5 ? '紧急' : level}级
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <div className="form-label">预估费用(元) *</div>
              <input
                type="number"
                className="form-input"
                value={estimatedAmount}
                onChange={(e) => setEstimatedAmount(Number(e.target.value))}
                min="0"
                placeholder="请输入预估维修费用"
              />
            </div>

            <div className="form-group">
              <div className="form-label">派单方式 *</div>
              <select
                className="form-input"
                value={dispatchType}
                onChange={(e) => setDispatchType(e.target.value)}
              >
                <option value="SYSTEM">自动派单池（工程师自由抢单）</option>
                <option value="DESIGNATED">指定工程师</option>
              </select>
            </div>

            {dispatchType === 'DESIGNATED' && (
              <div className="form-group">
                <div className="form-label">选择工程师 *</div>
                <select
                  className="form-input"
                  value={designatedEngineerId}
                  onChange={(e) => setDesignatedEngineerId(e.target.value)}
                >
                  <option value="">请选择工程师</option>
                  {engineers.map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.name} ({eng.phone}) - {eng.status}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              className="btn btn-primary btn-full"
              onClick={handleClassify}
              disabled={saving}
              style={{ marginTop: 16 }}
            >
              {saving ? '提交中...' : '确认分类并放入派单池'}
            </button>
          </div>
        )}
      </div>

      <div>
        {/* 客户信息 */}
        <div className="card">
          <div className="card-title">👤 客户信息</div>
          <div style={{ fontSize: 14 }}>
            <p>姓名: {order.customer?.name || '-'}</p>
            <p style={{ marginTop: 8 }}>电话: {order.customer?.phone || '-'}</p>
          </div>
          {order.customer?.phone && (
            <a
              href={`tel:${order.customer.phone}`}
              className="btn btn-default btn-small"
              style={{ marginTop: 12, display: 'inline-block' }}
            >
              📞 拨打
            </a>
          )}
        </div>

        {/* 工程师信息 */}
        {order.engineer && (
          <div className="card">
            <div className="card-title">👷 派单信息</div>
            <div style={{ fontSize: 14 }}>
              <p>工程师: {order.engineer.name}</p>
              <p style={{ marginTop: 8 }}>
                联系电话: {order.engineer.phone || '-'}
              </p>
              <p style={{ marginTop: 8 }}>
                状态: <span className={`badge badge-${order.engineer.status?.toLowerCase() || 'offline'}`}>
                  {order.engineer.status === 'ONLINE' ? '🟢 在线' : order.engineer.status === 'WORKING' ? '🟡工作中' : '⚪离线'}
                </span>
              </p>
            </div>
          </div>
        )}

        {/* 时间线 */}
        <div className="card">
          <div className="card-title">📍 工单时间线</div>
          <div className="timeline">
            <div className="timeline-item">
              <div className="timeline-time">
                {order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'}
              </div>
              <div className="timeline-content">工单创建</div>
            </div>
            {order.status !== 'PENDING' && (
              <div className="timeline-item">
                <div className="timeline-time">
                  {order.updatedAt ? new Date(order.updatedAt).toLocaleString('zh-CN') : '-'}
                </div>
                <div className="timeline-content">已分类</div>
              </div>
            )}
            {order.status === 'DISPATCHED' && (
              <div className="timeline-item">
                <div className="timeline-content">已派单，等待工程师接单</div>
              </div>
            )}
            {order.status === 'CONFIRMED' && (
              <div className="timeline-item">
                <div className="timeline-content">客户已确认报价</div>
              </div>
            )}
            {order.status === 'REPAIRING' && (
              <div className="timeline-item">
                <div className="timeline-content">维修中</div>
              </div>
            )}
            {order.status === 'COMPLETED' && (
              <div className="timeline-item">
                <div className="timeline-time">
                  {order.completedAt ? new Date(order.completedAt).toLocaleString('zh-CN') : '-'}
                </div>
                <div className="timeline-content">维修完成</div>
              </div>
            )}
          </div>
        </div>

        <Link to="/orders" className="btn btn-default" style={{ marginTop: 16, display: 'block', textAlign: 'center' }}>
          返回工单列表
        </Link>
      </div>
    </div>
  );
}
