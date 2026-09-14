import React, { useEffect, useState, useCallback } from 'react';
import { FiEdit2, FiDollarSign, FiClock, FiSearch, FiTrash2, FiSettings, FiFileText, FiPrinter, FiDownload, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const fmt = (n: number | string) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

const METHODS = ['cash', 'bank_transfer', 'upi', 'cheque', 'dd'];

interface ExamFeeRecord {
  exam_fee_record_id: number;
  student_id: number;
  student_code: string;
  full_name: string;
  mobile?: string;
  category_id?: number;
  category_name?: string;
  course_id?: number;
  course_name?: string;
  batch_name?: string;
  exam_fee: number;
  total_fee: number;
  discount: number;
  net_payable: number;
  paid_amount: number;
  pending_balance: number;
  notes?: string;
}

interface FeeSetting {
  id?: number;
  category_id?: number;
  category_name?: string;
  course_id: number;
  course_name?: string;
  exam_fee: number;
  notes?: string;
}

interface Category { id: number; category_name: string; }
interface CourseOption { id: number; course_name: string; category_id?: number; }

interface Payment {
  id: number;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference?: string;
  notes?: string;
  recorded_by_name?: string;
  created_at: string;
}

const ExamFeeList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const [records, setRecords] = useState<ExamFeeRecord[]>([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<CourseOption[]>([]);

  // Fee Settings modal (common fee per category+course)
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingForm, setSettingForm] = useState({
    category_id: '', course_id: '', exam_fee: '', notes: '',
  });
  const [settingLoading, setSettingLoading] = useState(false);
  const [existingSetting, setExistingSetting] = useState<FeeSetting | null>(null);

  // Edit modal (per-candidate override)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRecord, setEditRecord] = useState<ExamFeeRecord | null>(null);
  const [editForm, setEditForm] = useState({
    exam_fee: '', notes: '',
  });
  const [editLoading, setEditLoading] = useState(false);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payRecord, setPayRecord] = useState<ExamFeeRecord | null>(null);
  const [payForm, setPayForm] = useState({
    amount: '', payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash', reference: '', notes: '',
  });
  const [payLoading, setPayLoading] = useState(false);

  // Payment history modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRecord, setHistoryRecord] = useState<ExamFeeRecord | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // Load categories and courses
  useEffect(() => {
    api.get('/exam-fees/categories').then(r => setCategories(r.data.data || [])).catch(() => {});
    api.get('/exam-fees/courses').then(r => {
      setAllCourses(r.data.data || []);
      setFilteredCourses(r.data.data || []);
    }).catch(() => {});
  }, []);

  // When category filter changes, filter courses
  useEffect(() => {
    if (filterCategory) {
      setFilteredCourses(allCourses.filter(c => String(c.category_id) === filterCategory));
      setFilterCourse('');
    } else {
      setFilteredCourses(allCourses);
    }
  }, [filterCategory, allCourses]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (filterCategory) params.category_id = filterCategory;
      if (filterCourse) params.course_id = filterCourse;
      const r = await api.get('/exam-fees', { params });
      setRecords(r.data.data || []);
    } catch {
      toast.error('Failed to load exam fee records');
    } finally {
      setLoading(false);
    }
  }, [search, filterCategory, filterCourse]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);


  // ── Fee Settings modal (common fee for a course) ──
  const openSettingsModal = async () => {
    setSettingForm({ category_id: '', course_id: '', exam_fee: '', notes: '' });
    setExistingSetting(null);
    setShowSettingsModal(true);
  };

  const handleSettingCourseChange = async (courseId: string) => {
    setSettingForm(f => ({ ...f, course_id: courseId }));
    if (!courseId) { setExistingSetting(null); return; }
    try {
      const r = await api.get('/exam-fees/settings', { params: { course_id: courseId } });
      const settings = r.data.data || [];
      if (settings.length > 0) {
        const s = settings[0];
        setExistingSetting(s);
        setSettingForm(f => ({
          ...f,
          exam_fee: String(s.exam_fee || 0),
          notes: s.notes || '',
        }));
      } else {
        setExistingSetting(null);
        setSettingForm(f => ({ ...f, exam_fee: '', notes: '' }));
      }
    } catch { /* ignore */ }
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingForm.course_id) { toast.error('Select a course'); return; }
    setSettingLoading(true);
    try {
      const payload = {
        category_id: settingForm.category_id || null,
        course_id: settingForm.course_id,
        exam_fee: settingForm.exam_fee,
        notes: settingForm.notes,
      };
      if (existingSetting?.id) {
        await api.put(`/exam-fees/settings/${existingSetting.id}`, payload);
      } else {
        await api.post('/exam-fees/settings', payload);
      }
      toast.success('Exam fee updated for all candidates in this course!');
      setShowSettingsModal(false);
      // Refresh categories/courses in case new records were created
      const [catR, courR] = await Promise.all([
        api.get('/exam-fees/categories'),
        api.get('/exam-fees/courses'),
      ]);
      setCategories(catR.data.data || []);
      setAllCourses(courR.data.data || []);
      fetchRecords();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save fee setting');
    } finally {
      setSettingLoading(false);
    }
  };

  // ── Edit individual record ──
  const openEditModal = (rec: ExamFeeRecord) => {
    setEditRecord(rec);
    setEditForm({
      exam_fee: String(rec.exam_fee),
      notes: rec.notes || '',
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecord) return;
    setEditLoading(true);
    try {
      await api.put(`/exam-fees/${editRecord.exam_fee_record_id}`, editForm);
      toast.success('Exam fee updated!');
      setShowEditModal(false);
      fetchRecords();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setEditLoading(false);
    }
  };

  // ── Add payment ──
  const openPayModal = (rec: ExamFeeRecord) => {
    setPayRecord(rec);
    setPayForm({
      amount: '', payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash', reference: '', notes: '',
    });
    setShowPayModal(true);
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payRecord) return;
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setPayLoading(true);
    try {
      await api.post(`/exam-fees/${payRecord.exam_fee_record_id}/payments`, payForm);
      toast.success('Payment recorded!');
      setShowPayModal(false);
      fetchRecords();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    } finally {
      setPayLoading(false);
    }
  };


  // ── Payment history ──
  const openHistoryModal = async (rec: ExamFeeRecord) => {
    setHistoryRecord(rec);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    try {
      const r = await api.get(`/exam-fees/${rec.exam_fee_record_id}/payments`);
      setPaymentHistory(r.data.data || []);
    } catch {
      toast.error('Failed to load payment history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!window.confirm('Delete this payment record?')) return;
    try {
      await api.delete(`/exam-fees/payments/${paymentId}`);
      toast.success('Payment deleted');
      if (historyRecord) {
        const r = await api.get(`/exam-fees/${historyRecord.exam_fee_record_id}/payments`);
        setPaymentHistory(r.data.data || []);
      }
      fetchRecords();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete payment');
    }
  };

  const StatusBadge: React.FC<{ paid: number; total: number }> = ({ paid, total }) => {
    if (total === 0) return <span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>No Fee</span>;
    if (paid >= total) return <span className="badge badge-present">Paid</span>;
    if (paid > 0) return <span className="badge badge-late">Partial</span>;
    return <span className="badge badge-absent">Pending</span>;
  };

  const reportTotals = records.reduce((acc, r) => {
    acc.examFee += Number(r.exam_fee || 0);
    acc.discount += Number(r.discount || 0);
    acc.netPayable += Number(r.net_payable ?? Math.max(Number(r.exam_fee || 0) - Number(r.discount || 0), 0));
    acc.paid += Number(r.paid_amount || 0);
    acc.balance += Math.max(Number(r.net_payable ?? Math.max(Number(r.exam_fee || 0) - Number(r.discount || 0), 0)) - Number(r.paid_amount || 0), 0);
    return acc;
  }, { examFee: 0, discount: 0, netPayable: 0, paid: 0, balance: 0 });

  const exportReportCsv = () => {
    const header = ['#', 'Student Name', 'Student ID', 'Course', 'Batch', 'Total Exam Fee', 'Discount', 'Net Payable', 'Amount Paid', 'Balance'];
    const lines = [header.join(',')];
    records.forEach((r, i) => {
      const net = Number(r.net_payable ?? Math.max(Number(r.exam_fee || 0) - Number(r.discount || 0), 0));
      const balance = Math.max(net - Number(r.paid_amount || 0), 0);
      lines.push([i + 1, r.full_name, r.student_code, r.course_name || '', r.batch_name || '', Number(r.exam_fee || 0), Number(r.discount || 0), net, Number(r.paid_amount || 0), balance]
        .map(v => `\"${String(v).replace(/\"/g, '\"\"')}\"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exam-fee-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Group records by category → course for display
  const grouped = records.reduce<Record<string, { categoryName: string; courseName: string; items: ExamFeeRecord[] }>>((acc, r) => {
    const key = `${r.category_name || 'No Category'}__${r.course_name || 'No Course'}`;
    if (!acc[key]) acc[key] = { categoryName: r.category_name || 'No Category', courseName: r.course_name || 'No Course', items: [] };
    acc[key].items.push(r);
    return acc;
  }, {});

  const settingCoursesForModal = settingForm.category_id
    ? allCourses.filter(c => String(c.category_id) === settingForm.category_id)
    : allCourses;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Exam Fees</h1>
          <p className="page-subtitle">{records.length} candidate{records.length !== 1 ? 's' : ''} with active enrollment</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => setShowReport(true)} disabled={records.length === 0}>
            <FiFileText size={14} style={{ marginRight: 4 }} /> Get Report
          </button>
          {isAdmin && (
            <button className="btn btn-primary" onClick={openSettingsModal}>
              <FiSettings size={14} style={{ marginRight: 4 }} /> Set Course Exam Fee
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FiSearch size={16} color="var(--text-muted)" />
          <input
            className="form-control"
            placeholder="Search by name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          <select
            className="form-control"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ maxWidth: 200 }}
          >
            <option value="">All Main Courses</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.category_name}</option>
            ))}
          </select>
          <select
            className="form-control"
            value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}
            style={{ maxWidth: 200 }}
          >
            <option value="">All Sub Courses</option>
            {filteredCourses.map(c => (
              <option key={c.id} value={c.id}>{c.course_name}</option>
            ))}
          </select>
          {(filterCategory || filterCourse || search) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setFilterCategory(''); setFilterCourse(''); setSearch(''); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Records grouped by category → course */}
      {loading ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">⏳</div><h3>Loading...</h3></div></div>
      ) : records.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>No Candidates Found</h3>
            <p>Active candidates with approved enrollments will appear here automatically.</p>
            {isAdmin && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Use "Set Course Exam Fee" to define the exam fee for a course.</p>}
          </div>
        </div>
      ) : (
        Object.values(grouped).map(group => (
          <div key={`${group.categoryName}__${group.courseName}`} className="card" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{group.categoryName}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 6px' }}>→</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{group.courseName}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 10 }}>
                {group.items.length} candidate{group.items.length !== 1 ? 's' : ''}
              </span>
              {/* Course-level fee summary */}
              {(() => {
                const totalFee = group.items.reduce((s, r) => s + Number(r.exam_fee), 0);
                const totalPaid = group.items.reduce((s, r) => s + Number(r.paid_amount), 0);
                const totalPending = group.items.reduce((s, r) => s + Number(r.pending_balance), 0);
                return totalFee > 0 ? (
                  <span style={{ marginLeft: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                    Fee: <strong style={{ color: 'var(--accent)' }}>{fmt(group.items[0].exam_fee)}</strong> per candidate ·
                    Collected: <strong style={{ color: 'var(--teal)' }}>{fmt(totalPaid)}</strong> ·
                    Pending: <strong style={{ color: 'var(--red)' }}>{fmt(totalPending)}</strong>
                  </span>
                ) : null;
              })()}
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Batch</th>
                    <th style={{ textAlign: 'right' }}>Exam Fee</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Pending</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(rec => (
                    <tr key={rec.exam_fee_record_id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{rec.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rec.student_code}</div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{rec.batch_name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(rec.exam_fee)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmt(rec.total_fee)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--teal)', fontWeight: 600 }}>{fmt(rec.paid_amount)}</td>
                      <td style={{ textAlign: 'right', color: rec.pending_balance > 0 ? 'var(--red)' : 'var(--teal)', fontWeight: 600 }}>
                        {fmt(rec.pending_balance)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <StatusBadge paid={rec.paid_amount} total={rec.total_fee} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {isAdmin && (
                            <button className="btn btn-sm btn-secondary" title="Edit individual fees" onClick={() => openEditModal(rec)}>
                              <FiEdit2 size={13} />
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-primary"
                            title="Record Payment"
                            onClick={() => openPayModal(rec)}
                          >
                            <FiDollarSign size={13} />
                          </button>
                          <button className="btn btn-sm btn-secondary" title="Payment history" onClick={() => openHistoryModal(rec)}>
                            <FiClock size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}


      {showReport && (
        <div className="modal-overlay" onClick={() => setShowReport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 1250, width: '96vw', maxHeight: '92vh', overflow: 'auto', background: '#fff', color: '#111' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Exam Fee Report</h2>
                <p style={{ margin: '5px 0 0', fontSize: 12, color: '#666' }}>Academic Year — All Exams</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={exportReportCsv}><FiDownload size={14} /> Export CSV</button>
                <button className="btn btn-secondary" onClick={() => window.print()}><FiPrinter size={14} /> Print</button>
                <button className="btn btn-secondary" onClick={() => setShowReport(false)}><FiX size={14} /></button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
              {[
                ['TOTAL STUDENTS', records.length.toString(), 'enrolled'],
                ['TOTAL EXAM FEE', fmt(reportTotals.examFee), 'gross payable'],
                ['DISCOUNT GIVEN', fmt(reportTotals.discount), 'discount'],
                ['AMOUNT PAID', fmt(reportTotals.paid), 'collected'],
                ['BALANCE DUE', fmt(reportTotals.balance), 'pending'],
              ].map(([label, value, note]) => (
                <div key={label} style={{ border: '1px solid #ddd', borderRadius: 10, padding: '13px 15px', background: '#fafafa' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#666', letterSpacing: .5 }}>{label}</div>
                  <div style={{ fontSize: 21, fontWeight: 800, marginTop: 5 }}>{value}</div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{note}</div>
                </div>
              ))}
            </div>

            <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                <thead>
                  <tr style={{ background: '#f1f3f7' }}>
                    {['#', 'STUDENT NAME', 'STUDENT ID', 'COURSE', 'BATCH', 'TOTAL EXAM FEE', 'DISCOUNT', 'NET PAYABLE', 'AMOUNT PAID', 'BALANCE'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 9px', textAlign: i >= 5 ? 'right' : 'left', fontSize: 10, fontWeight: 800, borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const net = Number(r.net_payable ?? Math.max(Number(r.exam_fee || 0) - Number(r.discount || 0), 0));
                    const balance = Math.max(net - Number(r.paid_amount || 0), 0);
                    return (
                      <tr key={r.exam_fee_record_id}>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', fontSize: 12 }}>{i + 1}</td>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: 12 }}>{r.full_name}</td>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', fontSize: 11, color: '#555' }}>{r.student_code}</td>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', fontSize: 12 }}>{r.course_name || '—'}</td>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', fontSize: 12 }}>{r.batch_name || '—'}</td>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700, fontSize: 12 }}>{fmt(r.exam_fee)}</td>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', textAlign: 'right', fontSize: 12 }}>{Number(r.discount || 0) > 0 ? fmt(r.discount) : '—'}</td>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 800, fontSize: 12 }}>{fmt(net)}</td>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#078a69', fontWeight: 700, fontSize: 12 }}>{fmt(r.paid_amount)}</td>
                        <td style={{ padding: '9px', borderBottom: '1px solid #eee', textAlign: 'right', color: balance > 0 ? '#c0392b' : '#078a69', fontWeight: 800, fontSize: 12 }}>{fmt(balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8f9fb' }}>
                    <td colSpan={5} style={{ padding: '11px 9px', fontWeight: 800, fontSize: 12 }}>TOTAL</td>
                    <td style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 800, fontSize: 12 }}>{fmt(reportTotals.examFee)}</td>
                    <td style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 800, fontSize: 12 }}>{fmt(reportTotals.discount)}</td>
                    <td style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 800, fontSize: 12 }}>{fmt(reportTotals.netPayable)}</td>
                    <td style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 800, color: '#078a69', fontSize: 12 }}>{fmt(reportTotals.paid)}</td>
                    <td style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 800, color: reportTotals.balance > 0 ? '#c0392b' : '#078a69', fontSize: 12 }}>{fmt(reportTotals.balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SET COURSE FEE MODAL ── */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2 className="modal-title">Set Exam Fee for Course</h2>
              <button className="modal-close" onClick={() => setShowSettingsModal(false)}>×</button>
            </div>
            <form onSubmit={handleSettingsSubmit}>
              <div className="modal-body">
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                  💡 Setting the fee here applies it to <strong>all candidates</strong> in the selected Main Course → Sub Course. Existing payments are not affected.
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Main Course (Category)</label>
                    <select
                      className="form-control"
                      value={settingForm.category_id}
                      onChange={e => setSettingForm(f => ({ ...f, category_id: e.target.value, course_id: '' }))}
                    >
                      <option value="">All Categories</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.category_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sub Course *</label>
                    <select
                      className="form-control"
                      value={settingForm.course_id}
                      onChange={e => handleSettingCourseChange(e.target.value)}
                      required
                    >
                      <option value="">Select Sub Course</option>
                      {settingCoursesForModal.map(c => (
                        <option key={c.id} value={c.id}>{c.course_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {existingSetting && (
                  <div style={{ fontSize: 12, color: 'var(--teal)', marginBottom: 12 }}>
                    ✓ Existing setting found — editing will update all candidate records for this course.
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Exam Fee (₹) *</label>
                  <input
                    type="number" className="form-control" placeholder="0" min="0"
                    value={settingForm.exam_fee}
                    onChange={e => setSettingForm(f => ({ ...f, exam_fee: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-control" rows={2}
                    value={settingForm.notes}
                    onChange={e => setSettingForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSettingsModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={settingLoading}>
                  {settingLoading ? 'Saving...' : (existingSetting ? 'Update Course Fee' : 'Set Course Fee')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT INDIVIDUAL CANDIDATE FEE MODAL ── */}
      {showEditModal && editRecord && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Exam Fee — {editRecord.full_name}</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  {editRecord.category_name && <span>{editRecord.category_name} → </span>}
                  {editRecord.course_name || '—'} / {editRecord.batch_name || '—'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
                  Note: This edits only this candidate's fee. To change the fee for all candidates in this course, use "Set Course Exam Fee".
                </div>
                <div className="form-group">
                  <label className="form-label">Exam Fee (₹)</label>
                  <input
                    type="number" className="form-control" placeholder="0" min="0"
                    value={editForm.exam_fee}
                    onChange={e => setEditForm(f => ({ ...f, exam_fee: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-control" rows={2}
                    value={editForm.notes}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 16px', marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>New Total Fee</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {fmt(Number(editForm.exam_fee) || 0)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Already paid: {fmt(editRecord.paid_amount)}
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editLoading}>
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ADD PAYMENT MODAL ── */}
      {showPayModal && payRecord && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">Add Payment — {payRecord.full_name}</h2>
              <button className="modal-close" onClick={() => setShowPayModal(false)}>×</button>
            </div>
            <form onSubmit={handlePaySubmit}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                  {[
                    { label: 'Total', value: payRecord.total_fee, color: 'var(--accent)' },
                    { label: 'Paid', value: payRecord.paid_amount, color: 'var(--teal)' },
                    { label: 'Pending', value: payRecord.pending_balance, color: 'var(--red)' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontWeight: 700, color: item.color, fontSize: 15 }}>{fmt(item.value)}</div>
                    </div>
                  ))}
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (₹) *</label>
                  <input
                    type="number" className="form-control" placeholder="Enter amount" min="1"
                    value={payForm.amount}
                    onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Payment Date</label>
                    <input
                      type="date" className="form-control"
                      value={payForm.payment_date}
                      onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Method</label>
                    <select
                      className="form-control"
                      value={payForm.payment_method}
                      onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                    >
                      {METHODS.map(m => (
                        <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Reference / Transaction ID</label>
                  <input
                    type="text" className="form-control" placeholder="Optional"
                    value={payForm.reference}
                    onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-control" rows={2}
                    value={payForm.notes}
                    onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPayModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={payLoading}>
                  {payLoading ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PAYMENT HISTORY MODAL ── */}
      {showHistoryModal && historyRecord && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h2 className="modal-title">Payment History — {historyRecord.full_name}</h2>
              <button className="modal-close" onClick={() => setShowHistoryModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                {[
                  { label: 'Total Fee', value: historyRecord.total_fee, color: 'var(--accent)' },
                  { label: 'Total Paid', value: historyRecord.paid_amount, color: 'var(--teal)' },
                  { label: 'Pending', value: historyRecord.pending_balance, color: 'var(--red)' },
                ].map((item, i) => (
                  <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontWeight: 700, color: item.color, fontSize: 15 }}>{fmt(item.value)}</div>
                  </div>
                ))}
              </div>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Loading...</div>
              ) : paymentHistory.length === 0 ? (
                <div className="empty-state" style={{ padding: '20px 0' }}>
                  <div className="empty-state-icon">💳</div>
                  <h3>No Payments Yet</h3>
                  <p>No payments have been recorded for this candidate.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Recorded By</th>
                        {isAdmin && <th style={{ textAlign: 'center' }}>Del</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map(pay => (
                        <tr key={pay.id}>
                          <td style={{ fontSize: 13 }}>{new Date(pay.payment_date).toLocaleDateString()}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--teal)' }}>{fmt(pay.amount)}</td>
                          <td style={{ fontSize: 12, textTransform: 'capitalize' }}>
                            {(pay.payment_method || '').replace('_', ' ')}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pay.reference || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pay.recorded_by_name || '—'}</td>
                          {isAdmin && (
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className="btn btn-sm"
                                style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
                                onClick={() => handleDeletePayment(pay.id)}
                                title="Delete payment"
                              >
                                <FiTrash2 size={12} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowHistoryModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamFeeList;
