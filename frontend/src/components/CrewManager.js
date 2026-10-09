import React, { useState, useEffect } from 'react';
import api from '../api';

const CrewManager = () => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/workers');
      setWorkers(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Crew & Freelancer Directory</h1>
          <p>Photographers, videographers, and on-ground event crew members</p>
        </div>
      </div>

      <div className="table-card">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Crew Member</th>
                <th>Contact Details</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined Date</th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                    {loading ? 'Loading crew directory...' : 'No crew members registered yet.'}
                  </td>
                </tr>
              ) : (
                workers.map((w) => (
                  <tr key={w._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: '#F5F3FF',
                            color: '#6D28D9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                          }}
                        >
                          {w.name ? w.name.charAt(0).toUpperCase() : 'W'}
                        </div>
                        <div>
                          <strong style={{ color: '#0F172A' }}>{w.name}</strong>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{w.email}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{w.phone || 'No phone'}</div>
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{w.role}</span>
                    </td>
                    <td>
                      <span className="badge badge-active">{w.status || 'Active'}</span>
                    </td>
                    <td>{new Date(w.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
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

export default CrewManager;
