import React, { useEffect, useState, useCallback } from 'react';
import { FiEdit2, FiDollarSign, FiX, FiSearch, FiClock } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface HostelStudent {
  hostel_record_id: number;
  student_id: number;
  student_code: string;
  full_name: string;
  mobile: string;
  course_name: string | null;
  batch_name: string | null;
  hostel_fee: number;
  mess_fee: number;
  total_fee: number;
  paid_amount: number;
  pending_balance: number;
  notes: string | null;
}

interface HostelPayment {
  id: number;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Safely convert any value (string | number | null) to a JS number */
const toNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? 0 : n;
};

/** Format a number as Indian rupee string */
const fmt = (v: unknown): string =>
  '₹' + toNum(v).toLocaleString('en-IN', { minimumFractionDigits: 0 });

/** Normalise a raw API row so all fee fields are proper JS numbers */
const normalise = (row: Record<string, unknown>): HostelStudent => ({
  hostel_record_id: toNum(row.hostel_record_id),
  student_id:       toNum(row.student_id),
  student_code:     String(row.student_code ?? ''),
  full_name:        String(row.full_name ?? ''),
  mobile:           String(row.mobile ?? ''),
  course_name:      row.course_name ? String(row.course_name) : null,
  batch_name:       row.batch_name  ? String(row.batch_name)  : null,
  hostel_fee:       toNum(row.hostel_fee),
  mess_fee:         toNum(row.mess_fee),
  total_fee:        toNum(row.total_fee),
  paid_amount:      toNum(row.paid_amount),
  pending_balance:  toNum(row.pending_balance),
  notes:            row.notes ? String(row.notes) : null,
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const HostelList: React.FC = () => {
  const [students, setStudents]       = useState<HostelStudent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');

  // ── Edit Fee modal ──────────────────────────────────────────────────────
  const [editModal, setEditModal]     = useState(false);
  const [editTarget, setEditTarget]   = useState<HostelStudent | null>(null);
  const [feeForm, setFeeForm]         = useState({ hostel_fee: '', mess_fee: '', notes: '' });
  const [savingFee, setSavingFee]     = useState(false);

  // ── Add Payment modal ───────────────────────────────────────────────────
  const [payModal, setPayModal]       = useState(false);
  const [payTarget, setPayTarget]     = useState<HostelStudent | null>(null);
  const [payForm, setPayForm]         = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    reference: '',
    notes: '',
  });
  const [savingPay, setSavingPay]     = useState(false);

  // ── Payment History modal ───────────────────────────────────────────────
  const [historyModal, setHistoryModal]     = useState(false);
  const [historyTarget, setHistoryTarget]   = useState<HostelStudent | null>(null);
  const [payments, setPayments]             = useState<HostelPayment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      const r = await api.get('/hostel', { params });
      const rows: Record<string, unknown>[] = r.data.data || [];
      setStudents(rows.map(normalise));
    } catch {
      toast.error('Failed to load hostel students');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  // ─────────────────────────────────────────────────────────────────────────
  // Summary stats
  // ─────────────────────────────────────────────────────────────────────────
  const totalStudents = students.length;
  const totalFee      = students.reduce((s, r) => s + r.total_fee,      0);
  const totalPaid     = students.reduce((s, r) => s + r.paid_amount,     0);
  const totalPending  = students.reduce((s, r) => s + r.pending_balance, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // Edit Fee handlers
  // ─────────────────────────────────────────────────────────────────────────
  const openEdit = (s: HostelStudent) => {
    setEditTarget(s);
    setFeeForm({
      hostel_fee: String(s.hostel_fee),
      mess_fee:   String(s.mess_fee),
      notes:      s.notes ?? '',
    });
    setEditModal(true);
  };

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    const hf = parseFloat(feeForm.hostel_fee);
    const mf = parseFloat(feeForm.mess_fee);
    if (isNaN(hf) || hf < 0) { toast.error('Hostel fee must be 0 or more'); return; }
    if (isNaN(mf) || mf < 0) { toast.error('Mess fee must be 0 or more'); return; }

    setSavingFee(true);
    try {
      const r = await api.put(`/hostel/${editTarget.hostel_record_id}`, {
        hostel_fee: hf,
        mess_fee:   mf,
        notes:      feeForm.notes || null,
      });
      // Update local state directly from server response
      const updated = r.data.data as Record<string, unknown>;
      setStudents(prev =>
        prev.map(s =>
          s.hostel_record_id === editTarget.hostel_record_id
            ? {
                ...s,
                hostel_fee:      toNum(updated.hostel_fee),
                mess_fee:        toNum(updated.mess_fee),
                total_fee:       toNum(updated.total_fee),
                pending_balance: toNum(updated.pending_balance),
                notes:           updated.notes ? String(updated.notes) : null,
              }
            : s
        )
      );
      toast.success('Fees updated successfully');
      setEditModal(false);
    } catch {
      toast.error('Failed to update fees');
    } finally {
      setSavingFee(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Add Payment handlers
  // ─────────────────────────────────────────────────────────────────────────
  const openPay = (s: HostelStudent) => {
    setPayTarget(s);
    setPayForm({
      amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      reference: '',
      notes: '',
    });
    setPayModal(true);
  };

  const handleSavePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;

    const amt = parseFloat(payForm.amount);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount greater than 0'); return; }

    setSavingPay(true);
    try {
      const r = await api.post(`/hostel/${payTarget.hostel_record_id}/payments`, {
        amount:         amt,
        payment_date:   payForm.payment_date,
        payment_method: payForm.payment_method,
        reference:      payForm.reference  || null,
        notes:          payForm.notes      || null,
      });
      // Update local state directly from server response
      const updated = r.data.data as Record<string, unknown> | null;
      if (updated) {
        setStudents(prev =>
          prev.map(s =>
            s.hostel_record_id === payTarget.hostel_record_id
              ? {
                  ...s,
                  paid_amount:     toNum(updated.paid_amount),
                  pending_balance: toNum(updated.pending_balance),
                }
              : s
          )
        );
      }
      toast.success('Payment recorded successfully');
      setPayModal(false);
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setSavingPay(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Payment History handlers
  // ─────────────────────────────────────────────────────────────────────────
  const openHistory = async (s: HostelStudent) => {
    setHistoryTarget(s);
    setHistoryModal(true);
    setPayments([]);
    setLoadingHistory(true);
    try {
      const r = await api.get(`/hostel/${s.hostel_record_id}/payments`);
      const rows: Record<string, unknown>[] = r.data.data || [];
      setPayments(rows.map(p => ({
        id:               toNum(p.id),
        amount:           toNum(p.amount),
        payment_date:     String(p.payment_date ?? ''),
        payment_method:   String(p.payment_method ?? 'cash'),
        reference:        p.reference  ? String(p.reference)  : null,
        notes:            p.notes      ? String(p.notes)      : null,
        recorded_by_name: p.recorded_by_name ? String(p.recorded_by_name) : null,
        created_at:       String(p.created_at ?? ''),
      })));
    } catch {
      toast.error('Failed to load payment history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Fee edit live preview
  // ─────────────────────────────────────────────────────────────────────────
  const previewTotal   = (parseFloat(feeForm.hostel_fee) || 0) + (parseFloat(feeForm.mess_fee) || 0);
  const previewPending = Math.max(0, previewTotal - (editTarget?.paid_amount ?? 0));

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🏠 Hostel Management</h1>
          <p className="page-subtitle">Students staying in hostel — fee tracking &amp; payments</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Hostel Students', value: String(totalStudents), icon: '🏠', color: 'var(--accent)' },
          { label: 'Total Fee',       value: fmt(totalFee),          icon: '💰', color: '#f59e0b' },
          { label: 'Total Paid',      value: fmt(totalPaid),         icon: '✅', color: '#10b981' },
          { label: 'Total Pending',   value: fmt(totalPending),      icon: '⏳', color: '#ef4444' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28 }}>{stat.icon}</div>
            <div>
              <div style={{ fontSize: stat.label === 'Hostel Students' ? 22 : 16, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* List card */}
      <div className="card">
        {/* Search */}
        <div className="search-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="search-input-wrap" style={{ flex: 1, minWidth: 200 }}>
            <FiSearch className="search-icon" />
            <input
              className="form-control search-input"
              placeholder="Search by name, student ID, mobile..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏠</div>
            <h3>No Hostel Students</h3>
            <p>Students whose Accommodation Type is set to "Hostel" will appear here automatically.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course / Batch</th>
                  <th>Hostel Fee</th>
                  <th>Mess Fee</th>
                  <th>Total Fee</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => {
                  const cleared = s.pending_balance <= 0;
                  return (
                    <tr key={s.hostel_record_id}>
                      {/* Student info */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 8,
                            background: 'rgba(99,102,241,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                          }}>🏠</div>
                          <div>
                            <div style={{ fontWeight: 700 }}>{s.full_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.student_code}</div>
                          </div>
                        </div>
                      </td>

                      {/* Course / Batch */}
                      <td>
                        <div style={{ fontSize: 13 }}>{s.course_name || '—'}</div>
                        {s.batch_name && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.batch_name}</div>
                        )}
                      </td>

                      {/* Fee columns */}
                      <td style={{ fontWeight: 600 }}>{fmt(s.hostel_fee)}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(s.mess_fee)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(s.total_fee)}</td>
                      <td style={{ fontWeight: 600, color: '#10b981' }}>{fmt(s.paid_amount)}</td>

                      {/* Pending badge */}
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                          fontSize: 12, fontWeight: 700,
                          color:      cleared ? '#10b981' : '#ef4444',
                          background: cleared ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        }}>
                          {cleared ? '✓ Cleared' : fmt(s.pending_balance)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="table-actions">
                          <button
                            className="action-btn edit"
                            title="Edit Fees"
                            onClick={() => openEdit(s)}
                          >
                            <FiEdit2 />
                          </button>
                          <button
                            className="action-btn"
                            title="Add Payment"
                            style={{
                              color: '#10b981', background: 'rgba(16,185,129,0.1)',
                              border: 'none', borderRadius: 8, width: 32, height: 32,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            }}
                            onClick={() => openPay(s)}
                          >
                            <FiDollarSign />
                          </button>
                          <button
                            className="action-btn"
                            title="Payment History"
                            style={{
                              color: '#f59e0b', background: 'rgba(245,158,11,0.1)',
                              border: 'none', borderRadius: 8, width: 32, height: 32,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            }}
                            onClick={() => openHistory(s)}
                          >
                            <FiClock />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ──────────────────────────── Edit Fee Modal ──────────────────────────── */}
      {editModal && editTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">✏️ Edit Hostel Fees</h2>
              <button className="modal-close" onClick={() => setEditModal(false)}><FiX /></button>
            </div>

            {/* Student info strip */}
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700 }}>{editTarget.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{editTarget.student_code}</div>
            </div>

            <form onSubmit={handleSaveFee}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Hostel Fee (₹)</label>
                  <input
                    type="number" className="form-control" min="0" step="any"
                    value={feeForm.hostel_fee}
                    onChange={e => setFeeForm(f => ({ ...f, hostel_fee: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mess Fee (₹)</label>
                  <input
                    type="number" className="form-control" min="0" step="any"
                    value={feeForm.mess_fee}
                    onChange={e => setFeeForm(f => ({ ...f, mess_fee: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Notes (optional)</label>
                  <textarea
                    className="form-control" rows={2}
                    value={feeForm.notes}
                    onChange={e => setFeeForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>

              {/* Live preview */}
              <div style={{
                padding: '12px 14px', background: 'rgba(16,185,129,0.07)',
                borderRadius: 8, marginBottom: 16, fontSize: 13,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>New Total Fee</span>
                  <strong>{fmt(previewTotal)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Already Paid</span>
                  <span style={{ color: '#10b981' }}>{fmt(editTarget.paid_amount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>New Pending</span>
                  <span style={{ color: previewPending > 0 ? '#ef4444' : '#10b981' }}>
                    {previewPending <= 0 ? '✓ Cleared' : fmt(previewPending)}
                  </span>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={savingFee}>
                  {savingFee ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────── Add Payment Modal ───────────────────────── */}
      {payModal && payTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 className="modal-title">💵 Add Payment</h2>
              <button className="modal-close" onClick={() => setPayModal(false)}><FiX /></button>
            </div>

            {/* Balance summary */}
            <div style={{
              marginBottom: 16, padding: '12px 14px',
              background: 'rgba(16,185,129,0.07)', borderRadius: 8,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {payTarget.full_name} — {payTarget.student_code}
              </div>
              <div style={{ fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>Total: <strong>{fmt(payTarget.total_fee)}</strong></span>
                <span>Paid: <strong style={{ color: '#10b981' }}>{fmt(payTarget.paid_amount)}</strong></span>
                <span>Pending: <strong style={{ color: payTarget.pending_balance > 0 ? '#ef4444' : '#10b981' }}>
                  {payTarget.pending_balance <= 0 ? '✓ Cleared' : fmt(payTarget.pending_balance)}
                </strong></span>
              </div>
            </div>

            <form onSubmit={handleSavePay}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Amount (₹) *</label>
                  <input
                    type="number" className="form-control" min="1" step="any"
                    placeholder="e.g. 2000"
                    value={payForm.amount}
                    onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Date *</label>
                  <input
                    type="date" className="form-control"
                    value={payForm.payment_date}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select
                    className="form-control"
                    value={payForm.payment_method}
                    onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Reference (optional)</label>
                  <input
                    className="form-control"
                    placeholder="Transaction ID / Receipt No."
                    value={payForm.reference}
                    onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Notes (optional)</label>
                  <textarea
                    className="form-control" rows={2}
                    value={payForm.notes}
                    onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={savingPay}>
                  {savingPay ? 'Recording...' : 'Record Payment'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setPayModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────── Payment History Modal ──────────────────── */}
      {historyModal && historyTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <h2 className="modal-title">📋 Payment History</h2>
              <button className="modal-close" onClick={() => setHistoryModal(false)}><FiX /></button>
            </div>

            {/* Student summary */}
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(99,102,241,0.08)', borderRadius: 8,
            }}>
              <div style={{ fontWeight: 700 }}>{historyTarget.full_name} — {historyTarget.student_code}</div>
              <div style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>Total: <strong>{fmt(historyTarget.total_fee)}</strong></span>
                <span>Paid: <strong style={{ color: '#10b981' }}>{fmt(historyTarget.paid_amount)}</strong></span>
                <span>Pending: <strong style={{ color: historyTarget.pending_balance > 0 ? '#ef4444' : '#10b981' }}>
                  {historyTarget.pending_balance <= 0 ? '✓ Cleared' : fmt(historyTarget.pending_balance)}
                </strong></span>
              </div>
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                Loading payment history...
              </div>
            ) : payments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                No payments recorded yet for this student.
              </div>
            ) : (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {['Date', 'Amount', 'Method', 'Reference', 'Recorded By'].map(h => (
                        <th key={h} style={{
                          padding: '8px 12px', textAlign: 'left',
                          fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                          position: 'sticky', top: 0, background: 'var(--bg-secondary)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>
                          {p.payment_date
                            ? new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                          {fmt(p.amount)}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textTransform: 'capitalize' }}>
                          {p.payment_method.replace('_', ' ')}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                          {p.reference || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                          {p.recorded_by_name || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setHistoryModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostelList;
