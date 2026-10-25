import React, { useState, useEffect } from 'react';
import { getParts, createPart, Part } from '../api';

export default function Parts() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newPart, setNewPart] = useState({
    code: '',
    name: '',
    category: '',
    unit: '',
    guidePrice: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadParts();
  }, []);

  async function loadParts() {
    try {
      const data = await getParts();
      setParts(data || []);
    } catch (err) {
      console.error('Failed to load parts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newPart.code || !newPart.name || !newPart.category) {
      alert('请填写完整信息');
      return;
    }
    try {
      setSaving(true);
      await createPart(newPart);
      alert('创建成功');
      setShowModal(false);
      setNewPart({ code: '', name: '', category: '', unit: '', guidePrice: 0 });
      loadParts();
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
          <input className="search-input" placeholder="搜索配件名称/编码..." disabled />
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + 添加配件
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>配件名称</th>
              <th>编码</th>
              <th>类别</th>
              <th>单位</th>
              <th>指导价</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {parts.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 20 }}>
                  暂无配件数据
                </td>
              </tr>
            ) : (
              parts.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.code}</td>
                  <td>{p.category}</td>
                  <td>{p.unit}</td>
                  <td>¥{p.guidePrice}</td>
                  <td>
                    <span className={`badge ${p.isActive ? 'badge-working' : 'badge-cancelled'}`}>
                      {p.isActive ? '在售' : '停售'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 添加配件弹窗 */}
      {showModal && (
        <div className="modal-overlay show" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">添加配件</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <div className="form-label">配件编码 *</div>
                <input
                  type="text"
                  className="form-input"
                  value={newPart.code}
                  onChange={(e) => setNewPart({ ...newPart, code: e.target.value })}
                  placeholder="如: PWR-LASER-001"
                />
              </div>
              <div className="form-group">
                <div className="form-label">配件名称 *</div>
                <input
                  type="text"
                  className="form-input"
                  value={newPart.name}
                  onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                  placeholder="如: 激光器模块"
                />
              </div>
              <div className="form-group">
                <div className="form-label">类别 *</div>
                <select
                  className="form-input"
                  value={newPart.category}
                  onChange={(e) => setNewPart({ ...newPart, category: e.target.value })}
                >
                  <option value="">请选择类别</option>
                  <option value="激光管">激光管</option>
                  <option value="反射镜">反射镜</option>
                  <option value="聚焦镜">聚焦镜</option>
                  <option value="导轨">导轨</option>
                  <option value="水冷机组">水冷机组</option>
                  <option value="控制主板">控制主板</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div className="form-group">
                <div className="form-label">单位</div>
                <input
                  type="text"
                  className="form-input"
                  value={newPart.unit}
                  onChange={(e) => setNewPart({ ...newPart, unit: e.target.value })}
                  placeholder="如: 个/套/米"
                />
              </div>
              <div className="form-group">
                <div className="form-label">指导价(元)</div>
                <input
                  type="number"
                  className="form-input"
                  value={newPart.guidePrice}
                  onChange={(e) => setNewPart({ ...newPart, guidePrice: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <button
                className="btn btn-primary btn-full"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? '创建中...' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
