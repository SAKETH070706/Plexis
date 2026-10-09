import React, { useState, useEffect } from 'react';
import api from '../api';
import { IconCalendar, IconUsers, IconClock, IconCreditCard } from './icons';

const AdminOverview = ({ onNavigateTab, organization }) => {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({
    activeEvents: 0,
    totalWorkers: 0,
    pendingOvertimeCount: 0,
    pendingPayoutTotal: 0,
  });
  const [todayEvents, setTodayEvents] = useState([]);
  const [recentAttendance, setRecentAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleCopyCode = () => {
    if (organization?.studioCode) {
      navigator.clipboard.writeText(organization.studioCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [eventsRes, workersRes, attendanceRes, payoutsSummaryRes] = await Promise.all([
        api.get('/events?limit=10'),
        api.get('/auth/workers'),
        api.get('/attendance?limit=8'),
        api.get('/payouts/summary'),
      ]);

      const events = eventsRes.data.events || [];
      const workers = workersRes.data || [];
      const attendance = attendanceRes.data.attendance || [];
      const payoutSummary = payoutsSummaryRes.data || {};

      const pendingOT = attendance.filter((a) => a.overtimeStatus === 'pending').length;

      setStats({
        activeEvents: events.length,
        totalWorkers: workers.length,
        pendingOvertimeCount: pendingOT,
        pendingPayoutTotal: payoutSummary.pendingTotal || 0,
      });

      setTodayEvents(events.slice(0, 4));
      setRecentAttendance(attendance.slice(0, 6));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Workforce Operations Overview</h1>
          <p>Real-time monitoring of event crews, GPS check-ins, and shift payouts</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-primary" onClick={() => onNavigateTab('events', true)}>
            + New Event
          </button>
        </div>
      </div>

      {/* Studio Onboarding & Freelancer Code Banner */}
      {organization?.studioCode && (
        <div
          style={{
            background: 'linear-gradient(135deg, #FAF5FF 0%, #F5F3FF 100%)',
            border: '1px solid #DDD6FE',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '1.1rem' }}>🎉</span>
              <h4 style={{ margin: 0, fontSize: '0.96rem', color: 'var(--primary)', fontWeight: 700 }}>
                Crew Onboarding Studio Code:{' '}
                <span
                  style={{
                    letterSpacing: '1px',
                    background: '#fff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid #DDD6FE',
                  }}
                >
                  {organization.studioCode}
                </span>
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
              Share this unique code with your event photographers, cinematographers, and crew. They enter it when signing up to automatically join{' '}
              <strong>{organization.name}</strong>.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyCode}
            style={{
              background: copied ? '#16A34A' : 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {copied ? '✓ Studio Code Copied!' : '📋 Copy Studio Code'}
          </button>
        </div>
      )}

      {/* KPI Stat Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon">
            <IconCalendar size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Active Events</span>
            <span className="kpi-value">{loading ? '...' : stats.activeEvents}</span>
            <span className="kpi-sub">Upcoming & ongoing gigs</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon info">
            <IconUsers size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">On-Duty Crew</span>
            <span className="kpi-value">{loading ? '...' : stats.totalWorkers}</span>
            <span className="kpi-sub">Registered freelancers</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon warning">
            <IconClock size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Pending Overtime</span>
            <span className="kpi-value">{loading ? '...' : stats.pendingOvertimeCount}</span>
            <span className="kpi-sub">Awaiting admin review</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon success">
            <IconCreditCard size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Pending Payouts</span>
            <span className="kpi-value">₹{loading ? '...' : stats.pendingPayoutTotal.toLocaleString('en-IN')}</span>
            <span className="kpi-sub">Ready for disbursement</span>
          </div>
        </div>
      </div>

      {/* Today's Events & Shift Staffing */}
      <div className="table-card" style={{ marginBottom: '28px' }}>
        <div className="table-header-bar">
          <span className="table-header-title">Upcoming Shifts & Staffing</span>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigateTab('events')}>
            View All Events &rarr;
          </button>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event Title</th>
                <th>Date & Time</th>
                <th>Venue Location</th>
                <th>Crew Required</th>
                <th>Session Pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {todayEvents.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                    No events scheduled. Click "+ New Event" to create your first gig!
                  </td>
                </tr>
              ) : (
                todayEvents.map((ev) => (
                  <tr key={ev._id}>
                    <td>
                      <strong style={{ color: '#0F172A' }}>{ev.title}</strong>
                    </td>
                    <td>
                      {new Date(ev.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} | {ev.startTime} - {ev.endTime}
                    </td>
                    <td>📍 {ev.location?.address}</td>
                    <td>
                      <span className="badge badge-open">
                        {ev.assignedCount || 0} / {ev.requiredWorkers} Crew
                      </span>
                    </td>
                    <td>₹{ev.sessionPay}</td>
                    <td>
                      <span className={`badge badge-${ev.status}`}>{ev.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Geofenced Attendance Feed */}
      <div className="table-card">
        <div className="table-header-bar">
          <span className="table-header-title">Recent Geofenced Attendance</span>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigateTab('attendance')}>
            View Attendance Queue &rarr;
          </button>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Event</th>
                <th>Check-In Time</th>
                <th>GPS Geofence Status</th>
                <th>Overtime</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentAttendance.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                    No attendance recorded yet today.
                  </td>
                </tr>
              ) : (
                recentAttendance.map((rec) => (
                  <tr key={rec._id}>
                    <td>
                      <strong>{rec.freelancerId?.name || 'Freelancer'}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{rec.freelancerId?.phone}</div>
                    </td>
                    <td>{rec.eventId?.title || 'Event'}</td>
                    <td>
                      {rec.checkInAt ? new Date(rec.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                    </td>
                    <td>
                      {rec.checkInLocation?.isWithinGeofence ? (
                        <span className="badge badge-verified">
                          ● Within Geofence ({rec.checkInLocation.distanceFromVenue}m)
                        </span>
                      ) : (
                        <span className="badge badge-alert">
                          ⚠️ Outside Venue ({rec.checkInLocation?.distanceFromVenue}m)
                        </span>
                      )}
                    </td>
                    <td>
                      {rec.overtimeMinutes > 0 ? (
                        <span className="badge badge-pending">{rec.overtimeMinutes} mins</span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>None</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${rec.status}`}>{rec.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminOverview;
