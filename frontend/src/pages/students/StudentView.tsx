import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiEdit2, FiArrowLeft, FiUser, FiPhone, FiMail, FiCalendar, FiBook, FiCheckSquare } from 'react-icons/fi';
import api from '../../api/axios';
import { Student, Enrollment } from '../../types';

const StudentView: React.FC = () => {
  const { id } = useParams();
  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  useEffect(() => {
    api.get(`/students/${id}`).then(r => setStudent(r.data.data));
    api.get('/enrollments', { params: { student_id: id } }).then(r => setEnrollments(r.data.data)).catch(() => {});
  }, [id]);

  if (!student) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading...</div>;

  const personalInfo = [
    { icon: <FiUser />, label: 'Gender',       value: student.gender || '—' },
    { icon: <FiPhone />, label: 'Mobile',       value: student.mobile },
    { icon: <FiMail />,  label: 'Email',        value: student.email },
    { icon: <FiCalendar />, label: 'Date of Birth', value: student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : '—' },
  ];

  const certItems = [
    { label: '10th Marksheet',   collected: student.cert_10th_collected },
    { label: '12th Marksheet',   collected: student.cert_12th_collected },
    { label: 'TC',               collected: student.cert_diploma_collected },
  ];

  const hasCerts = certItems.some(c => c.collected);

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/students" className="btn btn-secondary btn-sm"><FiArrowLeft /></Link>
          <div><h1 className="page-title">Student Profile</h1></div>
        </div>
        <Link to={`/students/${id}/edit`} className="btn btn-primary"><FiEdit2 /> Edit</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
        {/* ── Left sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            {student.photo_url
              ? <img src={student.photo_url} alt={student.full_name} style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent)', marginBottom: 16 }} />
              : <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontWeight: 800, color: '#fff', margin: '0 auto 16px' }}>{student.full_name.charAt(0)}</div>}
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{student.full_name}</h2>
            <code style={{ color: 'var(--accent)', fontSize: 14 }}>{student.student_id}</code>
            <div style={{ marginTop: 12 }}><span className={`badge badge-${student.status}`}>{student.status}</span></div>
            {student.address && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>{student.address}</p>}
          </div>

          {/* ── Certificate Verification card ── */}
          {(hasCerts || true) && (
            <div className="card">
              <h3 className="section-heading" style={{ marginBottom: 12 }}><FiCheckSquare style={{ verticalAlign: 'middle', marginRight: 6 }} />Certificates</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {certItems.map(c => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: c.collected ? 'rgba(16,185,129,0.08)' : 'var(--bg-tertiary)', border: `1px solid ${c.collected ? 'rgba(16,185,129,0.3)' : 'var(--border-light)'}` }}>
                    <span style={{ fontSize: 16 }}>{c.collected ? '✅' : '⬜'}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: c.collected ? 'var(--teal)' : 'var(--text-muted)' }}>{c.collected ? 'Collected' : 'Not collected'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right content ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Personal info */}
          <div className="card">
            <h3 className="section-heading">Personal Information</h3>
            <div className="form-grid">
              {personalInfo.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ color: 'var(--accent)', fontSize: 18, marginTop: 2 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
                    <div style={{ fontWeight: 500, marginTop: 2 }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Parent info */}
          <div className="card">
            <h3 className="section-heading">Parent Information</h3>
            <div className="form-grid">
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Parent Name</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{student.parent_name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Parent Mobile</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{student.parent_mobile || '—'}</div>
              </div>
            </div>
          </div>

          {/* Academic / Enrollments */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 className="section-heading" style={{ margin: 0 }}><FiBook style={{ verticalAlign: 'middle', marginRight: 6 }} />Enrollments</h3>
              <Link to="/enrollments" className="btn btn-secondary btn-sm" style={{ fontSize: 12 }}>Manage Enrollments →</Link>
            </div>

            {enrollments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No Enrollments Yet</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                  This student has not been enrolled in any course yet.
                </p>
                <Link to="/enrollments" className="btn btn-primary" style={{ fontSize: 13 }}>
                  Enroll Student
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {enrollments.map(e => (
                  <div key={e.id} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{e.course_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {e.batch_name ? `Batch: ${e.batch_name}` : 'No batch assigned'}
                        {' · '}
                        Enrolled: {new Date(e.enrolled_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span className={`badge badge-${e.status}`}>{e.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentView;
