import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api';

const NAV_ITEMS = [
  { path: '/', label: '仪表盘', icon: '📊' },
  { path: '/orders', label: '工单管理', icon: '📋' },
  { path: '/customers', label: '客户管理', icon: '👥' },
  { path: '/engineers', label: '工程师管理', icon: '👷' },
  { path: '/devices', label: '设备管理', icon: '🖥' },
  { path: '/parts', label: '配件库存', icon: '🔩' },
  { path: '/complaints', label: '投诉管理', icon: '📝' },
  { path: '/service-desk', label: '客服工作台', icon: '💬' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-text">🔧 激光维保</span>
        </div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="header">
          <span className="header-title">
            {NAV_ITEMS.find((i) => isActive(i.path))?.label || ''}
          </span>
          <button className="header-user" onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            👤 客服小王 | 退出
          </button>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
