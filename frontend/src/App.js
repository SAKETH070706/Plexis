import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { io } from 'socket.io-client';
import api, { BACKEND_URL } from './api';
import Login from './components/Login';
import Register from './components/Register';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import './App.css';

// Code-split module views
const AdminOverview = lazy(() => import('./components/AdminOverview'));
const EventsManager = lazy(() => import('./components/EventsManager'));
const CrewManager = lazy(() => import('./components/CrewManager'));
const AttendanceMonitor = lazy(() => import('./components/AttendanceMonitor'));
const PayoutsLedger = lazy(() => import('./components/PayoutsLedger'));
const FreelancerPortal = lazy(() => import('./components/FreelancerPortal'));
const Dashboard = lazy(() => import('./components/Dashboard'));

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  });
  const [organization, setOrganization] = useState(null);
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [activeTab, setActiveTab] = useState('overview');
  const [autoOpenCreateEvent, setAutoOpenCreateEvent] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const handleNavigateTab = (tab, shouldOpenModal = false) => {
    setActiveTab(tab);
    if (tab === 'events' && shouldOpenModal) {
      setAutoOpenCreateEvent(true);
    }
  };

  // Leads CRM state (preserved from original project)
  const [leads, setLeads] = useState([]);

  const socketRef = useRef(null);

  // Set initial default tab based on role
  useEffect(() => {
    if (user?.role === 'admin') {
      setActiveTab('overview');
    } else if (user) {
      setActiveTab('portal');
    }
  }, [user]);

  // Toast notification helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 5000);
  };

  // Fetch Organization Details
  const fetchOrganization = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get('/auth/organization');
      setOrganization(res.data);
    } catch (err) {
      console.warn('Could not fetch org:', err.message);
    }
  }, [token]);

  // Fetch Leads (preserved memoized function)
  const fetchLeads = useCallback(async (params = {}, setTotalPages = null) => {
    if (!token) return;
    try {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined))
      ).toString();

      const res = await api.get(`/leads?${query}`);
      setLeads(res.data.leads || []);
      if (setTotalPages && res.data.pagination) {
        setTotalPages(res.data.pagination.pages);
      }
    } catch (err) {
      console.error('Fetch leads error:', err);
    }
  }, [token]);

  // Socket Lifecycle & Real-Time Event Handlers
  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (!token) {
      setIsSocketConnected(false);
      return;
    }

    fetchOrganization();
    fetchLeads();

    const socket = io(BACKEND_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsSocketConnected(true);
      fetchLeads();
    });

    socket.on('disconnect', () => {
      setIsSocketConnected(false);
    });

    // Real-Time Workforce Alerts
    socket.on('workerCheckedIn', (data) => {
      showToast(`📍 Crew member checked in! (${data.checkInLocation?.isWithinGeofence ? 'Within geofence' : 'Outside venue'})`);
      window.dispatchEvent(new CustomEvent('attendance:update', { detail: data }));
    });

    socket.on('workerCheckedOut', (data) => {
      showToast(`⏱️ Crew member checked out! (${data.overtimeMinutes > 0 ? `${data.overtimeMinutes}m overtime` : 'On time'})`);
      window.dispatchEvent(new CustomEvent('attendance:update', { detail: data }));
    });

    socket.on('overtimeProofUploaded', (data) => {
      showToast('📸 New overtime photo proof uploaded for review');
      window.dispatchEvent(new CustomEvent('attendance:update', { detail: data }));
    });

    socket.on('assignmentCreated', (data) => {
      showToast('🎉 You have been assigned to an event shift!');
    });

    socket.on('payoutApproved', (data) => {
      showToast(`💰 Payout of ₹${data.totalAmount} approved!`);
    });

    socket.on('gig:joined', (data) => {
      const name = data.freelancer?.name || 'A crew member';
      const eventTitle = data.event?.title || 'an event';
      const statusText = data.isWaitlisted ? 'added to waitlist for' : 'joined';
      showToast(`🎟️ ${name} ${statusText} "${eventTitle}"!`);
      window.dispatchEvent(new CustomEvent('gig:joined', { detail: data }));
    });

    socket.on('waitlist:promoted', (data) => {
      const eventTitle = data.eventTitle || 'your event';
      showToast(`🚀 Great news! You've been promoted from the waitlist to Confirmed Crew for "${eventTitle}"!`);
      window.dispatchEvent(new CustomEvent('waitlist:promoted', { detail: data }));
    });

    socket.on('attendanceRequestCreated', (data) => {
      showToast('⚠️ New manual attendance exception request submitted');
      window.dispatchEvent(new CustomEvent('attendance:update', { detail: data }));
    });

    // Lead CRM Socket Updates
    socket.on('leadCreated', (newLead) => {
      setLeads((prev) => (prev.some((l) => l._id === newLead._id) ? prev : [newLead, ...prev]));
    });

    socket.on('leadUpdated', (updatedLead) => {
      setLeads((prev) => prev.map((l) => (l._id === updatedLead._id ? updatedLead : l)));
    });

    socket.on('leadDeleted', (deletedId) => {
      setLeads((prev) => prev.filter((l) => l._id !== deletedId));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, fetchOrganization, fetchLeads]);

  // Handle Unauthorized Event
  useEffect(() => {
    const handleUnauthorized = () => handleLogout();
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const handleLogin = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleRegister = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setOrganization(null);
    setLeads([]);
    setAuthView('login');
  };

  // If not logged in -> Show Login / Register
  if (!token || !user) {
    return authView === 'login' ? (
      <Login
        onLogin={handleLogin}
        onSwitchToRegister={() => setAuthView('register')}
      />
    ) : (
      <Register
        onRegister={handleRegister}
        onSwitchToLogin={() => setAuthView('login')}
      />
    );
  }

  const isAdmin = user.role === 'admin';

  return (
    <div className="app-container">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="toast-notice">
          <span>🔔</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main App Workspace */}
      <div className="main-wrapper">
        <Topbar
          user={user}
          organization={organization}
          isLive={isSocketConnected}
          onLogout={handleLogout}
        />

        <main style={{ flex: 1 }}>
          <Suspense fallback={<div style={{ padding: '2rem', color: '#94a3b8', textAlign: 'center' }}>Loading module...</div>}>
            {isAdmin ? (
              /* ADMIN MODULES */
              <>
                {activeTab === 'overview' && (
                  <AdminOverview onNavigateTab={handleNavigateTab} organization={organization} />
                )}
                {activeTab === 'events' && (
                  <EventsManager
                    autoOpenCreateModal={autoOpenCreateEvent}
                    onCloseAutoModal={() => setAutoOpenCreateEvent(false)}
                  />
                )}
                {activeTab === 'crew' && <CrewManager />}
                {activeTab === 'attendance' && <AttendanceMonitor />}
                {activeTab === 'payouts' && <PayoutsLedger />}
                {activeTab === 'leads' && (
                  <div className="page-container">
                    <div className="page-header">
                      <div className="page-title">
                        <h1>Client Leads CRM</h1>
                        <p>Track wedding client inquiries, quotations, and convert them to live events</p>
                      </div>
                    </div>
                    <Dashboard
                      leads={leads}
                      user={user}
                      onLogout={handleLogout}
                      fetchLeads={fetchLeads}
                    />
                  </div>
                )}
              </>
            ) : (
              /* FREELANCER MODULES */
              <>
                {activeTab === 'portal' && <FreelancerPortal user={user} />}
                {activeTab === 'attendance' && <AttendanceMonitor />}
                {activeTab === 'earnings' && <PayoutsLedger />}
              </>
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default App;