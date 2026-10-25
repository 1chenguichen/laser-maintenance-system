import React, { useState, useEffect } from 'react';
import { getComplaints, getComplaintDetail, handleComplaint, Complaint } from '../api';

export default function Complaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('全部');
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [handleResult, setHandleResult] = useState('');
  const [refundAmount, setRefundAmount] = useState(0);
  const [handleStatus, setHandleStatus] = useState('HANDLED');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadComplaints();
  }, [filter]);

  async function loadComplaints() {
    try {
      const status = filter !== '全部' ? filter : undefined;
      const data = await getComplaints(status);
      setComplaints(data || []);
    } catch (err) {
      console.error('Failed to load complaints:', err);
    } finally {
      setLoading(false);
    }
  }

  async function showDetail(id: string) {
    try {
      const data = await getComplaintDetail(id);
      setSelectedComplaint(data);
      setShowModal(true);
      setHandleResult('');
      setRefundAmount(data.refundAmount || 0);
      setHandleStatus('HANDLED');
    } catch (err) {
      console.error('Failed to load complaint detail:', err);
      alert('加载详情失败');
    }
  }

  async function submitHandle() {
    if (!selectedComplaint || !handleResult.trim()) {
      alert('请填写处理结果');
      return;
    }
    try {
      setSaving(true);
      await handleComplaint(selectedComplaint.id, {
        status: handleStatus,
        handleResult,
        refundAmount: handleStatus === 'HANDLED' ? refundAmount : undefined,
      });
      alert('处理成功');
      setShowModal(false);
      loadComplaints();
    } catch (err: any) {
      alert(err.message || '处理失败');
    } finally {
      setSaving(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'PENDING':
        return 'badge-pending';
      case 'HANDLED':
        return 'badge-working';
      case 'REJECTED':
        return 'badge-cancelled';
      default:
        return '';
    }
  }

  function getTypeLabel(type: string) {
    switch (type) {
      case 'COMPLAINT':
        return '投诉';
      case 'REFUND':
        return '退款';
      case 'BOTH':
        return '投诉+退款';
      default:
        return type;
    }
  }

  if (loading) {
    return <div className="card"><div className="loading">加载中...</div></div>;
  }

  return (
    <div>
      <div className="card">
        <div className="filter-bar">
          <select
            className="search-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 150 }}
          >
            <option value="全部">全部状态</option>
            <option value="PENDING">待处理</option>
            <option value="HANDLED">已处理</option>
            <option value="REJECTED">已拒绝</option>
          </select>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>工单号</th>
              <th>类型</th>
              <th>客户</th>
              <th>退款金额</th>
              <th>状态</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {complaints.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>
                  暂无投诉数据
                </td>
              </tr>
            ) : (
              complaints.map((c) => (
                <tr key={c.id}>
                  <td>{c.workOrder?.orderNo || '-'}</td>
                  <td>{getTypeLabel(c.complaintType)}</td>
                  <td>{c.customer?.name || '-'}</td>
                  <td>¥{c.refundAmount || 0}</td>
                  <td>
                    <span className={`badge ${getStatusBadge(c.status)}`}>
                      {c.status === 'PENDING' ? '待处理' : c.status === 'HANDLED' ? '已处理' : '已拒绝'}
                    </span>
                  </td>
                  <td>{new Date(c.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td>
                    <button
                      className="btn btn-default btn-small"
                      onClick={() => showDetail(c.id)}
                    >
                      处理
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 处理投诉弹窗 */}
      {showModal && selectedComplaint && (
        <div className="modal-overlay show" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">处理投诉</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <div className="form-label">工单信息</div>
                <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                  <div>工单号: {selectedComplaint.workOrder?.orderNo}</div>
                  <div>故障类型: {selectedComplaint.workOrder?.faultType}</div>
                  <div>订单金额: ¥{selectedComplaint.workOrder?.finalAmount || 0}</div>
                </div>
              </div>
              <div className="form-group">
                <div className="form-label">客户</div>
                <div>{selectedComplaint.customer?.name} ({selectedComplaint.customer?.phone})</div>
              </div>
              <div className="form-group">
                <div className="form-label">投诉类型</div>
                <div>{getTypeLabel(selectedComplaint.complaintType)}</div>
              </div>
              <div className="form-group">
                <div className="form-label">投诉内容</div>
                <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4 }}>{selectedComplaint.content}</div>
              </div>
              {selectedComplaint.engineer && (
                <div className="form-group">
                  <div className="form-label">被投诉工程师</div>
                  <div>{selectedComplaint.engineer.name}</div>
                </div>
              )}
              <div className="form-group">
                <div className="form-label">处理结果 *</div>
                <select
                  className="form-input"
                  value={handleStatus}
                  onChange={(e) => setHandleStatus(e.target.value)}
                >
                  <option value="HANDLED">同意退款</option>
                  <option value="REJECTED">拒绝退款</option>
                </select>
              </div>
              {handleStatus === 'HANDLED' && (
                <div className="form-group">
                  <div className="form-label">退款金额(元)</div>
                  <input
                    type="number"
                    className="form-input"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(Number(e.target.value))}
                    min="0"
                    step="0.01"
                  />
                </div>
              )}
              <div className="form-group">
                <div className="form-label">处理说明 *</div>
                <textarea
                  className="form-input"
                  rows={3}
                  value={handleResult}
                  onChange={(e) => setHandleResult(e.target.value)}
                  placeholder="请输入处理说明..."
                />
              </div>
              <button
                className="btn btn-primary btn-full"
                onClick={submitHandle}
                disabled={saving}
              >
                {saving ? '处理中...' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
