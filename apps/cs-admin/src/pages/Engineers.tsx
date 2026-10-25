import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { EngineerStatus } from '../types';
import { getEngineers, createEngineer, Engineer } from '../api';

const STATUS_TEXT: Record<string, string> = {
  ONLINE: '🟢 在线',
  OFFLINE: '⚪ 离线',
  WORKING: '🟡 工作中',
};

export default function Engineers() {
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEngineers();
  }, []);

  async function loadEngineers() {
    try {
      const data = await getEngineers();
      setEngineers(data || []);
    } catch (err) {
      console.error('Failed to load engineers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName || !newPhone) {
      alert('请填写姓名和电话');
      return;
    }
    try {
      setSaving(true);
      await createEngineer({ name: newName, phone: newPhone });
      alert('创建成功');
      setShowModal(false);
      setNewName('');
      setNewPhone('');
      loadEngineers();
    } catch (err: any) {
      alert(err.message || '创建失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card"><div className="loading">加载中...</div></div>;
  }

  return (
    <div>
      <div className="card">
        <div className="filter-bar">
          <input
            className="search-input"
            placeholder="搜索工程师姓名/电话..."
            disabled
          />
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + 新增工程师
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>工程师</th>
              <th>联系电话</th>
              <th>状态</th>
              <th>本月订单</th>
              <th>本月收益</th>
              <th>评分</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {engineers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>
                  暂无工程师数据
                </td>
              </tr>
            ) : (
              engineers.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.phone}</td>
                  <td>
                    <span className={`badge badge-${e.status?.toLowerCase() || 'offline'}`}>
                      {STATUS_TEXT[e.status] || e.status}
                    </span>
                  </td>
                  <td>{e.monthlyOrders} 单</td>
                  <td>¥{Number(e.monthlyRevenue).toFixed(0)}</td>
                  <td>⭐ {Number(e.rating).toFixed(1)}</td>
                  <td>
                    <Link to={`/engineers/${e.id}`} className="btn btn-default btn-small">
                      详情
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 新增工程师弹窗 */}
      {showModal && (
        <div className="modal-overlay show" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">新增工程师</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <div className="form-label">姓名 *</div>
                <input
                  type="text"
                  className="form-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="请输入工程师姓名"
                />
              </div>
              <div className="form-group">
                <div className="form-label">联系电话 *</div>
                <input
                  type="tel"
                  className="form-input"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="请输入手机号"
                />
              </div>
              <button
                className="btn btn-primary btn-full"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
