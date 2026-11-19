import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiPrinter, FiCreditCard, FiRefreshCw, FiArrowLeft } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';

type AnyRow = Record<string, any>;
const money = (v: unknown) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const html = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const methodLabel = (m: AnyRow) => m.method_type === 'bank' ? `Bank${m.bank_name ? ` - ${m.bank_name}` : ''}` : m.method_type === 'upi' ? `UPI${m.upi_id ? ` - ${m.upi_id}` : ''}` : 'Cash';

const PaymentReceipt: React.FC = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [search, setSearch] = useState('');
  const [student, setStudent] = useState<AnyRow | null>(null);
  const [methods, setMethods] = useState<AnyRow[]>([]);
  const [enrollments, setEnrollments] = useState<AnyRow[]>([]);
  const [tuitionPayments, setTuitionPayments] = useState<AnyRow[]>([]);
  const [hostel, setHostel] = useState<AnyRow | null>(null);
  const [hostelHistory, setHostelHistory] = useState<AnyRow | null>(null);
  const [exam, setExam] = useState<AnyRow | null>(null);
  const [examPayments, setExamPayments] = useState<AnyRow[]>([]);
  const [category, setCategory] = useState<'tuition' | 'hostel' | 'exam'>('tuition');
  const [periodId, setPeriodId] = useState('');
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [form, setForm] = useState({ amount: '', methodId: '', paymentDate: today(), reference: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<AnyRow | null>(null);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [first, discontinuedFirst, methodRes] = await Promise.all([
        api.get('/students', { params: { page: 1, limit: 100 } }),
        api.get('/students/discontinued', { params: { page: 1, limit: 100 } }),
        api.get('/payment-methods'),
      ]);
      const pageRequests = (url: string, firstPage: AnyRow) => {
        const pages = Math.ceil(Number(firstPage.data.total || firstPage.data.data?.length || 0) / 100);
        return Array.from({ length: Math.max(0, pages - 1) }, (_, i) => api.get(url, { params: { page: i + 2, limit: 100 } }));
      };
      const [regularRest, discontinuedRest] = await Promise.all([
        Promise.all(pageRequests('/students', first)),
        Promise.all(pageRequests('/students/discontinued', discontinuedFirst)),
      ]);
      const allStudents = [
        ...(first.data.data || []), ...regularRest.flatMap(r => r.data.data || []),
        ...(discontinuedFirst.data.data || []), ...discontinuedRest.flatMap(r => r.data.data || []),
      ];
      setStudents(allStudents.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
      setMethods((methodRes.data.data || []).filter((m: AnyRow) => m.is_enabled));
    } catch (e: any) { toast.error(e.response?.data?.message || 'Unable to load students/payment methods'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadBase(); }, [loadBase]);

  const loadStudent = useCallback(async (s: AnyRow) => {
    setStudent(s); setDetailLoading(true); setLastReceipt(null); setPeriodId('');
    try {
      const [enrRes, tuitionRes, hostelRecordRes, examRes] = await Promise.all([
        api.get('/enrollments', { params: { student_id: s.id } }),
        api.get('/payments', { params: { student_id: s.id, status: 'verified' } }),
        api.get(`/hostel/student/${s.id}`),
        api.get('/exam-fees', { params: { search: s.student_id } }),
      ]);
      const approvedEnrollments = enrRes.data.data || [];
      setEnrollments(approvedEnrollments);
      setSelectedEnrollmentId(approvedEnrollments.find((en: AnyRow) => en.status === 'approved') ? String(approvedEnrollments.find((en: AnyRow) => en.status === 'approved').id) : '');
      setTuitionPayments(tuitionRes.data.data || []);
      const hr = hostelRecordRes.data.data || null;
      setHostel(hr);
      if (hr?.hostel_record_id) {
        const h = await api.get(`/hostel/${hr.hostel_record_id}/history`);
        setHostelHistory(h.data.data);
      } else setHostelHistory(null);
      const er = (examRes.data.data || []).find((r: AnyRow) => Number(r.student_id) === Number(s.id));
      setExam(er || null);
      if (er?.exam_fee_record_id) {
        const eh = await api.get(`/exam-fees/${er.exam_fee_record_id}/payments`);
        setExamPayments(eh.data.data || []);
      } else setExamPayments([]);
    } catch (e: any) { toast.error(e.response?.data?.message || 'Unable to load this student fee details'); }
    finally { setDetailLoading(false); }
  }, []);

  const tuitionTotal = useMemo(() => enrollments.reduce((sum, e) => sum + Math.max(0, Number(e.total_fee || 0) - Number(e.discount || 0)), 0), [enrollments]);
  const tuitionPaid = useMemo(() => enrollments.reduce((sum, e) => sum + Number(e.amount_paid || 0), 0), [enrollments]);
  const tuitionPending = Math.max(0, tuitionTotal - tuitionPaid);
  const selectedEnrollment = enrollments.find(e => String(e.id) === selectedEnrollmentId) || enrollments[0];
  const selectedTuitionPending = selectedEnrollment?.status === 'approved' ? Math.max(0, Number(selectedEnrollment.balance_amount || 0)) : 0;
  const hostelTotal = Number(hostelHistory?.summary?.total_fee || 0);
  const hostelPaid = Number(hostelHistory?.summary?.total_paid || 0);
  const hostelPending = Number(hostelHistory?.summary?.total_pending || 0);
  const examTotal = Math.max(0, Number(exam?.exam_fee || 0) - Number(exam?.discount || 0));
  const examPaid = Number(exam?.paid_amount || 0);
  const examPending = Math.max(0, examTotal - examPaid);

  const periods = (hostelHistory?.periods || []).filter((p: AnyRow) => !p.is_deleted);
  const selectedPeriod = periods.find((p: AnyRow) => String(p.period_id) === periodId) || periods.find((p: AnyRow) => Number(p.pending_balance) > 0) || periods[0];
  const hostelSelectedDue = selectedPeriod ? periods.filter((p: AnyRow) => String(p.period_from) <= String(selectedPeriod.period_from)).reduce((sum: number, p: AnyRow) => sum + Number(p.pending_balance || 0), 0) : 0;
  const due = category === 'tuition' ? selectedTuitionPending : category === 'hostel' ? hostelSelectedDue : examPending;
  const paymentMethods = methods;

  const refresh = async () => { if (student) await loadStudent(student); };
  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a valid payment amount'); return; }
    if (amount > due + 0.000001) { toast.error(`Amount cannot exceed pending balance ${money(due)}`); return; }
    if (!form.methodId) { toast.error('Select a payment method'); return; }
    if (category === 'tuition' && (!selectedEnrollment || selectedEnrollment.status !== 'approved')) { toast.error('No approved enrollment selected for tuition payment'); return; }
    if (category === 'hostel' && (!hostel?.hostel_record_id || !selectedPeriod?.period_id)) { toast.error('No active hostel fee period found'); return; }
    if (category === 'exam' && !exam?.exam_fee_record_id) { toast.error('Exam fee record is not available for this student'); return; }
    const method = paymentMethods.find(m => String(m.id) === form.methodId);
    const printWindow = window.open('', '_blank', 'width=850,height=900');
    setSaving(true);
    try {
      let response: AnyRow;
      if (category === 'tuition') {
        response = await api.post('/payments', { student_id: student.id, enrollment_id: selectedEnrollment.id, payment_method_id: Number(form.methodId), amount, payment_date: form.paymentDate, transaction_reference: form.reference || null, notes: form.notes || null, payment_type: 'course_fee' });
      } else if (category === 'hostel') {
        response = await api.post(`/hostel/${hostel.hostel_record_id}/payments`, { period_id: selectedPeriod.period_id, amount, payment_date: form.paymentDate, payment_method: methodLabel(method), reference: form.reference || null, notes: form.notes || null });
      } else {
        response = await api.post(`/exam-fees/${exam.exam_fee_record_id}/payments`, { amount, payment_date: form.paymentDate, payment_method: methodLabel(method), reference: form.reference || null, notes: form.notes || null });
      }
      const saved = response.data.data || {};
      const paymentId = saved.payment_id || saved.id;
      if (!paymentId) throw new Error('Payment was saved but the server did not return its payment ID. Please check payment history before retrying.');
      const prefix = category === 'tuition' ? 'TU' : category === 'hostel' ? 'HO' : 'EX';
      const receipt = { receiptNo: `NH-${prefix}-${form.paymentDate.replace(/-/g, '')}-${String(paymentId).padStart(6, '0')}`, student, category, amount, paymentDate: form.paymentDate, method: methodLabel(method), reference: form.reference, notes: form.notes, savedId: paymentId, totalPaid: (category === 'tuition' ? tuitionPaid : category === 'hostel' ? hostelPaid : examPaid) + amount, pending: Math.max(0, due - amount) };
      setLastReceipt(receipt);
      toast.success('Payment recorded successfully');
      setForm(f => ({ ...f, amount: '', reference: '', notes: '' }));
      await loadStudent(student);
      setLastReceipt(receipt);
      printReceipt(receipt, printWindow);
    } catch (err: any) { printWindow?.close(); toast.error(err.response?.data?.message || 'Payment failed'); }
    finally { setSaving(false); }
  };

  const printReceipt = (r: AnyRow, existingWindow?: Window | null) => {
    const w = existingWindow || window.open('', '_blank', 'width=420,height=760');
    if (!w) { toast.info('Allow pop-ups to print the receipt.'); return; }
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${html(r.receiptNo)}</title>
      <style>
        @page{size:80mm auto;margin:3mm}
        *{box-sizing:border-box}
        html,body{width:74mm;margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}
        body{font-size:11px;line-height:1.35}
        .receipt{width:72mm;margin:0 auto;padding:1mm 0 3mm}
        h1{text-align:center;font-size:17px;letter-spacing:.3px;margin:1mm 0 3mm;font-weight:700}
        .subtitle{text-align:center;font-size:10px;margin-bottom:3mm}
        .rule{border-top:1px dashed #000;margin:2mm 0}
        .line{display:flex;gap:2mm;align-items:flex-start;margin:1.5mm 0}
        .label{width:25mm;flex:0 0 25mm}
        .value{flex:1;overflow-wrap:anywhere;font-weight:600}
        .bill{font-size:12px}
        .amount{font-size:15px;font-weight:700}
        .footer{text-align:center;margin-top:3mm;font-size:9px}
        @media screen{body{margin:10px auto}.receipt{border:1px solid #ddd;padding:4mm}}
      </style></head><body><main class="receipt">
      <div class="subtitle">PAYMENT RECEIPT</div><div class="rule"></div>
      <div class="line bill"><span class="label">Bill No.</span><b class="value">${html(r.receiptNo)}</b></div>
      <div class="line"><span class="label">Bill Date</span><b class="value">${html(String(r.paymentDate || '').slice(0,10))}</b></div>
      <div class="line"><span class="label">Reg. No.</span><b class="value">${html(r.student.student_id || '-')}</b></div>
      <div class="line"><span class="label">Student Name</span><b class="value">${html(r.student.full_name || '-')}</b></div>
      <div class="line"><span class="label">Fee Type</span><b class="value">${html(r.category === 'tuition' ? 'Tuition / Book Fee' : r.category === 'hostel' ? 'Hostel Fee' : 'Exam Fee')}</b></div>
      <div class="line"><span class="label">Payment Mode</span><b class="value">${html(r.method || '-')}</b></div>
      <div class="line"><span class="label">Reference</span><b class="value">${html(r.reference || '-')}</b></div>
      <div class="rule"></div>
      <div class="line"><span class="label">Bill Amt.</span><b class="value amount">${money(r.amount)}</b></div>
      <div class="line"><span class="label">Total Paid</span><b class="value">${money(r.totalPaid ?? r.amount)}</b></div>
      <div class="line"><span class="label">Balance Due</span><b class="value">${money(r.pending ?? 0)}</b></div>
      <div class="footer">Computer generated receipt<br>Thank you</div>
      </main>
      <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`);
    w.document.close();
  };

  const filtered = students.filter(s => `${s.full_name} ${s.student_id} ${s.mobile || ''}`.toLowerCase().includes(search.toLowerCase()));
  const history = category === 'tuition' ? tuitionPayments : category === 'hostel' ? (hostelHistory?.payments || []) : examPayments;

  return <div>
    {!student ? <>
      <div className="page-header">
        <div><h1 className="page-title">Payment Receipt</h1><p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Select a student to view complete fee details and collect payments.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={() => navigate('/new-admissions')}>Add Student</button></div>
      </div>
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Students</h3>
        <div style={{ position: 'relative', marginBottom: 12, maxWidth: 460 }}>
          <FiSearch style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-muted)' }} />
          <input className="form-control" style={{ paddingLeft: 34 }} placeholder="Search name / ID / mobile" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? <p>Loading students...</p> : <div className="table-container">
          <table><thead><tr><th>Student Name</th><th>Student ID</th><th>Mobile</th><th>Action</th></tr></thead>
            <tbody>{filtered.map(s => <tr key={s.id}>
              <td style={{ fontWeight: 650 }}>{s.full_name}</td><td>{s.student_id || '-'}</td><td>{s.mobile || '-'}</td>
              <td><button className="btn btn-primary btn-sm" onClick={() => loadStudent(s)}>View Fee Details</button></td>
            </tr>)}
            {!filtered.length && <tr><td colSpan={4} className="empty-state">No students found</td></tr>}</tbody>
          </table>
        </div>}
      </div>
    </> : <>
      <div className="page-header" style={{ alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => { setStudent(null); setLastReceipt(null); setPeriodId(''); }}><FiArrowLeft /> Back to Students</button>
          <div><h1 className="page-title">Student Fee Details</h1><p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Complete fee records, payment collection and payment history.</p></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={() => navigate('/new-admissions')}>Add Student</button></div>
      </div>
      {detailLoading ? <div className="card" style={{ padding: 40 }}>Loading fee details...</div> : <>
        <div className="card" style={{ padding: 18, marginBottom: 16 }}><h2 style={{ margin: 0 }}>{student.full_name}</h2><p style={{ color: 'var(--text-muted)', margin: '5px 0 0' }}>{student.student_id} · {student.course_name || '-'} · {student.mobile || '-'}</p></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 16 }}>{[{ title: 'Tuition / Book Fees', total: tuitionTotal, paid: tuitionPaid, pending: tuitionPending }, { title: 'Hostel Fees', total: hostelTotal, paid: hostelPaid, pending: hostelPending }, { title: 'Exam Fees', total: examTotal, paid: examPaid, pending: examPending }].map(x => <div className="card" key={x.title} style={{ padding: 15 }}><b>{x.title}</b><div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>Total: {money(x.total)}</div><div style={{ fontSize: 13, color: '#16a34a' }}>Paid: {money(x.paid)}</div><div style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>Pending: {money(x.pending)}</div></div>)}</div>
        <div className="card" style={{ padding: 18, marginBottom: 16 }}><h3 style={{ marginTop: 0 }}>Hostel month-wise details</h3>{hostelHistory ? <><div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}><span>Total: <b>{money(hostelTotal)}</b></span><span>Paid: <b style={{ color: '#16a34a' }}>{money(hostelPaid)}</b></span><span>Pending: <b style={{ color: '#dc2626' }}>{money(hostelPending)}</b></span></div><div className="table-container"><table><thead><tr><th>Month / Period</th><th>Hostel + Mess</th><th>Paid</th><th>Pending</th></tr></thead><tbody>{periods.map((p: AnyRow) => <tr key={p.period_id}><td>{p.period_from} to {p.period_to}</td><td>{money(Number(p.total_fee || 0) - Number(p.discount || 0))}</td><td>{money(p.paid_amount)}</td><td>{money(p.pending_balance)}</td></tr>)}</tbody></table></div></> : <p style={{ color: 'var(--text-muted)' }}>No hostel fee record for this student.</p>}</div>
        <div className="card" style={{ padding: 18, marginBottom: 16 }}><h3 style={{ marginTop: 0 }}>Collect Payment</h3><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{([['tuition','Tuition / Book'],['hostel','Hostel'],['exam','Exam']] as const).map(([v,label]) => <button key={v} className={`btn ${category === v ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setCategory(v); setForm(f => ({ ...f, amount: '' })); }}>{label}</button>)}</div><div style={{ marginBottom: 12, fontWeight: 700 }}>Pending Balance: <span style={{ color: due > 0 ? '#dc2626' : '#16a34a' }}>{money(due)}</span></div>
          <form onSubmit={submitPayment}>{category === 'tuition' && enrollments.length > 0 && <div className="form-group"><label className="form-label">Course / Enrollment *</label><select className="form-control" value={selectedEnrollmentId} onChange={e => setSelectedEnrollmentId(e.target.value)}>{enrollments.map(en => <option key={en.id} value={en.id} disabled={en.status !== 'approved'}>{en.course_name || 'Course'} · {en.status} · Pending {money(en.balance_amount)}</option>)}</select></div>}<div className="form-grid"><div className="form-group"><label className="form-label">Amount *</label><input className="form-control" type="number" min="0.01" step="0.01" max={due} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="Enter partial/full amount" required disabled={due <= 0} /></div><div className="form-group"><label className="form-label">Payment Method *</label><select className="form-control" value={form.methodId} onChange={e => setForm(f => ({ ...f, methodId: e.target.value }))} required><option value="">Select method</option>{methods.map(m => <option key={m.id} value={m.id}>{methodLabel(m)}</option>)}</select></div><div className="form-group"><label className="form-label">Payment Date *</label><input className="form-control" type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} required /></div><div className="form-group"><label className="form-label">Transaction / Reference No.</label><input className="form-control" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} /></div></div>{category === 'hostel' && periods.length > 0 && <div className="form-group"><label className="form-label">Hostel Fee Month *</label><select className="form-control" value={periodId || String(selectedPeriod?.period_id || '')} onChange={e => setPeriodId(e.target.value)}>{periods.map((p: AnyRow) => <option key={p.period_id} value={p.period_id}>{p.period_from} – {p.period_to} · Pending {money(p.pending_balance)}</option>)}</select></div>}<div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div><button className="btn btn-primary" type="submit" disabled={saving || due <= 0 || !methods.length}><FiCreditCard /> {saving ? 'Saving...' : 'Collect Payment & Print Receipt'}</button>{!methods.length && <p style={{ color: '#dc2626' }}>No enabled payment methods. Add one under Settings → Payment Methods.</p>}</form>
        </div>
        <div className="card" style={{ padding: 18 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><div><h3 style={{ margin: 0 }}>Payment History – {category === 'tuition' ? 'Tuition / Book' : category === 'hostel' ? 'Hostel' : 'Exam'}</h3><small style={{ color: 'var(--text-muted)' }}>Audit trail of every recorded payment for this fee category.</small></div>{lastReceipt && <button className="btn btn-secondary btn-sm" onClick={() => printReceipt(lastReceipt)}><FiPrinter /> Reprint Receipt</button>}</div><div className="table-container" style={{ marginTop: 12 }}><table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded By</th><th>Print</th></tr></thead><tbody>{history.map((p: AnyRow) => <tr key={p.id}><td>{String(p.payment_date || '').slice(0,10)}</td><td>{money(p.amount)}</td><td>{p.method_type || p.payment_method || '-'}</td><td>{p.transaction_reference || p.reference || '-'}</td><td>{p.recorded_by_name || '-'}</td><td><button className="btn btn-secondary btn-sm" onClick={() => printReceipt({ receiptNo: `NH-${category === 'tuition' ? 'TU' : category === 'hostel' ? 'HO' : 'EX'}-${String(p.payment_date || '').slice(0,10).replace(/-/g, '')}-${String(p.id).padStart(6, '0')}`, student, category, amount: p.amount, totalPaid: category === 'tuition' ? tuitionPaid : category === 'hostel' ? hostelPaid : examPaid, pending: category === 'tuition' ? tuitionPending : category === 'hostel' ? hostelPending : examPending, paymentDate: p.payment_date, method: p.method_type || p.payment_method || '-', reference: p.transaction_reference || p.reference, notes: p.notes })}><FiPrinter /> Print</button></td></tr>)}{!history.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No payment history</td></tr>}</tbody></table></div></div>
      </>}
    </>}
  </div>;
};

export default PaymentReceipt;
