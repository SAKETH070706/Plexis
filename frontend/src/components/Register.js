import React, { useState } from 'react';
import api from '../api';

import { isValidEmail, isValidPhone } from '../utils/validators';

const Register = ({ onRegister, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin',
    organizationName: '',
    studioCode: '',
    eventCode: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      setError('Please enter your full name (minimum 2 characters)');
      return;
    }

    if (!isValidEmail(formData.email)) {
      setError('Please enter a valid work email address (e.g. name@domain.com)');
      return;
    }

    if (formData.phone && formData.phone.trim() !== '' && !isValidPhone(formData.phone)) {
      setError('Please enter a valid 10-digit phone number (e.g. 9876543210 or +91 9876543210)');
      return;
    }

    if (!formData.password || formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: formData.role,
        phone: formData.phone.trim(),
      };

      if (formData.role === 'admin') {
        payload.organizationName = formData.organizationName?.trim() || '';
        if (formData.studioCode?.trim()) payload.studioCode = formData.studioCode.trim().toUpperCase();
      } else if (formData.role === 'freelancer') {
        if (formData.eventCode?.trim()) payload.eventCode = formData.eventCode.trim().toUpperCase();
        if (formData.studioCode?.trim()) payload.studioCode = formData.studioCode.trim().toUpperCase();
      }

      const res = await api.post('/auth/register', payload);
      const { token, user } = res.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      onRegister(token, user);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
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
          <h3>Create an account</h3>
          <p>Get started with event workforce and crew management</p>
        </div>

        {error && <div className="auth-alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label>Full Name</label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Rahul Sharma"
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label>Work Email</label>
            <input
              type="email"
              name="email"
              required
              placeholder="you@studio.com"
              value={formData.email}
              onChange={handleChange}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label>Phone Number</label>
            <input
              type="text"
              name="phone"
              placeholder="+91 9876543210"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label>Password</label>
            <input
              type="password"
              name="password"
              required
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label>Account Role</label>
            <select name="role" value={formData.role} onChange={handleChange}>
              <option value="admin">Studio Owner / Admin</option>
              <option value="freelancer">Event Freelancer / Crew</option>
            </select>
          </div>

          {formData.role === 'admin' && (
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Studio / Agency Name</label>
              <input
                type="text"
                name="organizationName"
                placeholder="e.g. Royal Lens Wedding Studios"
                value={formData.organizationName}
                onChange={handleChange}
              />
            </div>
          )}

          {formData.role === 'freelancer' && (
            <>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Have an Event Code? (Optional)</label>
                <input
                  type="text"
                  name="eventCode"
                  placeholder="e.g. EVT-8K2"
                  value={formData.eventCode}
                  onChange={(e) => setFormData({ ...formData, eventCode: e.target.value.toUpperCase() })}
                  style={{ textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}
                />
                <small style={{ color: '#64748B', fontSize: '0.78rem', marginTop: '4px', display: 'block' }}>
                  Received an invite on WhatsApp? Enter the code to auto-join the gig immediately upon registration!
                </small>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label>Studio Code (Optional)</label>
                <input
                  type="text"
                  name="studioCode"
                  placeholder="e.g. STU-7K9A"
                  value={formData.studioCode}
                  onChange={(e) => setFormData({ ...formData, studioCode: e.target.value.toUpperCase() })}
                  style={{ textTransform: 'uppercase', letterSpacing: '1px' }}
                />
                <small style={{ color: '#64748B', fontSize: '0.78rem', marginTop: '4px', display: 'block' }}>
                  Leave blank if you work as an independent contractor across multiple studios.
                </small>
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ marginTop: '20px', fontSize: '0.85rem', color: '#64748B', textAlign: 'center' }}>
          Already have an account?{' '}
          <button
            onClick={onSwitchToLogin}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign in here
          </button>
        </p>
      </div>
    </div>
  );
};

export default Register;
