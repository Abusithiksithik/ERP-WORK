import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiToggleLeft, FiToggleRight, FiVideo, FiRefreshCw } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Course, CourseCategory } from '../../types';

const CourseList: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterCategory) params.category_id = filterCategory;
      const r = await api.get('/courses', { params });
      setCourses(r.data.data || []);
    } catch {
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/categories').then(r => setCategories(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete course "${name}"?\nThis cannot be undone.`)) return;
    try {
      await api.delete(`/courses/${id}`);
      toast.success('Course deleted');
      fetchCourses();
    } catch {
      toast.error('Cannot delete — course may have enrolled students');
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await api.patch(`/courses/${id}/status`);
      fetchCourses();
    } catch {
      toast.error('Failed to update status');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sub-Courses</h1>
          <p className="page-subtitle">{courses.length} sub-course{courses.length !== 1 ? 's' : ''}{filterCategory ? ' in selected master course' : ' total'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchCourses} title="Refresh"><FiRefreshCw /></button>
          <Link to="/courses/add" className="btn btn-primary"><FiPlus /> Add Course</Link>
        </div>
      </div>

      {/* Master Course filter */}
      {categories.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 24px' }}>
          <div className="search-bar" style={{ marginBottom: 0 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label" style={{ marginBottom: 6 }}>Filter by Master Course</label>
              <select
                className="form-control"
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                style={{ maxWidth: 320 }}
              >
                <option value="">All Master Courses</option>
                {categories.filter(c => c.status === 'active').map(c => (
                  <option key={c.id} value={c.id}>{c.category_name}</option>
                ))}
              </select>
            </div>
            {filterCategory && (
              <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => setFilterCategory('')}>
                Clear Filter
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: 32, height: 32, borderWidth: 3 }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading courses...</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <h3>No Courses{filterCategory ? ' in this Category' : ' Yet'}</h3>
            <p>{filterCategory ? 'Try selecting a different category.' : 'Create your first course to get started.'}</p>
            <Link to="/courses/add" className="btn btn-primary" style={{ marginTop: 16 }}>
              <FiPlus /> Add First Course
            </Link>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Sub-Course Name</th>
                  <th>Master Course</th>
                  <th>Duration</th>
                  <th>Fee</th>
                  <th>Candidates</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.course_name}</div>
                      {c.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {c.description.slice(0, 55)}{c.description.length > 55 ? '…' : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      {c.category_name ? (
                        <span style={{
                          background: 'rgba(99,102,241,0.12)',
                          color: 'var(--accent)',
                          padding: '3px 10px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 500,
                        }}>
                          {c.category_name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>{c.duration || '—'}</td>
                    <td>
                      {c.is_free ? (
                        <span className="badge badge-free">Free</span>
                      ) : (
                        <span style={{ fontWeight: 600 }}>₹{Number(c.fee_amount).toLocaleString()}</span>
                      )}
                    </td>
                    <td>{c.student_count || 0}</td>
                    <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                    <td>
                      <div className="table-actions">
                        <Link
                          to={`/videos?course_id=${c.id}&course_name=${encodeURIComponent(c.course_name)}`}
                          className="action-btn view"
                          title="Manage Videos"
                        >
                          <FiVideo />
                        </Link>
                        <Link to={`/courses/${c.id}/edit`} className="action-btn edit" title="Edit">
                          <FiEdit2 />
                        </Link>
                        <button
                          className="action-btn"
                          style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' }}
                          onClick={() => handleToggle(c.id)}
                          title={c.status === 'active' ? 'Deactivate' : 'Activate'}
                        >
                          {c.status === 'active' ? <FiToggleRight /> : <FiToggleLeft />}
                        </button>
                        <button className="action-btn delete" onClick={() => handleDelete(c.id, c.course_name)} title="Delete">
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseList;
