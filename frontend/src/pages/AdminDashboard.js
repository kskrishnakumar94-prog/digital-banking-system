import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, alertsRes] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/fraud/admin/alerts'),
        ]);
        setStats(statsRes.data.data.stats);
        setAlerts(alertsRes.data.data.alerts.slice(0, 8));
      } catch (err) {
        setError('Failed to load admin dashboard.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="page-loading">Loading admin dashboard...</div>;

  return (
    <div className="page">
      <h1>Admin Dashboard</h1>
      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total Users</span>
            <span className="stat-value">{stats.totalUsers}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total Accounts</span>
            <span className="stat-value">{stats.totalAccounts}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total Balance (System)</span>
            <span className="stat-value">{Number(stats.totalBalance).toLocaleString()}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Transfers Today</span>
            <span className="stat-value">{stats.transfersToday}</span>
          </div>
          <div className="stat-card stat-card-warn">
            <span className="stat-label">Unresolved Alerts</span>
            <span className="stat-value">{stats.unresolvedAlerts}</span>
          </div>
          <div className="stat-card stat-card-warn">
            <span className="stat-label">Currently Locked Accounts</span>
            <span className="stat-value">{stats.currentlyLockedAccounts}</span>
          </div>
        </div>
      )}

      <div className="admin-section-header">
        <h3>Recent Fraud Alerts</h3>
        <Link to="/admin/alerts">View all →</Link>
      </div>
      {alerts.length === 0 ? (
        <p className="muted">No fraud alerts recorded.</p>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.id} className={`severity-${a.severity}`}>
              <strong>{a.alert_type}</strong> — {a.email} — {a.severity} —{' '}
              {new Date(a.created_at).toLocaleString()} {a.is_resolved ? '(resolved)' : ''}
            </li>
          ))}
        </ul>
      )}

      <div className="admin-section-header">
        <h3>Quick Links</h3>
      </div>
      <div className="admin-quicklinks">
        <Link to="/admin/users" className="btn btn-primary">Manage Users</Link>
        <Link to="/admin/alerts" className="btn btn-primary">Manage Alerts</Link>
      </div>
    </div>
  );
}
