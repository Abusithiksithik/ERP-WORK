import React, { useEffect, useMemo, useState } from 'react';
import { FiDownload, FiFileText, FiPrinter, FiRefreshCw } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';

type ReportType = 'enrollment' | 'hostel' | 'exam-fee' | 'uniform';
const labels: Record<ReportType, string> = {
  enrollment: 'Tuition Report',
  hostel: 'Hostel Report',
  'exam-fee': 'Exam Fee Report',
  uniform: 'Uniform Report',
};
const endpoints: Record<ReportType, string> = {
  enrollment: '/reports/enrollment',
  hostel: '/reports/hostel',
  'exam-fee': '/reports/exam-fee',
  uniform: '/reports/uniform',
};
const money = (v: unknown) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (v: unknown) => {
  if (!v) return '—';
  const s = String(v);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const CourseCell = ({ r }: { r: any }) => (
  <div className="report-course-cell">
    <strong>{r.course_name || '—'}</strong>
    {r.master_course && <span>{r.master_course}</span>}
  </div>
);

const EnrollmentTable = ({ rows }: { rows: any[] }) => (
  <table className="report-table enrollment-report-table"><thead><tr>
    {['#', 'Student ID', 'Student Name', 'Mobile', 'Email', 'Course', 'Batch', 'Enrollment Date', 'Status', 'Tuition Fee', 'Total Fee', 'Discount', 'Paid', 'Balance'].map(h => <th key={h}>{h}</th>)}
  </tr></thead><tbody>{rows.map((r, i) => <tr key={r.enrollment_id}>
    <td>{i + 1}</td><td>{r.student_code}</td><td>{r.full_name}</td><td>{r.mobile}</td><td>{r.email || '—'}</td>
    <td><CourseCell r={r} /></td><td>{r.batch_name || '—'}</td><td>{fmtDate(r.enrollment_date)}</td><td>{r.status}</td>
    <td>{money(r.course_fee)}</td><td>{money(r.total_fee)}</td><td>{money(r.discount)}</td><td>{money(r.amount_paid)}</td><td>{money(r.balance_due)}</td>
  </tr>)}</tbody></table>
);

const HostelTable = ({ rows }: { rows: any[] }) => (
  <table className="report-table hostel-report-table"><thead><tr>
    {['#', 'Student ID', 'Student Name', 'Course / Batch', 'Admission Date', 'Hostel Fee', 'Mess Fee', 'Total Fee', 'Discount', 'Paid', 'Balance'].map(h => <th key={h}>{h}</th>)}
  </tr></thead><tbody>{rows.map((r, i) => <tr key={r.hostel_record_id}>
    <td>{i + 1}</td><td>{r.student_code}</td><td>{r.full_name}</td>
    <td><div className="report-course-cell"><strong>{r.course_name || '—'}</strong><span>{r.batch_name || '—'}</span></div></td>
    <td>{fmtDate(r.admission_date)}</td><td>{money(r.hostel_fee)}</td><td>{money(r.mess_fee)}</td><td>{money(r.total_fee)}</td><td>{money(r.discount)}</td><td>{money(r.amount_paid)}</td><td>{money(r.balance_due)}</td>
  </tr>)}</tbody></table>
);

const ExamTable = ({ rows }: { rows: any[] }) => (
  <table className="report-table exam-report-page-table"><thead><tr>
    {['#', 'Student ID', 'Student Name', 'Course', 'Batch', 'Total Exam Fee', 'Discount', 'Paid', 'Balance'].map(h => <th key={h}>{h}</th>)}
  </tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.student_code}-${i}`}>
    <td>{i + 1}</td><td>{r.student_code}</td><td>{r.full_name}</td><td>{r.course_name || '—'}</td><td>{r.batch_name || '—'}</td><td>{money(r.exam_fee)}</td><td>{money(r.discount)}</td><td>{money(r.amount_paid)}</td><td>{money(r.balance_due)}</td>
  </tr>)}</tbody></table>
);

const UniformTable = ({ rows }: { rows: any[] }) => (
  <table className="report-table uniform-report-table"><thead><tr>
    {['#', 'Student Name', 'Student ID', 'Course', 'Batch', 'Took Uniform?', 'No. of Sets', 'Price / Set', 'Total Amount', 'Amount Paid', 'Balance', 'Status', 'Progress'].map(h => <th key={h}>{h}</th>)}
  </tr></thead><tbody>{rows.map((r, i) => {
    const sets = Number(r.set_count || 0);
    const total = Number(r.total_amount || 3000);
    const paid = Number(r.amount_paid || 0);
    const price = sets > 0 ? total / sets : 0;
    const received = r.uniform_status === 'received';
    const progress = received ? 100 : 0;
    return <tr key={`${r.student_code}-${i}`}>
      <td>{i + 1}</td><td>{r.full_name}</td><td>{r.student_code}</td><td>{r.course_name || '—'}</td><td>{r.batch_name || '—'}</td>
      <td><span className={`uniform-report-pill ${received ? 'received' : 'not-received'}`}>{received ? '✓ Yes' : '— No'}</span></td>
      <td>{sets || '—'}</td><td>{price ? money(price) : '—'}</td><td>{total ? money(total) : '—'}</td><td>{paid ? money(paid) : '—'}</td>
      <td>{money(Math.max(0, Number(r.balance_due || 0)))}</td>
      <td>{received ? 'Received' : 'Not Received'}</td><td>{progress}%</td>
    </tr>;
  })}</tbody></table>
);

const ReportsPage: React.FC = () => {
  const [type, setType] = useState<ReportType>('enrollment');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(endpoints[type]);
      setRows(r.data.data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to load ${labels[type]}`);
      setRows([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [type]);

  const totals = useMemo(() => {
    const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
    if (type === 'uniform') {
      return [
        ['TOTAL STUDENTS', rows.length],
        ['UNIFORM RECEIVED', rows.filter(r => r.uniform_status === 'received').length],
        ['TOTAL SETS', sum('set_count')],
        ['TOTAL AMOUNT', money(sum('total_amount'))],
        ['AMOUNT PAID', money(sum('amount_paid'))],
        ['BALANCE', money(sum('balance_due'))],
      ];
    }
    if (type === 'enrollment' || type === 'hostel') {
      return [['RECORDS', rows.length], ['TOTAL FEE', money(sum('total_fee'))], ['DISCOUNT', money(sum('discount'))], ['PAID', money(sum('amount_paid'))], ['BALANCE', money(sum('balance_due'))]];
    }
    return [['RECORDS', rows.length], ['TOTAL EXAM FEE', money(sum('exam_fee'))], ['DISCOUNT', money(sum('discount'))], ['PAID', money(sum('amount_paid'))], ['BALANCE', money(sum('balance_due'))]];
  }, [rows, type]);

  const exportCsv = () => {
    let header: string[] = [];
    let data: any[][] = [];
    if (type === 'enrollment') {
      header = ['#', 'Student ID', 'Student Name', 'Mobile', 'Email', 'Course', 'Batch', 'Enrollment Date', 'Status', 'Tuition Fee', 'Total Fee', 'Discount', 'Paid', 'Balance'];
      data = rows.map((r, i) => [i + 1, r.student_code, r.full_name, r.mobile, r.email || '', r.master_course ? `${r.course_name || ''} / ${r.master_course}` : (r.course_name || ''), r.batch_name || '', fmtDate(r.enrollment_date), r.status, Number(r.course_fee || 0), Number(r.total_fee || 0), Number(r.discount || 0), Number(r.amount_paid || 0), Number(r.balance_due || 0)]);
    } else if (type === 'hostel') {
      header = ['#', 'Student ID', 'Student Name', 'Course / Batch', 'Admission Date', 'Hostel Fee', 'Mess Fee', 'Total Fee', 'Discount', 'Paid', 'Balance'];
      data = rows.map((r, i) => [i + 1, r.student_code, r.full_name, `${r.course_name || ''} / ${r.batch_name || ''}`, fmtDate(r.admission_date), Number(r.hostel_fee || 0), Number(r.mess_fee || 0), Number(r.total_fee || 0), Number(r.discount || 0), Number(r.amount_paid || 0), Number(r.balance_due || 0)]);
    } else if (type === 'exam-fee') {
      header = ['#', 'Student ID', 'Student Name', 'Course', 'Batch', 'Total Exam Fee', 'Discount', 'Paid', 'Balance'];
      data = rows.map((r, i) => [i + 1, r.student_code, r.full_name, r.course_name || '', r.batch_name || '', Number(r.exam_fee || 0), Number(r.discount || 0), Number(r.amount_paid || 0), Number(r.balance_due || 0)]);
    } else {
      header = ['#', 'Student Name', 'Student ID', 'Course', 'Batch', 'Took Uniform?', 'No. of Sets', 'Price / Set', 'Total Amount', 'Amount Paid', 'Balance', 'Status', 'Progress'];
      data = rows.map((r, i) => {
        const sets = Number(r.set_count || 0), total = Number(r.total_amount || 3000), received = r.uniform_status === 'received';
        return [i + 1, r.full_name, r.student_code, r.course_name || '', r.batch_name || '', received ? 'Yes' : 'No', sets, sets ? total / sets : 0, total, Number(r.amount_paid || 0), Number(r.balance_due || 0), received ? 'Received' : 'Not Received', received ? '100%' : '0%'];
      });
    }
    const lines = [header, ...data].map(row => row.map(esc).join(','));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${type}-report.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const table = type === 'enrollment' ? <EnrollmentTable rows={rows} /> : type === 'hostel' ? <HostelTable rows={rows} /> : type === 'exam-fee' ? <ExamTable rows={rows} /> : <UniformTable rows={rows} />;

  return <div>
    <div className="page-header"><div><h1 className="page-title">Reports</h1><p className="page-subtitle">Current database reports with consistent dates, spacing, fonts and numbers.</p></div><button className="btn btn-secondary" onClick={load}><FiRefreshCw /> Refresh</button></div>
    <div className="card report-selector">
      {(['enrollment', 'hostel', 'exam-fee', 'uniform'] as ReportType[]).map(t => <button key={t} className={`report-type-btn ${type === t ? 'active' : ''}`} onClick={() => setType(t)}><FiFileText /> {labels[t]}</button>)}
    </div>
    <div className="card report-print-area">
      <div className="report-title-row"><div><h2>{labels[type]}</h2><p>Generated from current ERP data · {new Date().toLocaleDateString('en-IN')}</p></div><div className="report-actions"><button className="btn btn-secondary" onClick={exportCsv} disabled={!rows.length}><FiDownload /> Export CSV</button><button className="btn btn-secondary" onClick={() => window.print()} disabled={!rows.length}><FiPrinter /> Print</button></div></div>
      <div className={`report-summary ${type === 'uniform' ? 'uniform-report-summary' : ''}`}>{totals.map(([k, v]) => <div className="report-summary-card" key={String(k)}><span>{k}</span><strong>{v}</strong></div>)}</div>
      {loading ? <div className="empty-state">Loading report…</div> : rows.length === 0 ? <div className="empty-state"><h3>No data</h3><p>No records are available for this report.</p></div> : <div className="report-table-wrap">{table}</div>}
    </div>
  </div>;
};

export default ReportsPage;
