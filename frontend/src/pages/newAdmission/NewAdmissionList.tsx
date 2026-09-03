import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiPlus, FiTrash2, FiExternalLink, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import api from '../../api/axios';

interface AdmissionRow {
  admission_id: number;
  student_id: number;
  admission_created_at: string;
  full_name: string;
  mobile: string;
  email: string | null;
  date_of_birth: string | null;
  joining_date: string | null;
  gender: string | null;
  address: string | null;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const NewAdmissionList: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<AdmissionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/new-admissions');
      setRows(res.data.data || []);
    } catch {
      toast.error('Failed to load admissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/new-admissions/${deleteTarget.admission_id}`);
      toast.success('Admission entry removed');
      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>New Admissions</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
            {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={fetchData}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FiRefreshCw size={14} /> Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/new-admissions/add')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FiPlus size={16} /> New Admission
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: 15 }}>No admission entries yet.</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/new-admissions/add')}
              style={{ marginTop: 12 }}
            >
              Add First Admission
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>DOB</th>
                  <th>Joining Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.admission_id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{idx + 1}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{row.full_name}</span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{row.mobile}</td>
                    <td style={{ fontSize: 13, color: row.email ? 'inherit' : 'var(--text-muted)' }}>
                      {row.email || '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{fmtDate(row.date_of_birth)}</td>
                    <td style={{ fontSize: 13 }}>{fmtDate(row.joining_date)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '5px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                          onClick={() => navigate(`/students/${row.student_id}/edit`)}
                          title="Full Details"
                        >
                          <FiExternalLink size={13} /> Full Details
                        </button>
                        <button
                          style={{
                            padding: '5px 10px', fontSize: 12,
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: 8, color: '#f87171', cursor: 'pointer',
                          }}
                          onClick={() => setDeleteTarget(row)}
                          title="Delete admission entry"
                        >
                          <FiTrash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(239,68,68,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px',
              }}>
                <FiAlertCircle size={26} color="#f87171" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Remove Admission Entry?</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                This will remove <strong>{deleteTarget.full_name}</strong> from the New Admissions list.
              </p>
              <p style={{
                fontSize: 12, color: 'var(--text-muted)', marginTop: 8,
                padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8,
              }}>
                The student record, enrollment, and all related data will <strong>NOT</strong> be deleted.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                autoFocus
              >
                Cancel
              </button>
              <button
                style={{
                  flex: 1, padding: '10px 20px',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none', borderRadius: 10, color: '#fff',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Removing…' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewAdmissionList;
