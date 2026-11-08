import {CompanyBrand,useCompany} from './CompanyBrand';
import WorkspaceScroll from './WorkspaceScroll';
import {ThemeSwitcher} from './AdminAppearance';
import { DashboardOutlined, UnorderedListOutlined, TeamOutlined, UserSwitchOutlined, DesktopOutlined, ToolOutlined, InboxOutlined, FileTextOutlined, CreditCardOutlined, FormOutlined, MessageOutlined, UserOutlined, SettingOutlined } from '@ant-design/icons';
import './workspace-design.css';
import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api';

const NAV_ITEMS = [
  { path: '/', label: '仪表盘', icon: <DashboardOutlined /> },
  { path: '/orders', label: '工单管理', icon: <UnorderedListOutlined /> },
  { path: '/customers', label: '客户管理', icon: <TeamOutlined /> },
  { path: '/engineers', label: '工程师管理', icon: <UserSwitchOutlined /> },
  { path: '/devices', label: '设备管理', icon: <DesktopOutlined /> },
  { path: '/iot', label: '设备监控', icon: <DesktopOutlined /> },
  { path: '/parts', label: '配件库存', icon: <ToolOutlined /> },
  { path: '/warehouse', label: '仓储与移动仓', icon: <InboxOutlined /> },
  { path: '/contracts', label: '服务合同', icon: <FileTextOutlined /> },
  { path: '/finance', label: '结算与发票', icon: <CreditCardOutlined /> },
  { path: '/complaints', label: '投诉管理', icon: <FormOutlined /> },
  { path: '/service-network', label: '平台服务协作', icon: <TeamOutlined /> },
  { path: '/company', label: '企业资料', icon: <SettingOutlined /> },
  { path: '/service-desk', label: '客服工作台', icon: <MessageOutlined /> },
];

export default function Layout() {
  const {company}=useCompany();
  const enterprise=company?.name||'企业工作台';
  let accountName='企业管理员';try{accountName=JSON.parse(sessionStorage.getItem('cs_admin_user')||'{}').name||accountName}catch{}
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <WorkspaceScroll />
      <aside className="sidebar">
        <div className="logo company-sidebar-logo"><CompanyBrand /></div>
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
        <div className="company-sidebar-footer">激光维保 · 企业服务平台<br/>当前企业独立业务空间</div>
      </aside>
      <main className="main">
        <header className="header">
          <span className="header-title">
            {NAV_ITEMS.find((i) => isActive(i.path))?.label || ''}
          </span>
          <div className="admin-header-actions"><ThemeSwitcher /><Link to="/company" className="header-company" title={enterprise}>{enterprise}</Link>
          <button className="header-user" onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <UserOutlined /> {accountName} · 退出
          </button></div>
        </header>
        <div className="content admin-page-transition" key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
