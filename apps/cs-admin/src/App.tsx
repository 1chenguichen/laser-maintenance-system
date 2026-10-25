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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="customers" element={<Customers />} />
          <Route path="engineers" element={<Engineers />} />
          <Route path="devices" element={<Devices />} />
          <Route path="parts" element={<Parts />} />
          <Route path="complaints" element={<Complaints />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
