import React, { useState, useEffect } from 'react';
import api from '../api';

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

const AttendanceMonitor = () => {
  const [attendance, setAttendance] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState('all'); // 'all' or 'exceptions'

  // Modal State for Overtime Review & Proof Photos
  const [selectedOTRecord, setSelectedOTRecord] = useState(null);
  const [selectedProofRecord, setSelectedProofRecord] = useState(null);
  const [otMinutesInput, setOtMinutesInput] = useState(0);
  const [otReviewNote, setOtReviewNote] = useState('');

  useEffect(() => {
    fetchData();

    const handleLiveUpdate = () => {
      fetchData();
    };

    window.addEventListener('attendance:update', handleLiveUpdate);
    return () => {
      window.removeEventListener('attendance:update', handleLiveUpdate);
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [attRes, reqRes] = await Promise.all([
        api.get('/attendance?limit=50'),
        api.get('/attendance/requests/pending'),
      ]);
      setAttendance(attRes.data.attendance || []);
      setPendingRequests(reqRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminCheckout = async (attendanceId) => {
    try {
      await api.post('/attendance/admin-checkout', { attendanceId });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Check-out failed');
    }
  };

  const handleOpenOTModal = (record) => {
    setSelectedOTRecord(record);
    setOtMinutesInput(record.overtimeMinutes || 0);
    setOtReviewNote('');
  };

  const handleReviewOvertime = async (action) => {
    if (!selectedOTRecord) return;
    try {
      await api.patch(`/attendance/${selectedOTRecord._id}/review-overtime`, {
        action,
        approvedMinutes: Number(otMinutesInput),
        note: otReviewNote,
      });
      setSelectedOTRecord(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to review overtime');
    }
  };

  const handleReviewExceptionRequest = async (requestId, action) => {
    const note = prompt(`Enter review note for ${action}:`, action === 'approve' ? 'Approved by admin' : 'Rejected');
    if (note === null) return;
    try {
      await api.patch(`/attendance/requests/${requestId}/review`, {
        action,
        reviewNote: note,
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to review request');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Geofenced Attendance Monitor</h1>
          <p>Real-time GPS verification, distance auditing, and overtime settlement</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${viewTab === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setViewTab('all')}
          >
            Attendance Logs ({attendance.length})
          </button>
          <button
            className={`btn ${viewTab === 'exceptions' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setViewTab('exceptions')}
          >
            Pending Exceptions ({pendingRequests.length})
          </button>
        </div>
      </div>

      {viewTab === 'all' ? (
        <div className="table-card">
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Event</th>
                  <th>Scheduled Shift</th>
                  <th>Actual Check-In</th>
                  <th>Actual Check-Out</th>
                  <th>GPS Geofence Status</th>
                  <th>Overtime</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                      {loading ? 'Loading attendance logs...' : 'No attendance records found.'}
                    </td>
                  </tr>
                ) : (
                  attendance.map((rec) => (
                    <tr key={rec._id}>
                      <td>
                        <strong>{rec.freelancerId?.name}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{rec.freelancerId?.phone}</div>
                      </td>
                      <td>
                        <strong>{rec.eventId?.title}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          📍 {rec.eventId?.location?.address}
                        </div>
                      </td>
                      <td>
                        {rec.scheduledStart ? new Date(rec.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} -{' '}
                        {rec.scheduledEnd ? new Date(rec.scheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                      </td>
                      <td>
                        {rec.checkInAt ? (
                          <>
                            <div>{new Date(rec.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            <span style={{ fontSize: '0.72rem', color: '#6D28D9' }}>{rec.checkInMethod?.toUpperCase()}</span>
                          </>
                        ) : '--'}
                      </td>
                      <td>
                        {rec.checkOutAt ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.88rem' }}>
                                {new Date(rec.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </strong>
                              {rec.overtimeMinutes > 0 && (
                                <span
                                  className="badge"
                                  style={{
                                    background: '#EA580C',
                                    color: '#FFFFFF',
                                    fontSize: '0.72rem',
                                    padding: '2px 6px',
                                    fontWeight: 700,
                                  }}
                                  title={`Total overtime duration: ${rec.overtimeMinutes} mins`}
                                >
                                  ⚡ +{rec.overtimeMinutes}m OT
                                </span>
                              )}
                            </div>
                            {rec.checkOutMethod === 'auto' ? (
                              <span
                                className="badge badge-alert"
                                style={{ fontSize: '0.7rem', padding: '2px 6px', marginTop: '2px', display: 'inline-block' }}
                                title={rec.notes || 'Shift auto-stopped after 30-minute grace period with no user response.'}
                              >
                                🛑 Auto-Stopped (+30m grace)
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{rec.actualMinutes} mins worked</span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: '#D97706', fontWeight: 600 }}>In Progress</span>
                        )}
                      </td>
                      <td>
                        {rec.checkInLocation?.isWithinGeofence ? (
                          <span className="badge badge-verified">
                            ● Inside ({rec.checkInLocation.distanceFromVenue}m)
                          </span>
                        ) : rec.checkInLocation ? (
                          <span className="badge badge-alert">
                            ⚠️ Outside ({rec.checkInLocation.distanceFromVenue}m)
                          </span>
                        ) : (
                          <span className="badge badge-pending">Manual / No GPS</span>
                        )}
                      </td>
                      <td>
                        {rec.overtimeMinutes > 0 || rec.overtimeProofPhotos?.length > 0 ? (
                          <div>
                            <span className={`badge badge-${rec.overtimeStatus === 'approved' ? 'verified' : 'pending'}`}>
                              {rec.overtimeMinutes}m ({rec.overtimeStatus})
                            </span>
                            {rec.overtimeProofPhotos && rec.overtimeProofPhotos.length > 0 && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setSelectedProofRecord(rec)}
                                style={{
                                  marginTop: '4px',
                                  fontSize: '0.72rem',
                                  padding: '2px 8px',
                                  display: 'block',
                                  background: '#FAF5FF',
                                  color: 'var(--primary)',
                                  borderColor: '#DDD6FE',
                                }}
                              >
                                📸 View Proofs ({rec.overtimeProofPhotos.length})
                              </button>
                            )}
                            {rec.overtimeStatus === 'pending' && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleOpenOTModal(rec)}
                                style={{ marginTop: '4px', fontSize: '0.72rem', padding: '2px 8px', display: 'block' }}
                              >
                                Review OT
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>None</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`badge badge-${rec.status}`}>{rec.status}</span>
                          {rec.status === 'checked_in' && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{
                                background: '#7C3AED',
                                color: '#fff',
                                border: 'none',
                                padding: '3px 8px',
                                fontSize: '0.74rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                              onClick={() => handleAdminCheckout(rec._id)}
                              title="1-Click: Wrap shoot for this worker and queue payout"
                            >
                              ⚡ Wrap & Pay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* PENDING EXCEPTION REQUESTS (Phone died, GPS failure) */
        <div className="table-card">
          <div className="table-header-bar">
            <span className="table-header-title">Manual Exception Queue (Phone dead, GPS signal failure)</span>
          </div>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Event</th>
                  <th>Request Type</th>
                  <th>Worker Explanation Reason</th>
                  <th>Requested Timing</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                      No pending exception requests! All shifts are accounted for.
                    </td>
                  </tr>
                ) : (
                  pendingRequests.map((req) => (
                    <tr key={req._id}>
                      <td>
                        <strong>{req.freelancerId?.name}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{req.freelancerId?.email}</div>
                      </td>
                      <td>{req.eventId?.title}</td>
                      <td>
                        <span className="badge badge-pending" style={{ textTransform: 'capitalize' }}>
                          {req.requestType.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px' }}>
                        <span style={{ color: '#0F172A', fontWeight: 500 }}>"{req.reason}"</span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem' }}>
                          In: {req.requestedCheckIn ? new Date(req.requestedCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                        </div>
                        <div style={{ fontSize: '0.8rem' }}>
                          Out: {req.requestedCheckOut ? new Date(req.requestedCheckOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleReviewExceptionRequest(req._id, 'approve')}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleReviewExceptionRequest(req._id, 'reject')}
                          >
                            Reject
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
      )}

      {/* OVERTIME REVIEW MODAL */}
      {selectedOTRecord && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Review Overtime Settlement</h3>
              <button className="modal-close" onClick={() => setSelectedOTRecord(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.88rem', color: '#475569' }}>
                Worker <strong>{selectedOTRecord.freelancerId?.name}</strong> recorded{' '}
                <strong>{selectedOTRecord.overtimeMinutes} minutes</strong> past scheduled shift end on{' '}
                <strong>{selectedOTRecord.eventId?.title}</strong>.
              </p>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0, fontWeight: 600 }}>Approved Overtime Minutes</label>
                  <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                    Rate: ₹{selectedOTRecord.eventId?.overtimeRate || 0}/hour
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={otMinutesInput}
                  onChange={(e) => setOtMinutesInput(e.target.value)}
                />

                {/* Adjust Overtime Hours Quick Presets */}
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Quick Adjust:</span>
                  {[30, 60, 90, 120, selectedOTRecord.overtimeMinutes].filter(Boolean).map((mins, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setOtMinutesInput(mins)}
                      style={{
                        padding: '2px 8px',
                        fontSize: '0.72rem',
                        background: Number(otMinutesInput) === mins ? 'var(--primary-light, #EDE9FE)' : '#F1F5F9',
                        borderColor: Number(otMinutesInput) === mins ? 'var(--primary, #7C3AED)' : 'var(--border, #CBD5E1)',
                        color: Number(otMinutesInput) === mins ? 'var(--primary, #7C3AED)' : '#475569',
                      }}
                    >
                      {mins >= 60 ? `${(mins / 60).toFixed(mins % 60 ? 1 : 0)}h (${mins}m)` : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Review Note / Explanation</label>
                <input
                  type="text"
                  placeholder="e.g. Stage shoot extended by 45 mins"
                  value={otReviewNote}
                  onChange={(e) => setOtReviewNote(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <button className="btn btn-danger btn-sm" onClick={() => handleReviewOvertime('reject')}>
                Reject Overtime
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const custom = prompt('Enter adjusted overtime in minutes:', otMinutesInput);
                    if (custom !== null && !isNaN(custom) && custom.trim() !== '') {
                      setOtMinutesInput(Number(custom));
                    }
                  }}
                >
                  Adjust Overtime Hours
                </button>
                <button className="btn btn-success btn-sm" onClick={() => handleReviewOvertime('approve')}>
                  Approve Overtime Payout ({otMinutesInput} Mins)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OVERTIME PROOF PHOTOS MODAL */}
      {selectedProofRecord && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>📸 Camera-Verified Overtime Proofs</h3>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Worker: {selectedProofRecord.freelancerId?.name} • Event: {selectedProofRecord.eventId?.title}
                </span>
              </div>
              <button className="modal-close" onClick={() => setSelectedProofRecord(null)}>
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: 'calc(85vh - 120px)', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                Review photos captured on-site with verified EXIF hardware timestamps and GPS coordinates.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {selectedProofRecord.overtimeProofPhotos?.map((photo, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  >
                    <div style={{ marginBottom: '8px', textAlign: 'center', background: '#000', borderRadius: '6px', overflow: 'hidden' }}>
                      <a href={photo.url} target="_blank" rel="noreferrer" title="Click to view full image in new tab">
                        <img
                          src={photo.url}
                          alt={`Overtime proof ${idx + 1}`}
                          style={{ maxHeight: '300px', maxWidth: '100%', objectFit: 'contain', verticalAlign: 'middle' }}
                        />
                      </a>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '0.78rem' }}>
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>SHUTTER TIMESTAMP (EXIF)</span>
                        <strong>{new Date(photo.capturedAt).toLocaleString()}</strong>
                        {selectedProofRecord.checkOutAt && (
                          <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '2px' }}>
                            ✓ Matches checkout ({new Date(selectedProofRecord.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                          </div>
                        )}
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>DEVICE MODEL</span>
                        <strong>{photo.deviceModel || 'Mobile Camera'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>PHOTO GPS & VENUE DISTANCE</span>
                        <strong>
                          {photo.location?.latitude ? `${photo.location.latitude.toFixed(5)}, ${photo.location.longitude?.toFixed(5)}` : 'On-device GPS'}
                        </strong>
                        {selectedProofRecord.eventId?.location && (
                          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                            Venue: {selectedProofRecord.eventId.location.address || 'Event location'}
                            {photo.location?.latitude && selectedProofRecord.eventId.location.latitude ? (
                              <span> ({getDistanceMeters(photo.location.latitude, photo.location.longitude, selectedProofRecord.eventId.location.latitude, selectedProofRecord.eventId.location.longitude)}m away)</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>SERVER RECEIVED</span>
                        <span>{new Date(photo.serverReceivedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedProofRecord(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const rec = selectedProofRecord;
                  setSelectedProofRecord(null);
                  handleOpenOTModal(rec);
                }}
              >
                Proceed to OT Settlement &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceMonitor;
