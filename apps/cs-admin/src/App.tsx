import IoTDashboard from './features/iot/IoTDashboard';
import ServiceNetwork from './pages/ServiceNetworkPage';
import {CompanyProvider} from './components/CompanyBrand';
import CompanySettings from './pages/CompanySettings';
import {WorkspaceFeedback} from './components/WorkspaceFeedback';
import {AdminAppearance} from './components/AdminAppearance';
import WarehouseCenter from './pages/WarehouseCenter';
import Contracts from './pages/Contracts';
import Finance from './pages/Finance';
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Customers from './pages/Customers';
import Engineers from './pages/Engineers';
import Devices from './pages/Devices';
import Parts from './pages/Parts';
import Complaints from './pages/Complaints';
import ServiceDesk from './pages/ServiceDesk';
import Login from './pages/Login';
import { getToken } from './api';
import './index.css';
import './components/design-system.css';
import './components/admin-themes.css';
import './components/admin-motion.css';
import './components/admin-controls.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AdminAppearance><WorkspaceFeedback><BrowserRouter><CompanyProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/service-desk"
          element={
            <ProtectedRoute>
              <ServiceDesk />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="service-network" element={<ServiceNetwork />} />
          <Route path="company" element={<CompanySettings />} />
          <Route path="customers" element={<Customers />} />
          <Route path="engineers" element={<Engineers />} />
          <Route path="devices" element={<Devices />} />
          <Route path="iot" element={<IoTDashboard />} />
          <Route path="warehouse" element={<WarehouseCenter />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="finance" element={<Finance />} />
          <Route path="parts" element={<Parts />} />
          <Route path="complaints" element={<Complaints />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </CompanyProvider></BrowserRouter></WorkspaceFeedback></AdminAppearance>
  );
}
