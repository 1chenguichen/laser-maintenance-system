import React, { useState, useEffect } from 'react';
import { getDevices, Device, getCustomers, Customer, getDeviceDetail } from '../api';

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);

  useEffect(() => {
    loadDevices();
    loadCustomers();
  }, []);

  async function loadDevices() {
    try {
      const data = await getDevices();
      setDevices(data || []);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomers() {
    try {
      const data = await getCustomers();
      setCustomers(data || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  }

  function isWarrantyValid(expireDate: string | null): boolean {
    if (!expireDate) return false;
    return new Date(expireDate) >= new Date();
  }

  function handleBindDevice() {
    setEditingDevice(null);
    setShowModal(true);
  }

  async function handleEditDevice(device: Device) {
    try {
      const detail = await getDeviceDetail(device.id);
      setEditingDevice(detail);
      setShowModal(true);
    } catch (err) {
      console.error('Failed to load device detail:', err);
    }
  }

  if (loading) {
    return <div className="card"><div className="loading">加载中...</div></div>;
  }

  return (
    <div>
      <div className="card">
        <div className="filter-bar">
          <input className="search-input" placeholder="搜索设备型号/序列号..." />
          <button className="btn btn-default" onClick={handleBindDevice}>+ 新增设备</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>设备型号</th>
              <th>序列号</th>
              <th>所属客户</th>
              <th>保修到期</th>
              <th>保修状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 20 }}>
                  暂无设备数据
                </td>
              </tr>
            ) : (
              devices.map((d) => {
                const isValid = isWarrantyValid(d.warrantyExpire as any);
                return (
                  <tr key={d.id}>
                    <td>{d.model}</td>
                    <td>{d.serialNumber}</td>
                    <td>{d.customer?.name || '-'}</td>
                    <td>{d.warrantyExpire ? new Date(d.warrantyExpire as any).toLocaleDateString('zh-CN') : '-'}</td>
                    <td>
                      <span className={`badge ${isValid ? 'badge-working' : 'badge-cancelled'}`}>
                        {isValid ? '保修期内' : '已过期'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-link" onClick={() => handleEditDevice(d)}>编辑</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <DeviceModal
          device={editingDevice}
          customers={customers}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            loadDevices();
          }}
        />
      )}
    </div>
  );
}

interface DeviceModalProps {
  device: Device | null;
  customers: Customer[];
  onClose: () => void;
  onSuccess: () => void;
}

function DeviceModal({ device, customers, onClose, onSuccess }: DeviceModalProps) {
  const [formData, setFormData] = useState({
    serialNumber: device?.serialNumber || '',
    model: device?.model || '',
    deviceType: device?.deviceType || '激光切割机',
    customerId: device?.customerId || '',
    purchaseDate: device?.purchaseDate ? new Date(device.purchaseDate as any).toISOString().split('T')[0] : '',
    warrantyExpire: device?.warrantyExpire ? new Date(device.warrantyExpire as any).toISOString().split('T')[0] : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!device;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!formData.serialNumber || !formData.model) {
      setError('请填写必填项：序列号、型号');
      return;
    }

    setSaving(true);
    try {
      const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080`;
      const token = localStorage.getItem('cs_admin_token');
      const url = isEdit ? `${API_BASE}/admin/devices/${device.id}` : `${API_BASE}/admin/devices`;
      const method = isEdit ? 'PUT' : 'POST';

      // 编辑时只发送允许修改的字段
      const submitData = isEdit ? {
        model: formData.model,
        deviceType: formData.deviceType,
        customerId: formData.customerId || null,
        purchaseDate: formData.purchaseDate || null,
        warrantyExpire: formData.warrantyExpire || null,
      } : formData;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '保存失败');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? '编辑设备' : '新增设备'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label>所属客户（可选，留空表示未绑定）</label>
              <select
                value={formData.customerId}
                onChange={e => setFormData({ ...formData, customerId: e.target.value })}
              >
                <option value="">-- 未绑定客户 --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>设备序列号 *</label>
              <input
                type="text"
                value={formData.serialNumber}
                onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
                placeholder="输入设备序列号"
                required
                disabled={isEdit}
              />
              {isEdit && <small style={{color:'#999',fontSize:'12px'}}>序列号不可修改</small>}
            </div>

            <div className="form-group">
              <label>设备型号 *</label>
              <input
                type="text"
                value={formData.model}
                onChange={e => setFormData({ ...formData, model: e.target.value })}
                placeholder="如：3000W激光切割机"
                required
              />
            </div>

            <div className="form-group">
              <label>设备类型</label>
              <select
                value={formData.deviceType}
                onChange={e => setFormData({ ...formData, deviceType: e.target.value })}
              >
                <option value="激光切割机">激光切割机</option>
                <option value="激光焊接机">激光焊接机</option>
                <option value="激光打标机">激光打标机</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div className="form-group">
              <label>购买日期</label>
              <input
                type="date"
                value={formData.purchaseDate}
                onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>保修到期日期</label>
              <input
                type="date"
                value={formData.warrantyExpire}
                onChange={e => setFormData({ ...formData, warrantyExpire: e.target.value })}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-default" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
