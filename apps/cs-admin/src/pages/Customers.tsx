import CustomerImport from './CustomerImport';
import CustomerDossier from './CustomerDossier';
import useWorkspaceState from '../components/useWorkspaceState';
import {useWorkspaceFeedback} from '../components/WorkspaceFeedback';
import PageHeading from '../components/PageHeading';
import './order-flow.css';
import React, { useState, useEffect } from 'react';
import { Modal, Field } from './business-shared';
import { getCustomers, getCustomerDetail, createCustomer, Customer } from '../api';

export default function Customers() {
  const [search,setSearch]=useWorkspaceState('customers:search','');
  const notify=useWorkspaceFeedback();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [importing,setImporting]=useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({name:'',phone:''});
  const [createError, setCreateError] = useState('');

  async function submitCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const name=form.name.trim(),phone=form.phone.trim();
    if (!name || name.length>50) {setCreateError('客户姓名为必填项，最多50个字符');return;}
    if (!/^1[3-9]\d{9}$/.test(phone)) {setCreateError('请输入有效的11位手机号码');return;}
    setSaving(true);setCreateError('');
    try {
      const customer=await createCustomer({name,phone});
      setCustomers(rows=>[customer,...rows.filter(row=>row.id!==customer.id)]);
      setSearch('');setCreating(false);notify('客户已添加');
    } catch(e:any) {setCreateError(e.message||'新增失败，请重试');}
    finally {setSaving(false);}
  }

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
      notify('加载客户详情失败');
    }
  }

  const visibleRows=customers.filter(row=>!search.trim()||String(row.name||'').toLowerCase().includes(search.trim().toLowerCase()) || String(row.phone||'').toLowerCase().includes(search.trim().toLowerCase()));

  if (loading) {
    return <div className="card"><div className="loading">加载中...</div></div>;
  }

  return (
    <div className="order-flow">
      <PageHeading title="客户管理" description="查找客户、核对联系方式及关联设备，进入客户档案查看业务记录。" />
      <div className="card">
        <div className="filter-bar">
          <input className="search-input" placeholder="搜索客户姓名/电话..."  aria-label="搜索列表" value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="btn btn-default" onClick={()=>setImporting(true)}>导入 Excel</button>
          <button className="btn btn-primary" onClick={()=>{setForm({name:'',phone:''});setCreateError('');setCreating(true);}}>+ 新建客户</button>
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
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: 20 }}>
                  {search.trim() ? '没有匹配的客户，请调整搜索内容' : '暂无客户数据'}
                </td>
              </tr>
            ) : (
              visibleRows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.createdAt ? new Date(c.createdAt).toLocaleDateString('zh-CN') : '-'}</td>
                  <td>
                    <button
                      className="btn btn-link btn-small"
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

      {importing && <CustomerImport onClose={()=>setImporting(false)} onImported={message=>{setSearch('');loadCustomers();notify(message)}}/>}
      {creating && <Modal title="新建客户" busy={saving} onClose={()=>setCreating(false)} onSubmit={submitCustomer}>
        {createError && <div className="biz-alert" role="alert">{createError}</div>}
        <Field label="客户姓名"><input required maxLength={50} autoComplete="name" value={form.name} disabled={saving} onChange={e=>setForm({...form,name:e.target.value})} placeholder="请输入客户姓名" /></Field>
        <Field label="手机号码"><input required type="tel" inputMode="tel" maxLength={11} autoComplete="tel" value={form.phone} disabled={saving} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="请输入11位手机号码" /></Field>
        <p className="text-secondary">客户将加入当前企业的客户列表，可通过该手机号登录客户端。</p>
      </Modal>}

      {showDetail && selectedCustomer && <CustomerDossier customer={selectedCustomer} onClose={()=>setShowDetail(false)} />}

    </div>
  );
}
