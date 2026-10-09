import React, { useState, useEffect } from 'react';
import api from '../api';
import { IconCreditCard, IconCheckCircle } from './icons';

const PayoutsLedger = () => {
  const [payouts, setPayouts] = useState([]);
  const [summary, setSummary] = useState({ pendingTotal: 0, paidTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  // Mark Paid Modal state
  const [selectedPayoutForPay, setSelectedPayoutForPay] = useState(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  useEffect(() => {
    fetchPayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);


  const fetchPayouts = async () => {
    try {
      setLoading(true);
      const query = statusFilter ? `?status=${statusFilter}` : '';
      const [listRes, summaryRes] = await Promise.all([
        api.get(`/payouts${query}`),
        api.get('/payouts/summary'),
      ]);
      setPayouts(listRes.data.payouts || []);
      setSummary({
        pendingTotal: summaryRes.data.pendingTotal || 0,
        paidTotal: summaryRes.data.paidTotal || 0,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.patch(`/payouts/${id}/approve`);
      fetchPayouts();
    } catch (err) {
      alert(err.response?.data?.message || 'Approval failed');
    }
  };

  const handleMarkPaid = async (e) => {
    e.preventDefault();
    if (!selectedPayoutForPay) return;
    try {
      await api.patch(`/payouts/${selectedPayoutForPay._id}/paid`, {
        paymentReference: paymentRef,
        notes: paymentNote,
      });
      setSelectedPayoutForPay(null);
      setPaymentRef('');
      setPaymentNote('');
      fetchPayouts();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record payment');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Event Crew Payouts & Financial Ledger</h1>
          <p>Transparent shift settlements: Base Session + Approved Overtime + Travel Allowance</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon warning">
            <IconCreditCard size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Pending Payouts</span>
            <span className="kpi-value">₹{summary.pendingTotal.toLocaleString('en-IN')}</span>
            <span className="kpi-sub">Awaiting approval or disbursement</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon success">
            <IconCheckCircle size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Total Disbursed (Paid)</span>
            <span className="kpi-value">₹{summary.paidTotal.toLocaleString('en-IN')}</span>
            <span className="kpi-sub">Total verified crew payments</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          className={`btn ${statusFilter === '' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setStatusFilter('')}
        >
          All Payouts
        </button>
        <button
          className={`btn ${statusFilter === 'pending' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setStatusFilter('pending')}
        >
          Pending
        </button>
        <button
          className={`btn ${statusFilter === 'approved' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setStatusFilter('approved')}
        >
          Approved
        </button>
        <button
          className={`btn ${statusFilter === 'paid' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setStatusFilter('paid')}
        >
          Paid
        </button>
      </div>

      {/* Payouts Table Card */}
      <div className="table-card">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Freelancer</th>
                <th>Event Title</th>
                <th>Base Session</th>
                <th>Approved OT</th>
                <th>Travel Allowance</th>
                <th>Total Payout</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                    {loading ? 'Loading payouts ledger...' : 'No payout records found.'}
                  </td>
                </tr>
              ) : (
                payouts.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <strong>{p.freelancerId?.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.freelancerId?.email}</div>
                    </td>
                    <td>
                      <strong>{p.eventId?.title}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {new Date(p.eventId?.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                      </div>
                    </td>
                    <td>₹{p.basePay}</td>
                    <td>
                      {p.overtimePay > 0 ? (
                        <span style={{ color: '#059669', fontWeight: 600 }}>+ ₹{p.overtimePay}</span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>₹0</span>
                      )}
                    </td>
                    <td>
                      {p.travelAllowance > 0 ? (
                        <span style={{ color: '#2563EB', fontWeight: 600 }}>+ ₹{p.travelAllowance}</span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>₹0</span>
                      )}
                    </td>
                    <td>
                      <strong style={{ fontSize: '1rem', color: '#0F172A' }}>₹{p.totalAmount}</strong>
                    </td>
                    <td>
                      <span className={`badge badge-${p.status}`}>
                        {p.status}
                        {p.paymentReference && ` (${p.paymentReference})`}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {p.status === 'pending' && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleApprove(p._id)}
                          >
                            Approve
                          </button>
                        )}
                        {p.status === 'approved' && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => setSelectedPayoutForPay(p)}
                          >
                            Mark Paid
                          </button>
                        )}
                        {p.status === 'paid' && (
                          <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                            ✓ Disbursed
                          </span>
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

      {/* MARK PAID MODAL */}
      {selectedPayoutForPay && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3>Record Shift Disbursement</h3>
              <button className="modal-close" onClick={() => setSelectedPayoutForPay(null)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleMarkPaid}>
              <div className="modal-body">
                <p style={{ fontSize: '0.88rem', color: '#475569' }}>
                  Marking payment of <strong>₹{selectedPayoutForPay.totalAmount}</strong> to{' '}
                  <strong>{selectedPayoutForPay.freelancerId?.name}</strong>.
                </p>

                <div className="form-group">
                  <label>Payment Reference (UPI / IMPS Ref)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UPI-9849204921 / Bank UTR"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Notes / Method</label>
                  <input
                    type="text"
                    placeholder="e.g. Transferred via PhonePe"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedPayoutForPay(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  Confirm Disbursed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayoutsLedger;
