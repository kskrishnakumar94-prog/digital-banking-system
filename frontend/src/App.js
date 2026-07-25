import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AppLayout from './components/AppLayout';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transfer from './pages/Transfer';
import ScheduledTransfers from './pages/ScheduledTransfers';
import Beneficiaries from './pages/Beneficiaries';
import Security from './pages/Security';
import Profile from './pages/Profile';
import Alerts from './pages/Alerts';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminAlerts from './pages/AdminAlerts';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/transfer" element={<Transfer />} />
            <Route path="/scheduled-transfers" element={<ScheduledTransfers />} />
            <Route path="/beneficiaries" element={<Beneficiaries />} />
            <Route path="/security" element={<Security />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/alerts" element={<Alerts />} />
          </Route>

          <Route
            element={
              <AdminRoute>
                <AppLayout />
              </AdminRoute>
            }
          >
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/alerts" element={<AdminAlerts />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
