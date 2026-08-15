import React, { useEffect, useState, useCallback } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiRefreshCw } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { LmsModule, Course, CourseCategory } from '../../types';

const ModuleList: React.FC = () => {
  const [modules, setModules] = useState<LmsModule[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LmsModule | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    course_id: '',
    module_name: '',
    order_number: '1',
    status: 'active',
  });

  // ✅ Load courses with loading state + error handling
  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);
    try {
      const r = await api.get('/courses');
      const data = r.data.data || [];
      setCourses(data);
      setFilteredCourses(data);
      if (data.length === 0) {
        toast.warn('No courses found. Create a course first before adding modules.');
      }
    } catch {
      toast.error('Failed to load courses. Please refresh.');
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  // Load categories on mount
  useEffect(() => {
    api.get('/categories').then(r => setCategories(r.data.data || [])).catch(() => {});
  }, []);

  // Filter courses when category changes
  useEffect(() => {
    if (!filterCategory) {
      setFilteredCourses(courses);
    } else {
      setFilteredCourses(courses.filter(c => String(c.category_id) === filterCategory));
    }
    setFilterCourse('');
  }, [filterCategory, courses]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  // ✅ Load modules whenever filterCourse changes
  const fetchModules = useCallback(async () => {
    setModulesLoading(true);
    try {
      const params: any = {};
      if (filterCourse) params.course_id = filterCourse;
      const r = await api.get('/modules', { params });
      setModules(r.data.data || []);
    } catch {
      toast.error('Failed to load modules');
    } finally {
      setModulesLoading(false);
    }
  }, [filterCourse]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      course_id: filterCourse || (courses.length === 1 ? String(courses[0].id) : ''),
      module_name: '',
      order_number: String((modules.filter(m => !filterCourse || String(m.course_id) === filterCourse).length) + 1),
      status: 'active',
    });
    setShowModal(true);
  };

  const openEdit = (m: LmsModule) => {
    setEditing(m);
    setForm({
      course_id: String(m.course_id),
      module_name: m.module_name,
      order_number: String(m.order_number),
      status: m.status,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.course_id) { toast.error('Please select a course'); return; }
    if (!form.module_name.trim()) { toast.error('Please enter a module name'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/modules/${editing.id}`, form);
        toast.success('Module updated!');
      } else {
        await api.post('/modules', form);
        toast.success('Module created!');
        // Switch filter to show the new module's course
        if (filterCourse !== form.course_id) setFilterCourse(form.course_id);
      }
      setShowModal(false);
      fetchModules();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save module');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete module "${name}"?\nVideos in this module will become unassigned.`)) return;
    try {
      await api.delete(`/modules/${id}`);
      toast.success('Module deleted');
      fetchModules();
    } catch {
      toast.error('Failed to delete module');
    }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const selectedCourseName = courses.find(c => String(c.id) === filterCourse)?.course_name || '';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Course Modules</h1>
          <p className="page-subtitle">
            {filterCourse
              ? `${modules.length} module${modules.length !== 1 ? 's' : ''} — ${selectedCourseName}`
              : `${modules.length} total modules across all courses`}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openAdd}
          disabled={coursesLoading || courses.length === 0}
          title={courses.length === 0 ? 'Create a course first' : ''}
        >
          <FiPlus /> Add Module
        </button>
      </div>

      {/* Course filter */}
      <div className="card" style={{ marginBottom: 16, padding: '16px 24px' }}>
        <div className="search-bar" style={{ marginBottom: 0 }}>
          <div style={{ flex: 1 }}>
            <label className="form-label" style={{ marginBottom: 6 }}>
              Filter by Course
              {coursesLoading && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8 }}>Loading...</span>}
            </label>
            <select
              className="form-control"
              value={filterCourse}
              onChange={e => setFilterCourse(e.target.value)}
              style={{ maxWidth: 360 }}
              disabled={coursesLoading}
            >
              <option value="">All Courses</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.course_name}</option>
              ))}
            </select>
          </div>
          {filterCourse && (
            <button className="btn btn-secondary btn-sm" onClick={() => setFilterCourse('')} style={{ alignSelf: 'flex-end' }}>
              Clear Filter
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={fetchModules} style={{ alignSelf: 'flex-end' }} title="Refresh">
            <FiRefreshCw />
          </button>
        </div>
      </div>

      <div className="card">
        {modulesLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: 32, height: 32, borderWidth: 3 }}></div>
            <p style={{ color: 'var(--text-muted)' }}>Loading modules...</p>
          </div>
        ) : modules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗂️</div>
            <h3>{filterCourse ? `No Modules in "${selectedCourseName}"` : 'No Modules Yet'}</h3>
            <p>
              {filterCourse
                ? 'Click "Add Module" to create the first module for this course.'
                : 'Select a course and create modules to organise your video content.'}
            </p>
            <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: 16 }} disabled={courses.length === 0}>
              <FiPlus /> Add First Module
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Module Name</th>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {modules.map(m => (
                  <tr key={m.id}>
                    <td>
                      <span style={{
                        background: 'rgba(99,102,241,0.15)',
                        color: 'var(--accent)',
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                      }}>
                        #{m.order_number}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{m.module_name}</td>
                    <td>
                      <span style={{
                        background: 'rgba(16,185,129,0.1)',
                        color: 'var(--teal)',
                        padding: '3px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                      }}>
                        {m.course_name}
                      </span>
                    </td>
                    <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                    <td>
                      <div className="table-actions">
                        <button className="action-btn edit" onClick={() => openEdit(m)} title="Edit"><FiEdit2 /></button>
                        <button className="action-btn delete" onClick={() => handleDelete(m.id, m.module_name)} title="Delete"><FiTrash2 /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing ? '✏️ Edit Module' : '➕ Add Module'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit}>

              {/* Course dropdown — with proper loading + data */}
              <div className="form-group">
                <label className="form-label">
                  Course *
                  {coursesLoading && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8 }}>Loading...</span>}
                </label>
                <select
                  className="form-control"
                  value={form.course_id}
                  onChange={set('course_id')}
                  required
                  disabled={coursesLoading || !!editing}
                >
                  <option value="">
                    {coursesLoading ? 'Loading courses...' : courses.length === 0 ? 'No courses — create one first' : 'Select Course'}
                  </option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.course_name}</option>
                  ))}
                </select>
                {courses.length === 0 && !coursesLoading && (
                  <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
                    ⚠️ No courses found. <a href="/courses/add" style={{ color: 'var(--accent)' }}>Create a course first →</a>
                  </p>
                )}
                {editing && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Course cannot be changed after creation.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Module Name *</label>
                <input
                  className="form-control"
                  value={form.module_name}
                  onChange={set('module_name')}
                  placeholder="e.g. Introduction, Chapter 1, Week 2..."
                  required
                  autoFocus={!coursesLoading}
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Order Number</label>
                  <input
                    type="number"
                    className="form-control"
                    value={form.order_number}
                    onChange={set('order_number')}
                    min={1}
                    placeholder="1"
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Modules are displayed in this order
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status} onChange={set('status')}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || courses.length === 0}
                >
                  {saving ? 'Saving...' : editing ? 'Update Module' : 'Add Module'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuleList;
