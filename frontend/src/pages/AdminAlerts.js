import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('unresolved'); // 'unresolved' | 'all'

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/fraud/admin/alerts');
      setAlerts(data.data.alerts);
    } catch (err) {
      setError('Failed to load fraud alerts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleResolve = async (alertId) => {
    try {
      await api.patch(`/fraud/admin/alerts/${alertId}/resolve`);
      loadAlerts();
    } catch (err) {
      setError('Failed to resolve alert.');
    }
  };

  const visibleAlerts = filter === 'unresolved' ? alerts.filter((a) => !a.is_resolved) : alerts;

  if (loading) return <div className="page-loading">Loading alerts...</div>;

  return (
    <div className="page">
      <h1>Fraud Alerts (All Users)</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="admin-filter-toggle">
        <button
          className={`btn ${filter === 'unresolved' ? 'btn-primary' : 'btn-link'}`}
          onClick={() => setFilter('unresolved')}
        >
          Unresolved
        </button>
        <button className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-link'}`} onClick={() => setFilter('all')}>
          All
        </button>
      </div>

      {visibleAlerts.length === 0 ? (
        <p className="muted">No alerts to show.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Details</th>
              <th>Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleAlerts.map((a) => (
              <tr key={a.id} className={`severity-row-${a.severity}`}>
                <td>{a.email}</td>
                <td>{a.alert_type}</td>
                <td>{a.severity}</td>
                <td><code>{JSON.stringify(a.details)}</code></td>
                <td>{new Date(a.created_at).toLocaleString()}</td>
                <td>{a.is_resolved ? '✅ Resolved' : '⏳ Open'}</td>
                <td>
                  {!a.is_resolved && (
                    <button className="btn btn-primary btn-small" onClick={() => handleResolve(a.id)}>
                      Mark Resolved
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
