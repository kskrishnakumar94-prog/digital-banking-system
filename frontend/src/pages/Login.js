import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.requires2FA) {
        setChallengeId(data.challengeId);
      } else {
        login(data.data.accessToken, data.data.user);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login/verify-2fa', { challengeId, token: otp });
      login(data.data.accessToken, data.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>🏦 Welcome Back</h2>
        {error && <div className="alert alert-error">{error}</div>}

        {!challengeId ? (
          <form onSubmit={handlePasswordSubmit}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

            <button className="btn btn-primary" disabled={loading} type="submit">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <p>Enter the 6-digit code from your authenticator app.</p>
            <label>2FA Code</label>
            <input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              autoFocus
            />
            <button className="btn btn-primary" disabled={loading} type="submit">
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
