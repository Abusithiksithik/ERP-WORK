import React, { useEffect, useState, useCallback } from 'react';
import { FiCalendar, FiCheck, FiBarChart2, FiUsers, FiUser, FiSearch } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';

interface StudentRow {
  id: number;
  student_id: string;
  full_name: string;
}

type ReportMode = 'overall' | 'individual';

const AttendancePage: React.FC = () => {
  /* ── Mark tab ── */
  const [tab, setTab] = useState<'mark' | 'report'>('mark');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<number, 'present' | 'absent'>>({});
  const [loading, setLoading] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);

  /* ── Report tab ── */
  const [reportMode, setReportMode] = useState<ReportMode>('overall');
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [reportStudent, setReportStudent] = useState('');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState('');

  /* ── Report data ── */
  const [overallData, setOverallData] = useState<any[]>([]);
  const [overallWorkingDays, setOverallWorkingDays] = useState(0);
  const [indivData, setIndivData] = useState<any[]>([]);
  const [indivSummary, setIndivSummary] = useState<any>(null);

  /* Load active students for mark + report on mount */
  useEffect(() => {
    api.get('/students', { params: { status: 'active', limit: 1000 } })
      .then(r => {
        const list: StudentRow[] = r.data.data || [];
        setAllStudents(list);
      })
      .catch(() => toast.error('Failed to load students'));
  }, []);

  /* Load students + existing records when date changes */
  const loadAttendance = useCallback(async () => {
    setStudentsLoading(true);
    try {
      // Always use active students
      const studRes = await api.get('/students', { params: { status: 'active', limit: 1000 } });
      const s: StudentRow[] = studRes.data.data || [];
      setStudents(s);

      // Default everyone to present
      const init: Record<number, 'present' | 'absent'> = {};
      s.forEach(st => { init[st.id] = 'present'; });

      // Overlay saved records for this date
      if (s.length > 0 && attendanceDate) {
        const attRes = await api.get('/attendance', { params: { attendance_date: attendanceDate } });
        const existing: any[] = attRes.data.data || [];
        existing.forEach((rec: any) => {
          if (init.hasOwnProperty(rec.student_id)) {
            init[rec.student_id] = rec.status === 'present' ? 'present' : 'absent';
          }
        });
      }
      setAttendance(init);
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setStudentsLoading(false);
    }
  }, [attendanceDate]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const handleMark = async () => {
    if (!attendanceDate) { toast.error('Select a date'); return; }
    if (students.length === 0) { toast.error('No active students found'); return; }
    setLoading(true);
    try {
      const records = Object.entries(attendance).map(([student_id, status]) => ({
        student_id: parseInt(student_id),
        status,
      }));
      await api.post('/attendance', { attendance_date: attendanceDate, records });
      toast.success(`Attendance saved for ${records.length} students!`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setLoading(false);
    }
  };

  const markAll = (status: 'present' | 'absent') => {
    const all: Record<number, 'present' | 'absent'> = {};
    students.forEach(st => { all[st.id] = status; });
    setAttendance(all);
  };

  /* ── Fetch reports ── */
  const fetchReport = async () => {
    setReportLoading(true);
    try {
      if (reportMode === 'overall') {
        const params: any = {};
        if (reportStartDate) params.start_date = reportStartDate;
        if (reportEndDate)   params.end_date   = reportEndDate;
        const r = await api.get('/attendance/report/all', { params });
        setOverallData(r.data.data || []);
        setOverallWorkingDays(r.data.working_days || 0);
        setIndivData([]); setIndivSummary(null);
      } else {
        if (!reportStudent) { toast.error('Select a candidate'); setReportLoading(false); return; }
        const params: any = {};
        if (reportStartDate) params.start_date = reportStartDate;
        if (reportEndDate)   params.end_date   = reportEndDate;
        const r = await api.get(`/attendance/report/student/${reportStudent}`, { params });
        setIndivData(r.data.data || []);
        setIndivSummary(r.data.summary);
        setOverallData([]); setOverallWorkingDays(0);
      }
    } catch {
      toast.error('Failed to load report');
    } finally {
      setReportLoading(false);
    }
  };

  const pctColor = (p: number) =>
    p >= 75 ? 'var(--teal)' : p >= 50 ? 'var(--amber)' : 'var(--red)';

  const presentCount = Object.values(attendance).filter(v => v === 'present').length;
  const absentCount  = Object.values(attendance).filter(v => v === 'absent').length;

  const filteredOverall = overallData.filter(s =>
    !reportSearch ||
    s.full_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
    (s.student_code || '').toLowerCase().includes(reportSearch.toLowerCase())
  );

  return (
    <div>
      <div className="page-header"><div><h1 className="page-title">Attendance</h1></div></div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`btn ${tab === 'mark' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('mark')}>
          <FiCalendar /> Mark Attendance
        </button>
        <button className={`btn ${tab === 'report' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('report')}>
          <FiBarChart2 /> Attendance Report
        </button>
      </div>

      {/* ══════════ MARK ATTENDANCE ══════════ */}
      {tab === 'mark' && (
        <div className="card">
          <div className="form-grid" style={{ marginBottom: 20, gridTemplateColumns: '1fr' }}>
            <div className="form-group" style={{ maxWidth: 280 }}>
              <label className="form-label">Date *</label>
              <input
                type="date"
                className="form-control"
                value={attendanceDate}
                onChange={e => setAttendanceDate(e.target.value)}
              />
            </div>
          </div>

          {studentsLoading && (
            <div className="empty-state">
              <div className="empty-state-icon">⏳</div>
              <h3>Loading students...</h3>
            </div>
          )}

          {!studentsLoading && students.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <h3>No Active Candidates</h3>
              <p>No active students found in the system.</p>
            </div>
          )}

          {!studentsLoading && students.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  {students.length} student{students.length !== 1 ? 's' : ''}
                  &nbsp;·&nbsp;
                  <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{presentCount} present</span>
                  &nbsp;·&nbsp;
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>{absentCount} absent</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => markAll('present')}>All Present</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => markAll('absent')}>All Absent</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {students.map(s => {
                  const status = attendance[s.id] || 'present';
                  return (
                    <div key={s.id} className="attendance-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                      <div className="student-avatar" style={{ width: 40, height: 40, fontSize: 15, flexShrink: 0 }}>
                        {s.full_name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.student_id}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => setAttendance(a => ({ ...a, [s.id]: 'present' }))}
                          style={{
                            width: 44,
                            padding: '5px 0',
                            borderRadius: 6,
                            border: '2px solid',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 12,
                            borderColor: status === 'present' ? 'var(--teal)' : 'var(--border)',
                            background: status === 'present' ? 'var(--teal)' : 'transparent',
                            color: status === 'present' ? '#fff' : 'var(--text-secondary)',
                            transition: 'all 0.15s',
                          }}
                        >P</button>
                        <button
                          onClick={() => setAttendance(a => ({ ...a, [s.id]: 'absent' }))}
                          style={{
                            width: 44,
                            padding: '5px 0',
                            borderRadius: 6,
                            border: '2px solid',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 12,
                            borderColor: status === 'absent' ? 'var(--red)' : 'var(--border)',
                            background: status === 'absent' ? 'var(--red)' : 'transparent',
                            color: status === 'absent' ? '#fff' : 'var(--text-secondary)',
                            transition: 'all 0.15s',
                          }}
                        >A</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleMark} disabled={loading}>
                  <FiCheck /> {loading ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════ REPORT TAB ══════════ */}
      {tab === 'report' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
              <button className={`btn ${reportMode === 'overall' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReportMode('overall')}>
                <FiUsers /> Overall Report
              </button>
              <button className={`btn ${reportMode === 'individual' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReportMode('individual')}>
                <FiUser /> Individual Student
              </button>
            </div>

            <div className="form-grid">
              {reportMode === 'individual' && (
                <div className="form-group">
                  <label className="form-label">Student *</label>
                  <select className="form-control" value={reportStudent} onChange={e => setReportStudent(e.target.value)}>
                    <option value="">Select Candidate</option>
                    {allStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name} ({s.student_id})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">From Date</label>
                <input type="date" className="form-control" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">To Date</label>
                <input type="date" className="form-control" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
              </div>
            </div>

            <button className="btn btn-primary" onClick={fetchReport} disabled={reportLoading} style={{ marginTop: 4 }}>
              {reportLoading ? 'Loading...' : '🔍 Get Report'}
            </button>
          </div>

          {/* OVERALL REPORT */}
          {reportMode === 'overall' && overallData.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Overall Attendance Summary</h3>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    Working Days: <strong style={{ color: 'var(--accent)' }}>{overallWorkingDays}</strong>
                  </div>
                </div>
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
                      <th>Candidate</th>
                      <th>Batch</th>
                      <th style={{ textAlign: 'center' }}>Working Days</th>
                      <th style={{ textAlign: 'center' }}>Present</th>
                      <th style={{ textAlign: 'center' }}>Absent</th>
                      <th style={{ textAlign: 'center' }}>Attendance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOverall.map((s: any) => (
                      <tr key={s.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{s.full_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.student_code}</div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.batch_name || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{overallWorkingDays}</td>
                        <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--teal)', fontWeight: 700 }}>{s.present}</span></td>
                        <td style={{ textAlign: 'center' }}><span style={{ color: 'var(--red)', fontWeight: 700 }}>{s.absent}</span></td>
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

          {/* INDIVIDUAL REPORT */}
          {reportMode === 'individual' && indivSummary && (
            <div className="card">
              <div className="stats-grid" style={{ marginBottom: 20 }}>
                {[
                  { label: 'Working Days', value: indivSummary.working_days, color: 'var(--accent)' },
                  { label: 'Present',      value: indivSummary.present,      color: 'var(--teal)' },
                  { label: 'Absent',       value: indivSummary.absent,       color: 'var(--red)' },
                  { label: 'Attendance %', value: `${indivSummary.percentage}%`, color: pctColor(indivSummary.percentage) },
                ].map((s, i) => (
                  <div key={i} className="stat-card" style={{ '--card-accent': s.color } as React.CSSProperties}>
                    <div className="stat-value">{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {indivData.map((r: any, i: number) => (
                      <tr key={r.id ?? i}>
                        <td>{new Date(r.attendance_date + 'T00:00:00').toLocaleDateString()}</td>
                        <td>
                          <span className={`badge badge-${r.status}`}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty states */}
          {reportMode === 'overall' && !reportLoading && overallData.length === 0 && (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">📊</div><h3>No Report Yet</h3><p>Click "Get Report" to view attendance data.</p></div></div>
          )}
          {reportMode === 'individual' && !reportLoading && !indivSummary && (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">👤</div><h3>Select a Student</h3><p>Choose a student and optional date range, then click "Get Report".</p></div></div>
          )}
        </div>
      )}
    </div>
  );
};

export default AttendancePage;
