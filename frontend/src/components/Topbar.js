import React, { useState } from 'react';
import { IconLogOut } from './icons';

const Topbar = ({ user, organization, isLive, onLogout }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (organization?.studioCode) {
      navigator.clipboard.writeText(organization.studioCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="org-pill">
          <span>🏢</span>
          <span>{organization?.name || 'My Studio Organization'}</span>
        </div>
        {organization?.studioCode && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyCode}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              fontSize: '0.78rem',
              cursor: 'pointer',
              border: '1px solid #CBD5E1',
              background: copied ? '#F0FDF4' : '#fff',
              color: copied ? '#16A34A' : 'var(--text-main)',
            }}
            title="Click to copy Studio Code for freelancer registration"
          >
            <span style={{ color: '#64748B', fontWeight: 600 }}>CODE:</span>
            <strong style={{ letterSpacing: '0.5px', color: copied ? '#16A34A' : 'var(--primary)' }}>
              {organization.studioCode}
            </strong>
            <span>{copied ? '✓ Copied' : '📋'}</span>
          </button>
        )}
        <div className="socket-status">
          <span className={`socket-dot ${isLive ? '' : 'offline'}`} />
          <span>{isLive ? 'Live Sync' : 'Connecting...'}</span>
        </div>
      </div>

      <div className="topbar-right">
        <div className="user-badge">
          <div className="user-avatar">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="user-meta">
            <span className="user-name">{user?.name}</span>
            <span className="user-role">{user?.role}</span>
          </div>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={onLogout}>
          <IconLogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Topbar;
