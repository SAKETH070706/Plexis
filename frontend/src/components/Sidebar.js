import React from 'react';
import {
  IconDashboard,
  IconCalendar,
  IconUsers,
  IconMapPin,
  IconCreditCard,
  IconFolder,
  IconLogOut
} from './icons';

const Sidebar = ({ activeTab, setActiveTab, user, onLogout }) => {
  const isAdmin = user?.role === 'admin';

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img
          src="https://plexis.in/assets/logo-CkLfEC-X.png"
          alt="Plexis Logo"
          className="brand-logo-img"
        />

      </div>

      <nav className="sidebar-nav">
        {isAdmin ? (
          <>
            <button
              className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <IconDashboard size={18} />
              <span>Overview</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'events' ? 'active' : ''}`}
              onClick={() => setActiveTab('events')}
            >
              <IconCalendar size={18} />
              <span>Events</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'crew' ? 'active' : ''}`}
              onClick={() => setActiveTab('crew')}
            >
              <IconUsers size={18} />
              <span>Crew & Workers</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('attendance')}
            >
              <IconMapPin size={18} />
              <span>Attendance</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'payouts' ? 'active' : ''}`}
              onClick={() => setActiveTab('payouts')}
            >
              <IconCreditCard size={18} />
              <span>Payouts</span>
            </button>

            <div className="nav-divider" />

            <button
              className={`nav-item ${activeTab === 'leads' ? 'active' : ''}`}
              onClick={() => setActiveTab('leads')}
            >
              <IconFolder size={18} />
              <span>Leads CRM</span>
            </button>
          </>
        ) : (
          <>
            <button
              className={`nav-item ${activeTab === 'portal' ? 'active' : ''}`}
              onClick={() => setActiveTab('portal')}
            >
              <IconDashboard size={18} />
              <span>My Shifts & GPS</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('attendance')}
            >
              <IconMapPin size={18} />
              <span>Attendance History</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'earnings' ? 'active' : ''}`}
              onClick={() => setActiveTab('earnings')}
            >
              <IconCreditCard size={18} />
              <span>My Earnings</span>
            </button>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-meta">
          <span className="user-name">{user?.name}</span>
          <span className="user-role">{user?.role}</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onLogout} title="Logout">
          <IconLogOut size={16} />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
