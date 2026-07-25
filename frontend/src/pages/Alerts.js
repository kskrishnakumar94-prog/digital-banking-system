import React, { useEffect, useState } from 'react';
import api from '../services/api';

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [alertsRes, attemptsRes] = await Promise.all([
        api.get('/fraud/my-alerts'),
        api.get('/fraud/login-attempts'),
      ]);
      setAlerts(alertsRes.data.data.alerts);
      setAttempts(attemptsRes.data.data.attempts);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div className="page">
      <h1>Security &amp; Fraud Alerts</h1>

      <h3>Fraud Alerts</h3>
      {alerts.length === 0 ? (
        <p className="muted">No alerts on your account.</p>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.id} className={`severity-${a.severity}`}>
              <strong>{a.alert_type}</strong> — {a.severity} — {new Date(a.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      )}

      <h3>Recent Login Attempts</h3>
      <table className="table">
        <thead>
          <tr><th>Time</th><th>Success</th><th>Reason</th><th>IP</th></tr>
        </thead>
        <tbody>
          {attempts.map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.created_at).toLocaleString()}</td>
              <td>{a.success ? '✅' : '❌'}</td>
              <td>{a.reason || '-'}</td>
              <td>{a.ip_address}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
