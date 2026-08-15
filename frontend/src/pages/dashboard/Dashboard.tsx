import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from 'recharts';
import { FiUsers, FiBook, FiUserCheck, FiDollarSign, FiCheckCircle, FiClock } from 'react-icons/fi';
import api from '../../api/axios';
import { DashboardStats } from '../../types';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [enrollData, setEnrollData] = useState<any[]>([]);
  const [studentData, setStudentData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [s, r, e, st] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/charts/revenue'),
          api.get('/dashboard/charts/enrollments'),
          api.get('/dashboard/charts/students'),
        ]);
        setStats(s.data.data);
        setRevenueData(r.data.data);
        setEnrollData(e.data.data);
        setStudentData(st.data.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  const cards = stats ? [
    { label: 'Total Students', value: stats.totalStudents, icon: <FiUsers />, color: 'var(--accent)', bg: 'rgba(99,102,241,0.15)' },
    { label: 'Active Courses', value: stats.totalCourses, icon: <FiBook />, color: 'var(--teal)', bg: 'rgba(16,185,129,0.15)' },
    { label: 'Total Faculty', value: stats.totalFaculty, icon: <FiUserCheck />, color: 'var(--accent-2)', bg: 'rgba(139,92,246,0.15)' },
    { label: 'Total Revenue', value: `₹${Number(stats.totalRevenue).toLocaleString()}`, icon: <FiDollarSign />, color: 'var(--amber)', bg: 'rgba(245,158,11,0.15)' },
    { label: 'Active Students', value: stats.activeStudents, icon: <FiCheckCircle />, color: 'var(--teal)', bg: 'rgba(16,185,129,0.15)' },
    { label: 'Pending Payments', value: stats.pendingPayments, icon: <FiClock />, color: 'var(--red)', bg: 'rgba(239,68,68,0.15)' },
  ] : [];

  const tooltipStyle = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Loading dashboard...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome to Nalam Academy — EPFT System</p>
        </div>
        <Link to="/students/add" className="btn btn-primary">+ Add Student</Link>
      </div>

      <div className="stats-grid">
        {cards.map((c, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': c.color, '--card-accent-bg': c.bg } as React.CSSProperties}>
            <div className="stat-icon">{c.icon}</div>
            <div className="stat-value">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="charts-grid">
        <div className="chart-card chart-full">
          <h3 className="chart-title">📈 Revenue (Last 12 Months)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">📊 Enrollments (Last 12 Months)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={enrollData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="enrollments" fill="#8b5cf6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">👥 Student Growth (Last 12 Months)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={studentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="students" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
