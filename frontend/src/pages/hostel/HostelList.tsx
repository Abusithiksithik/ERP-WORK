import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { FiEdit2, FiDollarSign, FiX, FiSearch, FiClock, FiLayers } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';

interface HostelStudent {
  hostel_record_id: number;
  student_id: number;
  student_code: string;
  full_name: string;
  mobile: string;
  course_name: string | null;
  batch_name: string | null;
  period_id: number | null;
  period_from: string | null;
  period_to: string | null;
  hostel_fee: number;
  mess_fee: number;
  total_fee: number;
  discount: number;
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

const toNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? '0'));
  return Number.isNaN(n) ? 0 : n;
};

const fmt = (v: unknown): string =>
  '₹' + toNum(v).toLocaleString('en-IN', { minimumFractionDigits: 0 });

const localISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const monthStart = () => {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth(), 1));
};

const monthEnd = () => {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

const monthValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthStartFor = (value: string) => `${value}-01`;
const monthEndFor = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${value}-${String(lastDay).padStart(2, '0')}`;
};
const monthLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const monthOptions = () => {
  const now = new Date();
  return Array.from({ length: 85 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 36 + i, 1);
    return monthValue(d);
  });
};

const displayDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
};

const parseDDMMYYYY = (value: string): string | null => {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  label?: string;
}

const DateField: React.FC<DateFieldProps> = ({ value, onChange, min, max, required, label }) => {
  const [text, setText] = useState(displayDate(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(displayDate(value));
  }, [value]);

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      if ('showPicker' in picker) (picker as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
      else (picker as HTMLInputElement & { click: () => void }).click();
    } catch {
      (picker as HTMLInputElement & { click: () => void }).click();
    }
  };

  return (
    <div className="hostel-date-field">
      <input
        type="text"
        className="form-control"
        value={text}
        placeholder="DD/MM/YYYY"
        inputMode="numeric"
        aria-label={label || 'Date'}
        required={required}
        onChange={e => {
          const next = e.target.value;
          setText(next);
          const iso = parseDDMMYYYY(next);
          if (iso) onChange(iso);
        }}
        onBlur={() => {
          const iso = parseDDMMYYYY(text);
          if (iso) {
            onChange(iso);
            setText(displayDate(iso));
          } else {
            setText(displayDate(value));
          }
        }}
      />
      <button type="button" className="hostel-date-picker-btn" onClick={openPicker} aria-label={`Open ${label || 'date'} calendar`}>
        <FiCalendar />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => onChange(e.target.value)}
        className="hostel-native-date-picker"
      />
    </div>
  );
};

const normalise = (row: Record<string, unknown>): HostelStudent => ({
  hostel_record_id: toNum(row.hostel_record_id),
  student_id: toNum(row.student_id),
  student_code: String(row.student_code ?? ''),
  full_name: String(row.full_name ?? ''),
  mobile: String(row.mobile ?? ''),
  course_name: row.course_name ? String(row.course_name) : null,
  batch_name: row.batch_name ? String(row.batch_name) : null,
  period_id: row.period_id ? toNum(row.period_id) : null,
  period_from: row.period_from ? String(row.period_from) : null,
  period_to: row.period_to ? String(row.period_to) : null,
  hostel_fee: toNum(row.hostel_fee),
  mess_fee: toNum(row.mess_fee),
  total_fee: toNum(row.total_fee),
  discount: toNum(row.discount),
  paid_amount: toNum(row.paid_amount),
  pending_balance: toNum(row.pending_balance),
  notes: row.notes ? String(row.notes) : null,
});

const HostelList: React.FC = () => {
  const [students, setStudents] = useState<HostelStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [periodMonth, setPeriodMonth] = useState(monthValue(new Date()));

  const periodFrom = monthStartFor(periodMonth);
  const periodTo = monthEndFor(periodMonth);

  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<HostelStudent | null>(null);
  const [feeForm, setFeeForm] = useState({ hostel_fee: '', mess_fee: '', notes: '' });
  const [savingFee, setSavingFee] = useState(false);

  const [payModal, setPayModal] = useState(false);
  const [payTarget, setPayTarget] = useState<HostelStudent | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_date: localISO(new Date()), payment_method: 'cash', reference: '', notes: '' });
  const [savingPay, setSavingPay] = useState(false);

  const [discountModal, setDiscountModal] = useState(false);
  const [discountTarget, setDiscountTarget] = useState<HostelStudent | null>(null);
  const [discountAmount, setDiscountAmount] = useState('');
  const [savingDiscount, setSavingDiscount] = useState(false);

  const [historyModal, setHistoryModal] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<HostelStudent | null>(null);
  const [payments, setPayments] = useState<HostelPayment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [bulkModal, setBulkModal] = useState(false);
  const [bulkMonth, setBulkMonth] = useState(monthValue(new Date()));
  const [bulkHostelFee, setBulkHostelFee] = useState('');
  const [bulkMessFee, setBulkMessFee] = useState('');
  const [savingBulk, setSavingBulk] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = { period_month: periodMonth };
      if (search.trim()) params.search = search.trim();
      const r = await api.get('/hostel', { params });
      setStudents((r.data.data || []).map((row: Record<string, unknown>) => normalise(row)));
    } catch {
      toast.error('Failed to load hostel students');
    } finally {
      setLoading(false);
    }
  }, [periodMonth, search]);

  useEffect(() => { load(); }, [load]);

  const totalStudents = students.length;
  const totalFee = useMemo(() => students.reduce((s, r) => s + Math.max(0, r.total_fee - r.discount), 0), [students]);
  const totalPaid = useMemo(() => students.reduce((s, r) => s + r.paid_amount, 0), [students]);
  const totalPending = useMemo(() => students.reduce((s, r) => s + r.pending_balance, 0), [students]);

  const openEdit = (s: HostelStudent) => {
    setEditTarget(s);
    setFeeForm({
      hostel_fee: String(s.hostel_fee),
      mess_fee: String(s.mess_fee),
      notes: s.notes ?? '',
    });
    setEditModal(true);
  };

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const hf = parseFloat(feeForm.hostel_fee);
    const mf = parseFloat(feeForm.mess_fee);
    if (!Number.isFinite(hf) || hf < 0 || !Number.isFinite(mf) || mf < 0) {
      toast.error('Enter valid hostel and mess fees');
      return;
    }
    if (!editTarget.period_id) {
      toast.error('Set the monthly fee for this period first');
      return;
    }
    setSavingFee(true);
    try {
      await api.put(`/hostel/${editTarget.hostel_record_id}`, {
        hostel_fee: hf, mess_fee: mf, period_id: editTarget.period_id, period_month: periodMonth, notes: feeForm.notes || null,
      });
      toast.success('Fees updated successfully');
      setEditModal(false);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update fees');
    } finally { setSavingFee(false); }
  };

  const openPay = (s: HostelStudent) => {
    if (!s.period_id) {
      toast.error('Set the hostel fee period first');
      return;
    }
    setPayTarget(s);
    setPayForm({ amount: '', payment_date: localISO(new Date()), payment_method: 'cash', reference: '', notes: '' });
    setPayModal(true);
  };

  const handleSavePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || !payTarget.period_id) return;
    const amt = parseFloat(payForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter a valid amount greater than 0'); return; }
    setSavingPay(true);
    try {
      await api.post(`/hostel/${payTarget.hostel_record_id}/payments`, {
        amount: amt,
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        reference: payForm.reference || null,
        notes: payForm.notes || null,
        period_id: payTarget.period_id,
      });
      toast.success('Payment recorded successfully');
      setPayModal(false);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    } finally { setSavingPay(false); }
  };

  const openDiscount = (s: HostelStudent) => {
    if (!s.period_id) {
      toast.error('Set the hostel fee period first');
      return;
    }
    setDiscountTarget(s);
    setDiscountAmount(s.discount ? String(s.discount) : '');
    setDiscountModal(true);
  };

  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountTarget || !discountTarget.period_id) return;
    const amt = parseFloat(discountAmount);
    if (!Number.isFinite(amt) || amt < 0) { toast.error('Enter a valid discount amount'); return; }
    setSavingDiscount(true);
    try {
      await api.post(`/hostel/${discountTarget.hostel_record_id}/discount`, { discount: amt, period_id: discountTarget.period_id });
      toast.success('Discount applied!');
      setDiscountModal(false);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply discount');
    } finally { setSavingDiscount(false); }
  };

  const openHistory = async (s: HostelStudent) => {
    setHistoryTarget(s);
    setHistoryModal(true);
    setPayments([]);
    setLoadingHistory(true);
    try {
      const r = await api.get(`/hostel/${s.hostel_record_id}/payments`, { params: { period_id: s.period_id || undefined } });
      setPayments((r.data.data || []).map((p: Record<string, unknown>) => ({
        id: toNum(p.id), amount: toNum(p.amount), payment_date: String(p.payment_date ?? ''),
        payment_method: String(p.payment_method ?? 'cash'), reference: p.reference ? String(p.reference) : null,
        notes: p.notes ? String(p.notes) : null, recorded_by_name: p.recorded_by_name ? String(p.recorded_by_name) : null,
        created_at: String(p.created_at ?? ''),
      })));
    } catch { toast.error('Failed to load payment history'); }
    finally { setLoadingHistory(false); }
  };

  const handleBulkSetFee = async (e: React.FormEvent) => {
    e.preventDefault();
    const hf = parseFloat(bulkHostelFee);
    const mf = parseFloat(bulkMessFee);
    if (!Number.isFinite(hf) || hf < 0 || !Number.isFinite(mf) || mf < 0) { toast.error('Enter valid hostel and mess fees'); return; }
    if (!/^\d{4}-\d{2}$/.test(bulkMonth)) { toast.error('Select a valid month'); return; }
    setSavingBulk(true);
    try {
      const r = await api.post('/hostel/bulk-period', { period_month: bulkMonth, hostel_fee: hf, mess_fee: mf });
      toast.success(`Fees applied to ${r.data.data?.count || 0} hostel students`);
      setBulkModal(false);
      setPeriodMonth(bulkMonth);
      setBulkHostelFee('');
      setBulkMessFee('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply fees');
    } finally { setSavingBulk(false); }
  };

  const previewTotal = (parseFloat(feeForm.hostel_fee) || 0) + (parseFloat(feeForm.mess_fee) || 0);
  const previewPending = Math.max(0, previewTotal - (editTarget?.discount || 0) - (editTarget?.paid_amount || 0));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🏠 Hostel Management</h1>
          <p className="page-subtitle">Candidates staying in hostel — monthly fee tracking &amp; payments</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setBulkMonth(periodMonth); setBulkHostelFee(''); setBulkMessFee(''); setBulkModal(true); }}>
          <FiLayers /> Set Hostel &amp; Mess Fee
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Hostel Students', value: String(totalStudents), icon: '🏠', color: 'var(--accent)' },
          { label: 'Total Fee', value: fmt(totalFee), icon: '💰', color: '#f59e0b' },
          { label: 'Total Paid', value: fmt(totalPaid), icon: '✅', color: '#10b981' },
          { label: 'Total Pending', value: fmt(totalPending), icon: '⏳', color: '#ef4444' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28 }}>{stat.icon}</div><div>
              <div style={{ fontSize: stat.label === 'Hostel Students' ? 22 : 16, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 220 }}>
            <label className="form-label">Monthly Fee Period</label>
            <select className="form-control" value={periodMonth} onChange={e => setPeriodMonth(e.target.value)}>
              {monthOptions().map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
            </select>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, paddingBottom: 10 }}>
            Period: <strong>{monthLabel(periodMonth)}</strong> ({displayDate(periodFrom)} → {displayDate(periodTo)})
          </div>
        </div>
      </div>

      <div className="card">
        <div className="search-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="search-input-wrap" style={{ flex: 1, minWidth: 200 }}>
            <FiSearch className="search-icon" />
            <input className="form-control search-input" placeholder="Search by name, student ID, mobile..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div> : students.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🏠</div><h3>No Hostel Students</h3><p>Candidates whose Accommodation Type is set to "Hostel" will appear here automatically.</p></div>
        ) : (
          <div className="table-container">
            <table>
              <thead><tr><th>Candidate</th><th>Course / Batch</th><th>Hostel Fee</th><th>Mess Fee</th><th>Total Fee</th><th>Paid</th><th>Pending</th><th>Actions</th></tr></thead>
              <tbody>{students.map(s => {
                const cleared = s.pending_balance <= 0;
                return <tr key={s.hostel_record_id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏠</div><div><div style={{ fontWeight: 700 }}>{s.full_name}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.student_code}</div></div></div></td>
                  <td><div style={{ fontSize: 13 }}>{s.course_name || '—'}</div>{s.batch_name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.batch_name}</div>}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(s.hostel_fee)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(s.mess_fee)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{s.discount > 0 ? <div><div style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through', marginBottom: 2 }}>{fmt(s.total_fee)}</div><span>{fmt(Math.max(0, s.total_fee - s.discount))}</span></div> : fmt(s.total_fee)}</td>
                  <td style={{ fontWeight: 600, color: '#10b981' }}>{fmt(s.paid_amount)}</td>
                  <td><span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: cleared ? '#10b981' : '#ef4444', background: cleared ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>{cleared ? '✓ Cleared' : fmt(s.pending_balance)}</span></td>
                  <td><div className="table-actions">
                    <button className="action-btn edit" title="Edit Fees" onClick={() => openEdit(s)}><FiEdit2 /></button>
                    <button className="action-btn" title="Record Payment" style={{ color: '#10b981', background: 'rgba(16,185,129,0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => openPay(s)}><FiDollarSign /></button>
                    <button className="action-btn" title="Discount" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => openDiscount(s)}>🏷️</button>
                    <button className="action-btn" title="Payment History" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => openHistory(s)}><FiClock /></button>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      {editModal && editTarget && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header"><h2 className="modal-title">✏️ Edit Hostel Fees</h2><button className="modal-close" onClick={() => setEditModal(false)}><FiX /></button></div>
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 8 }}><div style={{ fontWeight: 700 }}>{editTarget.full_name}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{editTarget.student_code}</div></div>
        <form onSubmit={handleSaveFee}>
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Monthly Fee Period</label><div className="form-control" style={{ display: 'flex', alignItems: 'center' }}>{monthLabel(periodMonth)} ({displayDate(periodFrom)} → {displayDate(periodTo)})</div></div>
            <div className="form-group"><label className="form-label">Hostel Fee (₹)</label><input type="number" className="form-control" min="0" step="any" value={feeForm.hostel_fee} onChange={e => setFeeForm(f => ({ ...f, hostel_fee: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">Mess Fee (₹)</label><input type="number" className="form-control" min="0" step="any" value={feeForm.mess_fee} onChange={e => setFeeForm(f => ({ ...f, mess_fee: e.target.value }))} required /></div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={feeForm.notes} onChange={e => setFeeForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.07)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Total Fee</span><strong>{fmt(previewTotal)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>New Pending</span><span style={{ color: previewPending > 0 ? '#ef4444' : '#10b981' }}>{previewPending <= 0 ? '✓ Cleared' : fmt(previewPending)}</span></div></div>
          <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={savingFee}>{savingFee ? 'Saving...' : 'Save Changes'}</button><button type="button" className="btn btn-secondary" onClick={() => setEditModal(false)}>Cancel</button></div>
        </form>
      </div></div>}

      {payModal && payTarget && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header"><h2 className="modal-title">💵 Add Payment</h2><button className="modal-close" onClick={() => setPayModal(false)}><FiX /></button></div>
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(16,185,129,0.07)', borderRadius: 8 }}><div style={{ fontWeight: 700, marginBottom: 6 }}>{payTarget.full_name} — {payTarget.student_code}</div><div style={{ fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}><span>Period: <strong>{displayDate(payTarget.period_from)} - {displayDate(payTarget.period_to)}</strong></span><span>Total: <strong>{fmt(payTarget.total_fee)}</strong></span><span>Paid: <strong style={{ color: '#10b981' }}>{fmt(payTarget.paid_amount)}</strong></span><span>Pending: <strong style={{ color: payTarget.pending_balance > 0 ? '#ef4444' : '#10b981' }}>{payTarget.pending_balance <= 0 ? '✓ Cleared' : fmt(payTarget.pending_balance)}</strong></span></div></div>
        <form onSubmit={handleSavePay}><div className="form-grid">
          <div className="form-group"><label className="form-label">Amount (₹) *</label><input type="number" className="form-control" min="1" step="any" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">Payment Date *</label><DateField value={payForm.payment_date} onChange={v => setPayForm(f => ({ ...f, payment_date: v }))} max={localISO(new Date())} label="Payment Date" required /></div>
          <div className="form-group"><label className="form-label">Payment Method</label><select className="form-control" value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option></select></div>
          <div className="form-group"><label className="form-label">Reference</label><input className="form-control" value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} /></div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div><div className="form-actions"><button type="submit" className="btn btn-primary" disabled={savingPay}>{savingPay ? 'Recording...' : 'Record Payment'}</button><button type="button" className="btn btn-secondary" onClick={() => setPayModal(false)}>Cancel</button></div></form>
      </div></div>}

      {discountModal && discountTarget && <div className="modal-overlay" onClick={() => setDiscountModal(false)}><div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header"><h2 className="modal-title">🏷️ Apply Discount</h2><button className="modal-close" onClick={() => setDiscountModal(false)}><FiX /></button></div>
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(245,158,11,0.07)', borderRadius: 8 }}><div style={{ fontWeight: 700, marginBottom: 6 }}>{discountTarget.full_name} — {discountTarget.student_code}</div><div style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}><span>Period: <strong>{displayDate(discountTarget.period_from)} - {displayDate(discountTarget.period_to)}</strong></span><span>Actual: <strong>{fmt(discountTarget.total_fee)}</strong></span><span>Discount: <strong style={{ color: '#f59e0b' }}>{fmt(discountTarget.discount)}</strong></span><span>Pending: <strong>{fmt(discountTarget.pending_balance)}</strong></span></div></div>
        <form onSubmit={handleSaveDiscount}><div className="form-group"><label className="form-label">Discount Amount (₹) *</label><input type="number" className="form-control" min="0" step="any" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} required />{Number(discountAmount) > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Final Fee: <strong style={{ color: 'var(--teal)' }}>{fmt(Math.max(0, discountTarget.total_fee - Number(discountAmount)))}</strong> · Pending: <strong>{fmt(Math.max(0, discountTarget.total_fee - Number(discountAmount) - discountTarget.paid_amount))}</strong></p>}</div><div className="form-actions"><button type="submit" className="btn btn-primary" disabled={savingDiscount}>{savingDiscount ? 'Applying...' : '✓ Apply Discount'}</button><button type="button" className="btn btn-secondary" onClick={() => setDiscountModal(false)}>Cancel</button></div></form>
      </div></div>}

      {historyModal && historyTarget && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header"><h2 className="modal-title">📋 Payment History</h2><button className="modal-close" onClick={() => setHistoryModal(false)}><FiX /></button></div>
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 8 }}><div style={{ fontWeight: 700 }}>{historyTarget.full_name} — {historyTarget.student_code}</div><div style={{ fontSize: 12, marginTop: 4 }}>Period: <strong>{displayDate(historyTarget.period_from)} - {displayDate(historyTarget.period_to)}</strong> · Paid: <strong style={{ color: '#10b981' }}>{fmt(historyTarget.paid_amount)}</strong></div></div>
        {loadingHistory ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div> : payments.length === 0 ? <div className="empty-state" style={{ padding: 30 }}>No payments for this period.</div> : <div className="table-container"><table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded By</th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td>{displayDate(p.payment_date)}</td><td style={{ fontWeight: 700, color: '#10b981' }}>{fmt(p.amount)}</td><td>{p.payment_method}</td><td>{p.reference || '—'}</td><td>{p.recorded_by_name || '—'}</td></tr>)}</tbody></table></div>}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-secondary" onClick={() => setHistoryModal(false)}>Close</button></div>
      </div></div>}

      {bulkModal && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header"><h2 className="modal-title">🏠 Set Hostel &amp; Mess Fee</h2><button className="modal-close" onClick={() => setBulkModal(false)}><FiX /></button></div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>Set one monthly/custom fee period for <strong>all hostel students</strong>. Previous periods remain unchanged.</p>
        <form onSubmit={handleBulkSetFee}><div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Monthly Fee Period *</label><select className="form-control" value={bulkMonth} onChange={e => setBulkMonth(e.target.value)}>{monthOptions().map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}</select><div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{displayDate(monthStartFor(bulkMonth))} → {displayDate(monthEndFor(bulkMonth))}</div></div>
            <div className="form-group"><label className="form-label">Hostel Fee (₹) *</label><input type="number" className="form-control" min="0" step="any" value={bulkHostelFee} onChange={e => setBulkHostelFee(e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">Mess Fee (₹) *</label><input type="number" className="form-control" min="0" step="any" value={bulkMessFee} onChange={e => setBulkMessFee(e.target.value)} required /></div>
        </div>
        {(bulkHostelFee || bulkMessFee) && <div style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.07)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Period</span><strong>{displayDate(monthStartFor(bulkMonth))} - {displayDate(monthEndFor(bulkMonth))}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Hostel Fee</span><strong>{fmt(parseFloat(bulkHostelFee) || 0)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Mess Fee</span><strong>{fmt(parseFloat(bulkMessFee) || 0)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--border-light)', paddingTop: 6, marginTop: 4 }}><span>Total per Student</span><span style={{ color: 'var(--accent)' }}>{fmt((parseFloat(bulkHostelFee) || 0) + (parseFloat(bulkMessFee) || 0))}</span></div></div>}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, padding: '8px 12px', background: 'rgba(99,102,241,0.07)', borderRadius: 8 }}>This will create/update the selected period for every active hostel student.</div>
        <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={savingBulk}>{savingBulk ? 'Applying...' : '✓ Set Fee'}</button><button type="button" className="btn btn-secondary" onClick={() => setBulkModal(false)}>Cancel</button></div>
        </form>
      </div></div>}
    </div>
  );
};

export default HostelList;
