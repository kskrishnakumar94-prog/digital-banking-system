import React, { useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Security() {
  const { user, setUser } = useAuth();
  const [qrCode, setQrCode] = useState(null);
  const [manualKey, setManualKey] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const startSetup = async () => {
    setError('');
    try {
      const { data } = await api.post('/auth/2fa/setup');
      setQrCode(data.data.qrCode);
      setManualKey(data.data.manualEntryKey);
    } catch (err) {
      setError('Failed to start 2FA setup.');
    }
  };

  const confirmSetup = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/2fa/confirm', { token: otp });
      setMessage('2FA enabled successfully!');
      setQrCode(null);
      setUser((u) => ({ ...u, is_2fa_enabled: true }));
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code.');
    }
  };

  const disable2FA = async () => {
    await api.post('/auth/2fa/disable');
    setMessage('2FA disabled.');
    setUser((u) => ({ ...u, is_2fa_enabled: false }));
  };

  return (
    <div className="page">
      <h1>Security Settings</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="form-card">
        <h3>Two-Factor Authentication (2FA)</h3>
        <p>Status: <strong>{user?.is_2fa_enabled ? 'Enabled ✅' : 'Disabled'}</strong></p>

        {!user?.is_2fa_enabled && !qrCode && (
          <button className="btn btn-primary" onClick={startSetup}>Enable 2FA</button>
        )}

        {qrCode && (
          <div>
            <p>Scan this QR code with Google Authenticator / Authy:</p>
            <img src={qrCode} alt="2FA QR Code" style={{ maxWidth: 220 }} />
            <p>Or enter manually: <code>{manualKey}</code></p>
            <form onSubmit={confirmSetup}>
              <label>Enter the 6-digit code to confirm</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} required />
              <button className="btn btn-primary" type="submit">Confirm & Enable</button>
            </form>
          </div>
        )}

        {user?.is_2fa_enabled && (
          <button className="btn btn-danger" onClick={disable2FA}>Disable 2FA</button>
        )}
      </div>
    </div>
  );
}
