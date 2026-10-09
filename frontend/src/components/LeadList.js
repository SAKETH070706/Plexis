import React from 'react';
import api from '../api';

const LeadList = ({ leads = [], onSelectLead, user }) => {
  const handleDelete = async (leadId, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this lead inquiry?')) {
      try {
        await api.delete(`/leads/${leadId}`);
      } catch (err) {
        console.error('Error deleting lead:', err);
        alert(err.response?.data?.message || 'Failed to delete lead');
      }
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'converted':
        return <span className="badge badge-success">Converted</span>;
      case 'contacted':
        return <span className="badge badge-warning">Contacted</span>;
      default:
        return <span className="badge badge-draft">New Inquiry</span>;
    }
  };

  return (
    <div className="table-card">
      <div className="table-header-bar">
        <span className="table-header-title">Client Inquiries & Quotes ({leads.length})</span>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Client / Couple</th>
              <th>Contact</th>
              <th>Event Location</th>
              <th>Source</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                  No leads found. Click "+ Add Lead" to record wedding or event inquiries.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead._id}
                  onClick={() => onSelectLead(lead)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      {lead.name}
                    </div>
                    {user?.role === 'admin' && lead.userId && (
                      <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                        Created by {lead.userId.name}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.84rem' }}>{lead.email}</div>
                    {lead.phone && (
                      <div style={{ fontSize: '0.76rem', color: '#64748B' }}>{lead.phone}</div>
                    )}
                  </td>
                  <td>
                    {lead.location?.city || lead.location?.address ? (
                      <div>
                        <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          📍 {lead.location?.city || 'Venue'}
                        </span>
                        {lead.location?.address && (
                          <div style={{ fontSize: '0.75rem', color: '#64748B', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {lead.location.address}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>{lead.source}</span>
                  </td>
                  <td>{getStatusBadge(lead.status)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLead(lead);
                        }}
                      >
                        Details
                      </button>
                      {user?.role === 'admin' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: '#EF4444', borderColor: '#FECACA' }}
                          onClick={(e) => handleDelete(lead._id, e)}
                        >
                          Delete
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
  );
};

export default LeadList;