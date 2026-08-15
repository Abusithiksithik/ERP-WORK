import React, { useEffect, useState } from 'react';
import { FiPlus, FiX, FiCheck, FiXCircle, FiEdit2 } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Payment, PaymentMethod, Student } from '../../types';
import { useAuth } from '../../context/AuthContext';

const emptyForm = {
  student_id: '',
  payment_method_id: '',
  amount: '',
  payment_date: new Date().toISOString().split('T')[0],
  transaction_reference: '',
  notes: '',
  status: 'pending',
};

const PaymentList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [payments, setPayments] = useState<Payment[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyId, setVerifyId] = useState<number | null>(null);
  const [verifyStatus, setVerifyStatus] = useState('verified');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const fetchPayments = async () => {
    const params: any = {};
    if (filterStatus) params.status = filterStatus;
    const r = await api.get('/payments', { params });
    setPayments(r.data.data);
  };

  useEffect(() => {
    fetchPayments();
    api.get('/payment-methods').then(r => setMethods(r.data.data.filter((m: PaymentMethod) => m.is_enabled)));
    if (isAdmin) api.get('/students').then(r => setStudents(r.data.data));
  }, [filterStatus]);

  const openAdd = () => {
    setEditingPayment(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (p: Payment) => {
    setEditingPayment(p);
    setForm({
      student_id: String(p.student_id),
      payment_method_id: p.payment_method_id ? String(p.payment_method_id) : '',
      amount: String(p.amount),
      payment_date: p.payment_date ? p.payment_date.split('T')[0] : new Date().toISOString().split('T')[0],
      transaction_reference: p.transaction_reference || '',
      notes: p.notes || '',
      status: p.status,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingPayment) {
        await api.put(`/payments/${editingPayment.id}`, form);
        toast.success('Payment updated!');
      } else {
        await api.post('/payments', form);
        toast.success('Payment recorded!');
      }
      setShowModal(false);
      fetchPayments();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyId) return;
    setLoading(true);
    try {
      await api.patch(`/payments/${verifyId}/verify`, { status: verifyStatus });
      toast.success(`Payment ${verifyStatus}!`);
      setShowVerifyModal(false);
      fetchPayments();
    } catch {
      toast.error('Failed');
    } finally {
      setLoading(false);
    }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">{payments.length} records</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>
            <FiPlus /> Record Payment
          </button>
        )}
      </div>

      <div className="card">
        <div className="search-bar">
          <select className="form-control filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {payments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <h3>No Payments</h3>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.student_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.student_code}</div>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--teal)' }}>₹{Number(p.amount).toLocaleString()}</td>
                    <td style={{ textTransform: 'capitalize' }}>{p.method_type || '—'}</td>
                    <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.transaction_reference || '—'}</td>
                    <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                    {isAdmin && (
                      <td>
                        <div className="table-actions">
                          {/* Edit button — always available for admin */}
                          <button
                            className="action-btn edit"
                            title="Edit Payment"
                            onClick={() => openEdit(p)}
                          >
                            <FiEdit2 />
                          </button>
                          {/* Verify / Reject — only for pending */}
                          {p.status === 'pending' && (
                            <>
                              <button
                                className="action-btn view"
                                title="Verify"
                                onClick={() => { setVerifyId(p.id); setVerifyStatus('verified'); setShowVerifyModal(true); }}
                              >
                                <FiCheck />
                              </button>
                              <button
                                className="action-btn delete"
                                title="Reject"
                                onClick={() => { setVerifyId(p.id); setVerifyStatus('rejected'); setShowVerifyModal(true); }}
                              >
                                <FiXCircle />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editingPayment ? 'Edit Payment' : 'Record Payment'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit}>
              {isAdmin && (
                <div className="form-group">
                  <label className="form-label">Student *</label>
                  <select className="form-control" value={form.student_id} onChange={set('student_id')} required>
                    <option value="">Select Student</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.student_id})</option>)}
                  </select>
                </div>
              )}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Amount (₹) *</label>
                  <input type="number" className="form-control" value={form.amount} onChange={set('amount')} required min={0} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-control" value={form.payment_date} onChange={set('payment_date')} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select className="form-control" value={form.payment_method_id} onChange={set('payment_method_id')}>
                  <option value="">Select Method</option>
                  {methods.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.method_type.toUpperCase()}{m.upi_id ? ` - ${m.upi_id}` : ''}{m.bank_name ? ` - ${m.bank_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Transaction Reference</label>
                <input className="form-control" value={form.transaction_reference} onChange={set('transaction_reference')} placeholder="UTR/Transaction ID" />
              </div>
              {editingPayment && (
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status} onChange={set('status')}>
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-control" value={form.notes} onChange={set('notes')} rows={2} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : (editingPayment ? 'Update Payment' : 'Record Payment')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verify / Reject Confirmation Modal */}
      {showVerifyModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2 className="modal-title">{verifyStatus === 'verified' ? 'Verify' : 'Reject'} Payment</h2>
              <button className="modal-close" onClick={() => setShowVerifyModal(false)}><FiX /></button>
            </div>
            <p style={{ marginBottom: 20, color: 'var(--text-secondary)' }}>
              Are you sure you want to {verifyStatus === 'verified' ? 'verify' : 'reject'} this payment?
            </p>
            <div className="form-actions">
              <button
                className={`btn ${verifyStatus === 'verified' ? 'btn-success' : 'btn-danger'}`}
                onClick={handleVerify}
                disabled={loading}
              >
                {loading ? 'Processing...' : `Confirm ${verifyStatus === 'verified' ? 'Verify' : 'Reject'}`}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowVerifyModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentList;
