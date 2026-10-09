import React, { useState, useEffect } from 'react';
import LeadList from './LeadList';
import LeadDetail from './LeadDetail';
import AddLead from './AddLead';

const Dashboard = ({ leads, user, fetchLeads }) => {
  const [selectedLead, setSelectedLead] = useState(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchLeads(
      { search: searchTerm, status: statusFilter, source: sourceFilter, page: currentPage },
      setTotalPages // pass setter so fetchLeads can update pagination
    );
  }, [searchTerm, statusFilter, sourceFilter, currentPage, fetchLeads]);

  // Sync selectedLead when the leads array updates via socket
  useEffect(() => {
    if (!selectedLead) return;
    const updatedLead = leads.find((lead) => lead._id === selectedLead._id);
    if (updatedLead && updatedLead !== selectedLead) {
      setSelectedLead(updatedLead);
    }
  }, [leads, selectedLead]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };
  const handleStatusFilter = (e) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };
  const handleSourceFilter = (e) => {
    setSourceFilter(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Plexis Unified Filters & Actions Toolbar */}
      <div className="filter-bar">
        <div style={{ flex: 1, minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Search leads by client name, email, phone..."
            value={searchTerm}
            onChange={handleSearch}
          />
        </div>
        <select value={statusFilter} onChange={handleStatusFilter}>
          <option value="">All Statuses</option>
          <option value="new">New Inquiries</option>
          <option value="contacted">Contacted</option>
          <option value="converted">Converted</option>
        </select>
        <select value={sourceFilter} onChange={handleSourceFilter}>
          <option value="">All Sources</option>
          <option value="Website">Website</option>
          <option value="Referral">Referral</option>
          <option value="Social Media">Social Media</option>
          <option value="WedMeGood">WedMeGood</option>
          <option value="Cold Call">Direct Call</option>
          <option value="Email">Email</option>
        </select>
        <button
          type="button"
          onClick={() => setShowAddLead(true)}
          className="btn btn-primary"
          style={{ whiteSpace: 'nowrap' }}
        >
          + Add Lead
        </button>
      </div>

      {/* Main Table Content */}
      <LeadList leads={leads} onSelectLead={setSelectedLead} user={user} />

      {/* Detail Modal */}
      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          fetchLeads={fetchLeads}
          onClose={() => setSelectedLead(null)}
          user={user}
        />
      )}

      {/* Add Lead Modal */}
      {showAddLead && (
        <AddLead fetchLeads={fetchLeads} onClose={() => setShowAddLead(false)} />
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginTop: '8px',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentPage((p) => p - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span style={{ fontSize: '0.84rem', color: '#64748B' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentPage((p) => p + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;