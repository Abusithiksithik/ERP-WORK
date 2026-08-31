import React, { useEffect, useState } from 'react';
import { FiCalendar, FiCheck, FiBarChart2, FiUsers, FiUser, FiSearch } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Student, Batch } from '../../types';

type ReportMode = 'all' | 'batch' | 'individual';

const AttendancePage: React.FC = () => {
  const [tab, setTab] = useState<'mark' | 'report'>('mark');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);

  // Report state
  const [reportMode, setReportMode] = useState<ReportMode>('all');
  const [reportBatch, setReportBatch] = useState('');
  const [reportStudent, setReportStudent] = useState('');
  const [reportMonth, setReportMonth] = useState(String(new Date().getMonth() + 1));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState('');

  // Report data
  const [allStudentsData, setAllStudentsData] = useState<any[]>([]);
  const [batchSummary, setBatchSummary] = useState<any>(null);
  const [batchStudentsData, setBatchStudentsData] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportSummary, setReportSummary] = useState<any>(null);

  useEffect(() => {
    api.get('/batches').then(r => setBatches(r.data.data));
    api.get('/students').then(r => setStudents(r.data.data));
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      api.get(`/students?batch_id=${selectedBatch}&limit=100`).then(r => {
        const s = r.data.data;
        setStudents(s);
        const init: Record<number, string> = {};
        s.forEach((st: Student) => { init[st.id] = 'present'; });
        setAttendance(init);
      });
    }
  }, [selectedBatch]);

  const handleMark = async () => {
    if (!selectedBatch || !attendanceDate) { toast.error('Select batch and date'); return; }
    setLoading(true);
    try {
      const records = Object.entries(attendance).map(([student_id, status]) => ({ student_id: parseInt(student_id), status }));
      await api.post('/attendance', { batch_id: selectedBatch, attendance_date: attendanceDate, records });
      toast.success(`Attendance marked for ${records.length} students!`);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  // ── Fetch report data by mode ──────────────────────────────────────
  const fetchReport = async () => {
    setReportLoading(true);
    try {
      if (reportMode === 'all') {
        const params: any = {};
        if (reportStartDate) params.start_date = reportStartDate;
        if (reportEndDate)   params.end_date   = reportEndDate;
        if (reportBatch)     params.batch_id   = reportBatch;
        const r = await api.get('/attendance/report/all', { params });
        setAllStudentsData(r.data.data);
        setBatchSummary(null);
        setBatchStudentsData([]);
        setReportData([]);
        setReportSummary(null);

      } else if (reportMode === 'batch') {
        if (!reportBatch) { toast.error('Select a batch'); setReportLoading(false); return; }
        const r = await api.get(`/attendance/report/batch/${reportBatch}`, { params: { date: reportDate } });
        setBatchSummary(r.data.summary);
        setBatchStudentsData(r.data.data);
        setAllStudentsData([]);
        setReportData([]);
        setReportSummary(null);

      } else {
        if (!reportStudent) { toast.error('Select a student'); setReportLoading(false); return; }
        const r = await api.get(`/attendance/report/student/${reportStudent}`, {
          params: { month: reportMonth, year: reportYear },
        });
        setReportData(r.data.data);
        setReportSummary(r.data.summary);
        setAllStudentsData([]);
        setBatchSummary(null);
        setBatchStudentsData([]);
      }
    } catch { toast.error('Failed to load report'); }
    finally { setReportLoading(false); }
  };

  const statusColors: Record<string, string> = {
    present: 'var(--teal)', absent: 'var(--red)', late: 'var(--amber)', excused: 'var(--accent)',
  };

  // Filter helpers
  const filteredAll = allStudentsData.filter(s =>
    !reportSearch ||
    s.full_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
    s.student_code?.toLowerCase().includes(reportSearch.toLowerCase())
  );
  const filteredBatch = batchStudentsData.filter(s =>
    !reportSearch ||
    s.full_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
    s.student_code?.toLowerCase().includes(reportSearch.toLowerCase())
  );

  const pctColor = (p: number) =>
    p >= 75 ? 'var(--teal)' : p >= 50 ? 'var(--amber)' : 'var(--red)';

  return (
    <div>
      <div className="page-header"><div><h1 className="page-title">Attendance</h1></div></div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`btn ${tab === 'mark' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('mark')}><FiCalendar /> Mark Attendance</button>
        <button className={`btn ${tab === 'report' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('report')}><FiBarChart2 /> Attendance Report</button>
      </div>

      {/* ══════════════════════════════════════════════════════
          MARK ATTENDANCE TAB (unchanged)
      ══════════════════════════════════════════════════════ */}
      {tab === 'mark' && (
        <div className="card">
          <div className="form-grid" style={{ marginBottom: 20 }}>
            <div className="form-group"><label className="form-label">Batch *</label>
              <select className="form-control" value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)}>
                <option value="">Select Batch</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Date *</label>
              <input type="date" className="form-control" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} />
            </div>
          </div>

          {students.length === 0 && selectedBatch
            ? <div className="empty-state"><div className="empty-state-icon">👥</div><h3>No Students in this Batch</h3></div>
            : students.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{students.length} students</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['present', 'absent', 'late'].map(s => (
                      <button key={s} className="btn btn-sm btn-secondary" onClick={() => {
                        const all: Record<number, string> = {};
                        students.forEach(st => { all[st.id] = s; });
                        setAttendance(all);
                      }} style={{ textTransform: 'capitalize' }}>All {s}</button>
                    ))}
                  </div>
                </div>
                <div className="attendance-grid">
                  {students.map(s => (
                    <div key={s.id} className="attendance-item">
                      <div className="student-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{s.full_name.charAt(0)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.student_id}</div>
                      </div>
                      <select
                        className="attendance-select"
                        value={attendance[s.id] || 'present'}
                        onChange={e => setAttendance(a => ({ ...a, [s.id]: e.target.value }))}
                        style={{ color: statusColors[attendance[s.id] || 'present'] }}
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 20 }}>
                  <button className="btn btn-primary" onClick={handleMark} disabled={loading}><FiCheck /> {loading ? 'Saving...' : 'Save Attendance'}</button>
                </div>
              </>
            )}
          {!selectedBatch && <div className="empty-state"><div className="empty-state-icon">📋</div><h3>Select a Batch</h3><p>Choose a batch to mark attendance.</p></div>}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          ATTENDANCE REPORT TAB
      ══════════════════════════════════════════════════════ */}
      {tab === 'report' && (
        <div>
          {/* Mode selector */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
              <button
                className={`btn ${reportMode === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setReportMode('all')}
              >
                <FiUsers /> All Students
              </button>
              <button
                className={`btn ${reportMode === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setReportMode('batch')}
              >
                <FiBarChart2 /> Batch-wise
              </button>
              <button
                className={`btn ${reportMode === 'individual' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setReportMode('individual')}
              >
                <FiUser /> Individual Student
              </button>
            </div>

            {/* ── All Students filters ── */}
            {reportMode === 'all' && (
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Batch (optional)</label>
                  <select className="form-control" value={reportBatch} onChange={e => setReportBatch(e.target.value)}>
                    <option value="">All Batches</option>
                    {batches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">From Date</label>
                  <input type="date" className="form-control" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
                </div>
                <div className="form-group"><label className="form-label">To Date</label>
                  <input type="date" className="form-control" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
                </div>
              </div>
            )}

            {/* ── Batch-wise filters ── */}
            {reportMode === 'batch' && (
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Batch *</label>
                  <select className="form-control" value={reportBatch} onChange={e => setReportBatch(e.target.value)}>
                    <option value="">Select Batch</option>
                    {batches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Date</label>
                  <input type="date" className="form-control" value={reportDate} onChange={e => setReportDate(e.target.value)} />
                </div>
              </div>
            )}

            {/* ── Individual Student filters ── */}
            {reportMode === 'individual' && (
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Student *</label>
                  <select className="form-control" value={reportStudent} onChange={e => setReportStudent(e.target.value)}>
                    <option value="">Select Student</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Month</label>
                  <select className="form-control" value={reportMonth} onChange={e => setReportMonth(e.target.value)}>
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) =>
                      <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Year</label>
                  <input type="number" className="form-control" value={reportYear} onChange={e => setReportYear(e.target.value)} min={2020} max={2030} />
                </div>
              </div>
            )}

            <button className="btn btn-primary" onClick={fetchReport} disabled={reportLoading} style={{ marginTop: 4 }}>
              {reportLoading ? 'Loading...' : '🔍 Get Report'}
            </button>
          </div>

          {/* ── ALL STUDENTS REPORT ── */}
          {reportMode === 'all' && allStudentsData.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <h3 style={{ fontWeight: 700, fontSize: 16 }}>All Students — Attendance Summary</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '6px 12px' }}>
                  <FiSearch size={14} color="var(--text-muted)" />
                  <input
                    className="form-control"
                    style={{ border: 'none', background: 'transparent', padding: 0, minWidth: 180 }}
                    placeholder="Search student..."
                    value={reportSearch}
                    onChange={e => setReportSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Batch</th>
                      <th style={{ textAlign: 'center' }}>Present</th>
                      <th style={{ textAlign: 'center' }}>Absent</th>
                      <th style={{ textAlign: 'center' }}>Late</th>
                      <th style={{ textAlign: 'center' }}>Excused</th>
                      <th style={{ textAlign: 'center' }}>Total Days</th>
                      <th style={{ textAlign: 'center' }}>Attendance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAll.map((s: any) => (
                      <tr key={s.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{s.full_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.student_code}</div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.batch_name || '—'}</td>
                        <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--teal)', fontWeight: 700 }}>{s.present}</span></td>
                        <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--red)', fontWeight: 700 }}>{s.absent}</span></td>
                        <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--amber)', fontWeight: 700 }}>{s.late}</span></td>
                        <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--accent)', fontWeight: 700 }}>{s.excused}</span></td>
                        <td style={{ textAlign: 'center' }}>{s.total_days}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: pctColor(s.percentage) }}>{s.percentage}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── BATCH-WISE REPORT ── */}
          {reportMode === 'batch' && batchSummary && (
            <div>
              {/* Summary cards */}
              <div className="stats-grid" style={{ marginBottom: 16 }}>
                {[
                  { label: 'Total Students', value: batchSummary.total_students, color: 'var(--accent)' },
                  { label: 'Present Today',  value: batchSummary.present_today,  color: 'var(--teal)' },
                  { label: 'Absent Today',   value: batchSummary.absent_today,   color: 'var(--red)' },
                  { label: 'Late Today',     value: batchSummary.late_today,     color: 'var(--amber)' },
                  { label: 'Attendance %',   value: `${batchSummary.percentage}%`, color: pctColor(batchSummary.percentage) },
                ].map((card, i) => (
                  <div key={i} className="stat-card" style={{ '--card-accent': card.color } as React.CSSProperties}>
                    <div className="stat-value">{card.value}</div>
                    <div className="stat-label">{card.label}</div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 16 }}>Batch Student Breakdown — {new Date(batchSummary.date + 'T00:00:00').toLocaleDateString()}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '6px 12px' }}>
                    <FiSearch size={14} color="var(--text-muted)" />
                    <input
                      className="form-control"
                      style={{ border: 'none', background: 'transparent', padding: 0, minWidth: 180 }}
                      placeholder="Search student..."
                      value={reportSearch}
                      onChange={e => setReportSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th style={{ textAlign: 'center' }}>Today</th>
                        <th style={{ textAlign: 'center' }}>Present</th>
                        <th style={{ textAlign: 'center' }}>Absent</th>
                        <th style={{ textAlign: 'center' }}>Late</th>
                        <th style={{ textAlign: 'center' }}>Excused</th>
                        <th style={{ textAlign: 'center' }}>Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatch.map((s: any) => (
                        <tr key={s.id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{s.full_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.student_code}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {s.today_status === 'not_marked'
                              ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                              : <span className={`badge badge-${s.today_status}`}>{s.today_status}</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--teal)', fontWeight: 700 }}>{s.present}</span></td>
                          <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--red)', fontWeight: 700 }}>{s.absent}</span></td>
                          <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--amber)', fontWeight: 700 }}>{s.late}</span></td>
                          <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--accent)', fontWeight: 700 }}>{s.excused}</span></td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, color: pctColor(s.percentage) }}>{s.percentage}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── INDIVIDUAL STUDENT REPORT ── */}
          {reportMode === 'individual' && reportSummary && (
            <div className="card">
              <div className="stats-grid" style={{ marginBottom: 20 }}>
                {[
                  { label: 'Total Days',   value: reportSummary.total,      color: 'var(--accent)' },
                  { label: 'Present',      value: reportSummary.present,    color: 'var(--teal)' },
                  { label: 'Absent',       value: reportSummary.absent,     color: 'var(--red)' },
                  { label: 'Late',         value: reportSummary.late,       color: 'var(--amber)' },
                  { label: 'Attendance %', value: `${reportSummary.percentage}%`, color: pctColor(reportSummary.percentage) },
                ].map((s, i) => (
                  <div key={i} className="stat-card" style={{ '--card-accent': s.color } as React.CSSProperties}>
                    <div className="stat-value">{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="table-container">
                <table>
                  <thead><tr><th>Date</th><th>Status</th><th>Notes</th></tr></thead>
                  <tbody>
                    {reportData.map(r => (
                      <tr key={r.id}>
                        <td>{new Date(r.attendance_date).toLocaleDateString()}</td>
                        <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty states */}
          {reportMode === 'all' && !reportLoading && allStudentsData.length === 0 && (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">📊</div><h3>No Report Yet</h3><p>Set filters and click "Get Report" to view attendance data.</p></div></div>
          )}
          {reportMode === 'batch' && !reportLoading && !batchSummary && (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">📋</div><h3>Select a Batch</h3><p>Choose a batch and date, then click "Get Report".</p></div></div>
          )}
          {reportMode === 'individual' && !reportLoading && !reportSummary && (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">👤</div><h3>Select a Student</h3><p>Choose a student and month, then click "Get Report".</p></div></div>
          )}
        </div>
      )}
    </div>
  );
};

export default AttendancePage;
