import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCustomers, getCustomerDetail, Customer } from '../api';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      const data = await getCustomers();
      setCustomers(data || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function showCustomerDetail(id: string) {
    try {
      const data = await getCustomerDetail(id);
      setSelectedCustomer(data);
      setShowDetail(true);
    } catch (err) {
      console.error('Failed to load customer detail:', err);
      alert('加载客户详情失败');
    }
  }

  if (loading) {
    return <div className="card"><div className="loading">加载中...</div></div>;
  }

  return (
    <div>
      <div className="card">
        <div className="filter-bar">
          <input className="search-input" placeholder="搜索客户姓名/电话..." disabled />
          <button className="btn btn-default" disabled>+ 新建客户</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>客户姓名</th>
              <th>联系电话</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: 20 }}>
                  暂无客户数据
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.createdAt ? new Date(c.createdAt).toLocaleDateString('zh-CN') : '-'}</td>
                  <td>
                    <button
                      className="btn btn-default btn-small"
                      onClick={() => showCustomerDetail(c.id)}
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 客户详情弹窗 */}
      {showDetail && selectedCustomer && (
        <div className="modal-overlay show" onClick={() => setShowDetail(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">客户详情</h3>
              <button className="modal-close" onClick={() => setShowDetail(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <div className="form-label">姓名</div>
                <div>{selectedCustomer.name}</div>
              </div>
              <div className="form-group">
                <div className="form-label">电话</div>
                <div>{selectedCustomer.phone}</div>
              </div>

              {selectedCustomer.addresses && selectedCustomer.addresses.length > 0 && (
                <div className="form-group">
                  <div className="form-label">地址列表</div>
                  {selectedCustomer.addresses.map((addr: any, idx: number) => (
                    <div key={idx} style={{ marginBottom: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                      {addr.province}{addr.city}{addr.district}{addr.detail}
                      {addr.isDefault && <span className="badge badge-primary" style={{ marginLeft: 8 }}>默认</span>}
                    </div>
                  ))}
                </div>
              )}

              {selectedCustomer.devices && selectedCustomer.devices.length > 0 && (
                <div className="form-group">
                  <div className="form-label">设备列表</div>
                  {selectedCustomer.devices.map((dev: any, idx: number) => (
                    <div key={idx} style={{ marginBottom: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                      <div>{dev.model} - {dev.serialNumber}</div>
                      <div className="text-small text-secondary">{dev.deviceType}</div>
                    </div>
                  ))}
                </div>
              )}

              {selectedCustomer.workOrders && selectedCustomer.workOrders.length > 0 && (
                <div className="form-group">
                  <div className="form-label">历史工单</div>
                  {selectedCustomer.workOrders.slice(0, 5).map((wo: any, idx: number) => (
                    <div key={idx} style={{ marginBottom: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                      <div>{wo.orderNo} - {wo.faultType}</div>
                      <div className="text-small text-secondary">
                        {wo.status} | ¥{wo.finalAmount || wo.estimatedAmount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
