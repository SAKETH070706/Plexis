import React, { useState } from 'react';
import api from '../api';
import { isValidEmail, isValidPhone } from '../utils/validators';

const AddLead = ({ fetchLeads, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    source: 'Website',
    city: '',
    address: '',
    latitude: '',
    longitude: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      setError('Please enter client name (minimum 2 characters)');
      return;
    }

    if (!isValidEmail(formData.email)) {
      setError('Please enter a valid email address (e.g. client@domain.com)');
      return;
    }

    if (formData.phone && formData.phone.trim() !== '' && !isValidPhone(formData.phone)) {
      setError('Please enter a valid 10-digit phone number (e.g. 9876543210 or +91 9876543210)');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        source: formData.source,
        location: {
          city: formData.city,
          address: formData.address,
          latitude: formData.latitude ? Number(formData.latitude) : undefined,
          longitude: formData.longitude ? Number(formData.longitude) : undefined,
        },
      };

      await api.post('/leads', payload);
      if (fetchLeads) {
        fetchLeads();
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <h3>Add New Client Lead</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-alert">{error}</div>}

            <div className="form-row">
              <div className="form-group">
                <label>Client Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Ananya & Karthik"
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="client@gmail.com"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 9876543210"
                />
              </div>
              <div className="form-group">
                <label>Inquiry Source</label>
                <select name="source" value={formData.source} onChange={handleChange}>
                  <option value="Website">Website</option>
                  <option value="Referral">Referral / Word of mouth</option>
                  <option value="Social Media">Instagram / Social Media</option>
                  <option value="WedMeGood">WedMeGood / WeddingWire</option>
                  <option value="Cold Call">Direct Call / Walk-in</option>
                  <option value="Email">Email</option>
                </select>
              </div>
            </div>

            {/* Location & Venue Data */}
            <div style={{ marginTop: '4px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>
                📍 Client Event Location
              </span>
              <div className="form-row">
                <div className="form-group">
                  <label>City</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="e.g. Hyderabad, Goa, Jaipur"
                  />
                </div>
                <div className="form-group">
                  <label>Tentative Venue / Address</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="e.g. Taj Falaknuma Palace"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Venue Latitude (Optional)</label>
                  <input
                    type="number"
                    step="any"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleChange}
                    placeholder="e.g. 17.3314"
                  />
                </div>
                <div className="form-group">
                  <label>Venue Longitude (Optional)</label>
                  <input
                    type="number"
                    step="any"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleChange}
                    placeholder="e.g. 78.4674"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating Lead...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLead;
