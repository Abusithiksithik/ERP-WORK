import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FiX, FiEdit2,
  FiDollarSign, FiPackage, FiTag,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Enrollment, Course, Student, Batch, CourseCategory, BatchStudent, PaymentMethod } from '../../types';
import { useAuth } from '../../context/AuthContext';

/* ─── small helpers ─────────────────────────────────────────── */
const fmt = (n: number | string) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

/* ─── component ─────────────────────────────────────────────── */
const EnrollmentList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  /* ── enrollments ── */
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [showPayModal, setShowPayModal]         = useState(false);
  const [payLoading, setPayLoading]             = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountLoading, setDiscountLoading]   = useState(false);
  const [discountAmount, setDiscountAmount]     = useState('');
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);

  const [payForm, setPayForm] = useState({
    amount: '', payment_date: new Date().toISOString().split('T')[0],
    payment_method_id: '',
    notes: '',
  });

  /* ── categories / courses (kept for potential future use in enroll cascade) ── */
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [courses, setCourses]       = useState<Course[]>([]);
  const [students, setStudents]     = useState<Student[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  /* ── fetchers ── */
  const fetchEnrollments = useCallback(async () => {
    try {
      const r = await api.get('/enrollments', { params: filterStatus ? { status: filterStatus } : {} });
      setEnrollments(r.data.data);
    } catch { toast.error('Failed to load enrollments'); }
  }, [filterStatus]);

  const fetchCourses = useCallback(async () => {
    try {
      const r = await api.get('/courses');
      setCourses(r.data.data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);
  useEffect(() => { fetchCourses(); },    [fetchCourses]);
  useEffect(() => {
    api.get('/categories').then(r => setCategories(r.data.data || [])).catch(() => {});
    // Load all configured payment methods. The payment form can use any method
    // that exists in Settings, including methods that were previously disabled.
    api.get('/payment-methods').then(r => setPaymentMethods(r.data.data || [])).catch(() => setPaymentMethods([]));
    if (isAdmin) api.get('/students').then(r => setStudents(r.data.data || [])).catch(() => {});
  }, [isAdmin]);

  /* ── record payment submit ── */
  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment) return;
    if (!payForm.amount || Number(payForm.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setPayLoading(true);
    try {
      await api.post('/payments', {
        student_id:    selectedEnrollment.student_id,
        enrollment_id: selectedEnrollment.id,
        amount:        Number(payForm.amount),
        payment_date:  payForm.payment_date,
        payment_method_id: payForm.payment_method_id ? Number(payForm.payment_method_id) : null,
        notes:         payForm.notes,
      });
      toast.success('Payment recorded!');
      setShowPayModal(false);
      fetchEnrollments();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setPayLoading(false); }
  };

  const openDiscountModal = (enr: Enrollment) => {
    setSelectedEnrollment(enr);
    setDiscountAmount(Number(enr.discount || 0) > 0 ? String(enr.discount) : '');
    setShowDiscountModal(true);
  };

  const handleDiscountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment) return;
    const amount = Number(discountAmount);
    const baseFee = Number(selectedEnrollment.total_fee || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid discount amount');
      return;
    }
    if (amount > baseFee) {
      toast.error(`Discount cannot exceed ${fmt(baseFee)}`);
      return;
    }
    setDiscountLoading(true);
    try {
      await api.post(`/enrollments/${selectedEnrollment.id}/discount`, { discount: amount });
      toast.success('Discount applied!');
      setShowDiscountModal(false);
      setSelectedEnrollment(null);
      fetchEnrollments();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply discount');
    } finally {
      setDiscountLoading(false);
    }
  };

  /* ── approve / reject ── */

  /* ── form helpers ── */
  const setP = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setPayForm(p => ({ ...p, [f]: e.target.value }));

  const openPayModal = async (enr: Enrollment) => {
    setSelectedEnrollment(enr);
    setPayForm({
      amount:           '',
      payment_date:     new Date().toISOString().split('T')[0],
      payment_method_id: '',
      notes:            '',
    });
    // Refresh payment methods when opening the modal so newly added/enabled
    // methods are immediately available without a page reload.
    try {
      const r = await api.get('/payment-methods');
      setPaymentMethods(r.data.data || []);
    } catch {
      // Keep any methods already loaded.
    }
    setShowPayModal(true);
  };

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Enrollment Management</h1>
          <p className="page-subtitle">View and manage candidate enrollments</p>
        </div>
      </div>

      {/* ══════════ ENROLLMENTS TABLE ══════════ */}
      <div className="card">
        <div className="search-bar">
          <select className="form-control filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="approved">Approved</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </div>

        {enrollments.length === 0
          ? <div className="empty-state"><div className="empty-state-icon">📋</div><h3>No Enrollments</h3></div>
          : <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Course</th>
                    <th>Batch</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Total Fee</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(enr => {
                    const hasBalance = Number(enr.balance_amount) > 0;
                    return (
                      <tr key={enr.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{enr.student_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{enr.student_code}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{enr.course_name}</div>
                          {enr.category_name && (
                            <span style={{ fontSize: 11, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', padding: '1px 7px', borderRadius: 10, fontWeight: 600, display: 'inline-block', marginTop: 3 }}>
                              {enr.category_name}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{enr.batch_name || '—'}</td>
                        <td style={{ fontSize: 13 }}>{new Date(enr.enrolled_at).toLocaleDateString()}</td>
                        <td><span className={`badge badge-${enr.status}`}>{enr.status}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                          {Number(enr.total_fee) > 0 ? (
                            <div>
                              {Number(enr.discount || 0) > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through', marginBottom: 2 }}>{fmt(enr.total_fee)}</div>
                              )}
                              <span>{fmt(Math.max(0, Number(enr.total_fee) - Number(enr.discount || 0)))}</span>
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--teal)', fontWeight: 600, fontSize: 14 }}>
                          {Number(enr.amount_paid) > 0 ? fmt(enr.amount_paid) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: hasBalance ? 'var(--red)' : 'var(--teal)' }}>
                          {Number(enr.total_fee) > 0
                            ? <span>{hasBalance ? fmt(enr.balance_amount) : '✓ Cleared'}</span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                        {isAdmin && (
                          <td>
                            <div className="table-actions">
                              {/* Edit Student */}
                              <Link
                                to={`/students/${enr.student_id}/edit`}
                                className="action-btn edit"
                                title="Edit Candidate"
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <FiEdit2 />
                              </Link>

                              {/* Payment */}
                              <button
                                className="action-btn"
                                onClick={() => openPayModal(enr)}
                                title="Record Payment"
                                style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--teal)' }}
                              >
                                <FiDollarSign />
                              </button>
                              {/* Discount — separate action */}
                              <button
                                className="action-btn"
                                onClick={() => openDiscountModal(enr)}
                                title="Discount"
                                style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--amber)' }}
                              >
                                <FiTag />
                              </button>
                              {/* Materials */}
                              <button
                                className="action-btn"
                                title="View Materials"
                                style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--accent-2)' }}
                                onClick={() => window.open(`/materials?course_id=${enr.course_id}`, '_self')}
                              >
                                <FiPackage />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
      </div>

      {/* ══════════ PAYMENT MODAL ══════════ */}
      {showPayModal && selectedEnrollment && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">💰 Record Payment</h2>
              <button className="modal-close" onClick={() => setShowPayModal(false)}><FiX /></button>
            </div>

            {/* Student + fee summary */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '12px 14px', marginBottom: 18, border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{selectedEnrollment.student_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {selectedEnrollment.course_name}{selectedEnrollment.batch_name ? ` · ${selectedEnrollment.batch_name}` : ''}
              </div>
              {/* Fee breakdown summary */}
              {Number(selectedEnrollment.total_fee) > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {Number(selectedEnrollment.course_fee) > 0 && <span style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 6 }}>Course: {fmt(selectedEnrollment.course_fee)}</span>}
                  {Number(selectedEnrollment.hostel_fee) > 0 && <span style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 6 }}>Hostel: {fmt(selectedEnrollment.hostel_fee)}</span>}
                  {Number(selectedEnrollment.uniform_fee) > 0 && <span style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 6 }}>Uniform: {fmt(selectedEnrollment.uniform_fee)}</span>}
                  {Number(selectedEnrollment.materials_fee) > 0 && <span style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 6 }}>Materials: {fmt(selectedEnrollment.materials_fee)}</span>}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Fee</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(selectedEnrollment.total_fee)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Discount</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)' }}>{fmt(selectedEnrollment.discount || 0)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Final Fee</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(Math.max(0, Number(selectedEnrollment.total_fee) - Number(selectedEnrollment.discount || 0)))}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Balance</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: Number(selectedEnrollment.balance_amount) > 0 ? 'var(--red)' : 'var(--teal)' }}>
                    {Number(selectedEnrollment.balance_amount) > 0 ? fmt(selectedEnrollment.balance_amount) : '✓ Cleared'}
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handlePaySubmit}>
              <div className="form-group">
                <label className="form-label">Amount Paid ₹ *</label>
                <input
                  type="number"
                  className="form-control"
                  value={payForm.amount}
                  onChange={setP('amount')}
                  min={1}
                  max={Number(selectedEnrollment.balance_amount) || undefined}
                  placeholder={`e.g. ${fmt(selectedEnrollment.balance_amount).replace('₹', '')}`}
                  required
                  autoFocus
                />
                {Number(payForm.amount) > 0 && Number(selectedEnrollment.balance_amount) > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Remaining after this payment:{' '}
                    <strong style={{ color: Math.max(0, Number(selectedEnrollment.balance_amount) - Number(payForm.amount)) > 0 ? 'var(--red)' : 'var(--teal)' }}>
                      {fmt(Math.max(0, Number(selectedEnrollment.balance_amount) - Number(payForm.amount)))}
                    </strong>
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Payment Date</label>
                <input type="date" className="form-control" value={payForm.payment_date} onChange={setP('payment_date')} />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select className="form-control" value={payForm.payment_method_id} onChange={e => setPayForm(p => ({ ...p, payment_method_id: e.target.value }))}>
                  <option value="">Select Payment Method</option>
                  {paymentMethods.map(method => (
                    <option key={method.id} value={String(method.id)}>
                      {method.method_type === 'upi' ? 'UPI' : method.method_type === 'bank' ? 'Bank' : 'Cash'}
                      {method.upi_id ? ` — ${method.upi_id}` : method.bank_name ? ` — ${method.bank_name}` : method.account_holder_name ? ` — ${method.account_holder_name}` : ''}
                    </option>
                  ))}
                </select>
                {paymentMethods.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
                    No payment methods configured. Add one in Settings → Payment Methods.
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Notes / Reference</label>
                <input className="form-control" value={payForm.notes} onChange={setP('notes')} placeholder="e.g. Cash, cheque no, UPI ref..." />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={payLoading}>{payLoading ? 'Recording...' : '✓ Record Payment'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPayModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════ COURSE DISCOUNT MODAL ══════════ */}
      {showDiscountModal && selectedEnrollment && (
        <div className="modal-overlay" onClick={() => setShowDiscountModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">🏷️ Apply Discount</h2>
              <button className="modal-close" onClick={() => setShowDiscountModal(false)}><FiX /></button>
            </div>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '12px 14px', marginBottom: 18, border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{selectedEnrollment.student_name} — {selectedEnrollment.student_code}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{selectedEnrollment.course_name}{selectedEnrollment.batch_name ? ` · ${selectedEnrollment.batch_name}` : ''}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <span>Total: <strong>{fmt(selectedEnrollment.total_fee)}</strong></span>
                <span>Discount: <strong style={{ color: 'var(--amber)' }}>{fmt(selectedEnrollment.discount || 0)}</strong></span>
                <span>Final: <strong style={{ color: 'var(--teal)' }}>{fmt(Math.max(0, Number(selectedEnrollment.total_fee) - Number(selectedEnrollment.discount || 0)))}</strong></span>
              </div>
            </div>
            <form onSubmit={handleDiscountSubmit}>
              <div className="form-group">
                <label className="form-label">Discount Amount (₹) *</label>
                <input type="number" className="form-control" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} min={0} max={Number(selectedEnrollment.total_fee) || 0} step="0.01" placeholder="e.g. 1000" required autoFocus />
                {discountAmount !== '' && Number(discountAmount) >= 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>Actual course fee after discount: <strong style={{ color: 'var(--teal)' }}>{fmt(Math.max(0, Number(selectedEnrollment.total_fee) - Number(discountAmount || 0)))}</strong></p>
                )}
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={discountLoading}>{discountLoading ? 'Applying...' : '✓ Apply Discount'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDiscountModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnrollmentList;
