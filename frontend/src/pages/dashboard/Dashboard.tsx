import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { FiUsers, FiBook, FiUserCheck, FiCheckCircle, FiFileText } from 'react-icons/fi';
import api from '../../api/axios';

const fmt = (n: number | string) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#14b8a6',
];

interface CourseFinance {
  category_name: string;
  course_name: string;
  label: string;
  candidate_count: number;
  total_fee: number;
  paid_amount: number;
  pending_amount: number;
}

interface Stats {
  totalCandidates: number;
  totalCourses: number;
  totalFaculty: number;
  activeCandidates: number;
  activeEnrollments: number;
}

interface ExamFeeSummary {
  total_fee: number;
  paid_amount: number;
  pending_amount: number;
}

const Dashboard: React.FC = () => {
  const [stats, setStats]               = useState<Stats | null>(null);
  const [courseFinance, setCourseFinance] = useState<CourseFinance[]>([]);
  const [examSummary, setExamSummary]   = useState<ExamFeeSummary | null>(null);
  const [recentData, setRecentData]     = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [s, cf, es, recent] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/charts/course-finance'),
          api.get('/dashboard/charts/exam-fee-summary'),
          api.get('/dashboard/recent-students'),
        ]);
        setStats(s.data.data);
        setCourseFinance(cf.data.data || []);
        setExamSummary(es.data.data);
        setRecentData(recent.data.data || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  const tooltipStyle = {
    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
      Loading dashboard...
    </div>
  );

  const cards = stats ? [
    { label: 'Total Candidates',    value: stats.totalCandidates,   icon: <FiUsers />,      color: 'var(--accent)',   bg: 'rgba(99,102,241,0.15)' },
    { label: 'Active Courses',      value: stats.totalCourses,       icon: <FiBook />,        color: 'var(--teal)',     bg: 'rgba(16,185,129,0.15)' },
    { label: 'Total Faculty',       value: stats.totalFaculty,       icon: <FiUserCheck />,   color: 'var(--accent-2)', bg: 'rgba(139,92,246,0.15)' },
    { label: 'Active Enrollments',  value: stats.activeEnrollments,  icon: <FiCheckCircle />, color: 'var(--teal)',     bg: 'rgba(16,185,129,0.15)' },

    { label: 'Active Candidates',   value: stats.activeCandidates,   icon: <FiFileText />,    color: '#f59e0b',         bg: 'rgba(245,158,11,0.15)' },
  ] : [];

  // Pie chart data: paid vs pending from exam fees
  const summaryPieData = examSummary && (examSummary.total_fee > 0) ? [
    { name: 'Collected', value: Number(examSummary.paid_amount) },
    { name: 'Pending',   value: Number(examSummary.pending_amount) },
  ] : [];

  // Bar chart for course-wise financials
  const barData = courseFinance.map(cf => ({
    name: cf.course_name.length > 12 ? cf.course_name.slice(0, 12) + '…' : cf.course_name,
    fullLabel: cf.label,
    Collected: Number(cf.paid_amount),
    Pending: Number(cf.pending_amount),
    Candidates: Number(cf.candidate_count),
  }));

  const totalCollected = courseFinance.reduce((s, c) => s + Number(c.paid_amount), 0);
  const totalPending   = courseFinance.reduce((s, c) => s + Number(c.pending_amount), 0);
  const totalFee       = courseFinance.reduce((s, c) => s + Number(c.total_fee), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Nalam Academy — EPFT Management System</p>
        </div>
        <Link to="/students/add" className="btn btn-primary">+ Add Candidate</Link>
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        {cards.map((c, i) => (
          <div key={i} className="stat-card"
            style={{ '--card-accent': c.color, '--card-accent-bg': c.bg } as React.CSSProperties}>
            <div className="stat-icon">{c.icon}</div>
            <div className="stat-value">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Link to="/students"    className="btn btn-secondary">🎓 Candidates</Link>
        <Link to="/enrollments" className="btn btn-secondary">📋 Enrollments</Link>
        <Link to="/exam-fees"   className="btn btn-secondary">📝 Exam Fees</Link>
        <Link to="/attendance"  className="btn btn-secondary">📅 Attendance</Link>
      </div>

      {/* Financial summary banner */}
      {examSummary && examSummary.total_fee > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📊 Exam Fee Summary (Active Candidates)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Total Exam Fee', value: examSummary.total_fee, color: 'var(--accent)', icon: '📋' },
              { label: 'Collected', value: examSummary.paid_amount, color: 'var(--teal)', icon: '✅' },
              { label: 'Pending', value: examSummary.pending_amount, color: 'var(--red)', icon: '⏳' },
            ].map((item, i) => (
              <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '14px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{item.icon}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="charts-grid">
        {/* Pie/Donut — Collected vs Pending */}
        {summaryPieData.length > 0 && (
          <div className="chart-card">
            <h3 className="chart-title">💰 Exam Fee Collection</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={summaryPieData}
                  cx="50%" cy="50%"
                  innerRadius={65} outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(v), '']} />
                <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Course-wise pie */}
        {courseFinance.length > 0 && (
          <div className="chart-card">
            <h3 className="chart-title">🎓 Course-wise Collection</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={courseFinance.map((cf, i) => ({ name: cf.course_name, value: Number(cf.paid_amount) }))}
                  cx="50%" cy="50%"
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {courseFinance.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(v), 'Collected']} />
                <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Course-wise bar chart */}
        {barData.length > 0 && (
          <div className="chart-card chart-full">
            <h3 className="chart-title">📈 Course-wise Exam Fee: Collected vs Pending</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: any, name: string) => [fmt(v), name]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullLabel || label}
                />
                <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{v}</span>} />
                <Bar dataKey="Collected" fill="#10b981" radius={[4,4,0,0]} />
                <Bar dataKey="Pending"   fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Course-wise table */}
      {courseFinance.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>📋 Course-wise Exam Fee Breakdown</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Main Course</th>
                  <th>Sub Course</th>
                  <th style={{ textAlign: 'center' }}>Candidates</th>
                  <th style={{ textAlign: 'right' }}>Fee/Candidate</th>
                  <th style={{ textAlign: 'right' }}>Total Fee</th>
                  <th style={{ textAlign: 'right' }}>Collected</th>
                  <th style={{ textAlign: 'right' }}>Pending</th>
                </tr>
              </thead>
              <tbody>
                {courseFinance.map((cf, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{cf.category_name}</td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{cf.course_name}</td>
                    <td style={{ textAlign: 'center', fontSize: 13 }}>{cf.candidate_count}</td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>
                      {cf.candidate_count > 0 ? fmt(Number(cf.total_fee) / cf.candidate_count) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{fmt(cf.total_fee)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--teal)' }}>{fmt(cf.paid_amount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: Number(cf.pending_amount) > 0 ? 'var(--red)' : 'var(--teal)' }}>
                      {fmt(cf.pending_amount)}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td colSpan={4} style={{ fontSize: 13 }}>Total</td>
                  <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmt(totalFee)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--teal)' }}>{fmt(totalCollected)}</td>
                  <td style={{ textAlign: 'right', color: totalPending > 0 ? 'var(--red)' : 'var(--teal)' }}>{fmt(totalPending)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Candidates */}
      {recentData.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>🆕 Recent Candidates</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Name</th><th>Course</th><th>Admission</th>
                </tr>
              </thead>
              <tbody>
                {recentData.map((s, i) => (
                  <tr key={i}>
                    <td><code style={{ color: 'var(--accent)', fontSize: 12 }}>{s.student_id}</code></td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{s.full_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.course_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.admission_date ? new Date(s.admission_date).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
