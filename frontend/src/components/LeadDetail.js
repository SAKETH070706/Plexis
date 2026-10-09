import React, { useState } from 'react';
import api from '../api';
import { isValidEmail, isValidPhone } from '../utils/validators';

const LeadDetail = ({ lead, fetchLeads, onClose, user }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState('');
  const [editData, setEditData] = useState({
    name: lead.name,
    email: lead.email,
    phone: lead.phone || '',
    source: lead.source,
    status: lead.status,
    city: lead.location?.city || '',
    address: lead.location?.address || '',
    latitude: lead.location?.latitude != null ? lead.location.latitude : '',
    longitude: lead.location?.longitude != null ? lead.location.longitude : '',
  });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEditChange = (e) => {
    setEditData({ ...editData, [e.target.name]: e.target.value });
  };

  const handleSaveEdit = async (e) => {
    e?.preventDefault();
    setEditError('');

    if (!editData.name.trim() || editData.name.trim().length < 2) {
      setEditError('Client name must be at least 2 characters');
      return;
    }
    if (!isValidEmail(editData.email)) {
      setEditError('Please enter a valid email address');
      return;
    }
    if (editData.phone && editData.phone.trim() !== '' && !isValidPhone(editData.phone)) {
      setEditError('Please enter a valid 10-digit phone number (e.g. 9876543210 or +91 9876543210)');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/leads/${lead._id}`, {
        name: editData.name,
        email: editData.email,
        phone: editData.phone,
        source: editData.source,
        status: editData.status,
        location: {
          city: editData.city,
          address: editData.address,
          latitude: editData.latitude ? Number(editData.latitude) : undefined,
          longitude: editData.longitude ? Number(editData.longitude) : undefined,
        },
      });
      setIsEditing(false);
      if (fetchLeads) fetchLeads();
    } catch (err) {
      console.error(err);
      setEditError(err.response?.data?.message || 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await api.put(`/leads/${lead._id}`, { status: newStatus });
      if (fetchLeads) fetchLeads();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    try {
      await api.post(`/leads/${lead._id}/notes`, { text: note.trim() });
      setNote('');
      if (fetchLeads) fetchLeads();
    } catch (err) {
      console.error(err);
    }
  };

  const canEdit = user?.role === 'admin' || lead.userId?._id?.toString() === user?.id?.toString();

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>{lead.name}</h3>
            <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
              Inquiry Source: {lead.source} • Created {new Date(lead.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {canEdit && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? 'Cancel Edit' : 'Edit Lead'}
              </button>
            )}
            <button type="button" className="modal-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="modal-body">
          {isEditing ? (
            <form onSubmit={handleSaveEdit}>
              {editError && <div className="auth-alert" style={{ marginBottom: '14px' }}>{editError}</div>}
              <div className="form-row">
                <div className="form-group">
                  <label>Client Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={editData.name}
                    onChange={handleEditChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={editData.email}
                    onChange={handleEditChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={editData.phone}
                    onChange={handleEditChange}
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select name="status" value={editData.status} onChange={handleEditChange}>
                    <option value="new">New Inquiry</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>
                  📍 Event Location
                </span>
                <div className="form-row">
                  <div className="form-group">
                    <label>City</label>
                    <input
                      type="text"
                      name="city"
                      value={editData.city}
                      onChange={handleEditChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Venue Address</label>
                    <input
                      type="text"
                      name="address"
                      value={editData.address}
                      onChange={handleEditChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Latitude</label>
                    <input
                      type="number"
                      step="any"
                      name="latitude"
                      value={editData.latitude}
                      onChange={handleEditChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Longitude</label>
                    <input
                      type="number"
                      step="any"
                      name="longitude"
                      value={editData.longitude}
                      onChange={handleEditChange}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Lead Info Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  background: '#F8FAFC',
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748B', display: 'block' }}>EMAIL</span>
                  <strong style={{ fontSize: '0.88rem' }}>{lead.email}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748B', display: 'block' }}>PHONE</span>
                  <strong style={{ fontSize: '0.88rem' }}>{lead.phone || 'N/A'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748B', display: 'block' }}>EVENT LOCATION</span>
                  <strong style={{ fontSize: '0.88rem' }}>
                    {lead.location?.city || lead.location?.address
                      ? `📍 ${lead.location?.city || ''} ${lead.location?.address ? `(${lead.location.address})` : ''}`
                      : 'Not specified'}
                  </strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748B', display: 'block' }}>STATUS</span>
                  <select
                    value={lead.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={!canEdit}
                    style={{ marginTop: '4px', padding: '4px 8px', fontSize: '0.82rem' }}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                  </select>
                </div>
              </div>

              {/* Notes Timeline */}
              <div style={{ marginTop: '12px' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-main)' }}>
                  Interaction Notes ({lead.notes?.length || 0})
                </h4>

                <div
                  style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginBottom: '12px',
                  }}
                >
                  {lead.notes && lead.notes.length > 0 ? (
                    lead.notes.map((n, index) => (
                      <div
                        key={index}
                        style={{
                          background: '#fff',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '8px 12px',
                        }}
                      >
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{n.text}</div>
                        <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>
                          {new Date(n.date).toLocaleString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontStyle: 'italic' }}>
                      No interaction notes recorded yet.
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add an update note (e.g. Sent wedding quote on WhatsApp)..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddNote();
                        }
                      }}
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleAddNote}
                      disabled={!note.trim()}
                    >
                      Add Note
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeadDetail;