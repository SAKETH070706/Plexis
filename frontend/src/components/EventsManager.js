import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { IconPlus } from './icons';
import MapPicker from './MapPicker';
import { isValidPhone } from '../utils/validators';

const EventsManager = ({ autoOpenCreateModal, onCloseAutoModal }) => {
  const [events, setEvents] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEventForAssign, setSelectedEventForAssign] = useState(null);
  const [selectedFreelancerId, setSelectedFreelancerId] = useState('');
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalBodyRef = useRef(null);

  useEffect(() => {
    if (autoOpenCreateModal) {
      setShowCreateModal(true);
      if (onCloseAutoModal) onCloseAutoModal();
    }
  }, [autoOpenCreateModal, onCloseAutoModal]);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    clientName: '',
    clientPhone: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '13:00',
    address: 'HICC Novotel, Hyderabad',
    latitude: 17.4722,
    longitude: 78.3728,
    radius: 150,
    requiredWorkers: 2,
    sessionPay: 1500,
    overtimeRate: 300,
    travelAllowance: 200,
    assignmentMode: 'direct',
    leadId: '',
  });

  useEffect(() => {
    fetchEvents();
    fetchWorkers();
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);


  const fetchEvents = async () => {
    try {
      setLoading(true);
      const query = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.get(`/events${query}`);
      setEvents(res.data.events || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkers = async () => {
    try {
      const res = await api.get('/auth/workers');
      setWorkers(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await api.get('/leads?limit=50');
      setLeads(res.data.leads || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!formData.title || !formData.title.trim()) {
      setModalError('Please enter an event title');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    if (!formData.date) {
      setModalError('Please select an event date');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    if (!formData.startTime) {
      setModalError('Please select a start time');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    if (!formData.endTime) {
      setModalError('Please select an end time');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    if (!formData.address || !formData.address.trim()) {
      setModalError('Please enter a venue address or pin on map');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    if (formData.latitude == null || formData.longitude == null || isNaN(Number(formData.latitude)) || isNaN(Number(formData.longitude))) {
      setModalError('Valid venue latitude and longitude coordinates are required');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    if (formData.clientPhone && formData.clientPhone.trim() !== '') {
      if (!isValidPhone(formData.clientPhone)) {
        setModalError('Please enter a valid 10-digit client phone number (e.g. 9876543210 or +91 9876543210)');
        if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
        return;
      }
    }

    if (Number(formData.requiredWorkers) < 1) {
      setModalError('Required crew members must be at least 1');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    if (Number(formData.sessionPay) < 0) {
      setModalError('Session pay cannot be negative');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    if (Number(formData.overtimeRate) < 0) {
      setModalError('Overtime rate cannot be negative');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    if (Number(formData.travelAllowance) < 0) {
      setModalError('Travel allowance cannot be negative');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        clientName: formData.clientName ? formData.clientName.trim() : '',
        clientPhone: formData.clientPhone ? formData.clientPhone.trim() : '',
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        location: {
          address: formData.address.trim(),
          latitude: Number(formData.latitude),
          longitude: Number(formData.longitude),
          radius: Number(formData.radius) || 150,
        },
        requiredWorkers: Number(formData.requiredWorkers) || 1,
        sessionPay: Number(formData.sessionPay) || 0,
        overtimeRate: Number(formData.overtimeRate) || 0,
        travelAllowance: Number(formData.travelAllowance) || 0,
        assignmentMode: formData.assignmentMode || 'direct',
        leadId: formData.leadId || undefined,
      };

      await api.post('/events', payload);
      setShowCreateModal(false);
      fetchEvents();
    } catch (err) {
      console.error('Create event error:', err);
      const errMsg = err.response?.data?.message || err.message || 'Failed to create event';
      setModalError(errMsg);
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAssignModal = async (event) => {
    try {
      const res = await api.get(`/events/${event._id}`);
      setSelectedEventForAssign(res.data);
      setSelectedFreelancerId('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignWorker = async () => {
    if (!selectedFreelancerId) return;
    try {
      await api.post(`/events/${selectedEventForAssign.event._id}/assign`, {
        freelancerId: selectedFreelancerId,
      });
      // Refresh modal
      handleOpenAssignModal(selectedEventForAssign.event);
      fetchEvents();
    } catch (err) {
      alert(err.response?.data?.message || 'Assignment failed');
    }
  };

  const handleRemoveWorker = async (freelancerId) => {
    if (!window.confirm('Remove this worker from the event?')) return;
    try {
      await api.delete(`/events/${selectedEventForAssign.event._id}/assign/${freelancerId}`);
      handleOpenAssignModal(selectedEventForAssign.event);
      fetchEvents();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove worker');
    }
  };

  const handleReviewApplication = async (assignmentId, action) => {
    try {
      await api.patch(`/events/${selectedEventForAssign.event._id}/applications/${assignmentId}/review`, {
        action,
      });
      handleOpenAssignModal(selectedEventForAssign.event);
      fetchEvents();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to review application');
    }
  };

  const filteredEvents = events.filter((ev) =>
    ev.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ev.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ev.location?.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Events & Crew Scheduling</h1>
          <p>Organize wedding shoots, manage venue geofences, and schedule freelancers</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <IconPlus size={16} />
          <span>New Event</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by event, client, or venue..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '9px 14px',
            borderRadius: '6px',
            border: '1px solid #E2E8F0',
            width: '320px',
            outline: 'none',
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '9px 14px',
            borderRadius: '6px',
            border: '1px solid #E2E8F0',
            outline: 'none',
          }}
        >
          <option value="">All Statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Events Table Card */}
      <div className="table-card">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event / Client</th>
                <th>Date & Shift</th>
                <th>Venue & Geofence</th>
                <th>Staffing Progress</th>
                <th>Rates (INR)</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                    {loading ? 'Loading events...' : 'No events found.'}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev) => (
                  <tr key={ev._id}>
                    <td>
                      <strong style={{ color: '#0F172A', display: 'block' }}>{ev.title}</strong>
                      {ev.clientName && (
                        <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                          Client: {ev.clientName} ({ev.clientPhone || 'No phone'})
                        </span>
                      )}
                    </td>
                    <td>
                      <div>{new Date(ev.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        {ev.startTime} - {ev.endTime}
                      </span>
                    </td>
                    <td>
                      <div style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        📍 {ev.location?.address}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#6D28D9', fontWeight: 600 }}>
                        Radius: {ev.location?.radius || 150}m
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${ev.assignedCount >= ev.requiredWorkers ? 'badge-verified' : 'badge-open'}`}>
                        {ev.assignedCount || 0} / {ev.requiredWorkers} Crew
                      </span>
                    </td>
                    <td>
                      <div>₹{ev.sessionPay}</div>
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        OT: ₹{ev.overtimeRate}/h | Trv: ₹{ev.travelAllowance}
                      </span>
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize', fontSize: '0.82rem', fontWeight: 500 }}>
                        {ev.assignmentMode}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${ev.status}`}>{ev.status}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenAssignModal(ev)}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        Manage Crew &rarr;
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE EVENT MODAL */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3>Create Event & Venue Geofence</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                &times;
              </button>
            </div>
            <form noValidate onSubmit={handleCreateSubmit}>
              <div className="modal-body" ref={modalBodyRef}>
                {modalError && <div className="auth-alert">{modalError}</div>}

                <div className="form-group">
                  <label>Event Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul & Priya Wedding Reception"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Client Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={formData.clientName}
                      onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Client Phone</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 9876543210"
                      value={formData.clientPhone}
                      onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Optional Lead Linkage */}
                {leads.length > 0 && (
                  <div className="form-group">
                    <label>Link from CRM Lead (Optional)</label>
                    <select
                      value={formData.leadId}
                      onChange={(e) => {
                        const selLead = leads.find((l) => l._id === e.target.value);
                        let leadAddress = formData.address;
                        let leadLat = formData.latitude;
                        let leadLng = formData.longitude;
                        if (selLead?.location) {
                          if (selLead.location.address) leadAddress = selLead.location.address;
                          else if (selLead.location.city) leadAddress = selLead.location.city;
                          if (selLead.location.latitude != null) leadLat = selLead.location.latitude;
                          if (selLead.location.longitude != null) leadLng = selLead.location.longitude;
                        }
                        setFormData({
                          ...formData,
                          leadId: e.target.value,
                          clientName: selLead ? selLead.name : formData.clientName,
                          clientPhone: selLead ? selLead.phone : formData.clientPhone,
                          address: leadAddress,
                          latitude: leadLat,
                          longitude: leadLng,
                        });
                      }}
                    >
                      <option value="">-- No Lead Linked --</option>
                      {leads.map((l) => (
                        <option key={l._id} value={l._id}>
                          {l.name} ({l.phone || l.email}){l.location?.city ? ` • ${l.location.city}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label>Event Date *</label>
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Start Time *</label>
                    <input
                      type="time"
                      required
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>End Time *</label>
                    <input
                      type="time"
                      required
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    />
                  </div>
                </div>

                {/* Venue & Geofencing Parameters with Map Picker */}
                <div className="form-group">
                  <label>Venue Name / Address *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HICC Novotel, Madhapur, Hyderabad"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Venue Geofence & Location Selector</label>
                  <MapPicker
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    radius={formData.radius}
                    address={formData.address}
                    onLocationChange={({ latitude, longitude, radius, address }) => {
                      setFormData((prev) => ({
                        ...prev,
                        latitude,
                        longitude,
                        radius,
                        address: address || prev.address,
                      }));
                    }}
                  />
                </div>

                {/* Financial Rates */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Required Crew *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={formData.requiredWorkers}
                      onChange={(e) => setFormData({ ...formData, requiredWorkers: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Session Pay (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.sessionPay}
                      onChange={(e) => setFormData({ ...formData, sessionPay: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>OT Hourly Rate (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.overtimeRate}
                      onChange={(e) => setFormData({ ...formData, overtimeRate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Travel Allowance (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.travelAllowance}
                      onChange={(e) => setFormData({ ...formData, travelAllowance: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Assignment Mode</label>
                  <select
                    value={formData.assignmentMode}
                    onChange={(e) => setFormData({ ...formData, assignmentMode: e.target.value })}
                  >
                    <option value="direct">Direct Assignment (Admin picks workers)</option>
                    <option value="open">Open Shift (Freelancers can apply)</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                {modalError && (
                  <div className="auth-alert" style={{ margin: 0, padding: '10px 14px', fontSize: '0.86rem', textAlign: 'left' }}>
                    ⚠️ {modalError}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCreateModal(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting}
                    style={{ minWidth: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {isSubmitting ? 'Creating Event...' : 'Create Event'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGNMENT MANAGEMENT MODAL */}
      {selectedEventForAssign && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div>
                <h3>{selectedEventForAssign.event.title}</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  Staffing: {selectedEventForAssign.assignedCount} / {selectedEventForAssign.event.requiredWorkers} Workers
                </span>
              </div>
              <button className="modal-close" onClick={() => setSelectedEventForAssign(null)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              {/* Direct Assign Control */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: '8px' }}>
                  Assign Freelancer to Event
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select
                    value={selectedFreelancerId}
                    onChange={(e) => setSelectedFreelancerId(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  >
                    <option value="">-- Select Freelancer --</option>
                    {workers.map((w) => (
                      <option key={w._id} value={w._id}>
                        {w.name} ({w.email})
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleAssignWorker}
                    disabled={!selectedFreelancerId || selectedEventForAssign.isFull}
                  >
                    + Assign
                  </button>
                </div>
                {selectedEventForAssign.isFull && (
                  <span style={{ fontSize: '0.75rem', color: '#D97706', marginTop: '4px', display: 'block' }}>
                    ⚠️ All required slots are filled for this event.
                  </span>
                )}
              </div>

              {/* Assigned Workers List */}
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px', color: '#0F172A' }}>
                  Assigned Crew & Applicants
                </h4>
                {selectedEventForAssign.assignments.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#94A3B8' }}>No workers assigned yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedEventForAssign.assignments.map((as) => (
                      <div
                        key={as._id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '6px',
                          border: '1px solid #E2E8F0',
                          background: '#fff',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>
                            {as.freelancerId?.name}
                          </strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            {as.freelancerId?.phone || as.freelancerId?.email}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className={`badge badge-${as.status}`}>{as.status}</span>

                          {as.status === 'applied' && (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleReviewApplication(as._id, 'accept')}
                              >
                                Accept
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleReviewApplication(as._id, 'decline')}
                              >
                                Decline
                              </button>
                            </>
                          )}

                          {['assigned', 'accepted'].includes(as.status) && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleRemoveWorker(as.freelancerId._id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedEventForAssign(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsManager;
