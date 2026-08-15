import React, { useEffect, useState, useRef } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiToggleLeft, FiToggleRight, FiUpload } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { PaymentMethod } from '../../types';

const typeLabels: Record<string, string> = { bank: '🏦 Bank Transfer', upi: '📱 UPI', cash: '💵 Cash' };

const PaymentMethodList: React.FC = () => {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(false);
  const qrRef = useRef<HTMLInputElement>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [form, setForm] = useState({ method_type: 'bank', account_holder_name: '', bank_name: '', account_number: '', ifsc_code: '', upi_id: '' });

  const fetch = () => api.get('/payment-methods').then(r => setMethods(r.data.data));
  useEffect(() => { fetch(); }, []);

  const openAdd = () => { setEditing(null); setQrPreview(null); setForm({ method_type: 'bank', account_holder_name: '', bank_name: '', account_number: '', ifsc_code: '', upi_id: '' }); setShowModal(true); };
  const openEdit = (m: PaymentMethod) => {
    setEditing(m); setQrPreview(m.qr_image_url || null);
    setForm({ method_type: m.method_type, account_holder_name: m.account_holder_name || '', bank_name: m.bank_name || '', account_number: m.account_number || '', ifsc_code: m.ifsc_code || '', upi_id: m.upi_id || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (qrRef.current?.files?.[0]) fd.append('qr_image', qrRef.current.files[0]);
      if (editing) await api.put(`/payment-methods/${editing.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      else await api.post('/payment-methods', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(editing ? 'Updated!' : 'Created!'); setShowModal(false); fetch();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete payment method?')) return;
    try { await api.delete(`/payment-methods/${id}`); toast.success('Deleted'); fetch(); }
    catch { toast.error('Failed'); }
  };

  const handleToggle = async (id: number) => {
    try { await api.patch(`/payment-methods/${id}/toggle`); fetch(); }
    catch { toast.error('Failed'); }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [f]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Payment Methods</h1></div>
        <button className="btn btn-primary" onClick={openAdd}><FiPlus /> Add Method</button>
      </div>

      <div className="card">
        {methods.length === 0 ? <div className="empty-state"><div className="empty-state-icon">💳</div><h3>No Payment Methods</h3></div>
        : <div className="table-container">
            <table>
              <thead><tr><th>Type</th><th>Details</th><th>QR</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {methods.map(m => (
                  <tr key={m.id}>
                    <td><span style={{ fontWeight: 600 }}>{typeLabels[m.method_type]}</span></td>
                    <td>
                      {m.method_type === 'bank' && <div style={{ fontSize: 12 }}>
                        <div>{m.account_holder_name}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{m.bank_name} • {m.account_number} • {m.ifsc_code}</div>
                      </div>}
                      {m.method_type === 'upi' && <div style={{ fontSize: 13, color: 'var(--accent)' }}>{m.upi_id}</div>}
                      {m.method_type === 'cash' && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cash payment at office</div>}
                    </td>
                    <td>{m.qr_image_url && <img src={m.qr_image_url} alt="QR" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 4 }} />}</td>
                    <td><span className={`badge badge-${m.is_enabled ? 'active' : 'inactive'}`}>{m.is_enabled ? 'Enabled' : 'Disabled'}</span></td>
                    <td><div className="table-actions">
                      <button className="action-btn view" onClick={() => handleToggle(m.id)} title="Toggle">{m.is_enabled ? <FiToggleRight /> : <FiToggleLeft />}</button>
                      <button className="action-btn edit" onClick={() => openEdit(m)}><FiEdit2 /></button>
                      <button className="action-btn delete" onClick={() => handleDelete(m.id)}><FiTrash2 /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Edit' : 'Add'} Payment Method</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label className="form-label">Type *</label>
                <select className="form-control" value={form.method_type} onChange={set('method_type')} required>
                  <option value="bank">Bank Transfer</option><option value="upi">UPI</option><option value="cash">Cash</option>
                </select>
              </div>
              {form.method_type === 'bank' && <>
                <div className="form-group"><label className="form-label">Account Holder Name</label><input className="form-control" value={form.account_holder_name} onChange={set('account_holder_name')} /></div>
                <div className="form-group"><label className="form-label">Bank Name</label><input className="form-control" value={form.bank_name} onChange={set('bank_name')} /></div>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Account Number</label><input className="form-control" value={form.account_number} onChange={set('account_number')} /></div>
                  <div className="form-group"><label className="form-label">IFSC Code</label><input className="form-control" value={form.ifsc_code} onChange={set('ifsc_code')} /></div>
                </div>
              </>}
              {form.method_type === 'upi' && <div className="form-group"><label className="form-label">UPI ID</label><input className="form-control" value={form.upi_id} onChange={set('upi_id')} placeholder="example@upi" /></div>}
              <div className="form-group">
                <label className="form-label">QR Code Image (optional)</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {qrPreview && <img src={qrPreview} alt="QR" style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)' }} />}
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }} onClick={() => qrRef.current?.click()}><FiUpload /> Upload QR
                    <input type="file" ref={qrRef} accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setQrPreview(URL.createObjectURL(f)); }} />
                  </label>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentMethodList;
