import React, { useEffect, useState } from 'react';
import { FiPlus, FiTrash2, FiSave, FiUsers } from 'react-icons/fi';
import { toast } from 'react-toastify';

const STORAGE_KEY = 'hostel_senior_staff';

const SeniorStaffSettings: React.FC = () => {
  const [names, setNames] = useState<string[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) setNames(saved.filter((name): name is string => typeof name === 'string'));
    } catch {
      setNames([]);
    }
  }, []);

  const save = (next: string[]) => {
    const unique = [...new Set(next.map(name => name.trim()).filter(Boolean))];
    setNames(unique);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    toast.success('Senior staff list saved');
  };

  const addName = () => {
    const value = newName.trim();
    if (!value) return toast.error('Enter a senior staff name');
    if (names.some(name => name.toLowerCase() === value.toLowerCase())) return toast.info('This staff name already exists');
    const next = [...names, value];
    save(next);
    setNewName('');
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><FiUsers style={{ marginRight: 10 }} />Senior Staff</h1>
          <p className="page-subtitle">Manage the staff names available in the Hostel Receipt “Handover By” dropdown.</p>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 760 }}>
        <div className="card-header"><h2 className="card-title">Senior Staff Configuration</h2></div>
        <div className="card-body">
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Add as many senior staff names as needed. Changes are immediately available to the receipt form in this browser.</p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
            <input className="form-control" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addName(); } }} placeholder="Enter senior staff name" style={{ flex: 1, minWidth: 220 }} />
            <button type="button" className="btn btn-primary" onClick={addName}><FiPlus style={{ marginRight: 6 }} />Add Staff</button>
          </div>
          {names.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 10 }}>No senior staff added yet. Add a name above to show it in the receipt dropdown.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {names.map((name, index) => (
                <div key={`${name}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: '1px solid var(--border-light)', borderRadius: 10 }}>
                  <div><span style={{ color: 'var(--text-muted)', marginRight: 12 }}>{index + 1}.</span><strong>{name}</strong></div>
                  <button type="button" className="btn btn-danger" onClick={() => save(names.filter((_, i) => i !== index))} title={`Remove ${name}`}><FiTrash2 style={{ marginRight: 5 }} />Remove</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>Note: This list currently saves in this browser’s local storage; it is not shared across different computers or browsers.</div>
        </div>
      </div>
    </div>
  );
};

export default SeniorStaffSettings;
