import React, { useEffect, useState, useCallback } from 'react';
import {
  FiCalendar, FiCheck, FiBarChart2, FiUsers, FiUser,
  FiChevronRight, FiX,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';

interface StudentRow {
  id: number;
  student_id: string;
  full_name: string;
}

interface ReportCourse {
  id: number;
  name: string;
  batches: { id: number; name: string; active_students: number }[];
}

interface ReportGroup {
  id: number;
  name: string;
  courses: ReportCourse[];
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

  /* ── Course -> Sub Course -> Batch report selection ── */
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ReportGroup | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<ReportCourse | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<{ id: number; name: string } | null>(null);
  const [showSubCourseModal, setShowSubCourseModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);

  /* ── Report data ── */
  const [batchReportData, setBatchReportData] = useState<any[]>([]);
  const [batchReportSummary, setBatchReportSummary] = useState<any>(null);
  const [batchReportMeta, setBatchReportMeta] = useState<any>(null);
  const [indivData, setIndivData] = useState<any[]>([]);
  const [indivSummary, setIndivSummary] = useState<any>(null);

  /* Load active students for individual report */
  useEffect(() => {
    api.get('/students', { params: { status: 'active', limit: 1000 } })
      .then(r => setAllStudents(r.data.data || []))
      .catch(() => toast.error('Failed to load students'));
  }, []);

  /* Load course/sub-course/batch hierarchy for reports */
  const loadReportHierarchy = useCallback(async () => {
    try {
      const r = await api.get('/attendance/report/hierarchy');
      setReportGroups(r.data.data || []);
    } catch {
      toast.error('Failed to load course report options');
    }
  }, []);

  useEffect(() => { loadReportHierarchy(); }, [loadReportHierarchy]);

  /* Load students + existing records when date changes */
  const loadAttendance = useCallback(async () => {
    setStudentsLoading(true);
    try {
      const studRes = await api.get('/students', { params: { status: 'active', limit: 1000 } });
      const s: StudentRow[] = studRes.data.data || [];
      setStudents(s);

      const init: Record<number, 'present' | 'absent'> = {};
      s.forEach(st => { init[st.id] = 'present'; });

      if (s.length > 0 && attendanceDate) {
        const attRes = await api.get('/attendance', { params: { attendance_date: attendanceDate } });
        const existing: any[] = attRes.data.data || [];
        existing.forEach((rec: any) => {
          if (Object.prototype.hasOwnProperty.call(init, rec.student_id)) {
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
      await loadReportHierarchy();
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

  const selectMainCourse = (group: ReportGroup) => {
    setSelectedGroup(group);
    setSelectedCourse(null);
    setSelectedBatch(null);
    setBatchReportData([]);
    setBatchReportSummary(null);
    setBatchReportMeta(null);
    setShowSubCourseModal(true);
  };

  const selectSubCourse = (course: ReportCourse) => {
    setSelectedCourse(course);
    setSelectedBatch(null);
    setShowSubCourseModal(false);
    setShowBatchModal(true);
  };

  const selectBatch = (batch: { id: number; name: string }) => {
    setSelectedBatch(batch);
    setShowBatchModal(false);
    setBatchReportData([]);
    setBatchReportSummary(null);
    setBatchReportMeta(null);
  };

  /* ── Fetch reports ── */
  const fetchReport = async () => {
    setReportLoading(true);
    try {
      if (reportMode === 'overall') {
        if (!selectedBatch) {
          toast.error('Select Course, Sub Course and Batch first');
          setReportLoading(false);
          return;
        }
        const params: any = {};
        if (reportStartDate) params.start_date = reportStartDate;
        if (reportEndDate) params.end_date = reportEndDate;
        if (reportStartDate && reportEndDate && reportEndDate < reportStartDate) {
          toast.error('To Date cannot be earlier than From Date');
          setReportLoading(false);
          return;
        }
        const r = await api.get(`/attendance/report/batch/${selectedBatch.id}`, { params });
        setBatchReportData(r.data.data || []);
        setBatchReportSummary(r.data.summary || null);
        setBatchReportMeta(r.data.batch || {
          batch_id: selectedBatch.id,
          batch_name: selectedBatch.name,
          course_name: selectedCourse?.name,
          category_name: selectedGroup?.name,
        });
        setIndivData([]);
        setIndivSummary(null);
      } else {
        if (!reportStudent) { toast.error('Select a candidate'); setReportLoading(false); return; }
        const params: any = {};
        if (reportStartDate) params.start_date = reportStartDate;
        if (reportEndDate) params.end_date = reportEndDate;
        if (reportStartDate && reportEndDate && reportEndDate < reportStartDate) {
          toast.error('To Date cannot be earlier than From Date');
          setReportLoading(false);
          return;
        }
        const r = await api.get(`/attendance/report/student/${reportStudent}`, { params });
        setIndivData(r.data.data || []);
        setIndivSummary(r.data.summary);
        setBatchReportData([]);
        setBatchReportSummary(null);
        setBatchReportMeta(null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load report');
    } finally {
      setReportLoading(false);
    }
  };

  const presentCount = Object.values(attendance).filter(v => v === 'present').length;
  const absentCount = Object.values(attendance).filter(v => v === 'absent').length;

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

      {/* ══════════ MARK ATTENDANCE — unchanged ══════════ */}
      {tab === 'mark' && (
        <div className="card">
          <div className="form-grid" style={{ marginBottom: 20, gridTemplateColumns: '1fr' }}>
            <div className="form-group" style={{ maxWidth: 280 }}>
              <label className="form-label">Date *</label>
              <input type="date" className="form-control" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} />
            </div>
          </div>

          {studentsLoading && <div className="empty-state"><div className="empty-state-icon">⏳</div><h3>Loading students...</h3></div>}

          {!studentsLoading && students.length === 0 && (
            <div className="empty-state"><div className="empty-state-icon">👥</div><h3>No Active Candidates</h3><p>No active students found in the system.</p></div>
          )}

          {!studentsLoading && students.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  {students.length} student{students.length !== 1 ? 's' : ''}&nbsp;·&nbsp;
                  <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{presentCount} present</span>&nbsp;·&nbsp;
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
                      <div className="student-avatar" style={{ width: 40, height: 40, fontSize: 15, flexShrink: 0 }}>{s.full_name.charAt(0)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.student_id}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => setAttendance(a => ({ ...a, [s.id]: 'present' }))} style={{ width: 44, padding: '5px 0', borderRadius: 6, border: '2px solid', cursor: 'pointer', fontWeight: 600, fontSize: 12, borderColor: status === 'present' ? 'var(--teal)' : 'var(--border)', background: status === 'present' ? 'var(--teal)' : 'transparent', color: status === 'present' ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>P</button>
                        <button onClick={() => setAttendance(a => ({ ...a, [s.id]: 'absent' }))} style={{ width: 44, padding: '5px 0', borderRadius: 6, border: '2px solid', cursor: 'pointer', fontWeight: 600, fontSize: 12, borderColor: status === 'absent' ? 'var(--red)' : 'var(--border)', background: status === 'absent' ? 'var(--red)' : 'transparent', color: status === 'absent' ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>A</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleMark} disabled={loading}><FiCheck /> {loading ? 'Saving...' : 'Save Attendance'}</button>
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
              <button className={`btn ${reportMode === 'overall' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReportMode('overall')}><FiUsers /> Overall Report</button>
              <button className={`btn ${reportMode === 'individual' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReportMode('individual')}><FiUser /> Individual Student</button>
            </div>

            {reportMode === 'overall' ? (
              <>
                <div style={{ marginBottom: 18 }}>
                  <label className="form-label">Course</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                    {reportGroups.map(group => (
                      <button key={group.id} type="button" onClick={() => selectMainCourse(group)} style={{ textAlign: 'left', padding: '13px 14px', borderRadius: 10, border: selectedGroup?.id === group.id ? '1px solid var(--accent)' : '1px solid var(--border-light)', background: selectedGroup?.id === group.id ? 'rgba(99,102,241,0.14)' : 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 650 }}>{group.name}</span><FiChevronRight />
                      </button>
                    ))}
                  </div>
                </div>

                {selectedGroup && selectedCourse && selectedBatch && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                    <span className="badge badge-approved">Course: {selectedGroup.name}</span>
                    <span className="badge badge-approved">Sub Course: {selectedCourse.name}</span>
                    <span className="badge badge-approved">Batch: {selectedBatch.name}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="form-group">
                <label className="form-label">Student *</label>
                <select className="form-control" value={reportStudent} onChange={e => setReportStudent(e.target.value)}>
                  <option value="">Select Candidate</option>
                  {allStudents.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.student_id})</option>)}
                </select>
              </div>
            )}

            <div className="form-grid" style={{ marginTop: 10 }}>
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

          {/* BATCH REPORT — date-wise */}
          {reportMode === 'overall' && batchReportData.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Batch Attendance Report</h3>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>
                    {batchReportMeta?.category_name ? `${batchReportMeta.category_name} → ` : ''}{batchReportMeta?.course_name || selectedCourse?.name || ''} → {batchReportMeta?.batch_name || selectedBatch?.name || ''}
                  </div>
                </div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{batchReportSummary?.present || 0} Present</span>
                  <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>·</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>{batchReportSummary?.absent || 0} Absent</span>
                </div>
              </div>
              <div className="table-container">
                <table>
                  <thead><tr><th>Date</th><th>Candidate</th><th>ID</th><th>Status</th></tr></thead>
                  <tbody>
                    {batchReportData.map((r: any) => (
                      <tr key={r.id}>
                        <td>{new Date(String(r.attendance_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB')}</td>
                        <td style={{ fontWeight: 600 }}>{r.full_name}</td>
                        <td><code style={{ color: 'var(--accent)', fontSize: 12 }}>{r.student_code}</code></td>
                        <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportMode === 'overall' && !reportLoading && selectedBatch && batchReportData.length === 0 && batchReportSummary && (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">📊</div><h3>No Attendance Data</h3><p>No attendance records found for this batch and date range.</p></div></div>
          )}

          {/* INDIVIDUAL REPORT — date + status only */}
          {reportMode === 'individual' && indivSummary && (
            <div className="card">
              <div className="table-container">
                <table>
                  <thead><tr><th>Date</th><th>Status</th></tr></thead>
                  <tbody>
                    {indivData.map((r: any, i: number) => (
                      <tr key={r.id ?? i}>
                        <td>{new Date(String(r.attendance_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB')}</td>
                        <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportMode === 'individual' && !reportLoading && !indivSummary && (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">👤</div><h3>Select a Student</h3><p>Choose a student and date range, then click "Get Report".</p></div></div>
          )}
        </div>
      )}

      {/* Sub Course popup */}
      {showSubCourseModal && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowSubCourseModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Select Sub Course — {selectedGroup.name}</h2>
              <button className="modal-close" onClick={() => setShowSubCourseModal(false)}><FiX /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedGroup.courses.map(course => (
                <button key={course.id} type="button" onClick={() => selectSubCourse(course)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px', borderRadius: 9, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}>
                  <span><strong>{course.name}</strong><span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{course.batches.length} batch{course.batches.length !== 1 ? 'es' : ''}</span></span>
                  <FiChevronRight />
                </button>
              ))}
              {selectedGroup.courses.length === 0 && <div className="empty-state"><h3>No Sub Courses</h3></div>}
            </div>
          </div>
        </div>
      )}

      {/* Batch popup */}
      {showBatchModal && selectedCourse && (
        <div className="modal-overlay" onClick={() => setShowBatchModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Select Batch — {selectedCourse.name}</h2>
              <button className="modal-close" onClick={() => setShowBatchModal(false)}><FiX /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedCourse.batches.map(batch => (
                <button key={batch.id} type="button" onClick={() => selectBatch(batch)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px', borderRadius: 9, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}>
                  <span><strong>{batch.name}</strong><span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{batch.active_students} active student{batch.active_students !== 1 ? 's' : ''}</span></span>
                  <FiChevronRight />
                </button>
              ))}
              {selectedCourse.batches.length === 0 && <div className="empty-state"><h3>No Batches</h3><p>This sub course has no batches.</p></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendancePage;
