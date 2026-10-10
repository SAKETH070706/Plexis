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

  // Initial Form State
  const initialFormState = {
    title: '',
    clientName: '',
    clientPhone: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '13:00',
    address: '',
    latitude: 17.4722,
    longitude: 78.3728,
    radius: 150,
    requiredWorkers: 2,
    sessionPay: 1500,
    overtimeRate: 0,
    travelAllowance: 0,
    assignmentMode: 'direct',
    attendancePolicy: 'admin_managed',
    attendanceTracking: true,
    leadId: '',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [showOvertimeSection, setShowOvertimeSection] = useState(false);
  const [createdEventModal, setCreatedEventModal] = useState(null);

  const [copiedCode, setCopiedCode] = useState('');

  const copyEventCode = (code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const handleShareWhatsApp = (ev) => {
    const formattedDate = new Date(ev.date).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const venue = ev.location?.address || 'Venue TBD';
    const pay = ev.sessionPay ? `₹${ev.sessionPay}` : 'Competitive';
    const text = `📸 You're invited to shoot at *${ev.title}* on *${formattedDate}* (${ev.startTime} - ${ev.endTime}). Venue: ${venue}. Pay: ${pay}. Open Plexis and enter code *${ev.eventCode || ''}* to accept!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  useEffect(() => {
    fetchEvents();
    fetchWorkers();
    fetchLeads();

    const handleGigJoined = () => {
      fetchEvents();
      if (selectedEventForAssign?.event?._id) {
        handleOpenAssignModal(selectedEventForAssign.event);
      }
    };

    window.addEventListener('gig:joined', handleGigJoined);
    window.addEventListener('attendance:update', handleGigJoined);

    return () => {
      window.removeEventListener('gig:joined', handleGigJoined);
      window.removeEventListener('attendance:update', handleGigJoined);
    };
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
      setModalError('Please enter a venue name or address');
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
      return;
    }

    const isStrictGps = formData.attendancePolicy === 'strict_geofence';
    if (isStrictGps) {
      if (formData.latitude == null || formData.longitude == null || isNaN(Number(formData.latitude)) || isNaN(Number(formData.longitude))) {
        setModalError('Valid venue latitude and longitude coordinates are required for GPS geofencing');
        if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
        return;
      }
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
          latitude: Number(formData.latitude) || 17.4722,
          longitude: Number(formData.longitude) || 78.3728,
          radius: Number(formData.radius) || 150,
        },
        requiredWorkers: Number(formData.requiredWorkers) || 1,
        sessionPay: Number(formData.sessionPay) || 0,
        overtimeRate: Number(formData.overtimeRate) || 0,
        travelAllowance: Number(formData.travelAllowance) || 0,
        assignmentMode: 'direct',
        attendancePolicy: formData.attendancePolicy || 'admin_managed',
        attendanceTracking: formData.attendancePolicy !== 'none',
        leadId: formData.leadId || undefined,
      };

      const res = await api.post('/events', payload);
      setShowCreateModal(false);
      setFormData(initialFormState);
      setShowOvertimeSection(false);
      fetchEvents();

      if (res.data?.event) {
        setCreatedEventModal(res.data.event);
      }
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
      const [eventRes, attRes] = await Promise.all([
        api.get(`/events/${event._id}`),
        api.get(`/attendance?eventId=${event._id}&limit=50`),
      ]);
      const eventData = eventRes.data;
      eventData.attendanceRecords = attRes.data.attendance || [];
      setSelectedEventForAssign(eventData);
      setSelectedFreelancerId('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminCheckin = async (freelancerId) => {
    try {
      await api.post('/attendance/admin-checkin', {
        eventId: selectedEventForAssign.event._id,
        freelancerId,
      });
      handleOpenAssignModal(selectedEventForAssign.event);
      fetchEvents();
    } catch (err) {
      alert(err.response?.data?.message || 'Check-in failed');
    }
  };

  const handleAdminCheckout = async (freelancerId) => {
    try {
      await api.post('/attendance/admin-checkout', {
        eventId: selectedEventForAssign.event._id,
        freelancerId,
      });
      handleOpenAssignModal(selectedEventForAssign.event);
      fetchEvents();
    } catch (err) {
      alert(err.response?.data?.message || 'Check-out failed');
    }
  };

  const handleAdminCompleteAll = async () => {
    if (!window.confirm('Mark all confirmed crew members present, completed, and queue their payouts?')) return;
    try {
      const res = await api.post('/attendance/admin-complete-all', {
        eventId: selectedEventForAssign.event._id,
      });
      alert(res.data.message || 'Entire crew marked completed!');
      handleOpenAssignModal(selectedEventForAssign.event);
      fetchEvents();
    } catch (err) {
      alert(err.response?.data?.message || 'Batch completion failed');
    }
  };

  const handleAdminMarkAbsent = async (freelancerId) => {
    if (!window.confirm('Mark this worker absent and release their shift slot?')) return;
    try {
      await api.post('/attendance/admin-mark-absent', {
        eventId: selectedEventForAssign.event._id,
        freelancerId,
      });
      handleOpenAssignModal(selectedEventForAssign.event);
      fetchEvents();
    } catch (err) {
      alert(err.response?.data?.message || 'Mark absent failed');
    }
  };

  const handleAssignWorker = async (freelancerIdToAssign = null) => {
    const fId = freelancerIdToAssign || selectedFreelancerId;
    if (!fId) return;
    try {
      await api.post(`/events/${selectedEventForAssign.event._id}/assign`, {
        freelancerId: fId,
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
                        <strong style={{ color: '#0F172A' }}>{ev.title}</strong>
                        {ev.eventCode && (
                          <span
                            className="badge"
                            onClick={() => copyEventCode(ev.eventCode)}
                            style={{
                              background: '#EEF2FF',
                              color: '#4F46E5',
                              border: '1px solid #C7D2FE',
                              cursor: 'pointer',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              letterSpacing: '0.5px',
                              padding: '2px 6px',
                            }}
                            title="Click to copy 6-character event code"
                          >
                            🎟️ {ev.eventCode} {copiedCode === ev.eventCode ? '✓' : ''}
                          </span>
                        )}
                      </div>
                      {ev.clientName && (
                        <span style={{ fontSize: '0.78rem', color: '#64748B', display: 'block' }}>
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
                      {ev.attendanceTracking !== false ? (
                        <span style={{ fontSize: '0.75rem', color: '#6D28D9', fontWeight: 600 }}>
                          Radius: {ev.location?.radius || 150}m (GPS Active)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                          🟢 Flat Pay (No GPS)
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${ev.assignedCount >= ev.requiredWorkers ? 'badge-verified' : 'badge-open'}`}>
                        {ev.assignedCount || 0} / {ev.requiredWorkers} Crew
                      </span>
                      {ev.waitlistCount > 0 && (
                        <span className="badge badge-alert" style={{ marginLeft: '4px' }}>
                          +{ev.waitlistCount} Waitlisted
                        </span>
                      )}
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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenAssignModal(ev)}
                        >
                          Manage Crew &rarr;
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{
                            background: '#25D366',
                            color: '#fff',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleShareWhatsApp(ev)}
                          title="Share event invite on WhatsApp"
                        >
                          <span>💬</span> Invite
                        </button>
                      </div>
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
              <div>
                <h3 style={{ margin: 0 }}>Create Event & Generate Code</h3>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Fast setup with instant WhatsApp crew intake
                </span>
              </div>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                &times;
              </button>
            </div>
            <form noValidate onSubmit={handleCreateSubmit}>
              <div className="modal-body" ref={modalBodyRef}>
                {modalError && <div className="auth-alert">{modalError}</div>}

                {/* ─── SECTION 1: CORE GIG DETAILS ─── */}
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
                </div>

                {/* Venue Selection via Places API & Interactive Map */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📍</span> Venue Location (Search Places API or Pick on Map) *
                  </label>
                  <MapPicker
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    radius={formData.radius}
                    address={formData.address}
                    showGeofenceControls={formData.attendancePolicy === 'strict_geofence'}
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

                {/* Client Info (Compact Row) */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Client Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={formData.clientName}
                      onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Client Phone (Optional)</label>
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
                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748B' }}>Link from CRM Lead (Optional)</label>
                    <select
                      value={formData.leadId}
                      style={{ fontSize: '0.84rem' }}
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

                {/* Collapsible Overtime & Travel Allowance */}
                <div style={{ marginBottom: '18px' }}>
                  <button
                    type="button"
                    onClick={() => setShowOvertimeSection(!showOvertimeSection)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4F46E5',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '4px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>{showOvertimeSection ? '▾' : '▸'}</span>
                    {showOvertimeSection ? 'Hide Overtime & Travel Allowance' : '+ Add Overtime & Travel Allowance (Optional)'}
                  </button>

                  {showOvertimeSection && (
                    <div className="form-row" style={{ marginTop: '10px', background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>OT Hourly Rate (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.overtimeRate}
                          onChange={(e) => setFormData({ ...formData, overtimeRate: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Travel Allowance (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.travelAllowance}
                          onChange={(e) => setFormData({ ...formData, travelAllowance: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── SECTION 2: ATTENDANCE & VERIFICATION DECISION (ASK UPFRONT) ─── */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '1.2rem' }}>📍</span>
                    <div>
                      <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', margin: 0, display: 'block' }}>
                        Location & Verification Policy
                      </label>
                      <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        Do you require GPS Location Tracking for this gig?
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '12px' }}>
                    {/* OPTION 1: NO GPS (Recommended) */}
                    <div
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          attendancePolicy: prev.attendancePolicy === 'strict_geofence' ? 'admin_managed' : prev.attendancePolicy,
                          attendanceTracking: prev.attendancePolicy !== 'none',
                        }));
                      }}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        border: formData.attendancePolicy !== 'strict_geofence' ? '2px solid #10B981' : '1px solid #CBD5E1',
                        background: formData.attendancePolicy !== 'strict_geofence' ? '#ECFDF5' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <strong style={{ fontSize: '0.88rem', color: formData.attendancePolicy !== 'strict_geofence' ? '#065F46' : '#1E293B' }}>
                          {formData.attendancePolicy !== 'strict_geofence' ? '🔘' : '⚪'} NO (Recommended)
                        </strong>
                        <span className="badge" style={{ background: '#D1FAE5', color: '#047857', fontSize: '0.7rem', fontWeight: 700 }}>
                          Standard Shoot
                        </span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.76rem', color: '#475569', lineHeight: '1.4' }}>
                        <li>Admin marks crew present on-site</li>
                        <li>Zero GPS battery drain or permissions</li>
                        <li>No map coordinates setup required</li>
                      </ul>
                    </div>

                    {/* OPTION 2: YES - STRICT GPS */}
                    <div
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          attendancePolicy: 'strict_geofence',
                          attendanceTracking: true,
                        }));
                      }}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        border: formData.attendancePolicy === 'strict_geofence' ? '2px solid #6366F1' : '1px solid #CBD5E1',
                        background: formData.attendancePolicy === 'strict_geofence' ? '#EEF2FF' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <strong style={{ fontSize: '0.88rem', color: formData.attendancePolicy === 'strict_geofence' ? '#4338CA' : '#1E293B' }}>
                          {formData.attendancePolicy === 'strict_geofence' ? '🔘' : '⚪'} YES (Strict Geofence)
                        </strong>
                        <span className="badge" style={{ background: '#E0E7FF', color: '#3730A3', fontSize: '0.7rem', fontWeight: 700 }}>
                          High-Security
                        </span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.76rem', color: '#475569', lineHeight: '1.4' }}>
                        <li>Workers must be within 150m of venue</li>
                        <li>Location verified via phone GPS</li>
                        <li>Leaflet map & geofence radius</li>
                      </ul>
                    </div>
                  </div>

                  {/* SUB-POLICY SELECTOR WHEN 'NO' IS SELECTED */}
                  {formData.attendancePolicy !== 'strict_geofence' && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '6px' }}>
                        Workflow Policy:
                      </span>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, attendancePolicy: 'admin_managed', attendanceTracking: true })}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: formData.attendancePolicy === 'admin_managed' ? '2px solid #059669' : '1px solid #CBD5E1',
                            background: formData.attendancePolicy === 'admin_managed' ? '#D1FAE5' : '#fff',
                            color: formData.attendancePolicy === 'admin_managed' ? '#065F46' : '#475569',
                          }}
                        >
                          👔 Studio-Managed (Admin marks present)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, attendancePolicy: 'freelancer_self', attendanceTracking: true })}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: formData.attendancePolicy === 'freelancer_self' ? '2px solid #059669' : '1px solid #CBD5E1',
                            background: formData.attendancePolicy === 'freelancer_self' ? '#D1FAE5' : '#fff',
                            color: formData.attendancePolicy === 'freelancer_self' ? '#065F46' : '#475569',
                          }}
                        >
                          📱 1-Tap Freelancer Self-Report
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, attendancePolicy: 'none', attendanceTracking: false })}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: formData.attendancePolicy === 'none' ? '2px solid #64748B' : '1px solid #CBD5E1',
                            background: formData.attendancePolicy === 'none' ? '#F1F5F9' : '#fff',
                            color: formData.attendancePolicy === 'none' ? '#1E293B' : '#475569',
                          }}
                        >
                          ⚪ Flat Pay (No Tracking)
                        </button>
                      </div>
                    </div>
                  )}
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
                    style={{
                      background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
                      border: 'none',
                      minWidth: '220px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontWeight: 700,
                      padding: '10px 20px',
                    }}
                  >
                    {isSubmitting ? 'Creating Gig...' : '⚡ Create Gig & Generate Code'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSTANT EVENT CODE SHARING MODAL AFTER GIG CREATION */}
      {createdEventModal && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.8)' }}>
          <div className="modal-card" style={{ maxWidth: '480px', textAlign: 'center' }}>
            <div className="modal-header" style={{ justifyContent: 'center', borderBottom: 'none', paddingBottom: 0 }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  background: '#ECFDF5',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                  fontSize: '1.8rem',
                }}
              >
                🎉
              </div>
            </div>
            <div className="modal-body" style={{ padding: '16px 24px' }}>
              <h3 style={{ margin: '8px 0 4px', fontSize: '1.3rem', color: '#0F172A' }}>Gig Created Successfully!</h3>
              <p style={{ color: '#64748B', fontSize: '0.88rem', margin: '0 0 20px' }}>
                Share this 6-character code with your freelancers or WhatsApp group.
              </p>

              <div
                style={{
                  background: '#F8FAFC',
                  border: '2px dashed #818CF8',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                  Event Join Code
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#1E1B4B', letterSpacing: '4px', fontFamily: 'monospace' }}>
                  {createdEventModal.eventCode}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => copyEventCode(createdEventModal.eventCode)}
                  style={{ marginTop: '10px', fontSize: '0.82rem', padding: '6px 14px' }}
                >
                  {copiedCode === createdEventModal.eventCode ? '✅ Copied to Clipboard!' : '📋 Copy Event Code'}
                </button>
              </div>

              <div style={{ fontSize: '0.84rem', color: '#334155', background: '#F1F5F9', borderRadius: '8px', padding: '12px', textAlign: 'left', marginBottom: '20px' }}>
                <div style={{ marginBottom: '4px' }}><strong>Event:</strong> {createdEventModal.title}</div>
                <div style={{ marginBottom: '4px' }}>
                  <strong>Date:</strong> {new Date(createdEventModal.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })} ({createdEventModal.startTime} - {createdEventModal.endTime})
                </div>
                <div style={{ marginBottom: '4px' }}><strong>Venue:</strong> {createdEventModal.location?.address}</div>
                <div><strong>Crew:</strong> {createdEventModal.requiredWorkers} Required • ₹{createdEventModal.sessionPay} Pay</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleShareWhatsApp(createdEventModal)}
                  style={{
                    background: '#25D366',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    padding: '12px',
                    fontSize: '0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span>💬</span> Share on WhatsApp Now
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const ev = createdEventModal;
                      setCreatedEventModal(null);
                      handleOpenAssignModal(ev);
                    }}
                    style={{ flex: 1 }}
                  >
                    👥 Manage Crew
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCreatedEventModal(null)}
                    style={{ flex: 1 }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGNMENT MANAGEMENT MODAL */}
      {selectedEventForAssign && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>{selectedEventForAssign.event.title}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Staffing: {selectedEventForAssign.assignedCount} / {selectedEventForAssign.event.requiredWorkers} Confirmed
                  </span>
                  {selectedEventForAssign.event.eventCode && (
                    <span
                      className="badge"
                      style={{
                        background: '#EEF2FF',
                        color: '#4F46E5',
                        border: '1px solid #C7D2FE',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: '3px 8px',
                      }}
                      onClick={() => copyEventCode(selectedEventForAssign.event.eventCode)}
                      title="Click to copy event code"
                    >
                      🎟️ {selectedEventForAssign.event.eventCode} {copiedCode === selectedEventForAssign.event.eventCode ? '✓ Copied' : '📋'}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      background: '#25D366',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      padding: '3px 10px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleShareWhatsApp(selectedEventForAssign.event)}
                  >
                    💬 WhatsApp Invite
                  </button>
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelectedEventForAssign(null)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              {/* Direct Assign Control */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: '8px' }}>
                  Directly Assign Registered Freelancer
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
                    onClick={() => handleAssignWorker()}
                    disabled={!selectedFreelancerId || selectedEventForAssign.isFull}
                  >
                    + Assign
                  </button>
                </div>
                {selectedEventForAssign.isFull && (
                  <span style={{ fontSize: '0.75rem', color: '#D97706', marginTop: '4px', display: 'block' }}>
                    ⚠️ All required slots are filled. Freelancers joining via code will be added to the Waitlist.
                  </span>
                )}
              </div>

              {/* Roster Partitioning: Confirmed vs Waitlist vs Applied */}
              {(() => {
                const confirmed = (selectedEventForAssign.assignments || []).filter((as) =>
                  ['assigned', 'accepted'].includes(as.status)
                );
                const waitlisted = (selectedEventForAssign.assignments || []).filter(
                  (as) => as.status === 'waitlist'
                );
                const applied = (selectedEventForAssign.assignments || []).filter(
                  (as) => as.status === 'applied'
                );

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* 1. Confirmed Crew */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>✅</span> Confirmed Crew ({confirmed.length} / {selectedEventForAssign.event.requiredWorkers})
                        </h4>
                        {confirmed.length > 0 && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{
                              background: '#ECFDF5',
                              color: '#059669',
                              border: '1px solid #A7F3D0',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                            onClick={handleAdminCompleteAll}
                            title="1-Click: Mark all assigned crew present & completed, and queue their payouts immediately"
                          >
                            ⚡ Mark Entire Crew Present & Completed
                          </button>
                        )}
                      </div>

                      {confirmed.length === 0 ? (
                        <p style={{ fontSize: '0.82rem', color: '#94A3B8', margin: 0 }}>No confirmed crew members yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {confirmed.map((as) => {
                            const att = (selectedEventForAssign.attendanceRecords || []).find(
                              (r) => (r.freelancerId?._id || r.freelancerId) === as.freelancerId?._id
                            );
                            const isCheckedIn = att && att.status === 'checked_in';
                            const isCompleted = att && att.status === 'completed';

                            return (
                              <div
                                key={as._id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '12px 14px',
                                  borderRadius: '8px',
                                  border: '1px solid #E2E8F0',
                                  background: '#fff',
                                  flexWrap: 'wrap',
                                  gap: '10px',
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <strong style={{ fontSize: '0.88rem', color: '#0F172A' }}>
                                      {as.freelancerId?.name}
                                    </strong>
                                    {isCompleted ? (
                                      <span className="badge" style={{ background: '#ECFDF5', color: '#059669', fontWeight: 700, fontSize: '0.72rem' }}>
                                        🏁 Completed & Payout Queued
                                      </span>
                                    ) : isCheckedIn ? (
                                      <span className="badge" style={{ background: '#F0FDF4', color: '#166534', fontWeight: 700, fontSize: '0.72rem' }}>
                                        🟢 Marked Present by Studio
                                      </span>
                                    ) : (
                                      <span className="badge badge-assigned" style={{ fontSize: '0.72rem' }}>
                                        ⚪ Scheduled
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '3px' }}>
                                    {as.freelancerId?.phone || as.freelancerId?.email}
                                    {as.joinedVia === 'event_code' && ' • Joined via Code'}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  {/* Admin Direct Attendance Actions */}
                                  {!isCheckedIn && !isCompleted && (
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      style={{ background: '#059669', color: '#fff', border: 'none', padding: '4px 8px', fontSize: '0.74rem', fontWeight: 600, borderRadius: '4px', cursor: 'pointer' }}
                                      onClick={() => handleAdminCheckin(as.freelancerId?._id)}
                                      title="Mark this worker present on venue"
                                    >
                                      🟢 Check In
                                    </button>
                                  )}

                                  {isCheckedIn && (
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      style={{ background: '#7C3AED', color: '#fff', border: 'none', padding: '4px 8px', fontSize: '0.74rem', fontWeight: 600, borderRadius: '4px', cursor: 'pointer' }}
                                      onClick={() => handleAdminCheckout(as.freelancerId?._id)}
                                      title="Mark shift wrapped for this worker"
                                    >
                                      🔴 Check Out
                                    </button>
                                  )}

                                  {!isCompleted && (
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      style={{ background: '#4F46E5', color: '#fff', border: 'none', padding: '4px 8px', fontSize: '0.74rem', fontWeight: 600, borderRadius: '4px', cursor: 'pointer' }}
                                      onClick={() => handleAdminCheckout(as.freelancerId?._id)}
                                      title="1-Click: Complete shift & queue payout"
                                    >
                                      ⚡ Complete & Pay
                                    </button>
                                  )}

                                  {!isCompleted && !isCheckedIn && (
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      style={{ background: '#FFF1F2', color: '#E11D48', border: '1px solid #FECDD3', padding: '4px 8px', fontSize: '0.74rem', fontWeight: 600, borderRadius: '4px', cursor: 'pointer' }}
                                      onClick={() => handleAdminMarkAbsent(as.freelancerId?._id)}
                                      title="Mark absent and free slot"
                                    >
                                      ❌ Absent
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                                    onClick={() => handleRemoveWorker(as.freelancerId?._id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 2. Priority Waitlist */}
                    {waitlisted.length > 0 && (
                      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px' }}>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#92400E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>⏱️</span> Priority Waitlist ({waitlisted.length} Backups Ready)
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {waitlisted.map((as, idx) => (
                            <div
                              key={as._id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid #FCD34D',
                                background: '#fff',
                              }}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, background: '#FEF3C7', color: '#B45309', padding: '2px 6px', borderRadius: '4px' }}>
                                    #{idx + 1} Waitlist
                                  </span>
                                  <strong style={{ fontSize: '0.86rem', color: '#0F172A' }}>
                                    {as.freelancerId?.name}
                                  </strong>
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                                  {as.freelancerId?.phone || as.freelancerId?.email}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleAssignWorker(as.freelancerId?._id)}
                                  title="Promote this waitlisted worker to confirmed shift"
                                >
                                  🚀 Promote to Crew
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleRemoveWorker(as.freelancerId?._id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Open Shift Applications */}
                    {applied.length > 0 && (
                      <div>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📩</span> Pending Applications ({applied.length})
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {applied.map((as) => (
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
                                <strong style={{ fontSize: '0.88rem', color: '#0F172A' }}>
                                  {as.freelancerId?.name}
                                </strong>
                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                  {as.freelancerId?.phone || as.freelancerId?.email}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
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
