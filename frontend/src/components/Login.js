import React, { useState } from 'react';
import api from '../api';
import { isValidEmail } from '../utils/validators';

const Login = ({ onLogin, onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studioCode, setStudioCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const payload = { email, password };
      if (studioCode.trim()) {
        payload.studioCode = studioCode.trim().toUpperCase();
      }
      const res = await api.post('/auth/login', payload);
      const { token, user } = res.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      onLogin(token, user);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img
            src="https://plexis.in/assets/logo-CkLfEC-X.png"
            alt="Plexis Logo"
            className="brand-logo-img"
          />
          <h2>PLEXIS</h2>
        </div>

        <div className="auth-title">
          <h3>Welcome back</h3>
          <p>Sign in to your event workforce management dashboard</p>
        </div>

        {error && <div className="auth-alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Work Email</label>
            <input
              type="email"
              required
              placeholder="you@studio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>Studio Code / Org ID</label>
              <span style={{ fontSize: '0.74rem', color: '#64748B' }}>Optional</span>
            </div>
            <input
              type="text"
              placeholder="e.g. STU-7K9A (for crew or multi-studio login)"
              value={studioCode}
              onChange={(e) => setStudioCode(e.target.value)}
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: '20px', fontSize: '0.85rem', color: '#64748B', textAlign: 'center' }}>
          Don't have an account?{' '}
          <button
            onClick={onSwitchToRegister}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Register here
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
